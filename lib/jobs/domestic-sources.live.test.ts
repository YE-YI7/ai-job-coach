import { DOMESTIC_SOURCE_IDS, searchLiveJobs } from "./live-sources";

// Opt-in public-source acceptance. No user data, account, model call or billing.
const liveTest = process.env.JOBS_SOURCE_SMOKE === "1" ? test : test.skip;
liveTest("six-source real official search returns traceable domestic job descriptions", async () => {
  const start = Date.now();
  const result = await searchLiveJobs(["产品"], { sourceIds: DOMESTIC_SOURCE_IDS, maxCalls: DOMESTIC_SOURCE_IDS.length });
  const counts = Object.fromEntries(DOMESTIC_SOURCE_IDS.map(id => [id, result.postings.filter(p => p.sourceId.startsWith(`${id}:`)).length]));
  console.info("Official source smoke", JSON.stringify({ counts, failures: result.failures, calls: result.calls, elapsedMs: Date.now() - start }));
  expect(result.calls).toBe(6);
  expect(result.truncatedCalls).toBe(0);
  for (const id of ["baidu", "meituan", "jd", "kuaishou"]) {
    const jobs = result.postings.filter(p => p.sourceId.startsWith(`${id}:`));
    expect(jobs.length).toBeGreaterThan(0);
    for (const job of jobs) {
      expect(job.rawPageText!.length).toBeGreaterThan(80);
      expect(job.url).toMatch(/^https:\/\//);
      expect(job.location).not.toMatch(/伦敦|科威特|新加坡|纽约/);
    }
  }
}, 40000);
