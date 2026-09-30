import { splitSavedJobs, trackedJobUrls } from "./retrieval-gate";
import type { DiscoveredJob } from "./discovery";

const job = (over: Partial<DiscoveredJob> = {}): DiscoveredJob => ({
  id: "remotive:1", company: "Acme", title: "Product Manager", location: "Remote",
  url: "https://remotive.com/remote-jobs/product/pm-1", description: "Own the roadmap",
  checkedAt: "2026-09-30T00:00:00Z", publishedAt: "2026-09-28T00:00:00Z", ...over,
});

test("已跟踪的按来源链接认：同一家公司换个城市的岗不许被一起藏掉", () => {
  const tracked = trackedJobUrls([{ workspaceType: "job", jdText: "公司：Acme\n岗位：Product Manager\n地点：上海\n来源：https://remotive.com/remote-jobs/product/pm-1\n\nOwn the roadmap" }]);
  const { fresh, tracked: hits } = splitSavedJobs([job(), job({ id: "r:2", location: "Beijing", url: "https://remotive.com/remote-jobs/product/pm-2" })], tracked);
  expect(hits).toEqual([{ company: "Acme", title: "Product Manager" }]);
  expect(fresh.map(item => item.location)).toEqual(["Beijing"]);
});

test("只归一尾部斜杠与锚点：查询串敢删就会把两条不同的岗并成一条", () => {
  const tracked = trackedJobUrls([{ workspaceType: "job", jdText: `来源：https://a.test/jobs/9/#details` }]);
  expect(splitSavedJobs([job({ url: "https://a.test/jobs/9/" })], tracked).tracked).toHaveLength(1);
  // `?id=` 分岗位是招聘板的常见写法，删掉查询串会把 9 和 10 认成同一条 → 少给一个真机会
  expect(splitSavedJobs([job({ url: "https://a.test/jobs/9?id=10" })], tracked).fresh).toHaveLength(1);
  // 另一块板子上的重发（链接不同）也不并：漏认只是多推一条，认错会少一个机会
  expect(splitSavedJobs([job({ url: "https://b.test/jobs/9" })], tracked).fresh).toHaveLength(1);
});

test("手粘的 JD 没有来源行：拿不准就照常推荐", () => {
  expect(trackedJobUrls([{ workspaceType: "job", jdText: "公司：Acme\n岗位：Product Manager\n负责 roadmap" }]).size).toBe(0);
  expect(splitSavedJobs([job()], trackedJobUrls([{ workspaceType: "job", jdText: "" }])).fresh).toHaveLength(1);
});

test("简历台与 Offer 条目不参与比对，也不拿它们的历史文本当已跟踪", () => {
  const tracked = trackedJobUrls([
    { workspaceType: "preparation", jdText: "来源：https://remotive.com/remote-jobs/product/pm-1" },
    { workspaceType: "offer", jdText: "来源：https://remotive.com/remote-jobs/product/pm-1" },
  ]);
  expect(tracked.size).toBe(0);
  expect(splitSavedJobs([job()], tracked).fresh).toHaveLength(1);
});

test("同一条被两个关键词搜回来时，已跟踪只报一次", () => {
  const tracked = trackedJobUrls([{ workspaceType: "job", jdText: "来源：https://a.test/jobs/9" }]);
  const { tracked: hits } = splitSavedJobs([job({ url: "https://a.test/jobs/9" }), job({ id: "x:2", url: "https://a.test/jobs/9" })], tracked);
  expect(hits).toHaveLength(1);
});
