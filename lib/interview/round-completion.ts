/**
 * 整轮模拟面试的收尾状态机（纯函数、客户端安全：不依赖任何 server-only 模块）。
 *
 * 之前的流程是最后一题答完直接让模型写整轮结论，用户反馈"系统凭空替我复盘"。
 * 现在收尾拆成两步：
 *   1) 用户先回答几个反思问题（自我复盘）；
 *   2) 提交后再调 AI 生成整轮点评，点评必须先回应用户自己的判断（见 /api/interview/complete 的 userReflection）。
 * 本模块只负责"现在处于哪一步、复盘文本怎么拼"，不产生任何评价内容。
 */

/** 引导用户自我复盘的问题：一轮结束后先答这些，再让 AI 补充点评。 */
export const ROUND_REFLECTION_QUESTIONS = [
  "这一轮里，哪一题你答得最别扭？卡在哪一步？",
  "如果面试官顺着某一题再追一层，你最没把握讲下去的是什么？",
  "抛开逐题反馈，你自己觉得这一轮暴露的最大短板是什么？",
  "下一轮面试前，你打算先补上的那一件事是什么？",
];

export type RoundCompletionPhase =
  /** 还有题目没答完或没评估完 */
  | "answering"
  /** 题目完成，等用户写自己的复盘（此时不生成 AI 结论） */
  | "self_reflection"
  /** 用户复盘已提交，等待/正在生成 AI 点评 */
  | "ai_summary"
  /** AI 点评已生成，整轮收尾完成 */
  | "done";

export function resolveRoundCompletionPhase(input: {
  /** 本轮所有题目已作答并评估（会话 status === "completed"）。 */
  roundCompleted: boolean;
  /** 用户已提交自己的复盘。 */
  hasSelfReflection: boolean;
  /** AI 整轮点评已生成。 */
  hasAiSummary: boolean;
}): RoundCompletionPhase {
  if (input.hasAiSummary) return "done";
  if (!input.roundCompleted) return "answering";
  if (!input.hasSelfReflection) return "self_reflection";
  return "ai_summary";
}

/** 至少要写一条才算完成自我复盘；全空时不能直接催 AI 替用户下结论。 */
export function hasRoundReflectionContent(answers: string[]): boolean {
  return answers.some((answer) => answer.trim().length > 0);
}

/** 把「问题 + 回答」按提交顺序拼成发给模型的自我复盘文本；空回答跳过。 */
export function formatRoundReflection(questions: string[], answers: string[]): string {
  return questions
    .map((question, index) => ({ question, answer: (answers[index] || "").trim() }))
    .filter((entry) => entry.answer.length > 0)
    .map((entry) => `问：${entry.question}\n答：${entry.answer}`)
    .join("\n");
}
