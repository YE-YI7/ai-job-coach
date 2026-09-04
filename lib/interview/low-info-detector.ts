/**
 * 低信息回答检测器
 * 拦截中文短回答、占位词、重复字符和无事实回答
 */

// 完全匹配的占位词（忽略首尾空白）
const EXACT_MATCH_PATTERNS = /^(不会|不知道|不清楚|没印象|忘了|没有|不记得|不知道啊|我不会|我觉得还行|还好|一般般|差不多|还行吧|可以|不好|不好说|这个问题我没想过|没了解过|暂时没有)$/i;

// 包含占位词（短回答中出现即判低信息）
const CONTAINS_PLACEHOLDER_RE = /(嗯|啊|额|额额|呃|emm|hmm|ok|okay|emmmm|emmm)+$/i;

// 仅重复单字符（如"啊啊啊啊"、"不知道不知道"）
const REPEATED_CHAR_RE = /^(.)\1{2,}$/;
const REPEATED_WORD_RE = /^(.{2,})\1{2,}$/;

// 纯标点或空白
const PUNCTUATION_ONLY_RE = /^[\s\.\,，。！？、\?\!]+$/;

// 最小有效字符数（去掉空白后）
const MIN_CHARS = 6;

/**
 * 检测是否为低信息回答
 * @returns { isLowInfo: boolean; reason?: string }
 */
export function detectLowInfoAnswer(answer: string): { isLowInfo: boolean; reason?: string } {
  const trimmed = answer.trim();

  // 空回答
  if (trimmed.length === 0) {
    return { isLowInfo: true, reason: "empty" };
  }

  // 纯标点或空白
  if (PUNCTUATION_ONLY_RE.test(trimmed)) {
    return { isLowInfo: true, reason: "punctuation_only" };
  }

  // 完全匹配占位词
  if (EXACT_MATCH_PATTERNS.test(trimmed)) {
    return { isLowInfo: true, reason: "placeholder" };
  }

  // 仅重复字符（如"啊啊啊"）- 在字符数检查之前
  if (REPEATED_CHAR_RE.test(trimmed)) {
    return { isLowInfo: true, reason: "repeated_char" };
  }

  // 仅重复词组（如"不知道不知道不知道"）
  if (REPEATED_WORD_RE.test(trimmed)) {
    return { isLowInfo: true, reason: "repeated_word" };
  }

  // 末尾包含占位词（如"可以嗯嗯"）- 在字符数检查之前
  if (CONTAINS_PLACEHOLDER_RE.test(trimmed)) {
    const stripped = trimmed.replace(CONTAINS_PLACEHOLDER_RE, "").trim();
    if (stripped.length < MIN_CHARS) {
      return { isLowInfo: true, reason: "trailing_placeholder" };
    }
  }

  // 字符数不足
  if (trimmed.length < MIN_CHARS) {
    return { isLowInfo: true, reason: "too_short" };
  }

  return { isLowInfo: false };
}

/**
 * 生成 needs_more_input 评估结果
 */
export function buildNeedsMoreInputAssessment(reason: string): {
  status: "needs_more_input";
  score: null;
  summary: string;
  evidence: string[];
  missingEvidence: string[];
  dimensions: Array<{ name: string; comment: string }>;
  rewritePlan: string[];
  followUp: string;
} {
  const reasonMessages: Record<string, { summary: string; followUp: string; hint: string }> = {
    empty: {
      summary: "回答为空，请补充你的实际经历或想法。",
      followUp: "能否简单描述一下你在这个场景下的具体做法或决策？",
      hint: "请用一句话描述你在类似场景中的实际做法",
    },
    placeholder: {
      summary: "回答仅包含占位词，缺少具体信息。",
      followUp: "能否用一句话说明你的实际做法或结果？",
      hint: "请补充一个具体的事例或数据",
    },
    too_short: {
      summary: "回答过短，缺少足够信息进行评估。",
      followUp: "能否展开说明你的具体做法、决策和结果？",
      hint: "请补充更多细节，比如你的角色、行动和结果",
    },
    repeated_char: {
      summary: "回答包含重复字符，缺少实质性内容。",
      followUp: "请用完整的句子描述你的实际经历。",
      hint: "请组织语言，描述一个具体事例",
    },
    repeated_word: {
      summary: "回答重复内容较多，缺少具体信息。",
      followUp: "请换个角度，描述你的具体做法或决策过程。",
      hint: "请提供一个具体的项目或场景",
    },
    trailing_placeholder: {
      summary: "回答末尾缺少有效信息。",
      followUp: "能否补充更多关于你的行动和结果的信息？",
      hint: "请补充具体的行动步骤和可衡量的结果",
    },
    punctuation_only: {
      summary: "回答仅包含标点符号，缺少实质内容。",
      followUp: "请用文字描述你的实际经历或想法。",
      hint: "请描述一个具体的事例",
    },
  };

  const msg = reasonMessages[reason] || reasonMessages.placeholder;

  return {
    status: "needs_more_input",
    score: null,
    summary: msg.summary,
    evidence: [],
    missingEvidence: ["回答中未提供具体事实或经历"],
    dimensions: [],
    rewritePlan: [msg.hint],
    followUp: msg.followUp,
  };
}
