import { createIntakeCache, intakeReceipt, readIntakeResponse } from "./intake-flow";
import type { Opportunity } from "./types";

test("保存失败重试复用已完成整理；输入变化不得沿用旧结论", async () => {
  const cache = createIntakeCache<{ text: string }>();
  const load = jest.fn().mockResolvedValue({ text: "整理结果" });
  const id = cache.requestId("original");
  await cache.analyze("original", load);
  // Persistence is separate and can fail; keeping this cache avoids charging another model call.
  expect(await cache.analyze("original", load)).toEqual({ text: "整理结果" });
  expect(load).toHaveBeenCalledTimes(1);
  expect(cache.requestId("original")).toBe(id);
  await cache.analyze("changed", load);
  expect(load).toHaveBeenCalledTimes(2);
  expect(cache.requestId("changed")).not.toBe(id);
  cache.clear(); await cache.analyze("changed", load);
  expect(load).toHaveBeenCalledTimes(3);
});
test("失败的模型请求使用新的任务编号重试，不重放已退款额度预留", async () => {
  const cache = createIntakeCache<string>();
  const id = cache.requestId("same");
  await expect(cache.analyze("same", async () => { throw Error("timeout"); })).rejects.toThrow("timeout");
  expect(cache.requestId("same")).not.toBe(id);
  expect(await cache.analyze("same", async () => "success")).toBe("success");
});
test("双击的并发整理合并为一次模型请求", async () => {
  const cache = createIntakeCache<string>();
  let finish!: (value: string) => void;
  const load = jest.fn(() => new Promise<string>(resolve => { finish = resolve; }));
  const a = cache.analyze("same", load), b = cache.analyze("same", load);
  finish("result"); expect(await Promise.all([a, b])).toEqual(["result", "result"]);
  expect(load).toHaveBeenCalledTimes(1);
});
test("真正的流式阶段跨中文字节边界解析，只有最终结果才算完成", async () => {
  const bytes = new TextEncoder().encode('{"type":"progress","phase":"analyzing","requestId":"test-id"}\n{"type":"progress","phase":"invented"}\n{"type":"result","data":{"ok":true,"title":"上海产品经理"}}');
  const stream = new ReadableStream({ start(controller) { for (const byte of bytes) controller.enqueue(new Uint8Array([byte])); controller.close(); } });
  const progress = jest.fn();
  expect(await readIntakeResponse(new Response(stream, { headers: { "content-type": "application/x-ndjson" } }), progress)).toEqual({ ok: true, title: "上海产品经理" });
  expect(progress.mock.calls).toEqual([["analyzing", "test-id"]]);
});
test("只有进度没有最终结果的断流不能当作成功", async () => {
  await expect(readIntakeResponse(new Response('{"type":"progress","phase":"reading"}\n', { headers: { "content-type": "application/x-ndjson" } }), jest.fn())).rejects.toThrow("未收到完整结果");
});
test("旧 JSON 客户端与401错误仍兼容，不伪造进度", async () => {
  const progress = jest.fn();
  expect(await readIntakeResponse(Response.json({ ok: false, error: "未认证" }, { status: 401 }), progress)).toEqual({ ok: false, error: "未认证" });
  expect(progress).not.toHaveBeenCalled();
});
const opportunity = { id: "saved-id", workspaceType: "job", company: "示例", role: "产品经理", location: "地点待确认", jdText: "JD原文", resumeText: "", recommendationReason: "没有简历不能判断匹配", requirements: [{ requirement: "本科" }, { requirement: "三年" }, { requirement: "SQL" }, { requirement: "Python" }] } as Opportunity;
test("JD回执说明岗位、三个要求、缺失简历与地点、保存落点和唯一下一步", () => {
  expect(intakeReceipt(opportunity, false)).toMatchObject({ kind: "岗位 JD", savedAt: "左侧机会列表 · 示例 · 产品经理", requirements: ["本科", "三年", "SQL"], missing: ["地点", "简历"], next: "补充简历，判断是否值得投" });
});
test("未识别材料不假装已建目标岗位，降级不输出匹配结论", () => {
  const receipt = intakeReceipt({ ...opportunity, workspaceType: "preparation", role: "方向待确认", jdText: "", profileText: "未知材料" }, true);
  expect(receipt.kind).toBe("待确认材料"); expect(receipt.title).toContain("材料类型还需确认"); expect(receipt.reason).toContain("不能据此判断匹配度"); expect(receipt.requirements).toEqual([]);
});
test("仅提供已识别求职方向不被误标为材料识别失败", () => {
  const receipt = intakeReceipt({ ...opportunity, workspaceType: "preparation", role: "产品经理", jdText: "", profileText: "想做产品经理" }, false);
  expect(receipt.kind).toBe("简历 / 求职方向");
  expect(receipt.title).toBe("基础档案已建立");
});
