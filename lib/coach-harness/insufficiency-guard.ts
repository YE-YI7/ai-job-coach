/**
 * 信息不足分级守卫（insufficiency guard）。
 *
 * 背景：LEARNING_SYSTEM 已要求模型在“用户信息不够完整”时分两级处理——
 * blocking（缺了这一步根本推不动）只问一个关键问题；non-blocking（缺了也能答）
 * 正常回答、适度展开并注明可补充点。但 prompt 约束不是硬保证，这里做
 * 确定性的后置兜底：
 * 1. 模型标了 blocking 却仍输出超长“伪完整”回答 → 收敛为一句澄清问句
 *    （最多保留 1 个 followup），并置 needsMoreInput/blocked，前端可提示补充；
 * 2. 模型标了 partial → 放行正文，把“补充X会更准”的提示保留为正文末句；
 * 3. 无论哪一级，对“你已掌握/已确认/已完成”这类无本轮用户原话依据的断言
 *    就地加“（待你确认）”，与 grounding/consistency 的约束同源，防止把
 *    用户没确认的东西写成已确认经历。
 * 4. 模型标了 blocking，但它卡住的那件事上下文里已经有原文 → 不拦（GS-004 那类
 *    「已提供信息被重复追问」误挡的确定性兜底，不依赖模型自觉）。两种形态分开处理：
 *    要用户重交 JD/简历文档的 → 丢掉那句；问「原文里已经写明的技能/事实」的 → 正文
 *    照常输出，那句追问保留成收尾补充。
 *
 * 契约：模型按 prompt 输出 <clarify level="blocking">问题</clarify> 或
 * <clarify level="partial">补充X会更准</clarify>；标签由本守卫解析并从正文剥离，
 * 用户看不到原始标签。纯函数、不触网、不抛异常（异常时原样放行）。
 *
 * 四槽归位（W1）：本文件公开 API 与行为一字未动。统一的 GuardDecision 外壳在
 * guard-slots/verification.guards.ts（落库前核验 · 钉在槽3），逐句流式复用同一
 * 映射（guard-slots/stream.guards.ts · 钉在槽2）。散装布尔仍从这里原样返回，
 * 由裁决的 data.legacy 携带，接线前消费方不需要改一个字。
 */

export type InsufficiencyLevel = "blocking" | "partial";

/** 上下文里已经带着原文的材料类型。 */
export type ProvidedKind = "jd" | "resume";

/** 一份已在上下文里的原文：kind 决定「别再让用户重交」的句式，text 决定「问的事是否已写明」。 */
export interface ProvidedMaterial {
  kind: ProvidedKind;
  text: string;
}

export interface GuardInput {
  /** parseTutorReply 之后的正文（已去掉 <followups> 块）。 */
  answer: string;
  /** parseTutorReply 之后的追问建议按钮。 */
  suggestions?: string[];
  /** 用户本轮及近期原话，用于判断“已确认/已掌握”类断言有没有依据。 */
  userText?: string;
  /** 本轮上下文里已经带了哪些原文材料；空或省略 = 守卫按“确实缺材料”处理。 */
  providedMaterials?: ProvidedMaterial[];}

export interface GuardResult {
  answer: string;
  suggestions: string[];
  /** 模型本轮声明的信息缺口级别；null 表示没有 blocking 级别的缺口信号。 */
  level: InsufficiencyLevel | null;
  /** true = 这一步确实推不动，等待用户补充关键信息。 */
  needsMoreInput: boolean;
  /** 与 needsMoreInput 同步的显式拦截标记，便于前端直接消费。 */
  blocked: boolean;
  /** true = 模型在 blocking 轮仍输出超长回答，被守卫收敛过。 */
  collapsed: boolean;
  /** 模型声明 blocking 但索要的内容上下文里已有 → 守卫拒绝拦截并放行正文；值是被降级的那一类。 */
  downgradedRedundantAsk: ReaskReason;
  /** 被就地加“（待你确认）”的无依据断言条数。 */
  claimsHedged: number;
  /** 守卫介入前后的对比，便于测试与审计。 */
  before: { answer: string; suggestions: string[] };
}

/** blocking 轮允许的“必要说明”正文上限（字符），超过即视为硬编长答。 */
export const BLOCKING_BODY_LIMIT = 120;
export const BLOCKING_BODY_SENTENCES = 2;

/** blocking 标记里没带问题时使用的兜底澄清句（不虚构任何用户事实）。 */
export const DEFAULT_CLARIFY_QUESTION =
  "要往下推进这一步，我还缺一个关键信息：方便用一句话说清楚与这一步最直接相关的情况或条件吗？";

const HEDGED_MARK = "（待你确认）";

/**
 * AI 单方面断言“用户已确认/已掌握/已完成”的模式。每条配一个“用户自己说过”
 * 的佐证模式；userText 里找不到佐证且句子本身没有疑问/假设/否定语气时，
 * 在断言后就地追加 HEDGED_MARK。
 */
const ASSERTION_RULES: Array<{ assertion: RegExp; corroboration: RegExp }> = [
  {
    assertion: /(?:你|您)(?:已经|早已|现已|业已|已)(?:基本|大致|完全|彻底|差不多)?(?:地)?(?:掌握|学会|会了|理解|记住|具备)/g,
    corroboration: /我[^。！？\n没未]{0,14}(?:掌握|学会|会了|理解|记住|具备)/,
  },
  {
    assertion: /(?:你|您)(?:已经|已)(?:确认|确定|认可)(?:过|了)?/g,
    corroboration: /我[^。！？\n没未]{0,14}(?:确认|确定|认可)/,
  },
  {
    assertion: /(?:你|您)(?:已经|已)(?:完成|做完|写好|改好|保存|投递|上传)(?:了)?/g,
    corroboration: /我[^。！？\n没未]{0,14}(?:完成|做完|写好|改好|保存|投递|上传|写完)/,
  },
  {
    assertion: /(?:经历|事实|信息|数字|版本)(?:已经|已)(?:确认|核实|核对)(?:过|了)?/g,
    corroboration: /我[^。！？\n没未]{0,14}(?:确认|核实|核对)/,
  },
];

/** 句子已带疑问/假设/否定/待确认语气时不追加标注，避免过度改写。 */
const SOFTENED = /[？?]|未|没|待确认|是否|如果|假如|应该|可能|似乎|大概/;

function sentences(text: string): string[] {
  return text.split(/(?<=[。！？!?；;\n])/).map((s) => s.trim()).filter(Boolean);
}

/** 按行去尾随空白、合并多余空格；保留单个空行（表格/列表/段落需要空行分块），仅把 3+ 连续换行收成 1 个空行。 */
function clean(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/[ \t]{2,}/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 取真正的问句：优先第一个含问号的句子，其次第一句；并做长度兜底。 */
function pickQuestion(text: string): string {
  const s = clean(text);
  if (!s) return "";
  const list = sentences(s);
  const clipped = (value: string): string => {
    const chars = [...value];
    for (let i = 0; i < chars.length; i++) {
      if (chars[i] === "？" || chars[i] === "?") return chars.slice(0, i + 1).join("").trim();
    }
    return value;
  };
  const candidate = list.find((sentence) => /[？?]/.test(sentence)) ?? list[0] ?? s;
  const picked = clipped(candidate);
  return picked.length > 160 ? picked.slice(0, 160).trim() : picked;
}

interface ClarifyExtraction {
  level: InsufficiencyLevel | null;
  /** 标签内的问句/提示语。 */
  question: string;
  /** 去掉全部标签后的正文。 */
  rest: string;
}

/** 解析 <clarify level="blocking|partial">…</clarify>；容忍漏写闭合标签。 */
function extractClarify(text: string): ClarifyExtraction {
  const closedRe = /<clarify\b[^>]*?level=["']?(blocking|partial)["']?[^>]*>([\s\S]*?)<\/clarify>/gi;
  const closed = [...text.matchAll(closedRe)];
  let level: InsufficiencyLevel | null = null;
  let question = "";
  if (closed.length) {
    level = closed[0][1].toLowerCase() === "blocking" ? "blocking" : "partial";
    question = clean(closed[0][2]);
  }
  let rest = text.replace(closedRe, " ");
  const leftover = /<clarify\b[^>]*?level=["']?(blocking|partial)["']?[^>]*>([\s\S]*)/i.exec(rest);
  if (leftover) {
    if (!closed.length) {
      level = leftover[1].toLowerCase() === "blocking" ? "blocking" : "partial";
      question = clean(leftover[2]);
    }
    rest = rest.slice(0, leftover.index ?? 0);
  }
  // 泄漏的残缺标签一律剥掉，正文不向用户暴露内部协议。
  rest = rest.replace(/<\/?clarify\b[^>]*>/gi, " ");
  return { level, question, rest: clean(rest) };
}

/**
 * 「还要用户重交文档」的句式：索要动词与材料名必须在同一个问句里挨着出现
 * （中间不超过 12 字且不跨标点）。分两处出现不算——「简历里的这段经历你给我
 * 讲讲？」既提到简历又有「给我」，但并不是索要简历原文；判成索要会把该拦的
 * 轮次放出去。
 */
const DOCUMENT_ASK_PATTERNS: Record<ProvidedKind, RegExp[]> = {
  jd: [
    /(?:上传|提供|发(?:我|一下|来)?|贴(?:出|上|一份)?|粘贴|附上|给我|有没有|是否有)[^。；，！？\n]{0,12}(JD|Job\s*Description|岗位描述|职位描述|岗位原文|招聘要求|职位要求)/i,
    /(?:JD|Job\s*Description|岗位描述|职位描述|岗位原文|招聘要求|职位要求)[^。；，！？\n]{0,12}(发我|贴上来|贴出|上传|提供|有没有)/i,
  ],
  resume: [
    /(?:上传|提供|发(?:我|一下|来)?|贴(?:出|上|一份)?|粘贴|附上|给我|有没有|是否有)[^。；，！？\n]{0,12}(简历|履历|CV|经历(?:材料|原文|清单))/i,
    /(?:简历|履历|CV|经历(?:材料|原文|清单))[^。；，！？\n]{0,12}(发我|贴上来|贴出|上传|提供|有没有)/i,
  ],
};

/** 问句里能当「事实钩子」的西式词：技能名、工具名、缩写。中文疑问词太宽，不做钩子。 */
const LATIN_TOKEN = /[A-Za-z][A-Za-z0-9+#]{1,}/g;

function latinTokens(text: string): string[] {
  return (text.match(LATIN_TOKEN) || []).map((token) => token.toUpperCase());
}

/**
 * blocking 问句里卡住的那件事，原文里其实已经写了。GS-004 就是这个形状：
 * 简历技能栏写着「SQL 查询」，模型给完差距分析又标 blocking 问「有没有实际用
 * SQL 查过数据」。只认拉丁钩子（SQL、Python、Figma、AB…）在原文里原样出现——
 * 中文词（实习、项目）几乎在任何材料里都有，用它判定会把真正的缺口放出去。
 */
function asksAboutStatedFact(question: string, provided: ProvidedMaterial[]): boolean {
  const stated = new Set(provided.flatMap((material) => latinTokens(material.text)));
  return latinTokens(question).some((token) => stated.has(token));
}

/** 守卫判定出的「重复索要」种类；null = 这个 blocking 卡得有道理。 */
export type ReaskReason = "document_handover" | "stated_in_material" | null;

/** 种类清单：护栏阈值指纹按它取哈希，新增一种判据必须同步登记。 */
export const REASK_KINDS = ["document_handover", "stated_in_material"] as const;

/**
 * 「已提供的信息不得再索要」的确定性判定，只看 blocking 问句本身：
 * - document_handover：要用户重交上下文里已经带着的文档原文；
 * - stated_in_material：问的那个事实/技能，原文里已经写了。
 */
export function reaskReason(question: string, provided?: ProvidedMaterial[]): ReaskReason {
  if (!question || !provided?.length) return null;
  const asked = sentences(question).filter((sentence) => /[？?]/.test(sentence));
  if (!asked.length) return null;
  if (asked.some((s) => provided.some((m) => DOCUMENT_ASK_PATTERNS[m.kind].some((re) => re.test(s))))) {
    return "document_handover";
  }
  if (asked.some((s) => asksAboutStatedFact(s, provided))) return "stated_in_material";
  return null;
}

/** 对无依据的“已确认/已掌握”断言就地追加待确认标注；不删语义，只降级断言。 */
function hedgeUnconfirmedClaims(text: string, userText: string): { text: string; hedged: number } {
  if (!text) return { text, hedged: 0 };
  let hedged = 0;
  const out = text
    .split(/(?<=[。！？!?；;\n])/)
    .map((part) => {
      const probe = part.trim();
      if (!probe || SOFTENED.test(probe)) return part;
      let result = part;
      for (const rule of ASSERTION_RULES) {
        if (rule.corroboration.test(userText)) continue;
        result = result.replace(rule.assertion, (matched) => {
          hedged++;
          return `${matched}${HEDGED_MARK}`;
        });
      }
      return result;
    })
    .join("");
  return { text: out, hedged };
}

export function guardInsufficientReply(input: GuardInput): GuardResult {
  const rawAnswer = typeof input.answer === "string" ? input.answer : "";
  const suggestions = Array.isArray(input.suggestions)
    ? input.suggestions.filter((s): s is string => typeof s === "string" && !!s.trim()).map((s) => s.trim())
    : [];
  const userText = typeof input.userText === "string" ? input.userText : "";
  const provided = Array.isArray(input.providedMaterials) ? input.providedMaterials : [];
  const before = { answer: rawAnswer, suggestions: [...suggestions] };
  try {
    const clarify = extractClarify(rawAnswer);
    let answer = clarify.rest;
    let outSuggestions = suggestions;
    let collapsed = false;
    // 索要的东西上下文里已经有原文 → 不许拦（GS-004 那类误挡）。正文为空时不降级，
    // 空正文降级就等于让守卫编答案。
    const reask = clarify.rest ? reaskReason(clarify.question, provided) : null;
    let downgradedRedundantAsk: ReaskReason = null;
    if (clarify.level === "blocking" && reask) {
      downgradedRedundantAsk = reask;
      const question = pickQuestion(clarify.question);
      // 要重交文档的那句是错的，直接丢掉；问«原文里已写明的事实»那句留着当收尾补充，
      // 它是有用的追问，只是不该据此拒绝已经给出的分析。
      answer =
        reask === "document_handover" || !question || clarify.rest.includes(question)
          ? clarify.rest
          : `${clarify.rest}\n${question}`;
    } else if (clarify.level === "blocking") {
      // 澄清问句优先取标签内容；标签为空时只认正文里真正的问句（含问号），
      // 绝不把硬编正文的第一句当问题；都没有就用固定兜底句。
      const fromTag = pickQuestion(clarify.question);
      const fromBody = clarify.rest.includes("？") || clarify.rest.includes("?") ? pickQuestion(clarify.rest) : "";
      const question = fromTag || fromBody || DEFAULT_CLARIFY_QUESTION;
      const bodyShort =
        clarify.rest.length <= BLOCKING_BODY_LIMIT &&
        sentences(clarify.rest).length <= BLOCKING_BODY_SENTENCES;
      collapsed = !bodyShort;
      if (collapsed || !clarify.rest) {
        answer = question;
      } else if (!clarify.rest.includes(question)) {
        answer = `${clarify.rest}\n${question}`;
      }
      outSuggestions = suggestions.slice(0, 1);
    } else if (clarify.level === "partial") {
      const hint = clean(clarify.question);
      if (hint) answer = !clarify.rest ? hint : clarify.rest.includes(hint) ? clarify.rest : `${clarify.rest}\n${hint}`;
    }
    const hedged = hedgeUnconfirmedClaims(clean(answer), userText);
    const blocked = clarify.level === "blocking" && !downgradedRedundantAsk;
    return {
      answer: hedged.text,
      suggestions: outSuggestions,
      level: clarify.level,
      needsMoreInput: blocked,
      blocked,
      collapsed,
      downgradedRedundantAsk,
      claimsHedged: hedged.hedged,
      before,
    };
  } catch {
    // 守卫本身故障不能拖垮回答链路：原样放行。
    return {
      answer: rawAnswer,
      suggestions,
      level: null,
      needsMoreInput: false,
      blocked: false,
      collapsed: false,
      downgradedRedundantAsk: null,
      claimsHedged: 0,
      before,
    };
  }
}
