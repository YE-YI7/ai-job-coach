import { callLLM } from "@/lib/llm";

export type QuickPracticeAnalysis = {
  verdict: "可继续追问" | "证据不足" | "表达失焦";
  summary: string;
  strengths: string[];
  gaps: string[];
  followUp: string;
  improvedOutline: string[];
};

function parseJson(text: string) {
  const match = text.replace(/```json\s*/gi, "").replace(/```/g, "").match(/\{[\s\S]*\}/);
  if (!match) throw new Error("AI 返回格式错误");
  return JSON.parse(match[0]) as Record<string, unknown>;
}

function stringList(value: unknown, limit: number) {
  return Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean).slice(0, limit) : [];
}

export async function evaluateQuickPractice(input: {
  question: string;
  answer: string;
  jobDescription: string;
  resumeText: string;
}) {
  const output = await callLLM([
    {
      role: "system",
      content: `你是益职的面试教练。只依据候选人的回答、简历和岗位要求判断，不补写候选人没有提供的经历或数字。反馈要短、具体、可立即重答。只返回 JSON：{"verdict":"可继续追问|证据不足|表达失焦","summary":"一句判断","strengths":["最多2条"],"gaps":["最多3条"],"followUp":"面试官下一句追问","improvedOutline":["最多4步的重答提纲"]}`,
    },
    {
      role: "user",
      content: `岗位要求：\n${input.jobDescription || "未提供完整 JD"}\n\n简历事实：\n${input.resumeText || "未提供简历"}\n\n面试题：\n${input.question}\n\n候选人回答：\n${input.answer}`,
    },
  ], {
    provider: "deepseek",
    temperature: 0.15,
    maxTokens: 1100,
    timeoutMs: 35_000,
    maxRetries: 1,
    responseFormat: "json_object",
  });

  const parsed = parseJson(output);
  const verdict = ["可继续追问", "证据不足", "表达失焦"].includes(String(parsed.verdict))
    ? String(parsed.verdict) as QuickPracticeAnalysis["verdict"]
    : "证据不足";
  const analysis: QuickPracticeAnalysis = {
    verdict,
    summary: String(parsed.summary || "这次回答还需要补充可核实的事实。").trim().slice(0, 600),
    strengths: stringList(parsed.strengths, 2),
    gaps: stringList(parsed.gaps, 3),
    followUp: String(parsed.followUp || "这件事里你个人做出的关键决策是什么？").trim().slice(0, 500),
    improvedOutline: stringList(parsed.improvedOutline, 4),
  };
  if (!analysis.summary || !analysis.followUp || !analysis.improvedOutline.length) throw new Error("AI 返回的反馈不完整");
  return analysis;
}
