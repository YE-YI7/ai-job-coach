/**
 * 答题链路·模型解析层回归（2026-09-22 用户被「LLM API 调用失败」挡住，
 * 无法线上走通 E2E，改为代码级测试）。
 *
 * 覆盖 chatModelAccess / resolveTokenDanceModel 与真实网关目录结构的对接：
 * 目录不可达时绝不臆造替换；用户显式选择的模型绝不换名计费；只有服务端
 * 默认 id 才允许在同为实惠档的模型里降级。
 */

jest.mock("@/lib/tokenpay", () => ({
  getTokenPayCredential: jest.fn(),
}));

type ChatModelsModule = typeof import("./chat-models");

// chat-models 有 15 分钟模块级缓存；resetModules 同时会重开 tokenpay 的
// mock 实例，所以每个用例都通过这里拿一份干净的依赖装配。
async function freshChatModels(credential: string | null = "tp-key"): Promise<ChatModelsModule> {
  jest.resetModules();
  const tokenpay = jest.requireMock("@/lib/tokenpay") as { getTokenPayCredential: jest.Mock };
  tokenpay.getTokenPayCredential.mockResolvedValue(credential);
  return await import("./chat-models");
}

function gatewayCatalog(entries: Array<{ id: string; chat: boolean }>) {
  return {
    data: entries.map((e) => ({ id: e.id, supported_protocols: e.chat ? ["openai:chat-completions"] : ["websocket:speech"] })),
  };
}

function mockFetchCatalog(ok: boolean, entries?: Array<{ id: string; chat: boolean }>) {
  const fetchMock = jest.fn(async () =>
    ok
      ? { ok: true, json: async () => gatewayCatalog(entries ?? []) }
      : { ok: false }
  );
  (globalThis as Record<string, unknown>).fetch = fetchMock;
  return fetchMock;
}

const chat = (...ids: string[]) => ids.map((id) => ({ id, chat: true }));

describe("chatModelAccess", () => {
  test("未连接 TokenPay：不请求目录，可用列表为空", async () => {
    const fetchMock = mockFetchCatalog(true, chat("glm-5.3"));
    const mod = await freshChatModels(null);
    const access = await mod.chatModelAccess("u-1");
    expect(access).toEqual({ connected: false, available: [], hosted: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("目录里的聊天模型进入 hosted，精选目录进入 available", async () => {
    mockFetchCatalog(true, [...chat("glm-5.3", "deepseek-v4-flash-0731", "some-unlisted-chat"), { id: "tts-model-x", chat: false }]);
    const mod = await freshChatModels();
    const access = await mod.chatModelAccess("u-1");
    expect(access.connected).toBe(true);
    expect(access.available).toEqual(["glm-5.3", "deepseek-v4-flash-0731"]);
    // 非精选但可聊天的模型保留在 hosted（供替换判断），未列出的 id 不进 available。
    expect(access.hosted).toContain("some-unlisted-chat");
    expect(access.hosted).not.toContain("tts-model-x");
  });

  test("目录不可达：不抛错，按空目录处理（resolve 层因此保持原模型）", async () => {
    mockFetchCatalog(false);
    const mod = await freshChatModels();
    const access = await mod.chatModelAccess("u-1");
    expect(access).toEqual({ connected: true, available: [], hosted: [] });
  });

  test("15 分钟缓存：第二次调用不再打网关", async () => {
    const fetchMock = mockFetchCatalog(true, chat("glm-5.3"));
    const mod = await freshChatModels();
    await mod.chatModelAccess("u-1");
    await mod.chatModelAccess("u-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("resolveTokenDanceModel（答题/出题请求落到网关前的最后一步）", () => {
  test("目录不可达时保持请求模型，绝不臆造替换", async () => {
    mockFetchCatalog(false);
    const mod = await freshChatModels();
    await expect(mod.resolveTokenDanceModel("u-1", "glm-5.3")).resolves.toBe("glm-5.3");
  });

  test("请求模型在目录里：原样返回", async () => {
    mockFetchCatalog(true, chat("glm-5.3", "deepseek-v4-flash-0731"));
    const mod = await freshChatModels();
    await expect(mod.resolveTokenDanceModel("u-1", "glm-5.3")).resolves.toBe("glm-5.3");
  });

  test("用户显式选择的模型缺失：报错且不换模型（不会被静默按别的模型计费）", async () => {
    mockFetchCatalog(true, chat("deepseek-v4-flash-0731"));
    const mod = await freshChatModels();
    await expect(mod.resolveTokenDanceModel("u-1", "glm-5.3")).rejects.toThrow("未替换模型");
  });

  test("服务端默认模型缺失：只在同族实惠档内降级", async () => {
    mockFetchCatalog(true, chat("deepseek-v4-flash-0731", "deepseek-v4-pro", "kimi-k3"));
    const mod = await freshChatModels();
    // deepseek-chat 是 env LLM_MODEL_CHAT 的默认 id，用户从未经手 → 允许降级，
    // 但绝不能降到 deepseek-v4-pro（高阶档）。
    await expect(mod.resolveTokenDanceModel("u-1", "deepseek-chat")).resolves.toBe("deepseek-v4-flash-0731");
  });

  test("服务端默认模型缺失且没有实惠档：显式失败，不偷偷按高阶计费", async () => {
    mockFetchCatalog(true, chat("deepseek-v4-pro"));
    const mod = await freshChatModels();
    await expect(mod.resolveTokenDanceModel("u-1", "deepseek-chat")).rejects.toThrow("没有实惠档");
  });
});
