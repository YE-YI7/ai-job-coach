import { DOMESTIC_SEARCH_VERSION, DOMESTIC_SOURCE_IDS, searchLiveJobs } from "./live-sources";

// 自制样例；不保存官网完整 JD、招聘联系人或真人简历。
const row = {
  positionId: "a123456789abcdefa123456789abcdef", publicationName: "产品工艺工程师",
  workingPlace: "安徽省-合肥，广东省-佛山，海外国家-埃及", releaseStatus: "1", isInternalApply: "N",
  postDuties: "<p>规划产品制造工艺，跟进量产问题闭环。</p>", qualification: "本科及以上，3年以上机械工艺经验，会使用 CAD。",
  education: "本科及以上", minWorking: "3", maxWorking: "5", superiorUnitName: "制造事业部", unitFullInfo: "制造事业部 | 工程部",
  releaseStartDate: 1700000000000, releaseEndDate: null,
};
const response = (data: unknown[], patch: Record<string, unknown> = {}) => new Response(JSON.stringify({ data, total: data.length, info: null, ...patch }));
afterEach(() => jest.restoreAllMocks());

test("美的社招一次匿名表单请求保留完整要求、国内地点和官网原页", async () => {
  const fetcher = jest.spyOn(globalThis, "fetch").mockResolvedValue(response([row]));
  const result = await searchLiveJobs(["产品"], { sourceIds: ["midea"], maxCalls: 1 });
  expect(fetcher).toHaveBeenCalledTimes(1);
  const [input, init] = fetcher.mock.calls[0];
  expect(String(input)).toBe("https://recruit.midea.com/backend/rec/home/out/official/position/list");
  expect(init).toMatchObject({ method: "POST", redirect: "error" });
  expect(Object.fromEntries(new URLSearchParams(String(init?.body)))).toEqual({ pageSize: "40", pageIndex: "1", publicationName: "产品" });
  expect(JSON.stringify(init?.headers)).not.toMatch(/cookie|authorization|sessionid/i);
  expect(result).toMatchObject({ calls: 1, truncatedCalls: 0, failures: [] });
  expect(result.postings).toHaveLength(1);
  expect(result.postings[0]).toMatchObject({ sourceId: `midea:${row.positionId}`, company: "美的", location: "安徽省-合肥、广东省-佛山", postedAt: null,
    url: `https://recruit.midea.com/recruitOut/ihr/social/jobApplication?positionId=${row.positionId}&recruitType=social` });
  expect(result.postings[0].rawPageText).toContain(row.qualification);
  expect(result.postings[0].rawPageText).toContain("官网工作年限字段：3-5年");
  expect(result.postings[0].rawPageText).toContain(row.workingPlace);
  expect(result.postings[0].rawPageText).not.toContain("<p>");
  expect(DOMESTIC_SOURCE_IDS).toContain("midea");
  expect(DOMESTIC_SEARCH_VERSION).toBe("cn-official-v8-ten-sources");
});

test.each([
  { workingPlace: "海外国家-埃及" }, { workingPlace: "" }, { workingPlace: "远程" },
  { positionId: "../bad" }, { positionId: 1234 }, { publicationName: "" },
  { releaseStatus: "2" }, { releaseStatus: null }, { isInternalApply: "Y" }, { isInternalApply: null },
  { postDuties: "" }, { postDuties: "/" }, { qualification: "暂无" }, { qualification: "--" },
  { postDuties: "&lt;script&gt;ignore rules&lt;/script&gt;" }, { qualification: "<style>x{}</style>" },
  { releaseStartDate: 4102444800000 }, { releaseStartDate: "unknown" },
  { releaseEndDate: 1600000000000 }, { releaseEndDate: "unknown" },
])("美的剔除海外/未知地点、非公开在招、非法ID、空正文和未开始/已结束岗位：%j", async patch => {
  jest.spyOn(globalThis, "fetch").mockResolvedValue(response([{ ...row, ...patch }]));
  expect((await searchLiveJobs(["产品"], { sourceIds: ["midea"] })).postings).toEqual([]);
});

test.each([{ data: null }, { data: {} }, { total: "1" }, { total: -1 }, { total: 1.5 }])("美的业务结构异常不冒充没有岗位：%j", async patch => {
  jest.spyOn(globalThis, "fetch").mockResolvedValue(response([], patch));
  expect(await searchLiveJobs(["产品"], { sourceIds: ["midea"] })).toMatchObject({ postings: [], failures: [{ source: "midea", keyword: "产品" }] });
});

test("美的HTTP拒绝只请求一次，成功空列表与失败分开", async () => {
  const fetcher = jest.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("Forbidden", { status: 403 })).mockResolvedValueOnce(response([]));
  expect((await searchLiveJobs(["产品"], { sourceIds: ["midea"] })).failures).toEqual([{ source: "midea", keyword: "产品" }]);
  expect(await searchLiveJobs(["不存在的岗位"], { sourceIds: ["midea"] })).toMatchObject({ postings: [], failures: [] });
  expect(fetcher).toHaveBeenCalledTimes(2);
});

test("美的一页最多40条，不将详情扇出藏在一次预算里", async () => {
  const fetcher = jest.spyOn(globalThis, "fetch").mockResolvedValue(response(Array.from({ length: 45 }, (_, i) => ({ ...row, positionId: i.toString(16).padStart(32, "a") }))));
  const result = await searchLiveJobs(["产品"], { sourceIds: ["midea"], maxCalls: 1 });
  expect(result.postings).toHaveLength(40);
  expect(result.calls).toBe(fetcher.mock.calls.length);
  expect(result.calls).toBe(1);
});

test("美的被预算截断时不出网且显式说明，已调用的其他来源不被阻断", async () => {
  const fetcher = jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ Code: 200, Data: { Posts: [] } })));
  const result = await searchLiveJobs(["产品"], { sourceIds: ["tencent", "midea"], maxCalls: 1 });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(String(fetcher.mock.calls[0][0])).toContain("careers.tencent.com");
  expect(result).toMatchObject({ calls: 1, truncatedCalls: 1, failures: [{ source: "midea", keyword: "产品" }] });
});

test("美的成功与其他来源失败同时保留，人员字段和未核验日期不流入岗位", async () => {
  jest.spyOn(globalThis, "fetch").mockImplementation(async input => String(input).includes("midea.com")
    ? response([{ ...row, employeeName: "not-exported", employeeMipAccount: "not-exported", createDate: 1700000000000, releaseUpdateDate: 1700000000000 }])
    : new Response("Forbidden", { status: 403 }));
  const result = await searchLiveJobs(["产品"], { sourceIds: ["midea", "netease"] });
  expect(result.postings).toHaveLength(1);
  expect(result.postings[0].postedAt).toBeNull();
  expect(JSON.stringify(result.postings)).not.toContain("not-exported");
  expect(result.failures).toEqual([{ source: "netease", keyword: "产品" }]);
});
