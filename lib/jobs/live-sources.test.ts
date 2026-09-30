import { LIVE_SOURCES, searchLiveJobs, SOURCE_CREDIT, toDiscoveredJobs } from "./live-sources";
import { fetchJobBoard } from "@/lib/jobs/discovery";

jest.mock("@/lib/jobs/discovery", () => ({
  ...jest.requireActual("@/lib/jobs/discovery"),
  fetchJobBoard: jest.fn(),
}));

// 四份 fixture 的字段名与外层结构按 2026-09-30 实测的源响应照抄。
const remotivePayload = {
  "job-count": 2,
  jobs: [
    { id: 1, url: "https://remotive.com/remote-jobs/product/pm-1", title: "Product Manager", company_name: "Acme",
      candidate_required_location: "Remote, Worldwide", publication_date: "2026-09-20T10:00:00",
      description: "<p>Own the roadmap.<script>evil()</script> 简历邮箱 <b>写这里</b></p>" },
    // 坏数据：链接不是 https、缺公司名 —— 不能进结果，也不能把整源带崩
    { id: 2, url: "http://evil.example.com/x", title: "No Company", company_name: "" },
  ],
};
const jobicyPayload = {
  jobCount: 1,
  jobs: [{ id: 9, url: "https://jobicy.com/jobs/9-senior-pm", jobTitle: "Senior PM", companyName: "Beta",
    geo: "Worldwide", pubDate: "2026-09-25T00:00:00Z", jobDescription: "<div>Lead product</div>" }],
};
// RemoteOK 回的是数组，第 0 格是服务器说明行不是岗位
const remoteokPayload = [
  { date_type: "regular", tagline: "Remote OK is a board for developers" },
  { id: 77, position: "AI Product Manager", company: "Gamma", location: "European Union",
    date: "2026-09-24T08:00:00+00:00", url: "https://remoteok.com/remote-jobs/ai-product-manager-gamma-77",
    description: "<p>Define the AI roadmap</p>" },
];

let urls: string[] = [];
function serveOnline() {
  urls = [];
  jest.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    urls.push(url);
    if (url.includes("remotive.com")) return new Response(JSON.stringify(remotivePayload));
    if (url.includes("jobicy.com")) return new Response(JSON.stringify(jobicyPayload));
    if (url.includes("remoteok.com")) return new Response(JSON.stringify(remoteokPayload));
    throw new Error("unexpected host");
  });
}

afterEach(() => { jest.restoreAllMocks(); jest.resetAllMocks(); (fetchJobBoard as jest.Mock).mockReset(); });

test("关键词真的进了出网地址，中文方向先翻成英文词表", async () => {
  serveOnline();
  await searchLiveJobs(["product manager"], { sourceIds: ["remoteok", "jobicy"] });
  expect(urls).toHaveLength(2);
  // Jobicy 的 tag 认空格不认连字符（实测 product-manager 返回 0 条）
  for (const url of urls) expect(url).toMatch(/tag=product(\+|%20)manager/);
});

test("正文按不可信数据处理：去标签去脚本，界面拿不到 HTML", async () => {
  serveOnline();
  const result = await searchLiveJobs(["product manager"], { sourceIds: ["remotive"] });
  const [job] = toDiscoveredJobs(result.postings);
  expect(job.description).not.toMatch(/<|script|evil/);
  expect(job.description).toContain("Own the roadmap");
  expect(job.location).toBe("Remote, Worldwide");
  expect(job.publishedAt).toBe(new Date(Date.parse("2026-09-20T10:00:00")).toISOString());
});

test("坏链接坏记录只丢这一条，同源其它岗位照常在", async () => {
  serveOnline();
  const result = await searchLiveJobs(["product manager"], { sourceIds: ["remotive"] });
  expect(result.postings).toHaveLength(1);
  expect(result.failures).toHaveLength(0);
});

test("RemoteOK 的说明行进不了结果：缺岗位名公司名的格子直接丢", async () => {
  serveOnline();
  const result = await searchLiveJobs(["product manager"], { sourceIds: ["remoteok"] });
  expect(result.postings).toHaveLength(1);
  expect(result.postings[0]).toMatchObject({ company: "Gamma", title: "AI Product Manager", location: "European Union" });
  expect(result.postings[0].postedAt).toBe(new Date(Date.parse("2026-09-24T08:00:00+00:00")).toISOString());
});

test("单源故障隔离：一个源挂了其它源照收，失败逐源记账", async () => {
  jest.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    if (String(input).includes("remoteok.com")) throw new Error("offline");
    if (String(input).includes("remotive.com")) return new Response(JSON.stringify(remotivePayload));
    return new Response(JSON.stringify(jobicyPayload));
  });
  const result = await searchLiveJobs(["product manager"], { sourceIds: ["remoteok", "jobicy", "remotive"] });
  expect(result.postings.map((posting) => posting.company).sort()).toEqual(["Acme", "Beta"]);
  expect(result.failures).toEqual([{ source: "remoteok", keyword: "product manager" }]);
});

test("流源不吃关键词：Remotive 与 Ashby 整轮各拉一次，不重复打同一批数据", async () => {
  serveOnline();
  (fetchJobBoard as jest.Mock).mockResolvedValue([]);
  const result = await searchLiveJobs(["a", "b", "c"], { sourceIds: ["remoteok", "jobicy", "remotive", "ashby"] });
  // 3 关键词 × 2 个按词查的源 + Remotive 一次 + Ashby 一次
  expect(result.calls).toBe(8);
  expect(urls.filter((url) => url.includes("remotive.com"))).toHaveLength(1);
  expect(fetchJobBoard).toHaveBeenCalledTimes(2); // 两块已登记的公司板，各一次
});

test("扇出有上限：被截掉的调用记进失败与 truncatedCalls，不静默少搜", async () => {
  serveOnline();
  const result = await searchLiveJobs(["a", "b", "c"], { sourceIds: ["remoteok", "jobicy"], maxCalls: 2 });
  expect(result.calls).toBe(2);
  expect(result.truncatedCalls).toBe(4);
  expect(result.failures).toHaveLength(4);
});

test("同一岗位被多个关键词命中只留一条", async () => {
  serveOnline();
  const result = await searchLiveJobs(["product manager", "product"], { sourceIds: ["remoteok"] });
  expect(result.postings).toHaveLength(1);
});

test("预算截掉的是靠后的关键词，不是某个源一整轮没被碰到", async () => {
  serveOnline();
  (fetchJobBoard as jest.Mock).mockResolvedValue([]);
  const result = await searchLiveJobs(["a", "b", "c", "d"], { maxCalls: 5 });
  expect(result.calls).toBe(5);
  expect(result.failures.every((failure) => failure.keyword !== "")).toBe(true);
  expect(urls.some((url) => url.includes("remotive.com"))).toBe(true);
  expect(fetchJobBoard).toHaveBeenCalled();
});

test("源清单与署名口径是同一份，界面不会说出第二套名字", () => {
  expect(LIVE_SOURCES.map((source) => source.id)).toEqual(["remoteok", "jobicy", "remotive", "ashby"]);
  expect(LIVE_SOURCES.every((source) => source.coverageNote.length > 0)).toBe(true);
  // 按词查的源和整轮流源是分开的两种：扇出预算只有前者花得多
  expect(LIVE_SOURCES.filter((source) => source.mode === "feed").map((source) => source.id)).toEqual(["remotive", "ashby"]);
  for (const source of LIVE_SOURCES) {
    const firstName = source.label.split(" ")[0];
    expect(SOURCE_CREDIT.includes(firstName === "公司公开招聘板" ? "公司公开招聘板" : firstName)).toBe(true);
  }
});
