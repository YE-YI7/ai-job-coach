import { needsExplicitSearch, waitForSavedSearch } from "./search-recovery";
test("刷新恢复过期的已完成搜索必须显式重搜，不自动扣 AI 额度", () => {
  expect(needsExplicitSearch(true, { found: false, status: "completed", runId: "old-batch" })).toBe(true);
  expect(needsExplicitSearch(false, { found: false, status: "completed", runId: "old-batch" })).toBe(false);
});
test("已有失配/未知状态记录只读；真首次搜索和匹配的缓存可继续", () => {
  expect(needsExplicitSearch(true, { found: false, runId: "old-batch" })).toBe(true);
  expect(needsExplicitSearch(true, { found: false, status: "failed" })).toBe(true);
  expect(needsExplicitSearch(true, { found: false })).toBe(false);
  expect(needsExplicitSearch(true, { found: true, runId: "cached" })).toBe(false);
});
test("恢复轮询直到保存结果，不另起任务", async () => {
  const read = jest.fn().mockResolvedValueOnce({ status: "running" }).mockResolvedValueOnce({ found: true, result: { jobs: ["a"] } });
  expect(await waitForSavedSearch(read, new AbortController().signal, async () => {})).toMatchObject({ found: true });
  expect(read).toHaveBeenCalledTimes(2);
});
test("失败和取消立即结束，未知故障不假装空列表成功", async () => {
  expect(await waitForSavedSearch(async () => ({ status: "failed" }), new AbortController().signal, async () => {})).toEqual({ status: "failed" });
  await expect(waitForSavedSearch(async () => { throw Error("DB failed"); }, new AbortController().signal, async () => {})).rejects.toThrow("DB failed");
});
test("关闭页面停止订阅，不重复搜索", async () => {
  const abort = new AbortController(); abort.abort(); const read = jest.fn();
  await expect(waitForSavedSearch(read, abort.signal, async () => {})).rejects.toThrow("Aborted");
  expect(read).not.toHaveBeenCalled();
});
