/**
 * PRD FR-35 / §5.6：计费按任务，不按请求。
 *
 * 验收口径（写死在这里）：
 *  1. 一次岗位搜索 / 一次公司调研 = 各一个计费单元，跟任务里调了几次模型无关。
 *  2. 不发明价格：唯一单价来源是 llm-telemetry.estimateGenerationCost（deepseek 两档）。
 *     目录里其它模型一律标 unsourced，estimatedCostUsd 必须是 null，界面不能显示假数。
 *  3. 事前预估只能给下界（输出侧仓库里没有口径）。
 *  4. 事后计量与预估对账，缺哪一侧就说清楚缺哪一侧。
 *
 * 数据库只读策略：所有「查询」都打内存替身，不碰真实连接、不跑迁移。
 */

jest.mock("@/lib/db");

import { getDbClient } from "@/lib/db";
import { DEFAULT_ROUTE_BUDGET } from "../types";
import {
  BILLING_UNITS,
  BILLING_UNIT_KINDS,
  OVER_BUDGET_RATIO,
  billableUnitsForLedger,
  billableUnitsForStatus,
  estimateFromLedger,
  estimateUnitCost,
  measureTaskMeter,
  reconcileTaskCost,
  runRequestId,
  settleTaskCost,
  stopReasonForStatus,
  type BillingUnitKind,
  type CostEstimate,
  type TaskMeter,
} from "./billing";
import { FakeDb } from "./testing/fake-db";
import type { TaskLedger } from "./types";

const USER = "00000000-0000-4000-8000-000000000001";
const RUN = "11111111-1111-4111-8111-111111111111";
const BUDGET = DEFAULT_ROUTE_BUDGET.bounded_orchestration;

/** deepseek v4-flash 的 cacheMiss 单价（$0.14 / 1M），抄自 llm-telemetry，不是新发明。 */
const FLASH_CACHE_MISS_PER_M = 0.14;

let db: FakeDb;

beforeEach(() => {
  db = new FakeDb();
  (getDbClient as jest.Mock).mockImplementation(async () => db);
});

function ledger(overrides: Partial<TaskLedger> = {}): TaskLedger {
  return {
    runId: RUN,
    userId: USER,
    opportunityId: null,
    actionType: "job_decision",
    billingUnit: "job_search",
    status: "done",
    runStatus: "completed",
    stoppedReason: "completed",
    outcome: "complete",
    steps: [],
    result: null,
    partialResult: null,
    estimate: null,
    createdAt: null,
    updatedAt: null,
    completedAt: null,
    ...overrides,
  } as TaskLedger;
}

function meter(overrides: Partial<TaskMeter> = {}): TaskMeter {
  return {
    calls: 3,
    pricedCalls: 3,
    unpricedCalls: 0,
    inputTokens: 40_000,
    outputTokens: 2_000,
    totalTokens: 42_000,
    cacheHitTokens: 0,
    latencyMs: 9_000,
    meteredCostUsd: 0.006,
    pricingVersions: ["deepseek-v4-2026-08-18"],
    providerModels: ["deepseek/deepseek-v4-flash"],
    empty: false,
    attributable: true,
    attribution: "request_ids",
    ...overrides,
  };
}

describe("计费单元定义（一任务一单元）", () => {
  test("FR-35 点名的两个单元都在，且都固定 1 个单元", () => {
    expect([...BILLING_UNIT_KINDS]).toEqual(["job_search", "company_research"]);
    for (const kind of BILLING_UNIT_KINDS) {
      expect(BILLING_UNITS[kind].units).toBe(1);
      expect(BILLING_UNITS[kind].label.length).toBeGreaterThan(1);
    }
  });

  test("单元的预期调用次数抄自既有路由预算，不是新数字", () => {
    for (const kind of BILLING_UNIT_KINDS) {
      const unit = BILLING_UNITS[kind];
      expect(unit.routeClass).toBe("bounded_orchestration");
      expect(unit.expectedModelCalls).toBe(DEFAULT_ROUTE_BUDGET[unit.routeClass].maxModelCalls);
    }
  });
});

describe("事前预估 estimateUnitCost", () => {
  test("deepseek 档：给得出下界，并写明依据哪个价目版本", () => {
    const estimate = estimateUnitCost({ unit: "job_search", provider: "deepseek", model: "deepseek-v4-flash" });
    expect(estimate).toMatchObject({
      billingUnit: "job_search",
      billingUnits: 1,
      routeClass: "bounded_orchestration",
      budgetedInputTokens: BUDGET.maxInputTokens * BUDGET.maxModelCalls,
      budgetedOutputTokens: null,
      costBasis: "deepseek-v4-2026-08-18",
      lowerBoundOnly: true,
    });
    // 只算输入侧：36000 token × $0.14/1M。
    expect(estimate.estimatedCostUsd).toBeCloseTo((36_000 * FLASH_CACHE_MISS_PER_M) / 1_000_000, 10);
    expect(estimate.unknowns.join("\n")).toContain("输出 token 预算");
  });

  test("pro 与 flash 分开计价，同一个预算表得出不同下界（价格确实来自目录）", () => {
    const flash = estimateUnitCost({ unit: "job_search", provider: "deepseek", model: "deepseek-v4-flash" });
    const pro = estimateUnitCost({ unit: "job_search", provider: "deepseek", model: "deepseek-v4-pro" });
    expect(pro.estimatedCostUsd! / flash.estimatedCostUsd!).toBeCloseTo(0.435 / FLASH_CACHE_MISS_PER_M, 6);
  });

  test("非 deepseek 模型：不猜价，estimatedCostUsd 为 null 并标 unsourced", () => {
    const estimate = estimateUnitCost({ unit: "company_research", provider: "openai", model: "gpt-5.1" });
    expect(estimate.estimatedCostUsd).toBeNull();
    expect(estimate.costBasis).toBe("unsourced");
    expect(estimate.budgetedInputTokens).toBe(BUDGET.maxInputTokens * BUDGET.maxModelCalls);
    expect(estimate.unknowns[0]).toContain("单价");
    expect(estimate.unknowns.join("\n")).toContain("预估不可用");
  });

  test("unknowns 永远非空——界面必须显示「以账单为准」而不能显示一个假数", () => {
    for (const provider of ["deepseek", "openai"]) {
      const estimate = estimateUnitCost({ unit: "job_search", provider, model: provider === "deepseek" ? "deepseek-v4-chat" : "other" });
      expect(estimate.unknowns.length).toBeGreaterThan(0);
      expect(estimate.budgetedOutputTokens).toBeNull();
      expect(estimate.lowerBoundOnly).toBe(true);
    }
  });

  test("一次任务算一个单元：模型调用次数只改 token 预算，不改单元数", () => {
    const one = estimateUnitCost({ unit: "job_search", provider: "deepseek", model: "deepseek-v4-flash", expectedModelCalls: 1 });
    const three = estimateUnitCost({ unit: "job_search", provider: "deepseek", model: "deepseek-v4-flash", expectedModelCalls: 3 });
    expect(one.billingUnits).toBe(1);
    expect(three.billingUnits).toBe(1);
    expect(three.budgetedInputTokens).toBe(one.budgetedInputTokens * 3);
    expect(three.estimatedCostUsd!).toBeGreaterThan(one.estimatedCostUsd!);
  });

  test("计划次数不许超过既有路由预算（不给「偷偷多跑」留口子）", () => {
    const estimate = estimateUnitCost({ unit: "job_search", provider: "deepseek", model: "deepseek-v4-flash", expectedModelCalls: 99 });
    expect(estimate.expectedModelCalls).toBe(BUDGET.maxModelCalls);
  });

  test("降档预估要留下说明，因为它和任务默认档位不一致", () => {
    const estimate = estimateUnitCost({ unit: "job_search", provider: "deepseek", model: "deepseek-v4-flash", routeClass: "single_inference" });
    expect(estimate.routeClass).toBe("single_inference");
    expect(estimate.budgetedInputTokens).toBe(DEFAULT_ROUTE_BUDGET.single_inference.maxInputTokens);
    expect(estimate.unknowns.join("\n")).toContain("不一致");
  });
});

describe("run 级 request_id 约定", () => {
  test("只含 [a-zA-Z0-9_-]、8–180 字符，可直接当 x-idempotency-key 透传", () => {
    const id = runRequestId(RUN, "rank_candidates");
    expect(id).toMatch(/^[a-zA-Z0-9_-]{8,180}$/);
    expect(id).toBe(`${RUN}-rank_candidates`.toLowerCase());
  });

  test("脏输入清洗 + 超长截断到 180", () => {
    const id = runRequestId("run/中文 id", `step:${"x".repeat(300)}`);
    expect(id).toMatch(/^[a-zA-Z0-9_-]{8,180}$/);
    expect(id.length).toBeLessThanOrEqual(180);
    expect(/[^\w-]/.test(id)).toBe(false);
  });
});

describe("事后计量 measureTaskMeter", () => {
  const row = (overrides: Record<string, unknown> = {}) => ({
    user_id: USER,
    operation: "job_search.rank",
    request_id: runRequestId(RUN, "rank"),
    provider: "deepseek",
    model: "deepseek-v4-flash",
    status: "success",
    latency_ms: 1_200,
    input_tokens: 12_000,
    output_tokens: 800,
    total_tokens: 12_800,
    cache_hit_tokens: 0,
    cache_miss_tokens: 12_000,
    estimated_cost_usd: 0.001808,
    pricing_version: "deepseek-v4-2026-08-18",
    created_at: "2026-09-30T10:00:00.000Z",
    ...overrides,
  });

  test("按 requestIds 精确归集：token 与成本求和，归属可信", async () => {
    db.seedRows("ai_generation_events", [
      row(),
      row({ request_id: runRequestId(RUN, "search"), input_tokens: 10_000, output_tokens: 600, estimated_cost_usd: 0.001548 }),
      // 别的任务的消耗，不该被算进来。
      row({ request_id: runRequestId("22222222-2222-4222-8222-222222222222", "rank"), estimated_cost_usd: 0.9 }),
    ]);
    const meter = await measureTaskMeter({
      userId: USER,
      requestIds: [runRequestId(RUN, "rank"), runRequestId(RUN, "search")],
    });
    expect(meter).toMatchObject({ calls: 2, pricedCalls: 2, unpricedCalls: 0, attributable: true, attribution: "request_ids", empty: false });
    expect(meter.inputTokens).toBe(22_000);
    expect(meter.outputTokens).toBe(1_400);
    expect(meter.meteredCostUsd).toBeCloseTo(0.003356, 10);
    expect(meter.pricingVersions).toEqual(["deepseek-v4-2026-08-18"]);
  });

  test("没单价的调用单独计数，绝不当成零成本", async () => {
    db.seedRows("ai_generation_events", [
      row({ estimated_cost_usd: null, pricing_version: null, provider: "openai", model: "gpt-5.1" }),
      row({ request_id: runRequestId(RUN, "summarize"), estimated_cost_usd: null, pricing_version: null }),
    ]);
    const meter = await measureTaskMeter({ userId: USER, requestIds: [runRequestId(RUN, "rank"), runRequestId(RUN, "summarize")] });
    expect(meter).toMatchObject({ calls: 2, pricedCalls: 0, unpricedCalls: 2, attributable: true });
    expect(meter.meteredCostUsd).toBeNull();
    expect(meter.totalTokens).toBe(25_600);
  });

  test("只有时间窗时归属是近似的，返回值必须标 attributable:false", async () => {
    db.seedRows("ai_generation_events", [
      row(),
      row({ request_id: "other-run-0001", estimated_cost_usd: 0.002 }),
      // 窗口外。
      row({ request_id: "outside-000001", created_at: "2026-09-29T10:00:00.000Z", estimated_cost_usd: 5 }),
      // 别人的。
      row({ user_id: "00000000-0000-4000-8000-000000000002", request_id: "other-user-01", estimated_cost_usd: 7 }),
    ]);
    const meter = await measureTaskMeter({
      userId: USER,
      window: { from: "2026-09-30T09:00:00.000Z", to: "2026-09-30T11:00:00.000Z" },
    });
    expect(meter).toMatchObject({ calls: 2, attributable: false, attribution: "time_window" });
    expect(meter.meteredCostUsd).toBeCloseTo(0.003808, 10);
  });

  test("时间窗可以按 operation 收窄", async () => {
    db.seedRows("ai_generation_events", [row(), row({ request_id: "search-call-001", operation: "web.search", estimated_cost_usd: 0.004 })]);
    const meter = await measureTaskMeter({
      userId: USER,
      window: { from: "2026-09-30T09:00:00.000Z", to: "2026-09-30T11:00:00.000Z" },
      operations: ["job_search.rank"],
    });
    expect(meter.calls).toBe(1);
    expect(meter.providerModels).toEqual(["deepseek/deepseek-v4-flash"]);
  });

  test("空窗口如实返回 empty，不编造成本", async () => {
    const meter = await measureTaskMeter({ userId: USER, requestIds: [runRequestId(RUN, "nothing")] });
    expect(meter).toMatchObject({ empty: true, calls: 0, attributable: true, meteredCostUsd: null });
  });

  test("既没 requestIds 也没时间窗 ⇒ 直接报错，不许偷偷全表扫", async () => {
    await expect(measureTaskMeter({ userId: USER })).rejects.toThrow("requestIds");
  });

  test("查询失败如实抛出", async () => {
    db.fail("ai_generation_events", "select", { message: "db down" });
    await expect(measureTaskMeter({ userId: USER, requestIds: [runRequestId(RUN, "rank")] })).rejects.toMatchObject({
      message: "db down",
    });
  });
});

describe("预估 vs 实测对账 reconcileTaskCost", () => {
  const estimate = (): CostEstimate => estimateUnitCost({ unit: "job_search", provider: "deepseek", model: "deepseek-v4-flash" });
  /** 对账只看数值：把下界换成整数，避免浮点边界把断言带偏。 */
  const priced = (usd: number): CostEstimate => ({ ...estimate(), estimatedCostUsd: usd });
  /** 应收口径由台账侧决定，对账只照单记录。 */
  const settle = (kind: BillingUnitKind | null = "job_search", units = kind ? 1 : 0) => ({ billingUnit: kind, billingUnits: units });

  test("20% 是容差线：线上达标、线外超支，四分之一的量级不再处处报超支", () => {
    expect(OVER_BUDGET_RATIO).toBe(0.2);
    expect(reconcileTaskCost(priced(1), meter({ meteredCostUsd: 1.1 }), settle()).status).toBe("under_budget");
    expect(reconcileTaskCost(priced(1), meter({ meteredCostUsd: 1.2 }), settle()).status).toBe("under_budget");
    expect(reconcileTaskCost(priced(1), meter({ meteredCostUsd: 1.21 }), settle()).status).toBe("over_budget");
    expect(reconcileTaskCost(priced(1), meter({ meteredCostUsd: 1 }), settle()).status).toBe("matched");
  });

  test("下界预估为 0 却有实测消耗 ⇒ 超支（没有预算兜得住它）", () => {
    expect(reconcileTaskCost(priced(0), meter({ meteredCostUsd: 0.004 }), settle()).status).toBe("over_budget");
  });

  test("对账结果带 delta、比率与单元数（永远 1 个单元）", () => {
    const result = reconcileTaskCost(priced(1), meter({ meteredCostUsd: 1.002 }), settle());
    expect(result).toMatchObject({ billingUnit: "job_search", billingUnits: 1, estimatedCostUsd: 1 });
    expect(result.meteredCostUsd).toBe(1.002);
    expect(result.deltaUsd).toBeCloseTo(0.002, 10);
    expect(result.varianceRatio).toBeCloseTo(0.002, 6);
    expect(result.status).toBe("under_budget");
    expect(result.notes.join("\n")).toContain("下界");
  });

  test("对账不许自己把单元数补成 1：不收就是不收（失败/取消的任务）", () => {
    const result = reconcileTaskCost(priced(1), meter({ meteredCostUsd: 1.002 }), settle("job_search", 0));
    expect(result).toMatchObject({ billingUnit: "job_search", billingUnits: 0 });
  });

  test("没计量：unmetered，并说明可能是埋点没接上", () => {
    const result = reconcileTaskCost(estimate(), null, settle());
    expect(result.status).toBe("unmetered");
    expect(result.meteredCostUsd).toBeNull();
    expect(result.deltaUsd).toBeNull();
    expect(result.notes.join("\n")).toContain("没有生成事件");
  });

  test("没预估：unestimated，绝不把未知成本写成 0", () => {
    const unsourced = estimateUnitCost({ unit: "job_search", provider: "openai", model: "gpt-5.1" });
    const result = reconcileTaskCost(unsourced, meter(), settle());
    expect(result.status).toBe("unestimated");
    expect(result.estimatedCostUsd).toBeNull();
    expect(result.meteredCostUsd).toBe(0.006);
    expect(result.notes.join("\n")).toContain("没有单价来源");
  });

  test("两侧都没数：unmetered，且 unknowns 全部带出来", () => {
    const result = reconcileTaskCost(estimateUnitCost({ unit: "job_search", provider: "openai", model: "gpt-5.1" }), null, settle());
    expect(result.status).toBe("unmetered");
    expect(result.notes.join("\n")).toContain("输出 token 预算");
  });

  test("实测低于下界：标成异常而不是省钱", () => {
    const result = reconcileTaskCost(priced(1), meter({ meteredCostUsd: 0.999 }), settle());
    expect(result.deltaUsd).toBeCloseTo(-0.001, 10);
    expect(result.notes.join("\n")).toContain("别读成成本下降");
  });

  test("部分调用没价：说明计量只覆盖了多少次", () => {
    const result = reconcileTaskCost(priced(1), meter({ pricedCalls: 1, unpricedCalls: 2 }), settle());
    expect(result.notes.join("\n")).toContain("2 次调用没有单价来源");
    expect(result.notes.join("\n")).toContain("1 次");
  });

  test("时间窗归属：明确说用量没唯一归到本任务", () => {
    const result = reconcileTaskCost(estimate(), meter({ attributable: false, attribution: "time_window" }), settle());
    expect(result.notes.join("\n")).toContain("未唯一归属");
  });

  test("没有计费单元：应收单元为 0", () => {
    const result = reconcileTaskCost(estimate(), meter(), settle(null));
    expect(result).toMatchObject({ billingUnit: null, billingUnits: 0 });
  });
});

describe("应收单元归集", () => {
  test("只有拿到结果的任务收单元：done/partial 收，其余不收", () => {
    expect(billableUnitsForStatus("done")).toBe(1);
    expect(billableUnitsForStatus("partial")).toBe(1);
    expect(billableUnitsForStatus("failed")).toBe(0);
    expect(billableUnitsForStatus("cancelled")).toBe(0);
    expect(billableUnitsForStatus("pending")).toBe(0);
    expect(billableUnitsForStatus("running")).toBe(0);
  });

  test("partial 收一个单元：半成品是交付物，不是失败退款", () => {
    expect(billableUnitsForLedger(ledger({ status: "partial" }))).toEqual({ billingUnits: 1, billingUnit: "job_search" });
  });

  test("非任务计费的动作（无计费单元）不从这里收单元", () => {
    expect(billableUnitsForLedger(ledger({ billingUnit: null }))).toEqual({ billingUnits: 0, billingUnit: null });
    expect(billableUnitsForLedger(ledger({ billingUnit: "resume_rewrite" }))).toEqual({ billingUnits: 0, billingUnit: null });
  });

  test("一次任务只收一个单元，与内部调用次数无关", () => {
    const oneCall = billableUnitsForLedger(ledger({ status: "done" })).billingUnits;
    const manyCalls = billableUnitsForLedger(ledger({ status: "done", steps: Array.from({ length: 6 }, (_unused, index) => ({ id: `s${index}`, label: "步", status: "done" as const })) })).billingUnits;
    expect([oneCall, manyCalls]).toEqual([1, 1]);
  });

  test("estimateFromLedger 只认结构完整的预估", () => {
    expect(estimateFromLedger(ledger({ estimate: estimateUnitCost({ unit: "job_search", provider: "deepseek", model: "deepseek-v4-flash" }) }))?.billingUnit).toBe("job_search");
    expect(estimateFromLedger(ledger({ estimate: null }))).toBeNull();
    expect(estimateFromLedger(ledger({ estimate: { 预算: "手填的" } }))).toBeNull();
    expect(estimateFromLedger(ledger({ estimate: "0.005" }))).toBeNull();
  });
});

describe("settleTaskCost（W6 界面拿这一份）", () => {
  const row = (overrides: Record<string, unknown> = {}) => ({
    user_id: USER,
    operation: "job_search.rank",
    request_id: runRequestId(RUN, "rank"),
    provider: "deepseek",
    model: "deepseek-v4-flash",
    status: "success",
    latency_ms: 1_200,
    input_tokens: 12_000,
    output_tokens: 800,
    total_tokens: 12_800,
    cache_hit_tokens: 0,
    cache_miss_tokens: 12_000,
    estimated_cost_usd: 0.001808,
    pricing_version: "deepseek-v4-2026-08-18",
    created_at: "2026-09-30T10:00:00.000Z",
    ...overrides,
  });

  test("完成的任务：单元 + 下界预估 + 实测一次给齐", async () => {
    db.seedRows("ai_generation_events", [
      row(),
      row({ request_id: runRequestId(RUN, "search"), estimated_cost_usd: 0.0018 }),
      row({ request_id: runRequestId(RUN, "write"), estimated_cost_usd: 0.0018 }),
    ]);
    const { reconciliation, meter } = await settleTaskCost({
      ledger: ledger({
        status: "done",
        estimate: estimateUnitCost({ unit: "job_search", provider: "deepseek", model: "deepseek-v4-flash" }),
      }),
      requestIds: [runRequestId(RUN, "rank"), runRequestId(RUN, "search"), runRequestId(RUN, "write")],
    });
    expect(reconciliation).toMatchObject({ billingUnit: "job_search", billingUnits: 1 });
    expect(reconciliation.estimatedCostUsd).toBeCloseTo(0.00504, 10);
    expect(reconciliation.meteredCostUsd).toBeCloseTo(0.005408, 10);
    expect(reconciliation.status).toBe("under_budget");
    expect(meter?.calls).toBe(3);
  });

  test("失败/取消的任务：不收单元，但已发生的消耗仍需归因", async () => {
    db.seedRows("ai_generation_events", [row()]);
    const { reconciliation } = await settleTaskCost({
      ledger: ledger({ status: "failed", billingUnit: "job_search" }),
      requestIds: [runRequestId(RUN, "rank")],
    });
    expect(reconciliation.billingUnits).toBe(0);
    expect(reconciliation.notes.join("\n")).toContain("不计费");
    expect(reconciliation.notes.join("\n")).toContain("成本仍需归因");
  });

  test("任务没有计量输入时不做假对账", async () => {
    const { reconciliation, meter } = await settleTaskCost({ ledger: ledger({ status: "done" }) });
    expect(meter).toBeNull();
    expect(reconciliation.status).toBe("unmetered");
    expect(reconciliation.notes.join("\n")).toContain("planned 事件里缺 estimate");
  });
});

describe("状态 → 停止原因（写库合法值）", () => {
  test("没有 partial 这个停止原因，所以部分完成只能靠 outcome 标记", () => {
    expect(stopReasonForStatus("completed")).toBe("completed");
    expect(stopReasonForStatus("cancelled")).toBe("user_cancelled");
    expect(stopReasonForStatus("failed")).toBe("error");
    expect(stopReasonForStatus("running")).toBeNull();
    expect(stopReasonForStatus("waiting_user")).toBeNull();
    expect(stopReasonForStatus("partial" as never)).toBeNull();
  });
});
