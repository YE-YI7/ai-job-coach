import {expectedModelForMode, isAcknowledged, modelTier, modelTurnNotice, rememberAcknowledged} from "./model-change";

describe("modelTurnNotice", () => {
  test("经济档正常回答：什么也不说", () => {
    expect(modelTurnNotice({modelMode: "fast", trace: {model: "deepseek-v4-flash", modelUsage: {model: "deepseek-v4-flash"}}})).toBeNull();
  });
  test("fast 档被换到高阶档回答：必须确认（静默升档判负）", () => {
    const notice = modelTurnNotice({modelMode: "fast", trace: {model: "deepseek-v4-pro"}})!;
    expect(notice.kind).toBe("tier-up");
    expect(notice.requiresConfirm).toBe(true);
    expect(notice.text).toContain("计费更高");
    expect(notice.text).toContain("确认");
  });
  test("明确点的模型被换到更省的档：只说明，不拦人", () => {
    const notice = modelTurnNotice({modelMode: "glm-5.3", trace: {model: "deepseek-v4.1-flash"}})!;
    expect(notice.kind).toBe("change");
    expect(notice.requiresConfirm).toBe(false);
    expect(notice.text).toContain("更省");
  });
  test("台账首选与实际应答不一致（重试/网关回显）：说明这一轮由谁完成", () => {
    const notice = modelTurnNotice({modelMode: "auto", trace: {model: "glm-5.3", modelCalls: 2, modelUsage: {model: "deepseek-v4-flash"}}})!;
    expect(notice.kind).toBe("change");
    expect(notice.text).toContain("deepseek-v4-flash");
    expect(notice.text).not.toContain("未测");
  });
  test("台账首选便宜、实际应答更贵：按升档处理，等确认", () => {
    const notice = modelTurnNotice({modelMode: "auto", trace: {model: "deepseek-v4-flash", modelUsage: {model: "kimi-k3"}}})!;
    expect(notice.kind).toBe("tier-up");
    expect(notice.requiresConfirm).toBe(true);
  });
  test("自动模式按所选池正常作答：不打扰", () => {
    expect(modelTurnNotice({modelMode: "auto", trace: {model: "kimi-k3", modelUsage: {model: "kimi-k3"}}})).toBeNull();
  });
  test("无 trace（预览轮/旧数据）：不猜测", () => {
    expect(modelTurnNotice({modelMode: "auto", trace: null})).toBeNull();
    expect(modelTurnNotice({modelMode: "fast", trace: {}})).toBeNull();
  });

  // —— route 下发的换档事实（#61 补的 learning_trace.modelSwap）——
  test("auto 档冷却换档：台账里首选与应答已经是同一个模型，只有 modelSwap 知道换过", () => {
    const trace = {model: "deepseek-v4-flash", modelUsage: {model: "deepseek-v4-flash"}};
    expect(modelTurnNotice({modelMode: "auto", trace})).toBeNull();
    const notice = modelTurnNotice({modelMode: "auto", trace: {...trace, modelSwap: {from: "kimi-k3", to: "deepseek-v4-flash"}}})!;
    expect(notice.kind).toBe("change");
    expect(notice.requiresConfirm).toBe(false);
    expect(notice.text).toContain("不可用");
    expect(notice.text).toContain("更省");
    expect(notice.ackKey).toBe("kimi-k3→deepseek-v4-flash");
  });
  test("换到更贵的档：即使 route 只报了 from/to，也按升档拦人", () => {
    const notice = modelTurnNotice({modelMode: "auto", trace: {model: "kimi-k3", modelSwap: {from: "deepseek-v4-flash", to: "kimi-k3"}}})!;
    expect(notice.kind).toBe("tier-up");
    expect(notice.requiresConfirm).toBe(true);
  });
  test("from 与 to 相同（无实义的重发字段）：不据此打扰用户", () => {
    expect(modelTurnNotice({modelMode: "auto", trace: {model: "kimi-k3", modelSwap: {from: "kimi-k3", to: "kimi-k3"}}})).toBeNull();
  });
});

describe("档位与模式映射", () => {
  test("fast→经济 id；auto 不承诺具体模型；显式 id 原样", () => {
    expect(expectedModelForMode("fast")).toBe("deepseek-v4-flash");
    expect(expectedModelForMode("auto")).toBeNull();
    expect(expectedModelForMode("glm-5.3")).toBe("glm-5.3");
  });
  test("经济 id 归实惠档，目录外 id 归 unknown 不误判为升档", () => {
    expect(modelTier("deepseek-v4-flash")).toBe("cheap");
    expect(modelTier("glm-5.3")).toBe("expensive");
    expect(modelTier("some-gateway-only-model")).toBe("unknown");
    expect(modelTurnNotice({modelMode: "fast", trace: {model: "some-gateway-only-model"}})!.kind).toBe("change");
  });
});

describe("确认状态存储", () => {
  function fakeStore() {
    const map = new Map<string, string>();
    return {getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v)};
  }
  test("确认过的换法不再反复拦；新换法仍然出现", () => {
    const store = fakeStore();
    const notice = modelTurnNotice({modelMode: "fast", trace: {model: "deepseek-v4-pro"}})!;
    expect(isAcknowledged(store, notice)).toBe(false);
    rememberAcknowledged(store, notice);
    expect(isAcknowledged(store, notice)).toBe(true);
    const other = modelTurnNotice({modelMode: "fast", trace: {model: "glm-5.3"}})!;
    expect(isAcknowledged(store, other)).toBe(false);
  });
  test("存储坏掉时按未确认处理，不崩", () => {
    expect(isAcknowledged({getItem: () => { throw Error("no storage"); }}, {kind: "tier-up", text: "", ackKey: "a", requiresConfirm: true})).toBe(false);
  });
});
