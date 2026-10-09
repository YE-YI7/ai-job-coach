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
