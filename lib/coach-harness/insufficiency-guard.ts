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
 *
 * 契约：模型按 prompt 输出 <clarify level="blocking">问题</clarify> 或
 * <clarify level="partial">补充X会更准</clarify>；标签由本守卫解析并从正文剥离，
 * 用户看不到原始标签。纯函数、不触网、不抛异常（异常时原样放行）。
 */

export type InsufficiencyLevel = "blocking" | "partial";

export interface GuardInput {
  /** parseTutorReply 之后的正文（已去掉 <followups> 块）。 */
  answer: string;
  /** parseTutorReply 之后的追问建议按钮。 */
  suggestions?: string[];
  /** 用户本轮及近期原话，用于判断“已确认/已掌握”类断言有没有依据。 */
  userText?: string;
}

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

/** 按行去空白、合并多余空格与空行；不改变正文语序。 */
function clean(text: string): string {
  return text
    .split(/\n+/)
    .map((line) => line.replace(/[ \t]{2,}/g, " ").trim())
    .filter(Boolean)
    .join("\n")
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
  const before = { answer: rawAnswer, suggestions: [...suggestions] };
  try {
    const clarify = extractClarify(rawAnswer);
    let answer = clarify.rest;
    let outSuggestions = suggestions;
    let collapsed = false;
    if (clarify.level === "blocking") {
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
    const blocked = clarify.level === "blocking";
    return {
      answer: hedged.text,
      suggestions: outSuggestions,
      level: clarify.level,
      needsMoreInput: blocked,
      blocked,
      collapsed,
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
      claimsHedged: 0,
      before,
    };
  }
}
