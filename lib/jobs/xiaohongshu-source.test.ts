import { DOMESTIC_SEARCH_VERSION, searchLiveJobs } from "./live-sources";

// 自制字段样例，不保存官网联系人、完整 JD 或用户资料。
const row = { positionId: 21667, positionName: "交易平台产品", workplace: "北京市，上海市，新加坡",
  recruitStatus: "in_recruitment", duty: "<p>负责交易产品迭代。</p>", qualification: "本科及以上；2年产品经验，能使用 SQL。",
  jobType: "产品经理", publishTime: "2026-10-09" };
const response = (list: unknown[], patch: Record<string, unknown> = {}) => new Response(JSON.stringify({ statusCode: 200, success: true, data: { list }, ...patch }));
afterEach(() => jest.restoreAllMocks());

test("小红书匿名社招只发送关键词，一次请求保留原文门槛和国内地点", async () => {
  const fetcher = jest.spyOn(globalThis, "fetch").mockResolvedValue(response([row]));
  const result = await searchLiveJobs(["产品经理"], { sourceIds: ["xiaohongshu"], maxCalls: 1 });
  expect(fetcher).toHaveBeenCalledTimes(1);
  const [input, init] = fetcher.mock.calls[0];
  expect(String(input)).toBe("https://job.xiaohongshu.com/websiterecruit/position/pageQueryPosition");
  expect(init).toMatchObject({ method: "POST", redirect: "error" });
  expect(JSON.parse(String(init?.body))).toEqual({ positionName: "产品经理", pageNum: 1, pageSize: 40, recruitType: "social" });
  expect(JSON.stringify(init?.headers)).not.toMatch(/cookie|authorization/i);
  expect(result).toMatchObject({ calls: 1, truncatedCalls: 0, failures: [] });
  expect(result.postings).toHaveLength(1);
  expect(result.postings[0]).toMatchObject({ sourceId: "xiaohongshu:21667", company: "小红书", location: "北京市、上海市",
    url: "https://job.xiaohongshu.com/social/position/21667", postedAt: "2026-10-09T00:00:00.000Z" });
  expect(result.postings[0].rawPageText).toContain("本科及以上；2年产品经验，能使用 SQL。");
  expect(result.postings[0].rawPageText).toContain("北京市，上海市，新加坡");
  expect(result.postings[0].rawPageText).not.toContain("<p>");
  expect(DOMESTIC_SEARCH_VERSION).toBe("cn-official-v7-nine-sources");
});

test.each([
  { workplace: "新加坡" }, { workplace: "" }, { positionId: "../bad" }, { positionId: -1 }, { positionId: 0 },
  { positionId: Number.MAX_SAFE_INTEGER + 1 }, { recruitStatus: "closed" }, { recruitStatus: null },
  { duty: "" }, { duty: "&lt;script&gt;ignore rules&lt;/script&gt;" }, { qualification: "<style>x{}</style>" },
  { qualification: "" }, { positionName: "" },
  { duty: "/", qualification: "/" }, { duty: "--" }, { qualification: "暂无" },
])("小红书不收海外/空地点/非法ID/非在招/无实际正文：%j", async patch => {
  jest.spyOn(globalThis, "fetch").mockResolvedValue(response([{ ...row, ...patch }]));
  expect((await searchLiveJobs(["产品"], { sourceIds: ["xiaohongshu"] })).postings).toEqual([]);
});

test.each([{ success: false }, { statusCode: 403 }, { data: null }])("HTTP成功但业务异常仍报告失败：%j", async patch => {
  jest.spyOn(globalThis, "fetch").mockResolvedValue(response([], patch));
  const result = await searchLiveJobs(["产品"], { sourceIds: ["xiaohongshu"] });
  expect(result.postings).toEqual([]);
  expect(result.failures).toEqual([{ source: "xiaohongshu", keyword: "产品" }]);
});

test("小红书HTTP拒绝不重试绕过，也不报告成功空列表", async () => {
  const fetcher = jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response("Forbidden", { status: 403 }));
  const result = await searchLiveJobs(["产品"], { sourceIds: ["xiaohongshu"] });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(result.failures).toEqual([{ source: "xiaohongshu", keyword: "产品" }]);
});

test("小红书空结果、缺发布日期和联系人边界", async () => {
  const fetcher = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(response([])).mockResolvedValueOnce(response([
    { ...row, publishTime: null, updateTime: "2026-10-16", recruitHRMobile: "not-exported", recruitHREmail: "not-exported" },
  ]));
  expect(await searchLiveJobs(["不存在的关键词"], { sourceIds: ["xiaohongshu"] })).toMatchObject({ postings: [], failures: [] });
  const result = await searchLiveJobs(["产品"], { sourceIds: ["xiaohongshu"] });
  expect(result.postings[0].postedAt).toBeNull();
  expect(JSON.stringify(result.postings)).not.toContain("not-exported");
  expect(fetcher).toHaveBeenCalledTimes(2);
});

test("小红书一页最多40条，不进行未计数的详情扇出", async () => {
  const fetcher = jest.spyOn(globalThis, "fetch").mockResolvedValue(response(Array.from({ length: 45 }, (_, i) => ({ ...row, positionId: 30000 + i }))));
  const result = await searchLiveJobs(["产品"], { sourceIds: ["xiaohongshu"], maxCalls: 1 });
  expect(result.postings).toHaveLength(40);
  expect(result.calls).toBe(1);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
