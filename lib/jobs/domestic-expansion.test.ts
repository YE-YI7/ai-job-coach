import { DOMESTIC_SOURCE_IDS, searchLiveJobs } from "./live-sources";

const id = "516ed994-1cc9-42c0-a39a-6fe9a922ae5c";
const fixtures = {
  baidu: { status: "ok", data: { list: [{ postId: id, name: "Agent 产品", workPlace: "北京市", workContent: "负责平台", serviceCondition: "本科、两年", publishDate: "2026-07-06" }] } },
  meituan: { data: { list: [{ jobUnionId: "4781164009", name: "产品经理", cityList: [{ name: "北京市" }, { name: "科威特城" }], jobStatus: "000", jobDuty: "产品规划", jobRequirement: "三年经验", refreshTime: 1790943861000 }] } },
  jd: { success: true, body: { items: [{ publishId: 9119, positionName: "产品运营", workContent: "用户增长", qualification: "2027届本科", requirementVoList: [{ workCity: "四川省-成都市" }, { workCity: "北京市-北京市" }] }] } },
  kuaishou: { code: 0, result: { list: [{ code: "ac750b349d7b4850a12b3d9f3af23591", name: "数据产品", positionStatusCode: "Release", positionNatureCode: "fulltime", workLocationDicts: [{ name: "北京" }], description: "建设平台", positionDemand: "本科和 SQL" }] } },
};
afterEach(() => jest.restoreAllMocks());
test("four verified official sources query user keyword and preserve full JD and canonical URLs", async () => {
  const calls: Array<{ url: string; body: string }> = [];
  jest.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input); calls.push({ url, body: String(init?.body) });
    const key = url.includes("baidu") ? "baidu" : url.includes("meituan") ? "meituan" : url.includes("kuaishou") ? "kuaishou" : "jd";
    return new Response(JSON.stringify(fixtures[key]));
  });
  const result = await searchLiveJobs(["产品"], { sourceIds: ["baidu", "meituan", "jd", "kuaishou"] });
  expect(result.failures).toEqual([]);
  expect(result.postings).toHaveLength(4);
  expect(calls).toHaveLength(4);
  const baidu = calls.find(c => c.url.includes("baidu"))!;
  expect(new URLSearchParams(baidu.body).get("keyWord")).toBe("产品");
  expect(new URLSearchParams(baidu.body).get("curPage")).toBe("1");
  expect(JSON.parse(calls.find(c => c.url.includes("meituan"))!.body).keywords).toBe("产品");
  expect(JSON.parse(calls.find(c => c.url.includes("jd.com"))!.body).parameter.positionName).toBe("产品");
  expect(JSON.parse(calls.find(c => c.url.includes("kuaishou"))!.body).name).toBe("产品");
  for (const job of result.postings) expect(job.rawPageText).toMatch(/岗位职责.*任职要求/);
  expect(result.postings.find(j => j.company === "美团")!.location).toBe("北京市");
  expect(result.postings.find(j => j.company === "美团")!.postedAt).toBeNull();
  expect(result.postings.find(j => j.company === "百度")!.url).toContain(`/SOCIAL/${id}`);
  expect(result.postings.find(j => j.company === "京东")!.rawPageText).toContain("应届生招聘");
  expect(result.postings.find(j => j.company === "京东")!.url).toContain("#/newDetails?publishId=9119");
});
test("overseas, missing city, closed jobs and invalid source IDs do not enter recommendations", async () => {
  jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: { list: [
    { ...fixtures.meituan.data.list[0], cityList: [{ name: "伦敦" }] },
    { ...fixtures.meituan.data.list[0], cityList: [] },
    { ...fixtures.meituan.data.list[0], jobStatus: "closed" },
    { ...fixtures.meituan.data.list[0], jobUnionId: "../../evil" },
  ] } })));
  expect((await searchLiveJobs(["产品"], { sourceIds: ["meituan"] })).postings).toEqual([]);
});
test("all six domestic companies are actually called within one-query budget; failure isolated", async () => {
  jest.spyOn(globalThis, "fetch").mockImplementation(async input => {
    const url = String(input);
    if (url.includes("meituan")) return new Response(JSON.stringify(fixtures.meituan));
    throw Error("source unavailable");
  });
  const result = await searchLiveJobs(["产品"], { sourceIds: DOMESTIC_SOURCE_IDS, maxCalls: DOMESTIC_SOURCE_IDS.length });
  expect(result.calls).toBe(6);
  expect(result.truncatedCalls).toBe(0);
  expect(result.failures.map(f => f.source).sort()).toEqual(["baidu", "jd", "kuaishou", "netease", "tencent"]);
  expect(result.postings[0].company).toBe("美团");
});
