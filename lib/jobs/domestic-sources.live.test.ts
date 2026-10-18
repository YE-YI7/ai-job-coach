import { DOMESTIC_SOURCE_IDS, searchLiveJobs } from "./live-sources";

// Opt-in public-source acceptance. No user data, account, model call or billing.
const liveTest = process.env.JOBS_SOURCE_SMOKE === "1" ? test : test.skip;
liveTest("domestic official sources return traceable domestic job descriptions", async () => {
  const start = Date.now();
  const result = await searchLiveJobs(["产品"], { sourceIds: DOMESTIC_SOURCE_IDS, maxCalls: DOMESTIC_SOURCE_IDS.length });
  const counts = Object.fromEntries(DOMESTIC_SOURCE_IDS.map(id => [id, result.postings.filter(p => p.sourceId.startsWith(`${id}:`)).length]));
  console.info("Official source smoke", JSON.stringify({ counts, failures: result.failures, calls: result.calls, elapsedMs: Date.now() - start }));
  expect(result.calls).toBe(DOMESTIC_SOURCE_IDS.length);
  expect(result.failures).toEqual([]);
  expect(result.truncatedCalls).toBe(0);
  for (const id of DOMESTIC_SOURCE_IDS) {
    const jobs = result.postings.filter(p => p.sourceId.startsWith(`${id}:`));
    expect(jobs.length).toBeGreaterThan(0);
    for (const job of jobs) {
      expect(job.rawPageText!.length).toBeGreaterThan(80);
      expect(job.url).toMatch(/^https:\/\//);
      expect(job.location).not.toMatch(/伦敦|科威特|新加坡|纽约/);
    }
  }
}, 40000);

liveTest("Xiaohongshu anonymous social keywords differ with full domestic requirements", async () => {
  const products = await searchLiveJobs(["产品"], { sourceIds: ["xiaohongshu"], maxCalls: 1 });
  const logistics = await searchLiveJobs(["物流"], { sourceIds: ["xiaohongshu"], maxCalls: 1 });
  expect(products.failures).toEqual([]);
  expect(logistics.failures).toEqual([]);
  expect(products.calls).toBe(1);
  expect(logistics.calls).toBe(1);
  expect(products.postings.length).toBeGreaterThan(0);
  expect(logistics.postings.length).toBeGreaterThan(0);
  const productIds = new Set(products.postings.map(p => p.sourceId));
  expect(logistics.postings.some(p => !productIds.has(p.sourceId))).toBe(true);
  for (const job of [...products.postings, ...logistics.postings]) {
    expect(job.url).toMatch(/^https:\/\/job\.xiaohongshu\.com\/social\/position\/[1-9]\d*$/);
    expect(job.location).not.toMatch(/新加坡|纽约|伦敦/);
    expect(job.rawPageText).toContain("岗位职责");
    expect(job.rawPageText).toContain("任职要求");
    expect(job.rawPageText!.length).toBeGreaterThan(80);
  }
  console.info("Xiaohongshu keyword contrast", JSON.stringify({ productCount: products.postings.length, logisticsCount: logistics.postings.length, differentIds: logistics.postings.filter(p => !productIds.has(p.sourceId)).length }));
}, 40000);

liveTest("Didi anonymous keywords differ and retain traceable domestic requirements", async () => {
  const products = await searchLiveJobs(["产品"], { sourceIds: ["didi"], maxCalls: 1 });
  const logistics = await searchLiveJobs(["物流"], { sourceIds: ["didi"], maxCalls: 1 });
  expect(products.failures).toEqual([]);
  expect(logistics.failures).toEqual([]);
  expect(products.calls).toBe(1);
  expect(logistics.calls).toBe(1);
  expect(products.postings.length).toBeGreaterThan(0);
  expect(logistics.postings.length).toBeGreaterThan(0);
  const productIds = new Set(products.postings.map(p => p.sourceId));
  expect(logistics.postings.some(p => !productIds.has(p.sourceId))).toBe(true);
  for (const job of [...products.postings, ...logistics.postings]) {
    expect(job.url).toMatch(/^https:\/\/talent\.didiglobal\.com\/social\/jobDetail\?jdId=\d+$/);
    expect(job.location).not.toMatch(/伦敦|墨西哥|巴西|纽约/);
    expect(job.rawPageText).toContain("岗位职责");
    expect(job.rawPageText).toContain("任职要求");
    expect(job.postedAt).toBeNull();
  }
  console.info("Didi keyword contrast", JSON.stringify({ productCount: products.postings.length, logisticsCount: logistics.postings.length, differentIds: logistics.postings.filter(p => !productIds.has(p.sourceId)).length }));
}, 40000);

liveTest("Xiaomi official search changes with keyword and exposes non-internet roles", async () => {
  const products = await searchLiveJobs(["产品"], { sourceIds: ["xiaomi"], maxCalls: 1 });
  const logistics = await searchLiveJobs(["物流"], { sourceIds: ["xiaomi"], maxCalls: 1 });
  expect(products.failures).toEqual([]);
  expect(logistics.failures).toEqual([]);
  expect(products.postings.length).toBeGreaterThan(0);
  expect(logistics.postings.length).toBeGreaterThan(0);
  const productIds = new Set(products.postings.map(p => p.sourceId));
  expect(logistics.postings.some(p => !productIds.has(p.sourceId))).toBe(true);
  expect(logistics.postings.some(p => /物流|供应链/.test(p.title))).toBe(true);
  expect(products.postings.some(p => /汽车部|硬件|平板/.test(p.rawPageText!))).toBe(true);
  console.info("Xiaomi keyword contrast", JSON.stringify({ productCount: products.postings.length, logisticsCount: logistics.postings.length, differentIds: logistics.postings.filter(p => !productIds.has(p.sourceId)).length }));
}, 40000);

liveTest("Midea anonymous manufacturing search retains domestic requirements and matches same-id detail", async () => {
  const products = await searchLiveJobs(["产品"], { sourceIds: ["midea"], maxCalls: 1 });
  const logistics = await searchLiveJobs(["物流"], { sourceIds: ["midea"], maxCalls: 1 });
  expect(products.failures).toEqual([]);
  expect(logistics.failures).toEqual([]);
  expect(products.calls).toBe(1);
  expect(logistics.calls).toBe(1);
  expect(products.postings.length).toBeGreaterThan(0);
  expect(logistics.postings.length).toBeGreaterThan(0);
  const productIds = new Set(products.postings.map(p => p.sourceId));
  expect(logistics.postings.some(p => !productIds.has(p.sourceId))).toBe(true);
  expect(products.postings.some(p => /制造|工艺|企划/.test(p.title))).toBe(true);
  for (const job of [...products.postings, ...logistics.postings]) {
    expect(job.url).toMatch(/^https:\/\/recruit\.midea\.com\/recruitOut\/ihr\/social\/jobApplication\?positionId=[\da-f]{32}&recruitType=social$/i);
    expect(job.location).not.toMatch(/海外|埃及|越南|巴西/);
    expect(job.rawPageText).toContain("岗位职责");
    expect(job.rawPageText).toContain("任职要求");
    expect(job.rawPageText).toContain("官网学历要求");
    expect(job.postedAt).toBeNull();
  }
  // 验收额外读一次官网详情；不属于运行时适配器，也不隐藏在其 calls=1 中。
  const sample = products.postings[0], id = sample.sourceId.slice("midea:".length);
  const detailResponse = await fetch(`https://recruit.midea.com/backend/rec/home/out/official/position/info/${id}`, {
    redirect: "error", signal: AbortSignal.timeout(12000), headers: { "user-agent": "YiZhiJobCoach/1.0 (public source acceptance)" },
  });
  expect(detailResponse.status).toBe(200);
  const detail = await detailResponse.json() as Record<string, unknown>;
  expect(detail.positionId).toBe(id);
  expect(detail.publicationName).toBe(sample.title);
  const plain = (text: unknown) => String(text ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  expect(sample.rawPageText).toContain(plain(detail.postDuties));
  expect(sample.rawPageText).toContain(plain(detail.qualification));
  console.info("Midea keyword/detail acceptance", JSON.stringify({ productCount: products.postings.length, logisticsCount: logistics.postings.length,
    differentIds: logistics.postings.filter(p => !productIds.has(p.sourceId)).length, detailCalls: 1, sameId: true }));
}, 40000);
