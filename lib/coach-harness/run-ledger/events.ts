/**
 * W5 / PRD FR-32：事件 intake——左栏每个用户动作、每个由模型完成的任务，
 * 都要作为事件交给主 Agent。
 *
 * 落在哪：`product_events`（第一方运营事件表，user_id + client_event_id 天然去重，
 * 且表注释就写着「只存有限的运营元数据，绝不存简历/JD/面试答案/消息正文」）。
 * 任务级事件再镜像一份到 `coach_run_events`，这样从 run 也能反查投递记录。
 *
 * 事件清单是封闭的：未知 kind 直接拒收，不做「先收下再说」。
 */

import { getDbClient } from "@/lib/db";
import { appendRunEvent } from "./lifecycle";
import { requireDb } from "../repository";
import type { TaskLedger } from "./types";

export type LedgerEventCategory = "user_action" | "task_result";

export interface LedgerEventDefinition {
  kind: string;
  category: LedgerEventCategory;
  /** 是否必须绑定一个 run（模型完成的任务）。 */
  runScoped: boolean;
  /** 与现有漏斗事件名的对应关系，给看板用；null 表示这是台账新造的事件。 */
  funnelEventName: string | null;
  label: string;
}

/**
 * FR-32 验收要求清单覆盖：保存简历 / 改阶段 / 跑调研 / 完成面试，各一条以上。
 */
export const LEDGER_EVENT_CATALOG = [
  {
    kind: "resume_saved",
    category: "user_action",
    runScoped: false,
    funnelEventName: "resume_generation_completed",
    label: "用户在左栏保存了简历版本",
  },
  {
    kind: "resume_change_confirmed",
    category: "user_action",
    runScoped: false,
    funnelEventName: "resume_change_reviewed",
    label: "用户确认了一处简历改动",
  },
  {
    kind: "resume_change_withdrawn",
    category: "user_action",
    runScoped: false,
    funnelEventName: "resume_change_edited",
    label: "用户撤销了一处简历改动",
  },
  {
    kind: "stage_changed",
    category: "user_action",
    runScoped: false,
    funnelEventName: null,
    label: "用户改了岗位阶段",
  },
  {
    kind: "material_uploaded",
    category: "user_action",
    runScoped: false,
    funnelEventName: "opportunity_material_completed",
    label: "用户上传或粘贴了材料",
  },
  {
    kind: "daily_action_completed",
    category: "user_action",
    runScoped: false,
    funnelEventName: "today_action_completed",
    label: "用户完成了今日动作",
  },
  {
    kind: "daily_action_snoozed",
    category: "user_action",
    runScoped: false,
    funnelEventName: "mentor_action_snoozed",
    label: "用户推迟了今日动作",
  },
  {
    kind: "fact_confirmed",
    category: "user_action",
    runScoped: false,
    funnelEventName: "evidence_confirmed",
    label: "用户确认了一条待确认事实",
  },
  {
    kind: "mock_interview_completed",
    category: "user_action",
    runScoped: false,
    funnelEventName: "mock_interview_completed",
    label: "用户结束了一场模拟面试",
  },
  {
    kind: "interview_review_saved",
    category: "user_action",
    runScoped: false,
    funnelEventName: "interview_review_saved",
    label: "用户保存了真实面试复盘",
  },
  {
    kind: "job_search_completed",
    category: "task_result",
    runScoped: true,
    funnelEventName: null,
    label: "模型跑完一次岗位搜索",
  },
  {
    kind: "research_completed",
    category: "task_result",
    runScoped: true,
    funnelEventName: null,
    label: "模型跑完一次公司调研",
  },
  {
    kind: "resume_draft_completed",
    category: "task_result",
    runScoped: true,
    funnelEventName: null,
    label: "模型跑完一次简历改写",
  },
  {
    kind: "task_partial",
    category: "task_result",
    runScoped: true,
    funnelEventName: null,
    label: "任务部分完成（有半成品可查）",
  },
  {
    kind: "task_failed",
    category: "task_result",
    runScoped: true,
    funnelEventName: null,
    label: "任务没跑成",
  },
  {
    kind: "task_cancelled",
    category: "task_result",
    runScoped: true,
    funnelEventName: null,
    label: "用户取消了任务",
  },
] as const satisfies readonly LedgerEventDefinition[];

export type LedgerEventKind = (typeof LEDGER_EVENT_CATALOG)[number]["kind"];
/** 清单条目的字面量类型：查表拿到的 kind 仍是窄类型，不用到处 as。 */
type LedgerEventEntry = (typeof LEDGER_EVENT_CATALOG)[number];

const CATALOG_BY_KIND = new Map<string, LedgerEventEntry>(
  LEDGER_EVENT_CATALOG.map((definition) => [definition.kind, definition]),
);

export const LEDGER_EVENT_KINDS: readonly LedgerEventKind[] = LEDGER_EVENT_CATALOG.map(
  (definition) => definition.kind,
) as readonly LedgerEventKind[];

/** 事件正文红线：这些键（或含这些词的性质）一律不收，台账只放运营元数据。 */
const FORBIDDEN_PROPERTY_KEYS = /(?:^|_)(?:text|content|body|resume|jd|answer|message|prompt|quote|transcript|attachment|claim)(?:$|_)/i;
const PROPERTY_KEY_MAX = 48;
const PROPERTY_VALUE_MAX = 160;
const MAX_PROPERTIES = 16;

export interface IntakeEventInput {
  userId: string;
  kind: string;
  /** 去重键：同一动作重放只落一条。 */
  clientEventId: string;
  occurredAt?: string;
  runId?: string | null;
  sessionId?: string | null;
  opportunityId?: string | null;
  properties?: Record<string, unknown> | null;
}

export type IntakeRejection =
  | { accepted: false; stored: false; reason: "unknown_event_kind" }
  | { accepted: false; stored: false; reason: "client_event_id_invalid" }
  | { accepted: false; stored: false; reason: "run_required_for_task_event" };

export interface IntakeAcceptance {
  accepted: true;
  stored: boolean;
  /** 同一 clientEventId 已经存在时为 true，不重复投递给主 Agent。 */
  deduped: boolean;
  eventName: string;
  kind: LedgerEventKind;
  category: LedgerEventCategory;
  properties: Record<string, string | number | boolean | null>;
}

export type IntakeResult = IntakeAcceptance | IntakeRejection;

/** 元数据清洗：键名白名单化、值限长、正文类字段整条丢弃。 */
export function sanitizeLedgerEventProperties(value: unknown): Record<string, string | number | boolean | null> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, string | number | boolean | null> = {};
  for (const [rawKey, rawValue] of Object.entries(value as Record<string, unknown>).slice(0, MAX_PROPERTIES)) {
    const key = rawKey.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, PROPERTY_KEY_MAX);
    if (!key || FORBIDDEN_PROPERTY_KEYS.test(key)) continue;
    if (typeof rawValue === "string") result[key] = rawValue.slice(0, PROPERTY_VALUE_MAX);
    else if (typeof rawValue === "number" && Number.isFinite(rawValue)) result[key] = rawValue;
    else if (typeof rawValue === "boolean" || rawValue === null) result[key] = rawValue;
  }
  return result;
}

/** 事件名：统一前缀，长度受 product_events 的 3–64 字符约束保护。 */
export function ledgerEventName(kind: string): string {
  return `agent_${kind}`.slice(0, 64);
}

/**
 * intake 入口。校验 → 落 product_events（去重）→ 任务级事件镜像进 coach_run_events。
 * 任何一步失败都不假装成功：返回 stored:false，让调用方决定重试。
 */
export async function intakeEvent(input: IntakeEventInput): Promise<IntakeResult> {
  const definition = CATALOG_BY_KIND.get(input.kind);
  if (!definition) return { accepted: false, stored: false, reason: "unknown_event_kind" };
  if (!/^[a-zA-Z0-9_-]{8,96}$/.test(input.clientEventId)) {
    return { accepted: false, stored: false, reason: "client_event_id_invalid" };
  }
  if (definition.runScoped && !input.runId) {
    return { accepted: false, stored: false, reason: "run_required_for_task_event" };
  }

  const properties = sanitizeLedgerEventProperties(input.properties);
  const occurredAt =
    typeof input.occurredAt === "string" && !Number.isNaN(Date.parse(input.occurredAt))
      ? new Date(input.occurredAt).toISOString()
      : new Date().toISOString();
  const eventName = ledgerEventName(definition.kind);

  const db = requireDb(await getDbClient());
  const { data, error } = await db
    .from("product_events")
    .upsert(
      {
        user_id: input.userId,
        event_name: eventName,
        client_event_id: input.clientEventId,
        occurred_at: occurredAt,
        properties: {
          ...properties,
          ...(input.runId ? { run_id: input.runId } : {}),
          ...(input.sessionId ? { session_id: input.sessionId } : {}),
          ...(input.opportunityId ? { opportunity_id: input.opportunityId } : {}),
        },
      },
      { onConflict: "user_id,client_event_id", ignoreDuplicates: true },
    )
    .select("id")
    .maybeSingle();
  if (error) throw error;
  const stored = Boolean(data?.id);

  if (input.runId) {
    // 任务级事件镜像到 run 流水，run 侧可反查「这个任务给主 Agent 递过什么」。
    // 用户动作没有 run 也能成立，所以只有带 runId 时才写。
    await appendRunEvent({
      userId: input.userId,
      runId: input.runId,
      eventType: definition.category === "task_result" ? "validation" : "artifact_saved",
      payload: { intakeKind: definition.kind, category: definition.category, clientEventId: input.clientEventId, at: occurredAt },
    });
  }

  return {
    accepted: true,
    stored,
    deduped: !stored,
    eventName,
    kind: definition.kind,
    category: definition.category,
    properties,
  };
}

export interface InboundEvent {
  kind: LedgerEventKind;
  category: LedgerEventCategory;
  label: string;
  occurredAt: string;
  runId: string | null;
  opportunityId: string | null;
  properties: Record<string, unknown>;
}

/** 主 Agent 读的地方：按用户取回最近的事件，最新的在前。 */
export async function readInboundEvents(input: {
  userId: string;
  opportunityId?: string | null;
  since?: string;
  limit?: number;
}): Promise<InboundEvent[]> {
  const db = requireDb(await getDbClient());
  let query = db
    .from("product_events")
    .select("event_name, occurred_at, properties")
    .eq("user_id", input.userId)
    .in("event_name", LEDGER_EVENT_KINDS.map(ledgerEventName));
  if (input.opportunityId !== undefined) query = input.opportunityId
    ? query.eq("properties->>opportunity_id", input.opportunityId)
    : query.is("properties->>opportunity_id", null);
  if (typeof input.since === "string" && !Number.isNaN(Date.parse(input.since))) {
    query = query.gte("occurred_at", new Date(input.since).toISOString());
  }
  const { data, error } = await query.order("occurred_at", { ascending: false }).limit(input.limit ?? 20);
  if (error) throw error;

  const events: InboundEvent[] = [];
  for (const row of (data || []) as Array<Record<string, unknown>>) {
    const name = String(row.event_name);
    const kind = name.replace(/^agent_/, "");
    const definition = CATALOG_BY_KIND.get(kind);
    if (!definition) continue;
    const properties = (row.properties && typeof row.properties === "object" ? row.properties : {}) as Record<string, unknown>;
    events.push({
      kind: definition.kind,
      category: definition.category,
      label: definition.label,
      occurredAt: String(row.occurred_at),
      runId: typeof properties.run_id === "string" ? properties.run_id : null,
      opportunityId: typeof properties.opportunity_id === "string" ? properties.opportunity_id : null,
      properties,
    });
  }
  return events;
}

/** 交给主 Agent 的正文上限：事件行本身很短，超出的直接不装。 */
export const INBOUND_EVENT_TEXT_MAX = 1_200;

/**
 * 把事件渲染成给主 Agent 的段落。确定性、不含任何用户正文内容，
 * 调用方（route 位）把它作为一块料交给上下文编译器——本层不新建第二套装配。
 */
export function renderInboundEventsForAgent(events: InboundEvent[]): string {
  if (!events.length) return "";
  const lines: string[] = [];
  let used = 0;
  for (const event of events) {
    const detail = Object.entries(event.properties)
      .filter(([key]) => !key.endsWith("_id"))
      .slice(0, 4)
      .map(([key, value]) => `${key}=${String(value)}`)
      .join(" ");
    const line = `- ${event.occurredAt} [${event.category === "task_result" ? "模型任务" : "用户动作"}] ${event.label}${detail ? `（${detail}）` : ""}`;
    if (used + line.length + 1 > INBOUND_EVENT_TEXT_MAX) break;
    used += line.length + 1;
    lines.push(line);
  }
  return [`最近的工作台事件（新→旧，只作背景，不作用户事实）：`, ...lines].join("\n");
}

/** 台账收口时顺手投递一条任务结果，调用方不必自己拼 kind。 */
export function taskResultKindForLedger(ledger: TaskLedger): LedgerEventKind | null {
  switch (ledger.status) {
    case "done":
      return ledger.billingUnit === "company_research" ? "research_completed" : ledger.billingUnit === "job_search" ? "job_search_completed" : "resume_draft_completed";
    case "partial":
      return "task_partial";
    case "failed":
      return "task_failed";
    case "cancelled":
      return "task_cancelled";
    default:
      return null;
  }
}
