import {
  buildSearchKeywords,
  containsPii,
  freshnessLabel,
  hardFilter,
  jobDedupeKey,
  RETRIEVAL_FAILURE_COPY,
  runRetrievalAgent,
  stripPii,
  type EducationLevel,
  type HardRequirement,
  type JobSource,
  type ProfileHardFields,
  type RawJobPosting,
  type RetrievalInput,
} from "./retrieval";
import { estimateTokens } from "../context";
import { TranscriptInputError, createInMemoryIdempotencyStore, type BudgetSpec } from "./contract";

const NOW = Date.parse("2026-09-30T00:00:00Z");
const budget: BudgetSpec = { maxSourceCalls: 8, maxTokens: 100_000, maxWallClockMs: 600_000, idempotencyKey: "r-idem" };

/* ------------------------------------------------------------------ */
/* FR-6 硬筛用例表：30 条 JD × 10 份档案，存活集合唯一确定              */
/* ------------------------------------------------------------------ */

type Edu = EducationLevel | undefined;
const JDS: Array<[string, HardRequirement]> = [
  ["J1", { location: "北京", remote: false, yearsMin: 1, educationMin: "bachelor" }],
  ["J2", { location: "北京", remote: false, yearsMin: 3, educationMin: "bachelor" }],
  ["J3", { location: "北京", remote: false, yearsMin: 5, educationMin: "master" }],
  ["J4", { location: "上海", remote: false, yearsMin: 1, educationMin: "bachelor" }],
  ["J5", { location: "上海", remote: false }],
  ["J6", { location: "上海", remote: false, yearsMin: 3, educationMin: "master" }],
  ["J7", { location: "深圳", remote: false, yearsMin: 0, educationMin: "associate" }],
  ["J8", { location: "深圳", remote: false, yearsMin: 2, educationMin: "bachelor" }],
  ["J9", { location: "杭州", remote: false, yearsMin: 3, educationMin: "bachelor" }],
  ["J10", { location: "杭州", remote: false, educationMin: "bachelor" }],
  ["J11", { yearsMin: 3 }],
  ["J12", { remote: true, yearsMin: 3, educationMin: "bachelor" }],
  ["J13", { location: "美国", remote: false, yearsMin: 2, educationMin: "bachelor" }],
  ["J14", { location: "美国", remote: false }],
  ["J15", { location: "北京", remote: false, educationMin: "master" }],
  ["J16", { location: "上海", remote: false, yearsMin: 8, educationMin: "phd" }],
  ["J17", { location: "深圳", remote: false, educationMin: "master" }],
  ["J18", { location: "杭州", remote: false, yearsMin: 1, educationMin: "associate" }],
  ["J19", {}],
  ["J20", { location: "北京", remote: true, yearsMin: 7, educationMin: "master" }],
  ["J21", { location: "上海", remote: false, yearsMin: 2, educationMin: "associate" }],
  ["J22", { location: "深圳", remote: false, yearsMin: 6, educationMin: "bachelor" }],
  ["J23", { location: "杭州", remote: false, educationMin: "master" }],
  ["J24", { remote: true, yearsMin: 0, educationMin: "high_school" }],
  ["J25", { location: "北京", remote: false, yearsMin: 0, educationMin: "bachelor" }],
  ["J26", { location: "美国", remote: false, yearsMin: 5, educationMin: "master" }],
  ["J27", { location: "上海", remote: true, yearsMin: 3 }],
  ["J28", { location: "广州", remote: false, yearsMin: 1, educationMin: "bachelor" }],
  ["J29", { yearsMin: 4, educationMin: "bachelor" }],
  ["J30", { location: "杭州", remote: false, yearsMin: 2, educationMin: "bachelor" }],
];

const PROFILES: Array<[string, ProfileHardFields]> = [
  ["P1", { city: "北京", openToRemote: false, yearsExperience: 2, education: "bachelor" }],
  ["P2", { city: "上海", yearsExperience: 5, education: "master" }],
  ["P3", { city: "深圳", yearsExperience: 0, education: "bachelor" }],
  ["P4", { city: "杭州", yearsExperience: 8, education: "phd" }],
  ["P5", { city: "美国", yearsExperience: 3, education: "bachelor" }],
  ["P6", { yearsExperience: 2, education: "bachelor" }], // 缺城市
  ["P7", { city: "北京", education: "bachelor" }], // 缺年限
  ["P8", { city: "北京", yearsExperience: 4 }], // 缺学历
  ["P9", { city: "上海", yearsExperience: 1, education: "associate" }],
  ["P10", { city: "深圳", yearsExperience: 10, education: "master", openToRemote: true }],
];

/** 人工推演的期望表：每个档案的 keep / keep_pending_profile 集合。 */
const EXPECTED: Record<string, { keep: string[]; pending: string[] }> = {
  P1: { keep: ["J1", "J19", "J24", "J25"], pending: [] },
  P2: { keep: ["J4", "J5", "J6", "J11", "J12", "J19", "J21", "J24", "J27", "J29"], pending: [] },
  P3: { keep: ["J7", "J19", "J24"], pending: [] },
  P4: { keep: ["J9", "J10", "J11", "J12", "J18", "J19", "J20", "J23", "J24", "J27", "J29", "J30"], pending: [] },
  P5: { keep: ["J11", "J12", "J13", "J14", "J19", "J24", "J27"], pending: [] },
  P6: { keep: ["J19", "J24"], pending: ["J1", "J4", "J5", "J7", "J8", "J10", "J13", "J14", "J18", "J21", "J25", "J28", "J30"] },
  P7: { keep: ["J19"], pending: ["J1", "J2", "J11", "J12", "J24", "J25", "J27", "J29"] },
  P8: { keep: ["J11", "J19", "J27"], pending: ["J1", "J2", "J12", "J15", "J24", "J25", "J29"] },
  P9: { keep: ["J5", "J19", "J24"], pending: [] },
  P10: { keep: ["J7", "J8", "J11", "J12", "J17", "J19", "J20", "J22", "J24", "J27", "J29"], pending: [] },
};

describe("FR-6 硬筛：30 JD × 10 档案，结果集合唯一确定", () => {
  for (const [pid, profile] of PROFILES) {
    it(`${pid} 的存活集合与人工推演表逐一致`, () => {
      const keep: string[] = [];
      const pending: string[] = [];
      for (const [jid, jd] of JDS) {
        const verdict = hardFilter(jd, profile).verdict;
        if (verdict === "keep") keep.push(jid);
        else if (verdict === "keep_pending_profile") pending.push(jid);
      }
      expect(keep.sort()).toEqual([...EXPECTED[pid].keep].sort());
      expect(pending.sort()).toEqual([...EXPECTED[pid].pending].sort());
    });
  }

  it("判定是纯函数：同输入两次结果全等（含 trace）", () => {
    const a = hardFilter(JDS[2][1], PROFILES[0][1]);
    const b = hardFilter(JDS[2][1], PROFILES[0][1]);
    expect(a).toEqual(b);
    expect(a.verdict).toBe("drop");
  });
});

/* ------------------------------------------------------------------ */
/* FR-8 PII 剥离：测试语料泄漏条数 = 0                                 */
/* ------------------------------------------------------------------ */

// 人名从档案/简历抽取而来（含同事），剥离器拿到的是已知姓名集合；公司名单独出现不是 PII。
const PII = { names: ["张小明", "Li Wei", "李雷"], companies: ["字节科技", "ByteDance"] };

const PII_CORPUS = [
  "张小明，电话13812345678，字节科技的李雷之前带我做过B端产品",
  "Contact 张小明 email: zhang.xm@example.com, ex-ByteDance staff Li Wei",
  "负责字节科技的增长中台与数据看板，身份证110101199001011234",
  "在字节科技 做产品经理三年", // 公司名单独出现不算泄漏
  "Li Wei (li.wei@corp-mail.cn) 138-0000-1234 主导推荐系统改版",
];

describe("FR-8 PII 剥离", () => {
  it("语料剥离后姓名/电话/邮箱/公司+人名组合泄漏数为 0", () => {
    let leaks = 0;
    for (const text of PII_CORPUS) {
      const cleaned = stripPii(text, PII);
      if (cleaned.includes("张小明") || cleaned.includes("Li Wei")) leaks += 1;
      if (/1[3-9]\d{9}|1[3-9]\d[-\s]\d{4}[-\s]\d{4}/.test(cleaned)) leaks += 1;
      if (/@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(cleaned)) leaks += 1;
      if (/(字节科技|ByteDance)\D{0,3}(李雷|张小明|Li Wei)/.test(cleaned)) leaks += 1;
    }
    expect(leaks).toBe(0);
  });

  it("关键词生成前剥离：任何生成出的搜索词都不含 PII", () => {
    const keywords = buildSearchKeywords({
      roleTitle: "产品经理",
      skills: ["B端产品", "数据看板"],
      profileText: PII_CORPUS.join("\n"),
      pii: { ...PII, names: [...PII.names, "李雷"] },
    });
    expect(keywords.length).toBeGreaterThan(0);
    expect(keywords.filter((k) => containsPii(k, { ...PII, names: [...PII.names, "李雷"] }))).toEqual([]);
    expect(keywords).toContain("产品经理");
  });
});

/* ------------------------------------------------------------------ */
/* FR-10 去重键 / FR-11 时效                                            */
/* ------------------------------------------------------------------ */

describe("FR-10 去重键", () => {
  it("同一岗位跨关键词键相同；公司/岗位/城市任一变化键不同", () => {
    const k1 = jobDedupeKey({ company: "字节科技有限公司", title: " 产品经理 ", location: "北京" });
    const k2 = jobDedupeKey({ company: "字节科技", title: "产品经理", location: "北京" });
    expect(k1).toBe(k2);
    expect(jobDedupeKey({ company: "字节科技", title: "产品经理", location: "上海" })).not.toBe(k1);
    expect(jobDedupeKey({ company: "字节科技", title: "高级产品经理", location: "北京" })).not.toBe(k1);
  });
});

describe("FR-11 时效标注", () => {
  it("TTL 内且有时间 → in_sale；超期/缺时间 → 待核实，绝不写在售", () => {
    expect(freshnessLabel(new Date(NOW - 5 * 86400_000).toISOString(), NOW)).toBe("in_sale");
    expect(freshnessLabel(new Date(NOW - 31 * 86400_000).toISOString(), NOW)).toBe("待核实");
    expect(freshnessLabel(null, NOW)).toBe("待核实");
    expect(freshnessLabel(undefined, NOW)).toBe("待核实");
    expect(freshnessLabel("not-a-date", NOW)).toBe("待核实");
  });
});

/* ------------------------------------------------------------------ */
/* 检索 Agent 运行：扇出、去重、失败可出口、幂等                        */
/* ------------------------------------------------------------------ */

function posting(over: Partial<RawJobPosting>): RawJobPosting {
  return {
    sourceId: "s1",
    url: "https://jobs.example.com/1",
    company: "字节科技",
    title: "产品经理",
    location: "北京",
    yearsMin: 1,
    educationMin: "bachelor",
    postedAt: new Date(NOW - 2 * 86400_000).toISOString(),
    fetchedAt: new Date(NOW).toISOString(),
    ...over,
  };
}

function makeInput(overrides: Partial<RetrievalInput> = {}): RetrievalInput {
  return {
    keywords: ["产品经理", "B端产品"],
    hard: { location: "北京", yearsMin: 1, educationMin: "bachelor" },
    profile: { city: "北京", yearsExperience: 3, education: "bachelor" },
    goal: { roleTitle: "产品经理", targetLocations: ["北京"] },
    budget: { ...budget, idempotencyKey: `run-${Math.random()}` },
    ...overrides,
  };
}

describe("runRetrievalAgent", () => {
  it("同一岗位跨关键词只出现一次，结果带来源 URL、抓取时间、去重键与命中理由", async () => {
    const same = posting({});
    const source: JobSource = {
      searchByKeyword: async () => [same, posting({ title: "数据产品经理", url: "https://jobs.example.com/2" })],
    };
    const outcome = await runRetrievalAgent(makeInput(), { source, clock: () => NOW });
    if (outcome.status === "failed") throw new Error("unexpected failure");
    expect(outcome.product.jobs.length).toBe(2);
    const job = outcome.product.jobs[0];
    expect(job.source).toEqual({ kind: "external", url: same.url, fetchedAt: same.fetchedAt, trust: "untrusted" });
    expect(job.dedupeKey).toMatch(/^jk_/);
    expect(job.soft[0].matchedField).toBe("keyword");
    expect(job.freshness).toBe("in_sale");
    expect(outcome.usage.sourceCalls).toBe(2);
    expect(outcome.usage.billingUnits).toBe(1);
    expect(outcome.product.quote.plannedSourceCalls).toBe(2);
  });

  it("事后计量按真实取回的文本算 token，不沿用报价常数（FR-35：token 口径只有 estimateTokens 一处）", async () => {
    const light = posting({ rawPageText: "负责产品规划" });
    const heavy = posting({ rawPageText: "负责产品规划".repeat(40) });
    const run = async (p: RawJobPosting) => {
      const outcome = await runRetrievalAgent(makeInput(), { source: { searchByKeyword: async () => [p] }, clock: () => NOW });
      if (outcome.status !== "ok") throw new Error("unexpected");
      return outcome;
    };
    const a = await run(light);
    const b = await run(heavy);
    // 两个关键词各调一次源、每次都把同一条文本读进来：计量算真实读入量，
    // 去重发生在读入之后，所以重复读入的那份也是花掉的成本。
    const perCall = (p: RawJobPosting) => estimateTokens(`${p.title}${p.location}${p.url}${p.rawPageText}`);
    expect(a.usage.tokens).toBe(perCall(light) * a.usage.sourceCalls);
    // 关键词一样 → 事前报价一样；源调用次数一样；但真实取回的内容大了一个量级，
    // 计量必须跟着变——报价与计量若共用一个常数，这一条就分不出来。
    expect(b.product.quote.estimatedTokens).toBe(a.product.quote.estimatedTokens);
    expect(b.usage.sourceCalls).toBe(a.usage.sourceCalls);
    expect(b.usage.tokens).toBeGreaterThan(a.usage.tokens);
  });

  it("与库里已有岗位比对不重复建（FR-10 后半句）", async () => {
    const p = posting({});
    const source: JobSource = { searchByKeyword: async () => [p] };
    const outcome = await runRetrievalAgent(makeInput(), {
      source,
      clock: () => NOW,
      existingKeys: new Set([jobDedupeKey(p)]),
    });
    if (outcome.status !== "ok") throw new Error("unexpected");
    expect(outcome.product.jobs).toHaveLength(0);
    expect(outcome.product.withheldExistingKeys).toEqual([jobDedupeKey(p)]);
    expect(outcome.product.userCopy).toBe(RETRIEVAL_FAILURE_COPY);
  });

  it("硬筛剔除的岗位带逐维度轨迹", async () => {
    const source: JobSource = {
      searchByKeyword: async () => [posting({ location: "广州", url: "https://jobs.example.com/3" })],
    };
    const outcome = await runRetrievalAgent(makeInput(), { source, clock: () => NOW });
    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") return;
    expect(outcome.product.jobs).toHaveLength(0);
    expect(outcome.product.dropped[0].trace.some((t) => t.dimension === "location" && t.outcome === "fail")).toBe(true);
  });

  it("失败可出口：数据源炸了 → failed，没有 product 键，话术原样可给主 Agent", async () => {
    let calls = 0;
    const source: JobSource = {
      searchByKeyword: async (kw) => {
        calls += 1;
        if (calls === 1) return [posting({})]; // 第一轮攒到成果
        throw new Error(`源在 ${kw} 上断开`);
      },
    };
    const outcome = await runRetrievalAgent(makeInput({ keywords: ["产品经理", "B端产品", "增长"] }), {
      source,
      clock: () => NOW,
    });
    if (outcome.status !== "failed") throw new Error("应为 failed");
    expect("product" in outcome).toBe(false);
    expect(outcome.failure.userCopy).toBe(RETRIEVAL_FAILURE_COPY);
    expect(outcome.failure.partialWithheld).toBe(true);
  });

  it("事前报价超预算 → 未启动就 failed（扇出可报价可计量）", async () => {
    const source: JobSource = { searchByKeyword: async () => [] };
    let called = false;
    (source as { searchByKeyword: (k: string) => Promise<RawJobPosting[]> }).searchByKeyword = async () => {
      called = true;
      return [];
    };
    const outcome = await runRetrievalAgent(
      makeInput({ keywords: ["a", "b", "c", "d", "e", "f"], budget: { maxSourceCalls: 4, maxTokens: 4800, maxWallClockMs: 60000, idempotencyKey: "over-quote" } }),
      { source, clock: () => NOW },
    );
    expect(outcome.status).toBe("failed");
    if (outcome.status === "failed") expect(outcome.failure.reason).toBe("budget_exhausted");
    expect(called).toBe(false);
  });

  it("幂等键：同键重放不再打源，返回首次结果", async () => {
    let calls = 0;
    const source: JobSource = {
      searchByKeyword: async () => {
        calls += 1;
        return [posting({})];
      },
    };
    const store = createInMemoryIdempotencyStore<Awaited<ReturnType<typeof runRetrievalAgent>>>();
    const input = makeInput({ keywords: ["产品经理"], budget: { ...budget, idempotencyKey: "idem-x" } });
    const deps = { source, clock: () => NOW, idempotency: store };
    const first = await runRetrievalAgent(input, deps);
    const second = await runRetrievalAgent(input, deps);
    expect(calls).toBe(1);
    expect(second).toBe(first);
  });

  it("整段对话灌入 → 类型上过不去（excess property 见编译期），运行时同样拒绝", async () => {
    const duck = { ...makeInput(), messages: [{ role: "user", content: "帮我找找岗位" }] } as unknown as RetrievalInput;
    const source: JobSource = { searchByKeyword: async () => [] };
    await expect(runRetrievalAgent(duck, { source, clock: () => NOW })).rejects.toThrow(TranscriptInputError);
  });
});
