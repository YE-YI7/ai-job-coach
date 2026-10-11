import { searchLiveJobs } from "./live-sources";

const row = {
  jdId: 64999, jdNo: "JR20260706008", jobName: "存款产品负责人", workArea: "深圳市、伦敦",
  deptName: "Fintech Technology", jobDuty: "负责海外数字银行产品定义与迭代。",
  jobQualification: "5年以上数字银行产品经验；本科及以上。", refreshTime: "2026-10-11",
};
const response = (data: unknown, code = 0) => new Response(JSON.stringify({ meta: { code }, data }));
afterEach(() => jest.restoreAllMocks());

test("滴滴官网社招接口匿名按关键词查询，留国内地点、完整原文与可追溯原页", async () => {
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
  expect(result.postings).toHaveLength(1);
  expect(result.postings[0]).toMatchObject({ sourceId: "didi:64999", company: "滴滴", location: "深圳市", postedAt: null,
    url: "https://talent.didiglobal.com/social/jobDetail?jdId=64999" });
  expect(result.postings[0].rawPageText).toContain("5年以上");
  expect(result.postings[0].rawPageText).toContain("Fintech Technology");
});

test.each([
  { workArea: "伦敦" }, { workArea: "" }, { jdId: "../bad" }, { jobDuty: "" }, { jobQualification: "" }, { jobName: "" },
])("滴滴源丢弃海外/地点不明/缺失正文与非法ID：%j", async patch => {
  jest.spyOn(globalThis, "fetch").mockResolvedValue(response({ items: [{ ...row, ...patch }] }));
  const result = await searchLiveJobs(["产品"], { sourceIds: ["didi"] });
  expect(result.postings).toEqual([]);
  expect(result.failures).toEqual([]);
});

test("滴滴接口异常不能伪装成无匹配岗位", async () => {
  jest.spyOn(globalThis, "fetch").mockResolvedValue(response({ items: [] }, 10400));
  const result = await searchLiveJobs(["产品"], { sourceIds: ["didi"] });
  expect(result.postings).toEqual([]);
  expect(result.failures).toEqual([{ source: "didi", keyword: "产品" }]);
});
