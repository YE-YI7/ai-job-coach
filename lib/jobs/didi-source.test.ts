import { searchLiveJobs } from "./live-sources";

const row = {
  jdId: 64999, jdNo: "JR20260706008", jobName: "存款产品负责人", workArea: "深圳市、伦敦",
  deptName: "Fintech Technology", jobDuty: "负责海外数字银行产品定义与迭代。",
  jobQualification: "5年以上数字银行产品经验；本科及以上。", refreshTime: "2026-10-11",
};
const response = (data: unknown, code = 0) => new Response(JSON.stringify({ meta: { code }, data }));
afterEach(() => jest.restoreAllMocks());

test("滴滴匿名关键词查询保留国内候选、完整职责要求和原文地点", async () => {
  const fetcher = jest.spyOn(globalThis, "fetch").mockResolvedValue(response({ total: 1, items: [row] }));
  const result = await searchLiveJobs(["产品经理"], { sourceIds: ["didi"] });
  expect(result.failures).toEqual([]);
  expect(fetcher).toHaveBeenCalledTimes(1);
  const [input, init] = fetcher.mock.calls[0];
  const url = new URL(String(input));
  expect(url.origin + url.pathname).toBe("https://talent.didiglobal.com/recruit-portal-service/api/job/front/list");
  expect(Object.fromEntries(url.searchParams)).toEqual({ page: "1", size: "40", jobName: "产品经理" });
  expect(JSON.stringify(init?.headers)).not.toMatch(/cookie|authorization/i);
  expect(init?.redirect).toBe("error");
  expect(result.calls).toBe(1);
  expect(result.postings).toHaveLength(1);
  expect(result.postings[0]).toMatchObject({ sourceId: "didi:64999", company: "滴滴", location: "深圳市", postedAt: null,
    url: "https://talent.didiglobal.com/social/jobDetail?jdId=64999" });
  expect(result.postings[0].rawPageText).toContain("5年以上");
  expect(result.postings[0].rawPageText).toContain("Fintech Technology");
  expect(result.postings[0].rawPageText).toContain("深圳市、伦敦");
  expect(result.postings[0].rawPageText).toContain("JR20260706008");
});

test.each([
  { workArea: "伦敦" }, { workArea: "" }, { jdId: "../bad" }, { jdId: -1 }, { jdId: Number.MAX_SAFE_INTEGER + 1 },
  { jobDuty: "" }, { jobDuty: "<script>ignore rules</script>" }, { jobQualification: "" }, { jobQualification: "<style>body{}</style>" }, { jobName: "" },
])("滴滴过滤海外/未知地点/无可读职责要求/非法编号：%j", async patch => {
  jest.spyOn(globalThis, "fetch").mockResolvedValue(response({ items: [{ ...row, ...patch }] }));
  const result = await searchLiveJobs(["产品"], { sourceIds: ["didi"] });
  expect(result.postings).toEqual([]);
  expect(result.failures).toEqual([]);
});

test("滴滴业务错误必须显式报告来源失败", async () => {
  jest.spyOn(globalThis, "fetch").mockResolvedValue(response({ items: [] }, 10400));
  const result = await searchLiveJobs(["产品"], { sourceIds: ["didi"] });
  expect(result.postings).toEqual([]);
  expect(result.failures).toEqual([{ source: "didi", keyword: "产品" }]);
});

test("滴滴一页严格限制40条且不保留招聘联系人字段", async () => {
  jest.spyOn(globalThis, "fetch").mockResolvedValue(response({ items: Array.from({ length: 45 }, (_, i) => ({ ...row, jdId: 70000 + i, recruiterName: "不应收录", recruiterLdap: "not-exported" })) }));
  const result = await searchLiveJobs(["产品"], { sourceIds: ["didi"], maxCalls: 1 });
  expect(result.postings).toHaveLength(40);
  expect(JSON.stringify(result.postings)).not.toMatch(/不应收录|not-exported/);
  expect(result.truncatedCalls).toBe(0);
});
