/**
 * 引用回指核验器（W3 · PRD FR-23 / FR-22 / FR-24，槽3 落库前核验的候选实现）。
 *
 * PRD 最难的一条线：幻觉经历率 = 0。不是"低"，是零。所以本核验器的默认判据只有一种：
 * **逐字子串**。候选简历里的每个句子必须能被拆成「某个来源里的精确子串」+「白名单连接词」，
 * 拼不出来的就是幻觉，直接判负。拒绝是硬闸而不是可忽略的 warning 字段：
 * `verifyResumeGrounding` 在有任意一句被拒时把 `groundedText` 置 null，
 * `acceptGroundedRewrite` 直接抛 `GroundingNotAcceptedError`，且没有调用方 supplied 的
 * 用户确认标志（FR-24）就拿不到 `accepted: true`。
 *
 * 为什么子串之外还要动作词纪律（FR-23 的已知编造形状，全部编码成数据表）：
 * - 「上线」是「没有上线」的子串——逐字匹配会放它过去。所以动作词在来源里的出现若
 *   全部带 NEG/HEDGE/ROLE 限定、而候选句同位置没有同类限定 → 判负
 *   （negation_or_hedge_dropped；跨类替换如 计划→没有 同样判负）。
 * - 「数字没造假不等于经历真实」：30 名用户是真的、访谈是真的，但「计划访谈」写成
 *   「访谈了 30 名用户」仍是编造——限定词按类别核对。
 * - 「周活约10，已上线腾」「腾活」类截断（项目实测翻车）：断词/悬挂尾标点先判
 *   broken_tail；换字（周活→腾活）凑不出逐字证据，被覆盖扫描判 no_exact_substring。
 *
 * 中文匹配纪律（FR-2 的教训：宽松分词会把材料里没写的东西判过）：
 * 子串/逐字是默认；一切更松的通道只有三张显式、有测试覆盖的小表——
 * GAP_ALLOWLIST（连接词级缺口）、ALLOWED_ACTION_PATTERNS（只允许弱化方向的蕴含改写）、
 * FABRICATION_RULES（已知编造形状的正向要求）。表外一律拒。
 */

/** 核验器版本：改动下面任何判定表都必须升版；护栏阈值指纹的 guard 段应把本对象取进去。 */
export const CITATION_VERIFIER_VERSION = "citation-verifier-v1";

export type GroundingSource = { id: string; text: string };

export interface VerifyResumeGroundingInput {
  /** 候选简历文本（改写后/新增的 bullet 拼成的纯文本）。 */
  candidateText: string;
  /** 可回指的来源：已确认 claim 的展示文本、来源摘录、简历原文。 */
  sources: GroundingSource[];
  /** 单段缺口允许的最大连接词字数（防御性上限），默认 4。 */
  maxGapLength?: number;
}

export type RejectReason =
  | "broken_tail"
  | "action_not_supported"
  | "negation_or_hedge_dropped"
  | "no_exact_substring"
  | "unknown_source_citation";

export interface EvidenceSpan {
  sourceId: string;
  /** 来源里的精确子串（entailment 时记候选词，依据词见 sourceEvidence）。 */
  evidence: string;
  kind: "substring" | "entailment";
  /** ALLOWED_ACTION_PATTERNS 命中时记录来源里的更强依据词。 */
  sourceEvidence?: string;
  /** 在 candidateText 中的偏移。 */
  statementStart: number;
  statementEnd: number;
  /** 命中来源文本中的位置。 */
  sourceStart: number;
}

export interface StatementLocation {
  start: number;
  end: number;
}

export type StatementVerdict =
  | ({ status: "grounded"; statement: string } & StatementLocation & { evidences: EvidenceSpan[] })
  | ({
      status: "rejected";
      statement: string;
      /** 判负原因类别。 */
      reason: RejectReason;
      /** 命中的数据表条目 id（规则/蕴含/覆盖），便于审计与回放。 */
      ruleId: string;
      /** 违规片段在 candidateText 中的位置与原文。 */
      offendingSpan: StatementLocation & { text: string };
      detail: string;
      /** 已能回指上的部分——只用于解释拒绝，不构成放行依据。 */
      partialEvidences: EvidenceSpan[];
    } & StatementLocation);

export interface GroundingReport {
  version: typeof CITATION_VERIFIER_VERSION;
  /** true = 每一句都回指成功。false 时 groundedText 必为 null。 */
  ok: boolean;
  /** 核验器永远不自行放行：本字段类型上就是字面量 false（FR-24）。 */
  accepted: false;
  verdicts: StatementVerdict[];
  /** 全部句 grounded 时等于规范化候选文本；有任何拒绝即 null。 */
  groundedText: string | null;
  stats: { statements: number; grounded: number; rejected: number; durationMs: number };
}

/** FR-24：改写落地前必须有用户点头。类型上就拒收 `{ userConfirmed: false }`。 */
export interface RewriteConfirmation {
  readonly userConfirmed: true;
  /** 用户确认过的文本；必须与 report.groundedText 完全一致（防确认 A 落地 B）。 */
  readonly confirmedText: string;
  readonly note?: string;
}

export interface AcceptedRewrite {
  accepted: true;
  text: string;
  version: typeof CITATION_VERIFIER_VERSION;
  confirmationNote?: string;
}

export class GroundingNotAcceptedError extends Error {
  readonly rejectedVerdicts: StatementVerdict[];
  constructor(message: string, rejected: StatementVerdict[]) {
    super(message);
    this.name = "GroundingNotAcceptedError";
    this.rejectedVerdicts = rejected;
  }
}

/**
 * 硬闸（FR-22/23/24）：任何一句被拒 → 抛错，文本不可落地；
 * 全部通过但缺少 caller-supplied 用户确认、或确认文本与核验文本不一致 → 同样抛错。
 * 想拿到 accepted:true，两条都绕不开。
 */
export function acceptGroundedRewrite(
  report: GroundingReport,
  confirmation: RewriteConfirmation,
): AcceptedRewrite {
  const rejected = report.verdicts.filter((v) => v.status === "rejected");
  if (rejected.length || !report.ok || report.groundedText === null) {
    throw new GroundingNotAcceptedError(
      `简历改写未通过引用回指核验：${rejected.length} 句无法回指到来源，拒绝落库`,
      rejected,
    );
  }
  if (confirmation.userConfirmed !== true) {
    throw new GroundingNotAcceptedError("缺少用户确认（FR-24）：改写未经用户点头不得落地", []);
  }
  if (confirmation.confirmedText !== report.groundedText) {
    throw new GroundingNotAcceptedError("用户确认的文本与核验通过的文本不一致", []);
  }
  return {
    accepted: true,
    text: report.groundedText,
    version: report.version,
    confirmationNote: confirmation.note,
  };
}

// ---------------------------------------------------------------------------
// 判定数据表（可评审、可版本化；联合指纹取 CITATION_VERIFIER_GUARD_INPUT）
// ---------------------------------------------------------------------------

/** 连接词级缺口白名单：只有这些单字可以不来自子串证据。扩充必须带正反例测试。 */
export const GAP_ALLOWLIST: readonly string[] = [
  "的", "地", "得", "了", "和", "与", "及", "在", "中", "等", "并", "而", "更", "把", "让", "过",
];

/** 结构标点/空白：不计入缺口长度，也不进来源规范化索引。 */
const PUNCTUATION = new Set(
  Array.from("，,、；;：:。“”\"‘’'（）()【】[]《》<>·—…-*#•·\t\r\n "),
);

/**
 * 只允许「弱化方向」的蕴含改写。边界规则：
 * 1. 候选词必须是来源依据词的严格语义子集（主导某事 ⇒ 参与/负责过该事）；
 * 2. 永不收录新增「已发生/已达成」语义的改写（参与→主导、访谈→归纳需求、原型→可点击
 *    都不在表内——它们走 FABRICATION_RULES 直接判负）；
 * 3. 覆盖扫描的缺口里同一位置只允许命中一个表内词；
 * 4. 依据词必须在来源里逐字存在。
 */
export interface AllowedActionPattern {
  id: string;
  candidateTerm: string;
  entailedBySourceTerm: string;
  note: string;
}

export const ALLOWED_ACTION_PATTERNS: readonly AllowedActionPattern[] = [
  { id: "lead-entails-participate", candidateTerm: "参与", entailedBySourceTerm: "主导", note: "主导过 ⇒ 参与过（弱化）" },
  { id: "lead-entails-own", candidateTerm: "负责", entailedBySourceTerm: "主导", note: "主导过 ⇒ 负责过（弱化）" },
  { id: "own-entails-helped", candidateTerm: "协助", entailedBySourceTerm: "负责", note: "负责过 ⇒ 协助过（弱化）" },
] as const;

/**
 * 已知编造形状（逐条来自 RESUME_GROUNDING_PROMPT 的禁令）：
 * 候选命中 when → 至少一个（被引用的）来源必须逐字含 requiresSomeSourceTerm 之一，否则判负。
 */
export interface FabricationRule {
  id: string;
  when: RegExp;
  requiresSomeSourceTerm: readonly string[];
  reason?: RejectReason;
  note: string;
}

export const FABRICATION_RULES: readonly FabricationRule[] = [
  {
    id: "interview-not-synthesis",
    when: /(归纳|提炼|总结)[^。！？；\n]{0,6}需求|需求[^。！？；\n]{0,4}(归纳|提炼|梳理)/,
    requiresSomeSourceTerm: ["归纳", "提炼", "梳理"],
    note: "访谈过用户 ≠ 归纳/提炼过需求",
  },
  {
    id: "prototype-not-clickable",
    when: /可点击|可交互|高保真/,
    requiresSomeSourceTerm: ["可点击", "可交互", "高保真"],
    note: "做了原型 ≠ 可点击/可交互/高保真",
  },
  {
    id: "prototype-not-shipped",
    when: /上线|发布|开放注册|灰度/,
    requiresSomeSourceTerm: ["上线", "发布", "开放注册", "灰度"],
    note: "本机跑通的原型 ≠ 已上线（限定词丢失另有 negation_or_hedge_dropped 兜底）",
  },
  {
    id: "participate-not-lead",
    when: /主导|牵头|带领|独立负责|操盘/,
    requiresSomeSourceTerm: ["主导", "牵头", "带领", "独立负责", "操盘"],
    note: "参与 ≠ 主导/牵头/带领",
  },
  {
    id: "no-feedback-fabricated",
    when: /(没有|未|无)[^。！？；\n]{0,6}反馈/,
    requiresSomeSourceTerm: ["没有反馈", "没有收到反馈", "还没有收到反馈", "未收到反馈", "无反馈", "没有用户反馈"],
    reason: "negation_or_hedge_dropped",
    note: "材料里没提反馈 ≠ 没有收到反馈",
  },
  {
    id: "no-testing-fabricated",
    when: /(没有|未|无)[^。！？；\n]{0,8}(测试|验证|调研|访谈)/,
    requiresSomeSourceTerm: ["没有测试", "没有做过测试", "未测试", "没有验证", "未验证", "没有调研", "没有访谈", "未访谈"],
    reason: "negation_or_hedge_dropped",
    note: "未上线 ≠ 没有做用户测试",
  },
  {
    id: "outcome-verb-not-sourced",
    when: /迭代|评测|演示|提升|增长|推广|收集|落地|推动/,
    requiresSomeSourceTerm: ["迭代", "评测", "演示", "提升", "增长", "推广", "收集", "落地", "推动"],
    note: "常见流程动作不能因为「通常会做」而补写",
  },
] as const;

/**
 * 限定词类别：动作词在来源里的全部出现都带某类限定时，候选句同位置必须有同类限定；
 * 跨类替换（计划做测试 → 没有做测试）同样判负。
 */
export const QUALIFIER_TOKENS: Record<"NEG" | "HEDGE" | "ROLE", readonly string[]> = {
  NEG: ["没有", "没", "未", "无", "尚未", "不曾"],
  HEDGE: ["计划", "准备", "拟", "预计", "即将", "待", "考虑"],
  ROLE: ["参与", "协助", "配合", "观摩", "跟随"],
} as const;

/** 受限定词纪律管辖的动作词表（扩充须带正反例测试）。 */
export const ACTION_VOCAB: readonly string[] = [
  "上线", "发布", "交付", "灰度", "访谈", "调研", "测试", "验证", "反馈", "评测", "演示",
  "迭代", "优化", "提升", "完成", "负责", "搭建", "开发", "设计", "收集", "梳理", "归纳",
  "提炼", "推动", "落地", "推广", "增长",
] as const;

/** 护栏阈值指纹 guard 段应哈希本对象（route owner 接线，见交付报告）。 */
export const CITATION_VERIFIER_GUARD_INPUT = {
  version: CITATION_VERIFIER_VERSION,
  fabricationRuleIds: FABRICATION_RULES.map((rule) => rule.id),
  allowedActionPatternIds: ALLOWED_ACTION_PATTERNS.map((pattern) => pattern.id),
  gapAllowlist: [...GAP_ALLOWLIST],
  actionVocab: [...ACTION_VOCAB],
  qualifierTokens: { NEG: [...QUALIFIER_TOKENS.NEG], HEDGE: [...QUALIFIER_TOKENS.HEDGE], ROLE: [...QUALIFIER_TOKENS.ROLE] },
} as const;

// ---------------------------------------------------------------------------
// 切分与索引
// ---------------------------------------------------------------------------

const STATEMENT_END = /[。！？!?；;\n]/;
const CLAUSE_SPLIT = /[，,、；;：:\s]+/;

interface RawStatement extends StatementLocation {
  text: string;
}

function splitStatements(text: string): RawStatement[] {
  const out: RawStatement[] = [];
  let start = 0;
  for (let i = 0; i <= text.length; i++) {
    if (i === text.length || STATEMENT_END.test(text[i])) {
      const raw = text.slice(start, i);
      const body = raw.trim().replace(/^(?:[-*•·]|\d+[.、])\s*/, "");
      if (body) {
        const idx = text.indexOf(body, start);
        const at = idx < 0 ? start : idx;
        out.push({ text: body, start: at, end: at + body.length });
      }
      start = i + 1;
    }
  }
  return out;
}

function splitClauses(text: string): Array<{ text: string; start: number }> {
  const out: Array<{ text: string; start: number }> = [];
  let start = 0;
  for (let i = 0; i <= text.length; i++) {
    if (i === text.length || CLAUSE_SPLIT.test(text[i])) {
      const body = text.slice(start, i).trim();
      if (body) {
        const idx = text.indexOf(body, start);
        out.push({ text: body, start: idx < 0 ? start : idx });
      }
      start = i + 1;
    }
  }
  return out;
}

interface IndexedSource {
  id: string;
  text: string;
  /** 去标点规范化文本（逐字子串判定的比对面）。 */
  normalized: string;
  /** normalized[i] 对应 text 中的下标。 */
  map: number[];
}

function indexSource(source: GroundingSource): IndexedSource {
  const chars: string[] = [];
  const map: number[] = [];
  for (let i = 0; i < source.text.length; i++) {
    const ch = source.text[i];
    if (PUNCTUATION.has(ch)) continue;
    chars.push(ch);
    map.push(i);
  }
  return { id: source.id, text: source.text, normalized: chars.join(""), map };
}

/** 片段是否值得尝试匹配（候选分句里残留的标点让子串永远匹配不上，先滤掉）。 */
function stripPunctuation(text: string): string {
  let out = "";
  for (const ch of text) if (!PUNCTUATION.has(ch)) out += ch;
  return out;
}

function findInSources(
  needle: string,
  pool: IndexedSource[],
): { source: IndexedSource; sourceStart: number; sourceEnd: number; evidence: string } | null {
  if (needle.length < 2) return null;
  for (const source of pool) {
    const at = source.normalized.indexOf(needle);
    if (at >= 0) {
      const start = source.map[at];
      const end = source.map[at + needle.length - 1] + 1;
      return { source, sourceStart: start, sourceEnd: end, evidence: source.text.slice(start, end) };
    }
  }
  return null;
}

/** 从 text[pos] 起最长的来源子串（谓词对长度单调：前缀可命中则更短前缀必可命中）。 */
function longestEvidence(
  text: string,
  pos: number,
  pool: IndexedSource[],
): { hit: NonNullable<ReturnType<typeof findInSources>>; length: number } | null {
  const maxLen = Math.min(text.length - pos, 48);
  if (maxLen < 2) return null;
  const first = findInSources(stripPunctuation(text.slice(pos, pos + 2)), pool);
  if (!first) return null;
  let lo = 2;
  let hi = maxLen;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (findInSources(stripPunctuation(text.slice(pos, pos + mid)), pool)) lo = mid;
    else hi = mid - 1;
  }
  for (let len = lo; len >= 2; len--) {
    const needle = stripPunctuation(text.slice(pos, pos + len));
    if (needle.length < 2) continue;
    const hit = findInSources(needle, pool);
    if (hit) return { hit, length: len };
  }
  return { hit: first, length: 2 };
}

const DANGLING_TAIL = /[，、；：,;:（(\[【「『“—–-]$/;

function brokenTailReason(statement: string): string | null {
  if (DANGLING_TAIL.test(statement)) return "结尾是悬挂标点，疑似半句截断（「已上线，」类实测翻车形状）";
  const opens = (statement.match(/[（(\[【「『]/g) || []).length;
  const closes = (statement.match(/[）)\]】」』]/g) || []).length;
  if (opens > closes) return "括号未闭合";
  if ((statement.match(/[「『“]/g) || []).length > (statement.match(/[」』”]/g) || []).length) return "引号未闭合";
  return null;
}

// ---------------------------------------------------------------------------
// 限定词纪律
// ---------------------------------------------------------------------------

/** 动词出现位置之前（同一片文本内、回溯 LOOKBACK 字）的限定类别集合。 */
const LOOKBACK = 10;

function qualifierClassesBefore(clause: string, verbIndex: number): Set<"NEG" | "HEDGE" | "ROLE"> {
  const window = clause.slice(Math.max(0, verbIndex - LOOKBACK), verbIndex);
  const classes = new Set<"NEG" | "HEDGE" | "ROLE">();
  (Object.keys(QUALIFIER_TOKENS) as Array<"NEG" | "HEDGE" | "ROLE">).forEach((cls) => {
    if (QUALIFIER_TOKENS[cls].some((token) => window.includes(token))) classes.add(cls);
  });
  return classes;
}

interface QualifierFinding {
  ruleId: string;
  verb: string;
  at: number;
  detail: string;
}

function checkQualifiers(statement: string, pool: IndexedSource[]): QualifierFinding | null {
  for (const clause of splitClauses(statement)) {
    for (const verb of ACTION_VOCAB) {
      let at = clause.text.indexOf(verb);
      while (at >= 0) {
        const candidateClasses = qualifierClassesBefore(clause.text, at);
        // 来源侧：按分句切开（规范化文本没标点，用动作词邻域窗口近似分句范围已足够严格）。
        const occurrences: Array<Set<"NEG" | "HEDGE" | "ROLE"> | null> = [];
        for (const source of pool) {
          let sAt = source.normalized.indexOf(verb);
          while (sAt >= 0) {
            const classes = qualifierClassesBefore(source.normalized, sAt);
            occurrences.push(classes.size ? classes : null);
            sAt = source.normalized.indexOf(verb, sAt + verb.length);
          }
        }
        const qualified = occurrences.filter((c): c is Set<"NEG" | "HEDGE" | "ROLE"> => c !== null && c.size > 0);
        if (occurrences.length > 0 && qualified.length === occurrences.length) {
          for (const cls of new Set(qualified.flatMap((c) => [...c]))) {
            if (!candidateClasses.has(cls)) {
              return {
                ruleId: `qualifier-${cls}-dropped`,
                verb,
                at: clause.start + at,
                detail:
                  cls === "ROLE"
                    ? `来源里「${verb}」的全部出现都带职责限定（参与/协助类），候选句写成了无限定动作（参与≠主导）`
                    : `来源里「${verb}」的全部出现都被${cls === "NEG" ? "否定" : "计划/待做"}限定，候选句丢掉了同类限定词（数字没造假不等于经历真实）`,
              };
            }
          }
        }
        at = clause.text.indexOf(verb, at + verb.length);
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// 单句核验
// ---------------------------------------------------------------------------

const CITATION_RE = /\[([a-zA-Z0-9_:-]+)\]/;

function verifyStatement(raw: RawStatement, allSources: IndexedSource[], maxGapLength: number): StatementVerdict {
  const base = { statement: raw.text, start: raw.start, end: raw.end };

  // 0. 显式引用标记 [sourceId]：引用不存在的来源直接拒；存在则只许回指到该来源。
  let pool = allSources;
  let statement = raw.text;
  const citation = CITATION_RE.exec(raw.text);
  if (citation) {
    const cited = allSources.find((s) => s.id === citation[1]);
    if (!cited) {
      return makeRejected("unknown_source_citation", "citation-unknown", {
        ...base,
        offending: { start: raw.start + citation.index, end: raw.start + citation.index + citation[0].length },
        detail: `引用的来源 ${citation[1]} 不存在`,
      });
    }
    pool = [cited];
    statement = statement.replace(CITATION_RE, "");
  }

  // 1. 文字完整性：悬挂尾/未闭合括号（残缺文本不许进入回指）。
  const broken = brokenTailReason(statement);
  if (broken) {
    return makeRejected("broken_tail", "broken-tail", {
      ...base,
      statement,
      offending: { start: raw.start, end: raw.end },
      detail: broken,
    });
  }

  // 2. 已知编造形状：命中即要求来源里有对应逐字事实。
  for (const rule of FABRICATION_RULES) {
    const hit = rule.when.exec(statement);
    if (!hit) continue;
    const satisfied = pool.some((s) => rule.requiresSomeSourceTerm.some((term) => s.normalized.includes(term)));
    if (!satisfied) {
      return makeRejected(rule.reason ?? "action_not_supported", rule.id, {
        ...base,
        statement,
        offending: { start: raw.start + hit.index, end: raw.start + hit.index + hit[0].length },
        detail: `${rule.note}；来源里没有可回指的逐字依据`,
      });
    }
  }

  // 3. 限定词纪律：这是「上线 ⊂ 没有上线」逐字匹配放行不了的形状的唯一防线。
  const qualifier = checkQualifiers(statement, pool);
  if (qualifier) {
    return makeRejected("negation_or_hedge_dropped", qualifier.ruleId, {
      ...base,
      statement,
      offending: { start: raw.start + qualifier.at, end: raw.start + qualifier.at + qualifier.verb.length },
      detail: qualifier.detail,
    });
  }

  // 4. 逐字覆盖：每个分句必须拆成「≥2 字来源子串」+「白名单连接词/蕴含词」。
  return coverStatement(statement, pool, maxGapLength, base);
}

interface CoverFailure {
  reason: RejectReason;
  ruleId: string;
  at: number;
  length: number;
  detail: string;
}

function coverStatement(
  statement: string,
  pool: IndexedSource[],
  maxGapLength: number,
  base: StatementLocation & { statement: string },
): StatementVerdict {
  const evidences: EvidenceSpan[] = [];
  let failure: CoverFailure | null = null;
  for (const clause of splitClauses(statement)) {
    const clauseAt = base.start + clause.start;
    let pos = 0;
    while (pos < clause.text.length) {
      const match = longestEvidence(clause.text, pos, pool);
      if (match) {
        evidences.push({
          sourceId: match.hit.source.id,
          evidence: match.hit.evidence,
          kind: "substring",
          statementStart: clauseAt + pos,
          statementEnd: clauseAt + pos + match.length,
          sourceStart: match.hit.sourceStart,
        });
        pos += match.length;
        continue;
      }
      // 无 ≥2 字子串证据：只允许白名单连接词/标点，或恰好一个 ALLOWED_ACTION_PATTERNS 词。
      let j = pos;
      let allowCount = 0;
      let consumedEntailment = false;
      while (j < clause.text.length) {
        const ch = clause.text[j];
        if (!consumedEntailment) {
          const pattern = ALLOWED_ACTION_PATTERNS.find(
            (p) => ch === p.candidateTerm[0] && clause.text.startsWith(p.candidateTerm, j),
          );
          if (pattern) {
            const basis = pool
              .map((s) => ({ s, at: s.normalized.indexOf(pattern.entailedBySourceTerm) }))
              .find((row) => row.at >= 0);
            if (basis) {
              evidences.push({
                sourceId: basis.s.id,
                evidence: pattern.candidateTerm,
                kind: "entailment",
                sourceEvidence: pattern.entailedBySourceTerm,
                statementStart: clauseAt + j,
                statementEnd: clauseAt + j + pattern.candidateTerm.length,
                sourceStart: basis.s.map[basis.at],
              });
              j += pattern.candidateTerm.length;
              consumedEntailment = true;
              continue;
            }
          }
        }
        if (PUNCTUATION.has(ch)) {
          j++;
          continue;
        }
        if (GAP_ALLOWLIST.includes(ch)) {
          allowCount++;
          if (allowCount > maxGapLength) break;
          j++;
          continue;
        }
        break;
      }
      const stuckRun = unmatchableRun(clause.text, j, pool);
      if (j === pos || allowCount > maxGapLength || (j >= clause.text.length && stuckRun.length > 0)) {
        const badFrom = j;
        const badLen = Math.max(stuckRun.length, 1);
        failure = {
          reason: "no_exact_substring",
          ruleId: "cover-gap",
          at: clauseAt + badFrom,
          length: badLen,
          detail:
            badFrom >= clause.text.length
              ? `结尾「${clause.text.slice(clause.text.length - badLen)}」断在词中间：凑不出任何来源子串证据（「已上线腾/腾活」类截断）`
              : `片段「${clause.text.slice(badFrom, badFrom + Math.min(badLen, 12))}」在任何来源里都没有逐字依据，且不是白名单连接词`,
        };
        break;
      }
      pos = j;
    }
    if (failure) break;
  }
  if (failure) {
    return makeRejected(failure.reason, failure.ruleId, {
      ...base,
      offending: { start: failure.at, end: failure.at + failure.length },
      detail: failure.detail,
      partialEvidences: evidences,
    });
  }
  if (!evidences.length) {
    return makeRejected("no_exact_substring", "cover-empty", {
      ...base,
      offending: { start: base.start, end: base.end },
      detail: "整句找不到任何来源子串证据",
    });
  }
  return { status: "grounded", ...base, evidences };
}

/** 从 pos 起向后找到第一段「无法被任何 ≥2 字子串覆盖」的连续非白名单文本。 */
function unmatchableRun(text: string, pos: number, pool: IndexedSource[]): string {
  let out = "";
  for (let i = pos; i < text.length; i++) {
    const ch = text[i];
    if (PUNCTUATION.has(ch) || GAP_ALLOWLIST.includes(ch)) break;
    out += ch;
    if (findInSources(stripPunctuation(text.slice(pos, i + 3)), pool)) break;
  }
  return out;
}

function makeRejected(
  reason: RejectReason,
  ruleId: string,
  input: {
    statement: string;
    start: number;
    end: number;
    offending: StatementLocation;
    detail: string;
    partialEvidences?: EvidenceSpan[];
  },
): StatementVerdict {
  return {
    status: "rejected",
    statement: input.statement,
    start: input.start,
    end: input.end,
    reason,
    ruleId,
    offendingSpan: {
      start: input.offending.start,
      end: input.offending.end,
      text: candidateRef.slice(input.offending.start, input.offending.end),
    },
    detail: input.detail,
    partialEvidences: input.partialEvidences ?? [],
  };
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------

let candidateRef = "";

export function verifyResumeGrounding(input: VerifyResumeGroundingInput): GroundingReport {
  const startedAt = Date.now();
  const candidateText = typeof input.candidateText === "string" ? input.candidateText : "";
  const sources = Array.isArray(input.sources)
    ? input.sources.filter((s) => s && typeof s.id === "string" && typeof s.text === "string")
    : [];
  candidateRef = candidateText;
  const indexed = sources.map(indexSource);
  const maxGapLength = typeof input.maxGapLength === "number" && input.maxGapLength > 0 ? input.maxGapLength : 4;
  const verdicts = splitStatements(candidateText).map((raw) => verifyStatement(raw, indexed, maxGapLength));
  const grounded = verdicts.filter((v) => v.status === "grounded").length;
  const rejected = verdicts.length - grounded;
  const ok = verdicts.length > 0 && rejected === 0;
  return {
    version: CITATION_VERIFIER_VERSION,
    ok,
    accepted: false,
    verdicts,
    groundedText: ok ? normalizeCandidateText(candidateText) : null,
    stats: { statements: verdicts.length, grounded, rejected, durationMs: Date.now() - startedAt },
  };
}

/** acceptGroundedRewrite 比对用的规范形：去空行、统一列表符号。 */
export function normalizeCandidateText(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/^\s*[-*•·]\s*/, "- ").trim())
    .filter(Boolean)
    .join("\n");
}
