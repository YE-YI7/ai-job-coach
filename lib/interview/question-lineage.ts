/**
 * W4（FR-26 / FR-27）：出题承接与来源标注的显式合同 + 确定性检查器。
 *
 * 背景：面试链路里题目此前要么批量生成、要么单题派发，都没有携带结构——
 * 「这一题承接了上一答的什么」只存在于模型话术里，系统无法验证。
 * 本文件把两件事变成合同：
 *
 * FR-26 承接：每题必须显式声明它从候选人上一答里拿走了哪些原文片段（tookFrom），
 *   以及承接方式（linkage）。检查器是确定性的：tookFrom 必须能在上一答原文里
 *   逐字找到——找不到就是编造承接，按未承接计。会话级验收是二值断言：
 *   完全无承接的连续回合占比必须 < 10%。
 *
 * FR-27 来源：每题必须携带来源标注（简历事实 / 调研产出 / 知识库 / JD），
 *   且每题至少两个不同来源、禁止仅由 JD 成立；整轮来源并集只有 JD 直接判负。
 *
 * 纯函数、不依赖任何 server-only 模块，route / 生成器 / 回放测试都可直接调用。
 * 知识库纪律同样约束这里：单条外部面经不能升成结论，来源标注必须带可追溯指针。
 */

// ========== 来源标注（FR-27） ==========

export const QUESTION_SOURCE_KINDS = ["resume", "research", "knowledge", "jd"] as const;
export type QuestionSourceKind = (typeof QUESTION_SOURCE_KINDS)[number];

export const QUESTION_SOURCE_LABELS: Record<QuestionSourceKind, string> = {
  resume: "简历事实",
  research: "调研产出",
  knowledge: "知识库",
  jd: "岗位 JD",
};

/**
 * 每题至少需要的不同来源数。1 意味着「单源题」——FR-27 明确禁止
 * 一个会话仅由 JD（或任何单一来源）成立。
 */
export const MIN_DISTINCT_SOURCES_PER_QUESTION = 2;

export interface SourceAnnotation {
  source: QuestionSourceKind;
  /**
   * 可追溯指针：refId（如 [interview-jd] / [skill-1]）或材料原文片段。
   * 空指针等于没有来源，只有类型没有证据，检查器判负。
   */
  pointer: string;
}

export type QuestionMaterials = Partial<Record<QuestionSourceKind, Array<{ id: string; text: string }>>>;

/** A category label alone is not evidence: the pointer must be in selected materials. */
export function checkSourcePointers(sources: SourceAnnotation[], materials: QuestionMaterials): string[] {
  return sources.flatMap(source => {
    const pointer = normalizeForQuotation(source.pointer).replace(/^\[|\]$/g, "");
    const found = (materials[source.source] || []).some(item => pointer === item.id
      || (pointer.length >= 4 && normalizeForQuotation(item.text).includes(pointer)));
    return found ? [] : [`${source.source} 来源指针未出现在本次实际装载材料里：${source.pointer}`];
  });
}

export function interviewMaterials(context: import("@/lib/coach-harness/types").ContextBundle): QuestionMaterials {
  const attachments = (id: string) => context.attachments.filter(item => item.id === id).map(item => ({ id: item.id, text: item.text }));
  return {
    jd: attachments("interview-jd"), resume: attachments("resume-text"), research: attachments("company-research"),
    knowledge: context.knowledge.map(item => ({ id: item.id, text: [item.title, item.content, item.description, item.goal, item.scope].filter(Boolean).join("\n") })),
  };
}

export function isQuestionSourceKind(value: unknown): value is QuestionSourceKind {
  return typeof value === "string" && (QUESTION_SOURCE_KINDS as readonly string[]).includes(value);
}

/** 归一化文本用于逐字承接核验：只去空白，不改字符——承接必须是原文引用。 */
export function normalizeForQuotation(text: string): string {
  return text.replace(/\s+/g, "");
}

/**
 * 单题来源检查：返回违规原因列表（空数组 = 合规）。
 */
export function checkQuestionSourcing(sources: unknown): string[] {
  if (!Array.isArray(sources) || sources.length === 0) {
    return ["题目没有任何来源标注——FR-27 要求每题携带来源，无标注即单源不成立"];
  }
  const reasons: string[] = [];
  const kinds = new Set<QuestionSourceKind>();
  sources.forEach((annotation, index) => {
    if (!annotation || typeof annotation !== "object") {
      reasons.push(`sources[${index}] 不是对象`);
      return;
    }
    const item = annotation as { source?: unknown; pointer?: unknown };
    if (!isQuestionSourceKind(item.source)) {
      reasons.push(`sources[${index}] 的来源类型「${String(item.source)}」不在四源（简历/调研/知识库/JD）之内`);
      return;
    }
    if (typeof item.pointer !== "string" || item.pointer.trim().length === 0) {
      reasons.push(`sources[${index}]（${QUESTION_SOURCE_LABELS[item.source]}）缺少可追溯指针，视同无来源`);
      return;
    }
    kinds.add(item.source);
  });
  if (reasons.length > 0) return reasons;

  if (kinds.size < MIN_DISTINCT_SOURCES_PER_QUESTION) {
    reasons.push(`单源题：本题仅由 ${[...kinds].map((k) => QUESTION_SOURCE_LABELS[k]).join("、")} 成立，FR-27 要求每题至少 ${MIN_DISTINCT_SOURCES_PER_QUESTION} 个不同来源组合`);
  }
  if (kinds.size === 1 && kinds.has("jd")) {
    reasons.push("题目仅由 JD 成立——禁止围着 JD 出题");
  }
  return reasons;
}

export interface SessionSourcingReport {
  ok: boolean;
  questionCount: number;
  violations: Array<{ index: number; questionId?: string; reasons: string[] }>;
  sessionSourceUnion: QuestionSourceKind[];
}

/**
 * 会话级来源检查：逐题合规 + 整轮来源并集不得只剩 JD。
 * 「一个会话仅由 JD 成立」在这里结构性不可能通过。
 */
export function checkSessionSourcing(
  questions: Array<{ id?: string; sources?: unknown }>,
): SessionSourcingReport {
  const violations: SessionSourcingReport["violations"] = [];
  const union = new Set<QuestionSourceKind>();
  questions.forEach((question, index) => {
    const reasons = checkQuestionSourcing(question.sources);
    if (reasons.length > 0) {
      violations.push({ index, questionId: question.id, reasons });
    } else {
      for (const annotation of question.sources as SourceAnnotation[]) {
        union.add(annotation.source);
      }
    }
  });
  if (union.size === 1 && union.has("jd")) {
    violations.push({ index: -1, reasons: ["整轮题目全部只有 JD 一个来源——会话不能仅由 JD 成立"] });
  }
  return {
    ok: violations.length === 0,
    questionCount: questions.length,
    violations,
    sessionSourceUnion: [...union],
  };
}

// ========== 承接合同（FR-26） ==========

export const LINKAGE_KINDS = [
  "drill_missing_evidence",
  "follow_confirmed_claim",
  "contrast_with_material",
  "extend_to_next_layer",
] as const;
export type LinkageKind = (typeof LINKAGE_KINDS)[number];

export const LINKAGE_LABELS: Record<LinkageKind, string> = {
  drill_missing_evidence: "追问上一答缺失的证据",
  follow_confirmed_claim: "顺着上一答已说出的说法往深挖",
  contrast_with_material: "把上一答和简历/JD/知识对照出质疑点",
  extend_to_next_layer: "上一答已成立，进一层加压",
};

/**
 * 显式承接结构。session_opener 只允许出现在会话第一题（没有上一答可承接）；
 * 其余题必须是 linked，且 tookFrom 是上一答原文的逐字片段。
 */
export type QuestionLinkage =
  | { kind: "session_opener"; note: string }
  | {
      kind: "linked";
      previousQuestionId: string;
      /** 从上一答里逐字拿走的片段（≥1 条），必须能在上一答原文中找到。 */
      tookFrom: string[];
      linkage: LinkageKind;
      /** 一句话说明这一题怎么用上了这些片段——随题展示，不能只留类型。 */
      carriesForward: string;
    };

export type LinkageState = "linked" | "unlinked";

export interface PairLinkageResult {
  state: LinkageState;
  reasons: string[];
}

/**
 * 单对（上一答 → 本题）承接核验，确定性代码、不走模型：
 * tookFrom 有任何一条在上一答原文里找不到 → 编造承接，整对判未承接。
 * 「不能声称用户说了他没说的话」在这里落地。
 */
export function isPairLinked(linkage: unknown, previousAnswer: string): PairLinkageResult {
  const reasons: string[] = [];
  if (!linkage || typeof linkage !== "object" || !("kind" in linkage)) {
    return { state: "unlinked", reasons: ["题目没有携带承接结构"] };
  }
  const value = linkage as Record<string, unknown>;
  if (value.kind === "session_opener") {
    return { state: "unlinked", reasons: ["非首题不允许标记为 session_opener——没有承接上一答就是未承接"] };
  }
  if (value.kind !== "linked") {
    return { state: "unlinked", reasons: [`承接类型「${String(value.kind)}」不在合同之内`] };
  }
  if (typeof value.previousQuestionId !== "string" || !value.previousQuestionId.trim()) {
    reasons.push("linked 缺少 previousQuestionId");
  }
  if (typeof value.carriesForward !== "string" || !value.carriesForward.trim()) {
    reasons.push("linked 缺少 carriesForward 说明——分数要带依据，承接也要");
  }
  if (!isLinkageKind(value.linkage)) {
    reasons.push(`承接方式「${String(value.linkage)}」不在四种合同方式之内`);
  }
  const tookFrom = Array.isArray(value.tookFrom) ? value.tookFrom : [];
  if (tookFrom.length === 0) {
    reasons.push("tookFrom 为空——没有从上一答拿走任何东西，等于没承接");
  } else {
    const source = normalizeForQuotation(previousAnswer);
    tookFrom.forEach((fragment, index) => {
      if (typeof fragment !== "string" || !fragment.trim()) {
        reasons.push(`tookFrom[${index}] 为空片段`);
        return;
      }
      if (!source.includes(normalizeForQuotation(fragment))) {
        reasons.push(`tookFrom[${index}] 在上一答原文里找不到：${fragment.slice(0, 40)}——编造承接判未承接`);
      }
    });
  }
  return reasons.length === 0 ? { state: "linked", reasons: [] } : { state: "unlinked", reasons };
}

export function isLinkageKind(value: unknown): value is LinkageKind {
  return typeof value === "string" && (LINKAGE_KINDS as readonly string[]).includes(value);
}

/** 连续回合对：按题序传入，rounds[i].previousAnswer 是候选人对第 i-1 题的真实回答。 */
export interface ConsecutiveRoundPair {
  question: { id?: string; linkage?: unknown };
  /** 上一题的候选人真实回答；null/空 = 本题没有可承接的上一答（跳过未答），不计入分母。 */
  previousAnswer: string | null;
}

/** FR-26 验收阈值：完全无承接的连续回合占比必须 < 10%（严格小于）。 */
export const LINKAGE_MAX_UNLINKED_RATIO = 0.1;

export interface SessionLinkageReport {
  pairs: number;
  unlinkedPairs: number;
  skippedPairs: number;
  unlinkedRatio: number;
  /** 二值断言：占比 < 10% 才为 true。 */
  passes: boolean;
  failures: Array<{ index: number; questionId?: string; reasons: string[] }>;
}

/**
 * 会话级承接检查器：跨会话统计连续回合的承接率。
 * 分母只含存在真实上一答的回合对——没答过的题不能被谎称「已承接」。
 */
export function checkSessionLinkage(rounds: ConsecutiveRoundPair[]): SessionLinkageReport {
  const failures: SessionLinkageReport["failures"] = [];
  let pairs = 0;
  let skipped = 0;
  rounds.forEach((round, index) => {
    if (index === 0) return; // 首题无上一答，不构成连续对
    const prior = round.previousAnswer;
    if (prior === null || prior === undefined || prior.trim().length === 0) {
      // 上一题没答，就无所谓「承接了上一答」——如实排除出分母，不虚报承接率。
      skipped += 1;
      return;
    }
    pairs += 1;
    const result = isPairLinked(round.question.linkage, prior);
    if (result.state === "unlinked") {
      failures.push({ index, questionId: round.question.id, reasons: result.reasons });
    }
  });
  const unlinkedPairs = failures.length;
  const unlinkedRatio = pairs === 0 ? 0 : unlinkedPairs / pairs;
  return {
    pairs,
    unlinkedPairs,
    skippedPairs: skipped,
    unlinkedRatio,
    passes: unlinkedRatio < LINKAGE_MAX_UNLINKED_RATIO,
    failures,
  };
}

/** 承接 + 来源合一的题目形状（生成器与检查器共用）。 */
export interface LineagedQuestion {
  id: string;
  session_id: string;
  question_text: string;
  sources: SourceAnnotation[];
  linkage: QuestionLinkage;
}

export class QuestionLineageError extends Error {
  readonly violations: Array<{ index: number; questionId?: string; reasons: string[] }>;
  constructor(message: string, violations: Array<{ index: number; questionId?: string; reasons: string[] }>) {
    super(message);
    this.name = "QuestionLineageError";
    this.violations = violations;
  }
}
