/**
 * 学习成果契约（PRD 2026-10-08 §8.2 第二段）。
 *
 * 这份东西存在的理由只有一个：导师聊完得留下一条**用户自己能改、能带走**的记录，
 * 而不是又一份读过的长回答。所以字段里最要紧的不是文案，是三条硬约束：
 * 1. 没有用户实际尝试（`attemptTurnIds` 为空）就不给表现判断，只能是「未独立检验」。
 *    模型自己讲得好不等于用户会了。
 * 2. `observedStatus` 只描述**本题**表现，不是永久能力认证；界面和后续检索都按这个口径写。
 * 3. `answerDraft` 是用户内容，必须能回查到来源 turn 或材料版本；模型示范不能混进去。
 *
 * 存储映射（WP3-a 的现状与本文件的分工）：
 * 草稿落在 `coach_agent_turns.learning_trace.outcome`，随本轮一次写入产生，
 * 刷新与重放都能从历史回读同一份。用户编辑后的当前版本由 outcomes 接口通过
 * `save_coach_outcome` 事务保存到 `coach_learning_sessions.outcome jsonb`，
 * 使用 owner/source 唯一约束、version 乐观锁和 requestId 幂等；
 * 现有 `summary` 继续存可读正文，绝不把 JSON 拼进 `summary` 字符串。
 */

export const LEARNING_OUTCOME_VERSION = "learning-outcome-v1";

/** 三档，且只有三档：本题独立完成过 > 提示下完成 > 未独立检验。 */
export type ObservedStatus = "未独立检验" | "提示下完成" | "独立完成过";

export interface LearningOutcome {
  sessionId: string;
  /** 本次目标，一行可读。 */
  goal: string;
  /** 完成标准变了要升版本，旧成果的「已覆盖」结论不能跟着新标准走。 */
  criterionVersion: number;
  /** 用户实际开口的轮次；为空 = 没有尝试。 */
  attemptTurnIds: string[];
  answerDraft: string;
  observedStatus: ObservedStatus;
  /** 回查锚点：turn id 或材料版本指纹。 */
  evidenceRefs: string[];
  openIssue: string | null;
  nextStep: string | null;
  revision: number;
  status: "draft" | "saved";
}

const uuid = /^[\da-f-]{36}$/i;

/** 校验在落库前跑，返回给用户的话不能出现内部术语。 */
export function validateOutcome(input: Partial<LearningOutcome>): { ok: true; outcome: LearningOutcome } | { ok: false; error: string } {
  if (typeof input.goal !== "string" || !input.goal.trim()) return { ok: false, error: "请先写下这次要练成什么" };
  if (input.goal.trim().length > 200) return { ok: false, error: "本次目标请控制在 200 字内" };
  if (typeof input.answerDraft !== "string" || !input.answerDraft.trim()) return { ok: false, error: "成果里要有你自己写的答案或修改稿" };
  if (input.answerDraft.length > 6000) return { ok: false, error: "成果正文请控制在 6000 字内" };
  if (!Number.isInteger(input.criterionVersion) || (input.criterionVersion ?? 0) < 1) return { ok: false, error: "完成标准版本不正确" };
  if (!Number.isInteger(input.revision) || (input.revision ?? 0) < 1) return { ok: false, error: "成果版本不正确，请重新打开后再保存" };
  if (input.status !== "draft" && input.status !== "saved") return { ok: false, error: "成果状态不正确" };
  const attempts = Array.isArray(input.attemptTurnIds) ? input.attemptTurnIds.filter((id) => uuid.test(id)) : [];
  const refs = Array.isArray(input.evidenceRefs) ? input.evidenceRefs.filter((id) => typeof id === "string" && id.trim().length > 0 && id.length <= 200) : [];
  // 声称「完成过」却没有任何本人轮次，是 §9.1 的独立硬失败，直接拒。
  if (input.observedStatus !== "未独立检验" && !attempts.length) {
    return { ok: false, error: "这次还没有你自己的尝试，先按未独立检验保存" };
  }
  if ((input.observedStatus === "独立完成过" || input.observedStatus === "提示下完成") && !refs.length) {
    return { ok: false, error: "这条判断要能回查到对应的回答或材料版本" };
  }
  return {
    ok: true,
    outcome: {
      sessionId: typeof input.sessionId === "string" && uuid.test(input.sessionId) ? input.sessionId : "",
      goal: input.goal.trim(),
      criterionVersion: input.criterionVersion as number,
      attemptTurnIds: attempts,
      answerDraft: input.answerDraft.trim(),
      // 缺省即最保守的一档：没标状态不等于已满标。
      observedStatus: input.observedStatus === "独立完成过" || input.observedStatus === "提示下完成" ? input.observedStatus : "未独立检验",
      evidenceRefs: refs,
      openIssue: typeof input.openIssue === "string" && input.openIssue.trim() ? input.openIssue.trim() : null,
      nextStep: typeof input.nextStep === "string" && input.nextStep.trim() ? input.nextStep.trim() : null,
      revision: input.revision as number,
      status: input.status as LearningOutcome["status"],
    },
  };
}

/**
 * 用户手写修改是新的内容版本，不自动升级为新的能力证据：
 * 编辑只推进 `revision`，`observedStatus` 与 `criterionVersion` 由判定方另行决定。
 */
export function reviseOutcome(saved: LearningOutcome, answerDraft: string): LearningOutcome {
  return { ...saved, answerDraft: answerDraft.trim(), revision: saved.revision + 1, status: "draft" };
}

/**
 * 成果草稿的信源划分（PRD §8.2「草稿沿用一次导师调用产出」+ §6 B3）。
 *
 * 模型**只**被允许提供三样东西：这一本题的表现档、一个未解决点、一个下一步。
 * `answerDraft`、`attemptTurnIds`、`goal`、`criterionVersion` 全部由服务端自己填——
 * 「模型示范不能混进用户内容」这件事不该靠校验器抓，该靠它根本没有输入口。
 * 表现档同样不由它定：声称「独立完成过」一律降为「提示下完成」，
 * 因为独立迁移要换一个没给过提示的新场景才观察得到，本链路没有可核验的迁移判定
 * （**施工判断，待郭屹复核**：另一条路是回看上一轮导师有没有给提示来放行更高一档）。
 */
export interface OutcomeModelDraft {
  observedStatus: unknown;
  openIssue: unknown;
  nextStep: unknown;
  criterionEvidence?: unknown;
}

export interface OutcomeEvidence {
  sessionId: string;
  /** 服务端认定的本人作答轮次；本轮新落库的 turn 由调用方加进来。 */
  attempts: string[];
  /** 服务端自己抄的用户原话。 */
  answerDraft: string;
  goal: string;
  criterionVersion: number;
  scenarioAudited: boolean;
  feedbackText?: string;
  requiredCriterionParts?: string[];
}

export type OutcomeRejectCode = "no_attempt" | "empty_draft" | "invalid" | "inconsistent_feedback";

export type OutcomeBuild =
  | { ok: true; outcome: LearningOutcome; note: string | null }
  | { ok: false; code: OutcomeRejectCode; copy: string };

/** 导师正文之外的成果标签：`<outcome>…</outcome>`，与 answer/clarify/followups 一样不外露。 */
export function extractOutcomeTag(raw: string): { text: string; draft: OutcomeModelDraft | null; malformed: boolean } {
  const closed = /<outcome\b[^>]*>([\s\S]*?)<\/outcome>/i.exec(raw);
  if (closed) {
    const text = raw.slice(0, closed.index) + raw.slice(closed.index + closed[0].length);
    try {
      const value = JSON.parse(closed[1].trim()) as Record<string, unknown>;
      // 只认成果字段与可回查引用；用户答案必须来自真实 turn，不能由模型代写。
      return { text: raw.replace(/<outcome\b[^>]*>[\s\S]*?<\/outcome>/gi, "").replace(/<\/?outcome\b[^>]*>/gi, "").trim(), draft: { observedStatus: value.observedStatus, openIssue: value.openIssue, nextStep: value.nextStep, ...(value.criterionEvidence!==undefined?{criterionEvidence:value.criterionEvidence}:{}) }, malformed: false };
    } catch {
      return { text, draft: null, malformed: true };
    }
  }
  // 只有开头没有闭合：整段吞掉，内部 JSON 一律不外露。
  const opening = /<outcome\b[^>]*>/i.exec(raw);
  if (!opening) return { text: raw.trim(), draft: null, malformed: false };
  return { text: raw.slice(0, opening.index).trim(), draft: null, malformed: true };
}

/**
 * 卡片里两句自由文案（未解决点 / 下一步）也不能夹带能力结论：
 * 出现「已掌握/已达标/已确认」这类断言就整句丢掉，宁可少一句提示。
 */
const STRONG_CLAIM = /已(?:经)?(?:掌握|学会|达标|具备|独立检验|确认|核实)/;
const text = (value: unknown, max: number) => {
  if (typeof value !== "string" || !value.trim()) return null;
  const trimmed = value.trim().slice(0, max);
  return STRONG_CLAIM.test(trimmed) ? null : trimmed;
};

export function outcomeFromModel(draft: OutcomeModelDraft, evidence: OutcomeEvidence): OutcomeBuild {
  const attempts = evidence.attempts.filter((id) => typeof id === "string" && uuid.test(id)).slice(-20);
  if (!attempts.length) {
    return { ok: false, code: "no_attempt", copy: "这次没有观察到你自己写下的答案，本次未形成可保存成果。把导师的讲解存进笔记记下的是「读过」，不是完成练习。" };
  }
  const answerDraft = String(evidence.answerDraft || "").trim();
  if (!answerDraft) {
    return { ok: false, code: "empty_draft", copy: "这次没有取到你自己的答案原文，本次未形成可保存成果；正文仍保留，可以直接要求再答一次。" };
  }
  const claimed = draft.observedStatus;
  if (!text(draft.openIssue,600) && evidence.feedbackText &&
      /(?:^|\n)\s*(?:\*\*)?(?:需要(?:改|收紧|补)|要补|还(?:需|缺)|关键缺口|不足之处)/.test(evidence.feedbackText)) {
    return {ok:false,code:"inconsistent_feedback",copy:"本轮点评和完成状态不一致，暂不标记完成。你的原回答保留，可以请导师按原来的标准重新点评。"};
  }
  const required=evidence.requiredCriterionParts??[];
  const citations=Array.isArray(draft.criterionEvidence)?draft.criterionEvidence as Array<{part?:unknown;quote?:unknown}>:[];
  const covered=required.every(part=>citations.some(citation=>citation.part===part&&typeof citation.quote==="string"&&citation.quote.trim().length>=4&&answerDraft.includes(citation.quote.trim())&&
    (part!=="boundary"||/不|未|没有|如果|当|否则|只|但|缺/.test(citation.quote))));
  const hinted = (claimed === "提示下完成" || claimed === "独立完成过") && covered && !text(draft.openIssue,600);
  const notes = [
    claimed === "独立完成过" && hinted ? "模型给出的独立完成判断不采纳：这一轮是在导师提示之后作答，所以按「提示下完成」记。" : "",
    evidence.scenarioAudited ? "" : "这里只记本题作答，不代表其他题目或岗位能力已达标。",
    covered ? "" : "完成标准的依据还没有全部回查到你的原回答，暂不标记本题完成。",
  ].filter(Boolean);
  const validated = validateOutcome({
    sessionId: evidence.sessionId,
    goal: evidence.goal,
    criterionVersion: evidence.criterionVersion,
    attemptTurnIds: attempts,
    answerDraft,
    observedStatus: hinted ? "提示下完成" : "未独立检验",
    evidenceRefs: [...attempts.map((id) => `turn:${id}`), `criterion:v${evidence.criterionVersion}`],
    openIssue: text(draft.openIssue, 600),
    nextStep: text(draft.nextStep, 600),
    revision: 1,
    status: "draft",
  });
  if (!validated.ok) return { ok: false, code: "invalid", copy: `本次未形成可保存成果：${validated.error}` };
  return { ok: true, outcome: validated.outcome, note: notes.join("\n") || null };
}
