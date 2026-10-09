import { searchLiveJobs } from "./live-sources";

const row = {
  jobPostId: "7683345689383995711", title: "AI 产品经理", cityZhNames: ["北京", "新加坡"], type: 1,
  url: "https://xiaomi.jobs.f.mioffice.cn/index/position/7683345689383995711/detail",
  description: "<p>负责 AI Agent 产品规划</p>", requirement: "本科及以上，五年以上 AI 产品经验",
  publishTime: "2026-09-09", levelOneDeptName: "汽车部",
};
const payload = (list: unknown[]) => new Response(JSON.stringify({ code: 0, data: { list } }));
afterEach(() => jest.restoreAllMocks());

test("小米匿名官网查询仅传关键词和社招参数，保留国内地点、硬门槛、原页和发布日期", async () => {
  const fetcher = jest.spyOn(globalThis, "fetch").mockResolvedValue(payload([row]));
  const result = await searchLiveJobs(["产品经理"], { sourceIds: ["xiaomi"] });
  expect(result.failures).toEqual([]);
  expect(fetcher).toHaveBeenCalledTimes(1);
  const [input, init] = fetcher.mock.calls[0];
  const url = new URL(String(input));
  expect(url.origin + url.pathname).toBe("https://hr.xiaomi.com/website/api/agent/searchJobPage");
  expect(Object.fromEntries(url.searchParams)).toEqual({ keyword: "产品经理", type: "1", pageNum: "1", pageSize: "40" });
  expect(init?.body).toBeUndefined();
  expect(JSON.stringify(init?.headers)).not.toMatch(/cookie|authorization/i);
  expect(init?.redirect).toBe("error");
  expect(result.postings).toHaveLength(1);
  expect(result.postings[0]).toMatchObject({ sourceId: `xiaomi:${row.jobPostId}`, company: "小米", location: "北京", url: row.url, postedAt: "2026-09-09T00:00:00.000Z" });
  expect(result.postings[0].rawPageText).toContain("汽车部");
  expect(result.postings[0].rawPageText).toContain("五年以上 AI 产品经验");
  expect(result.postings[0].rawPageText).not.toContain("<p>");
});

test.each([
  { type: 2 }, { type: 3 }, { cityZhNames: ["新加坡"] }, { cityZhNames: [] },
  { jobPostId: "../evil" }, { jobPostId: 7683345689383995711 },
  { url: "https://other.jobs.f.mioffice.cn/index/position/7683345689383995711/detail" },
  { url: "https://xiaomi.jobs.f.mioffice.cn.evil.test/index/position/7683345689383995711/detail" },
  { url: "https://xiaomi.jobs.f.mioffice.cn/index/position/123/detail" },
  { url: "http://xiaomi.jobs.f.mioffice.cn/index/position/7683345689383995711/detail" },
  { requirement: "" }, { description: "" }, { title: "" },
])("社招源不接纳校园、海外、缺失全文或非官方/不匹配链接：%j", async patch => {
  jest.spyOn(globalThis, "fetch").mockResolvedValue(payload([{ ...row, ...patch }]));
  const result = await searchLiveJobs(["产品"], { sourceIds: ["xiaomi"] });
  expect(result.postings).toEqual([]);
  expect(result.failures).toEqual([]);
});

test.each([{ code: 500, data: { list: [] } }, { code: 0, data: {} }])("小米业务错误不能伪装成无匹配岗位：%j", async body => {
  jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(body)));
  const result = await searchLiveJobs(["产品"], { sourceIds: ["xiaomi"] });
  expect(result.postings).toEqual([]);
  expect(result.failures).toEqual([{ source: "xiaomi", keyword: "产品" }]);
});

test("发布日期缺失不以读取时间冒充；重复岗位按官网原页 ID 去重", async () => {
  jest.spyOn(globalThis, "fetch").mockResolvedValue(payload([{ ...row, publishTime: "" }, { ...row, publishTime: "" }]));
  const result = await searchLiveJobs(["产品"], { sourceIds: ["xiaomi"] });
  expect(result.postings).toHaveLength(1);
  expect(result.postings[0].postedAt).toBeNull();
});
