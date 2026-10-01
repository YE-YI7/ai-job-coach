import { POST } from "./route";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { listCockpitOpportunities, readUserTierPreference } from "@/lib/coach-harness/repository";
import { searchLiveJobs } from "@/lib/jobs/live-sources";
import { fetchJobBoard } from "@/lib/jobs/discovery";
import { completeTask, failTask, getTaskLedger, intakeEvent, startTask } from "@/lib/coach-harness/run-ledger";
import type { RawJobPosting } from "@/lib/coach-harness/subagents/retrieval";

jest.mock("@/lib/auth");
jest.mock("@/lib/coach-harness/run-ledger");
jest.mock("@/lib/coach-harness/repository");
jest.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
jest.mock("@/lib/jobs/discovery", () => ({ ...jest.requireActual("@/lib/jobs/discovery"), fetchJobBoard: jest.fn() }));
jest.mock("@/lib/jobs/live-sources", () => ({ ...jest.requireActual("@/lib/jobs/live-sources"), searchLiveJobs: jest.fn() }));

const id = "00000000-0000-4000-8000-000000000001";
const request = () => new Request("http://localhost/api/coach/jobs/discover", { method: "POST", body: JSON.stringify({ profileId: id }) });
const noPreference = { effectiveTiers: [], origin: "unset", sourceExcerpt: null, claimId: null, pending: null };

const posting = (description: string, over: Record<string, unknown> = {}): RawJobPosting => ({
  sourceId: "ashby:/meshy/9", url: "https://jobs.ashbyhq.com/meshy/9", fetchedAt: "2026-09-30T00:00:00Z",
  postedAt: "2026-09-28T00:00:00Z", company: "Meshy", title: "Product Manager", location: "Shanghai",
  rawPageText: description, ...over,
});
const online = (postings: RawJobPosting[], over: Record<string, unknown> = {}) =>
  ({ postings, failures: [], calls: 3, truncatedCalls: 0, ...over });

beforeEach(() => {
  jest.resetAllMocks();
  (startTask as jest.Mock).mockResolvedValue({ runId: "run-test", reused: false });
  (getTaskLedger as jest.Mock).mockResolvedValue({ runStatus: "running", status: "running" });
  (intakeEvent as jest.Mock).mockResolvedValue({ accepted: true, stored: true });
  (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({ id: "owner" });
  (listCockpitOpportunities as jest.Mock).mockResolvedValue([{ id, workspaceType: "preparation", role: "产品经理", location: "上海", resumeText: "2 年产品经验，会 SQL" }]);
  (readUserTierPreference as jest.Mock).mockResolvedValue(noPreference);
  (searchLiveJobs as jest.Mock).mockResolvedValue(online([posting("Own the roadmap.")]));
  (fetchJobBoard as jest.Mock).mockResolvedValue([]);
});

test("同一请求重放已保存结果，不再次搜索", async () => {
  (startTask as jest.Mock).mockResolvedValue({ runId: "run-test", reused: true });
  (getTaskLedger as jest.Mock).mockResolvedValue({ runStatus: "completed", status: "done", result: { runId: "run-test", jobs: [] } });
  expect(await (await POST(request())).json()).toEqual({ runId: "run-test", jobs: [] });
  expect(searchLiveJobs).not.toHaveBeenCalled();
});

test("取消后即使来源返回也不继续筛选或报完成", async () => {
  (getTaskLedger as jest.Mock).mockResolvedValue({ runStatus: "cancelled", status: "cancelled" });
  expect((await POST(request())).status).toBe(409);
  expect(completeTask).not.toHaveBeenCalled();
  expect(readUserTierPreference).not.toHaveBeenCalled();
});

test("全部源失败会持久化失败状态；不是成功空列表", async () => {
  (searchLiveJobs as jest.Mock).mockResolvedValue(online([], { calls: 1, failures: [{ source: "remoteok", keyword: "PM" }] }));
  expect((await POST(request())).status).toBe(502);
  expect(failTask).toHaveBeenCalledWith(expect.objectContaining({ failureType: "all_sources_failed" }));
  expect(completeTask).not.toHaveBeenCalled();
});

test("部分失败保存可用产物为 partial，成功才进入 done", async () => {
  (searchLiveJobs as jest.Mock).mockResolvedValue(online([posting("Own the roadmap.")], { failures: [{ source: "remoteok", keyword: "PM" }] }));
  expect((await POST(request())).status).toBe(200);
  expect(failTask).toHaveBeenCalledWith(expect.objectContaining({ partialResult: expect.objectContaining({ jobs: expect.any(Array) }) }));
  expect(completeTask).not.toHaveBeenCalled();
});

test("未登录不读档案、不上网", async () => {
  (getCurrentUserFromRequest as jest.Mock).mockResolvedValue(null);
  expect((await POST(request())).status).toBe(401);
  expect(searchLiveJobs).not.toHaveBeenCalled();
  expect(listCockpitOpportunities).not.toHaveBeenCalled();
  expect(readUserTierPreference).not.toHaveBeenCalled();
});

test("档案不属于当前用户：不读也不搜", async () => {
  (listCockpitOpportunities as jest.Mock).mockResolvedValue([]);
  expect((await POST(request())).status).toBe(404);
  expect(listCockpitOpportunities).toHaveBeenCalledWith("owner");
  expect(searchLiveJobs).not.toHaveBeenCalled();
});

test("出网的只有过闸的关键词：真跑一次源，逐个地址检查没有简历与联系方式", async () => {
  const live = jest.requireActual("@/lib/jobs/live-sources") as typeof import("@/lib/jobs/live-sources");
  (searchLiveJobs as jest.Mock).mockImplementation(live.searchLiveJobs);
  (listCockpitOpportunities as jest.Mock).mockResolvedValue([{
    id, workspaceType: "preparation", role: "产品经理", location: "上海",
    resumeText: "郭小明 13800138000 guoxm@example.com 字节跳动 抖音电商 用 SQL 取数",
  }]);
  const urls: string[] = [];
  const globalFetch = jest.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    urls.push(url);
    expect(String(init?.body || "")).not.toMatch(/13800138000|guoxm|郭小明|字节|抖音|example\.com/i);
    return new Response(JSON.stringify(url.includes("hr.163.com") ? {code:200,data:{list:[]}} : { Code:200, Data:{Posts:[]} }));
  });
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(urls.length).toBeGreaterThan(0);
  for (const url of urls) {
    expect(url.startsWith("https://")).toBe(true);
    expect(url).not.toMatch(/13800138000|guoxm|郭小明|字节|抖音|example\.com/i);
  }
  // 国内两源均真实调用，出网没有简历信息。
  expect(urls.every(url=>["careers.tencent.com","hr.163.com"].includes(new URL(url).hostname))).toBe(true);
  expect(urls.some(url=>new URL(url).hostname==="hr.163.com")).toBe(true);
  expect(urls.some(url=>new URL(url).searchParams.get("keyword")==="产品经理")).toBe(true);
  const body = await response.json();
  expect(body.search.keywords.join(" ")).not.toMatch(/13800138000|guoxm|郭小明/);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  globalFetch.mockRestore();
});

test("方向读不出关键词：直接说清楚，一次都不外呼", async () => {
  (listCockpitOpportunities as jest.Mock).mockResolvedValue([{ id, workspaceType: "preparation", role: "1234 5678", location: "上海", resumeText: "2 年产品经验" }]);
  const globalFetch = jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
  const response = await POST(request());
  expect(response.status).toBe(400);
  expect((await response.json()).error).toContain("求职方向");
  expect(searchLiveJobs).not.toHaveBeenCalled();
  expect(globalFetch).not.toHaveBeenCalled();
  globalFetch.mockRestore();
});

/* ----------------        空结果与部分失败必须是两回事        ---------------- */

test("全部源都没读到 = 错误，不是「没有匹配岗位」", async () => {
  (searchLiveJobs as jest.Mock).mockResolvedValue(online([], {
    failures: [{ source: "remoteok", keyword: "product manager" }, { source: "jobicy", keyword: "product manager" },
      { source: "remotive", keyword: "" }, { source: "ashby", keyword: "" }],
    calls: 4,
  }));
  const response = await POST(request());
  expect(response.status).toBe(502);
  expect((await response.json()).error).toContain("你的简历不受影响");
});

test("部分源失败照样出结果，失败的源如实点名", async () => {
  (searchLiveJobs as jest.Mock).mockResolvedValue(online([posting("Own the roadmap.")], {
    failures: [{ source: "remoteok", keyword: "product manager" }],
  }));
  const body = await (await POST(request())).json();
  expect(body.jobs).toHaveLength(1);
  expect(body.failedSources).toEqual(["RemoteOK 远程岗位"]);
});

test("搜到了但都不合适 = 空列表加搜过的词，不是错误", async () => {
  (searchLiveJobs as jest.Mock).mockResolvedValue(online([posting("Hiring a nurse.", { title: "Nurse", company: "Hospital", sourceId: "remotive:1" })]));
  const body = await (await POST(request())).json();
  expect(body.jobs).toHaveLength(0);
  expect(body.search.keywords.length).toBeGreaterThan(0);
  expect(body.search.calls).toBe(3);
});

test("扇出被上限截掉要说得出来，不静默少搜", async () => {
  (searchLiveJobs as jest.Mock).mockResolvedValue(online([posting("Own the roadmap.")], { calls: 12, truncatedCalls: 4 }));
  const body = await (await POST(request())).json();
  expect(body.search.truncatedCalls).toBe(4);
});

test("已跟踪的那条不占候选位，并且点名给用户看", async () => {
  (listCockpitOpportunities as jest.Mock).mockResolvedValue([
    { id, workspaceType: "preparation", role: "产品经理", location: "上海", resumeText: "2 年产品经验，会 SQL" },
    { id: "job-1", workspaceType: "job", company: "Meshy", role: "Product Manager",
      jdText: "公司：Meshy\n岗位：Product Manager\n地点：Shanghai\n来源：https://jobs.ashbyhq.com/meshy/9\n\nOwn the roadmap." },
  ]);
  (searchLiveJobs as jest.Mock).mockResolvedValue(online([
    posting("Own the roadmap."),
    posting("Own the roadmap.", { sourceId: "ashby:/meshy/10", url: "https://jobs.ashbyhq.com/meshy/10", title: "Senior Product Manager" }),
  ]));
  const body = await (await POST(request())).json();
  expect(body.jobs.map((job: { url: string }) => job.url)).toEqual(["https://jobs.ashbyhq.com/meshy/10"]);
  expect(body.search.alreadyTracked).toEqual([{ company: "Meshy", title: "Product Manager" }]);
  expect(body.note).toContain("1 条你已在跟踪");
});

test("坏请求不当档案处理", async () => {
  expect((await POST(new Request("http://localhost", { method: "POST", body: "{" }))).status).toBe(400);
});

/* ----------------        硬筛 / 时效 / 层次（原有链路）        ---------------- */

const withProfile = async (resumeText: string, description: string) => {
  (listCockpitOpportunities as jest.Mock).mockResolvedValue([{ id, workspaceType: "preparation", role: "产品经理", location: "上海", resumeText }]);
  (searchLiveJobs as jest.Mock).mockResolvedValue(online([posting(description)]));
  return (await POST(request())).json();
};

test("硬筛在链路上真的生效：够不上门槛的岗位进 filtered 并带理由", async () => {
  const result = await withProfile("2 年产品经验，本科学历。", "Requirements: 5+ years of experience.");
  expect(result.jobs).toHaveLength(0);
  expect(result.filtered).toHaveLength(1);
  expect(result.filtered[0].reasons.join()).toContain("5 年");
});

test("简历读不出年限学历不阻断：全部保留并标注待补（FR-5）", async () => {
  const result = await withProfile("负责过三个版本迭代。", "Requirements: 5+ years of experience.");
  expect(result.jobs).toHaveLength(1);
  expect(result.jobs[0].hardVerdict).toBe("keep_pending_profile");
  expect(result.pendingProfileFields).toEqual(["years"]);
  expect(result.filtered).toHaveLength(0);
});

test("时效标注随岗位下发：超过 30 天读作待核实", async () => {
  const result = await withProfile("2 年产品经验。", "Own the roadmap.");
  expect(result.jobs[0].freshness).toBe("in_sale");
  const stale = await withProfile("2 年产品经验。", "Own the roadmap.");
  (searchLiveJobs as jest.Mock).mockResolvedValue(online([posting("Own the roadmap.", { postedAt: "2026-01-01T00:00:00Z" })]));
  const staleBody = await (await POST(request())).json();
  expect(staleBody.jobs[0].freshness).toBe("待核实");
  expect(result.jobs).toHaveLength(1);
});

test("公司层次核验在链路上：认得出的给层次与出处，认不出的照样保留", async () => {
  (searchLiveJobs as jest.Mock).mockResolvedValue(online([
    posting("Own the roadmap."),
    posting("Own the roadmap.", { sourceId: "remotive:9", company: "查无此司实验室", url: "https://remotive.com/remote-jobs/x" }),
  ]));
  const result = await (await POST(request())).json();
  expect(result.jobs).toHaveLength(2);
  const meshy = result.jobs.find((j: Record<string, unknown>) => j.company === "Meshy");
  expect(meshy.tierLabel).toBe("独立融资的互联网/软件公司");
  expect(meshy.tierMatchedField).toBe("target_tiers_empty");
  expect(meshy.tierSources.length).toBeGreaterThan(1);
  const unknown = result.jobs.find((j: Record<string, unknown>) => j.company === "查无此司实验室");
  expect(unknown.tierLabel).toBeNull();
  expect(unknown.tierVerdict).toBe("unsure");
  expect(result.verification.status).toBe("ok");
  expect(result.verification.coverage).toEqual({ total: 2, inDirectory: 1 });
});

test("层次标注查离线名录：不为标档位额外打任何源", async () => {
  const globalFetch = jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
  const body = await (await POST(request())).json();
  expect(body.jobs[0].tierLabel).toBeTruthy();
  expect(searchLiveJobs).toHaveBeenCalledTimes(1);
  expect(globalFetch).not.toHaveBeenCalled();
  globalFetch.mockRestore();
});

/* ----------------        目标档位偏好（FR-9 剔除分支）        ---------------- */

const chosenTiers = async (tiers: string[]) => {
  (readUserTierPreference as jest.Mock).mockResolvedValue({ ...noPreference, effectiveTiers: tiers, origin: "explicit", claimId: "claim-1" });
  (searchLiveJobs as jest.Mock).mockResolvedValue(online([posting("Own the roadmap.")]));
  return (await POST(request())).json();
};

test("面板选过档位：层次不符的公司被挪到下面，理由写档位名不写枚举码", async () => {
  const result = await chosenTiers(["big_tech"]);
  expect(result.jobs).toHaveLength(0);
  expect(result.filtered[0].company).toBe("Meshy");
  expect(result.filtered[0].reasons.join()).toContain("独立融资的互联网/软件公司");
  expect(result.filtered[0].reasons.join()).not.toContain("mid_small");
});

test("选了「不限」= 一条都不剔，层次照样标出来", async () => {
  const result = await chosenTiers([]);
  expect(result.jobs).toHaveLength(1);
  expect(result.jobs[0].tierMatchedField).toBe("target_tiers_empty");
  expect(result.filtered).toHaveLength(0);
});

test("对话里抽到但没确认的意向不参与剔除，只跟着结果下发给面板提示", async () => {
  (readUserTierPreference as jest.Mock).mockResolvedValue({ ...noPreference, pending: { claimId: "claim-2", tiers: ["big_tech"], excerpt: "我想去大厂" } });
  (searchLiveJobs as jest.Mock).mockResolvedValue(online([posting("Own the roadmap.")]));
  const result = await (await POST(request())).json();
  expect(result.jobs).toHaveLength(1);
  expect(result.tierPreference.pending.excerpt).toBe("我想去大厂");
});

test("面板的档位选项与名录口径同源", async () => {
  const result = await chosenTiers([]);
  expect(result.tierOptions.map((option: { label: string }) => option.label)).toEqual(["集团级大厂", "独立融资的互联网/软件公司", "非互联网行业用人方"]);
});
