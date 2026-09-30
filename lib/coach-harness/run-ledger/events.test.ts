/**
 * PRD FR-32：左栏用户动作与模型完成的任务都要作为事件交给主 Agent。
 * 验收口径：事件清单覆盖「保存简历 / 改阶段 / 跑调研 / 完成面试」各一条以上，
 * 且事件里绝不出现简历/JD/答案正文（product_events 的表注释就是这条红线）。
 */

jest.mock("@/lib/db");

import { getDbClient } from "@/lib/db";
import {
  LEDGER_EVENT_CATALOG,
  LEDGER_EVENT_KINDS,
  INBOUND_EVENT_TEXT_MAX,
  intakeEvent,
  ledgerEventName,
  readInboundEvents,
  renderInboundEventsForAgent,
  sanitizeLedgerEventProperties,
  taskResultKindForLedger,
} from "./events";
import { FakeDb } from "./testing/fake-db";
import type { TaskLedger } from "./types";

const USER = "00000000-0000-4000-8000-000000000001";
const RUN = "11111111-1111-4111-8111-111111111111";
const OPP = "22222222-2222-4222-8222-222222222222";

let db: FakeDb;

beforeEach(() => {
  db = new FakeDb();
  (getDbClient as jest.Mock).mockImplementation(async () => db);
});

function ledger(overrides: Partial<TaskLedger> = {}): TaskLedger {
  return {
    runId: RUN,
    userId: USER,
    opportunityId: OPP,
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

describe("事件清单（FR-32 覆盖面）", () => {
  test("四类动作都有事件：保存简历 / 改阶段 / 跑调研 / 完成面试", () => {
    const kinds = LEDGER_EVENT_KINDS;
    expect(kinds.filter((kind) => kind.startsWith("resume_"))).toEqual(
      expect.arrayContaining(["resume_saved", "resume_change_confirmed", "resume_draft_completed"]),
    );
    expect(kinds).toContain("stage_changed");
    expect(kinds).toContain("research_completed");
    expect(kinds).toEqual(expect.arrayContaining(["mock_interview_completed", "interview_review_saved"]));
  });

  test("每个事件都归了类，任务级事件必须绑 run", () => {
    for (const definition of LEDGER_EVENT_CATALOG) {
      expect(["user_action", "task_result"]).toContain(definition.category);
      expect(definition.label.length).toBeGreaterThan(1);
      if (definition.category === "task_result") expect(definition.runScoped).toBe(true);
    }
  });

  test("事件名长度落在 product_events 的 3–64 约束里", () => {
    for (const kind of LEDGER_EVENT_KINDS) {
      const name = ledgerEventName(kind);
      expect(name.length).toBeGreaterThanOrEqual(3);
      expect(name.length).toBeLessThanOrEqual(64);
    }
  });
});

describe("intakeEvent", () => {
  test("用户动作进 product_events，事件名带 agent_ 前缀", async () => {
    const result = await intakeEvent({
      userId: USER,
      kind: "resume_saved",
      clientEventId: "resume-saved-0001",
      occurredAt: "2026-09-30T10:00:00.000Z",
      opportunityId: OPP,
      properties: { version: 3, workspace: "target" },
    });
    expect(result).toMatchObject({ accepted: true, stored: true, deduped: false, eventName: "agent_resume_saved", category: "user_action" });
    const [row] = db.rows("product_events");
    expect(row).toMatchObject({
      user_id: USER,
      event_name: "agent_resume_saved",
      client_event_id: "resume-saved-0001",
      occurred_at: "2026-09-30T10:00:00.000Z",
    });
    expect((row.properties as Record<string, unknown>).version).toBe(3);
    expect((row.properties as Record<string, unknown>).opportunity_id).toBe(OPP);
  });

  test("同一 clientEventId 重放只落一条，且明确回报 deduped", async () => {
    const first = await intakeEvent({ userId: USER, kind: "stage_changed", clientEventId: "stage-00000001" });
    const second = await intakeEvent({ userId: USER, kind: "stage_changed", clientEventId: "stage-00000001" });
    expect(first).toMatchObject({ stored: true, deduped: false });
    expect(second).toMatchObject({ accepted: true, stored: false, deduped: true });
    expect(db.rows("product_events")).toHaveLength(1);
  });

  test("未知事件名直接拒收，不先收下再说", async () => {
    expect(await intakeEvent({ userId: USER, kind: "随手记一笔", clientEventId: "whatever-1" })).toEqual({
      accepted: false,
      stored: false,
      reason: "unknown_event_kind",
    });
    expect(db.rows("product_events")).toHaveLength(0);
  });

  test("去重键格式不符拒收", async () => {
    expect(await intakeEvent({ userId: USER, kind: "resume_saved", clientEventId: "短" })).toEqual({
      accepted: false,
      stored: false,
      reason: "client_event_id_invalid",
    });
  });

  test("模型完成的任务没带 runId 拒收", async () => {
    expect(await intakeEvent({ userId: USER, kind: "research_completed", clientEventId: "research-00001" })).toEqual({
      accepted: false,
      stored: false,
      reason: "run_required_for_task_event",
    });
  });

  test("任务级事件同时镜像进 coach_run_events，run 侧能反查投递记录", async () => {
    await intakeEvent({
      userId: USER,
      kind: "job_search_completed",
      clientEventId: "job-search-0001",
      runId: RUN,
      properties: { candidates: 12 },
    });
    const mirrored = db.rows("coach_run_events");
    expect(mirrored).toHaveLength(1);
    expect(mirrored[0]).toMatchObject({ run_id: RUN, event_type: "validation", user_id: USER });
    expect(mirrored[0].payload).toMatchObject({ intakeKind: "job_search_completed", category: "task_result" });
  });

  test("落库失败如实抛出，不回报成功", async () => {
    // PostgREST 的错误是个带 message 的普通对象，不是 Error 实例：
    // intakeEvent 必须原样抛出，不能吞成 stored:false。
    db.fail("product_events", "upsert", { message: "db down", code: "23505" });
    await expect(
      intakeEvent({ userId: USER, kind: "resume_saved", clientEventId: "resume-saved-0002" }),
    ).rejects.toMatchObject({ message: "db down" });
    expect(db.rows("product_events")).toHaveLength(0);
  });
});

describe("事件正文红线", () => {
  test("简历/JD/答案/消息正文这类键整条丢弃", () => {
    const cleaned = sanitizeLedgerEventProperties({
      version: 3,
      resume_text: "整段简历原文",
      jd: "JD 原文",
      answer: "面试答案",
      message_body: "对话消息",
      stage_before: "evaluating",
      nested: { still: "dropped-because-key-unsafe? " },
    });
    expect(cleaned).toEqual({ version: 3, stage_before: "evaluating", nested: undefined });
    expect(JSON.stringify(cleaned)).not.toContain("整段简历原文");
  });

  test("字符串限长 160、键名清洗、条数上限 16", () => {
    const many = Object.fromEntries(Array.from({ length: 40 }, (_unused, index) => [`key_${index}`, index]));
    expect(Object.keys(sanitizeLedgerEventProperties(many))).toHaveLength(16);
    const cleaned = sanitizeLedgerEventProperties({ "bad key/name": "x".repeat(400) });
    expect(Object.keys(cleaned)).toEqual(["bad_key_name"]);
    expect(String(cleaned.bad_key_name)).toHaveLength(160);
  });

  test("非对象输入返回空属性", () => {
    expect(sanitizeLedgerEventProperties(null)).toEqual({});
    expect(sanitizeLedgerEventProperties(["a"])).toEqual({});
    expect(sanitizeLedgerEventProperties("字符串")).toEqual({});
  });
});

describe("主 Agent 读事件", () => {
  async function seed() {
    db.seedRows("product_events", [
      {
        user_id: USER,
        event_name: "agent_resume_saved",
        client_event_id: "seed-00000001",
        occurred_at: "2026-09-30T09:00:00.000Z",
        properties: { version: 4 },
      },
      {
        user_id: USER,
        event_name: "agent_stage_changed",
        client_event_id: "seed-00000002",
        occurred_at: "2026-09-30T10:30:00.000Z",
        properties: { stage_before: "evaluating", stage_after: "applied", run_id: RUN },
      },
      {
        user_id: USER,
        event_name: "agent_research_completed",
        client_event_id: "seed-00000003",
        occurred_at: "2026-09-30T11:00:00.000Z",
        properties: { run_id: RUN, opportunity_id: OPP },
      },
      // 非台账事件（漏斗埋点）不该被主 Agent 当工作台事件读走。
      {
        user_id: USER,
        event_name: "coach_response_received",
        client_event_id: "seed-00000004",
        occurred_at: "2026-09-30T11:30:00.000Z",
        properties: {},
      },
    ]);
  }

  test("只取台账事件、新的在前、带上可读标签", async () => {
    await seed();
    const events = await readInboundEvents({ userId: USER });
    expect(events.map((event) => event.kind)).toEqual(["research_completed", "stage_changed", "resume_saved"]);
    expect(events[0].label).toBe("模型跑完一次公司调研");
    expect(events[1].properties.stage_after).toBe("applied");
    expect(events[1].runId).toBe(RUN);
    expect(events[2].opportunityId).toBeNull();
  });

  test("since 过滤 + limit", async () => {
    await seed();
    const events = await readInboundEvents({ userId: USER, since: "2026-09-30T10:00:00.000Z", limit: 2 });
    expect(events.map((event) => event.kind)).toEqual(["research_completed", "stage_changed"]);
  });

  test("渲染给主 Agent 的段落是确定性的、不含正文", async () => {
    await seed();
    const events = await readInboundEvents({ userId: USER });
    const text = renderInboundEventsForAgent(events);
    expect(text).toContain("最近的工作台事件");
    expect(text).toContain("[模型任务] 模型跑完一次公司调研");
    expect(text).toContain("[用户动作] 用户改了岗位阶段");
    expect(text).toContain("stage_after=applied");
    // id 类字段不进正文，避免把 uuid 灌给模型。
    expect(text).not.toContain(RUN);
    expect(text.length).toBeLessThanOrEqual(INBOUND_EVENT_TEXT_MAX + 200);
    // 同一批事件渲染两次结果一致（确定性）。
    expect(renderInboundEventsForAgent(events)).toBe(text);
  });

  test("没有事件时返回空串，不塞一段废话进上下文", () => {
    expect(renderInboundEventsForAgent([])).toBe("");
  });

  test("超出预算的事件行直接不装，不截半条", async () => {
    const many = await readInboundEvents({ userId: USER });
    void many;
    const big = Array.from({ length: 60 }, (_unused, index) => ({
      kind: "stage_changed" as const,
      category: "user_action" as const,
      label: "用户改了岗位阶段",
      occurredAt: `2026-09-30T11:00:00.000Z`,
      runId: null,
      opportunityId: null,
      properties: { index, filler: "阶段".repeat(30) },
    }));
    const text = renderInboundEventsForAgent(big);
    expect(text.length).toBeLessThanOrEqual(INBOUND_EVENT_TEXT_MAX + 200);
    const lines = text.split("\n").slice(1);
    expect(lines.length).toBeLessThan(big.length);
    for (const line of lines) expect(line).toMatch(/用户改了岗位阶段/);
  });
});

describe("台账收口 → 事件", () => {
  test("六种任务状态映射到投递事件", () => {
    expect(taskResultKindForLedger(ledger({ status: "done", billingUnit: "company_research" }))).toBe("research_completed");
    expect(taskResultKindForLedger(ledger({ status: "done", billingUnit: "job_search" }))).toBe("job_search_completed");
    expect(taskResultKindForLedger(ledger({ status: "done", billingUnit: null, actionType: "resume_workshop" }))).toBe("resume_draft_completed");
    expect(taskResultKindForLedger(ledger({ status: "partial" }))).toBe("task_partial");
    expect(taskResultKindForLedger(ledger({ status: "failed" }))).toBe("task_failed");
    expect(taskResultKindForLedger(ledger({ status: "cancelled" }))).toBe("task_cancelled");
    expect(taskResultKindForLedger(ledger({ status: "running" }))).toBeNull();
    expect(taskResultKindForLedger(ledger({ status: "pending" }))).toBeNull();
  });
});
