import { waitForSavedSearch } from "./search-recovery";
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
