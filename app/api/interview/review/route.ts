import { NextResponse } from "next/server";
import { callLLM } from "@/lib/llm";
import { getCurrentUserFromRequest } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const auth = await getCurrentUserFromRequest();
    if (!auth) {
      return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });
    }

    const body = await req.json();
    const { interviewContent, context, followUpQuestion } = body;

    if (!interviewContent && !followUpQuestion) {
      return NextResponse.json(
        { ok: false, error: "缺少面试内容" },
        { status: 400 }
      );
    }

    // 追问模式
    if (followUpQuestion && context) {
      const followUpPrompt = `你是一位温柔但坦率的面试复盘教练。之前你已经对用户的面试进行了分析。

之前的分析结果：
${context}

用户的追问：${followUpQuestion}

请针对用户的追问进行深入解答。如果用户想要某个问题的参考回答，请给出具体的回答示例。语气温暖但不回避问题。`;

      const reply = await callLLM(
        [
          { role: "system", content: "你是专业的面试复盘教练，温柔但会坦率指出问题。回答简洁有针对性。" },
          { role: "user", content: followUpPrompt },
        ],
        { temperature: 0.5, maxTokens: 1500, provider: "deepseek" }
      );

      return NextResponse.json({ ok: true, reply });
    }

    // 初始分析模式
    const systemPrompt = `你是一位温柔但有锋芒的面试复盘教练。用户将提供真实的面试对话记录（可能是文本粘贴或录音转文字），你需要深度分析面试表现。

分析维度：
1. 面试官可能的考察意图（每个问题背后想考什么）
2. 用户回答的优点和亮点
3. 用户回答的不足和改进空间（温柔但直接地指出）
4. 每个问题的参考回答框架
5. 整体面试表现评级（S/A/B/C/D 五级）
6. 下一步改进建议

输出格式：返回JSON
{
  "overall_grade": "B+",
  "overall_comment": "整体表现中等偏上，...",
  "improvement_potential": "再练3次可达A",
  "questions": [
    {
      "interviewer_question": "面试官的问题",
      "intent": "考察意图",
      "user_answer_summary": "用户回答摘要",
      "strengths": ["亮点1", "亮点2"],
      "weaknesses": ["不足1"],
      "suggested_answer_points": ["建议回答要点1", "建议回答要点2"],
      "score": "B"
    }
  ],
  "key_strengths": ["整体优势1", "整体优势2"],
  "key_improvements": ["需改进1", "需改进2"],
  "action_items": ["具体行动1", "具体行动2"]
}

只返回JSON，不要包含markdown标记。注意：如果面试内容不完整或格式混乱，尽力分析，在overall_comment中说明。`;

    const result = await callLLM(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: `以下是我的面试记录：\n\n${interviewContent}` },
      ],
      { temperature: 0.4, maxTokens: 3000, provider: "deepseek" }
    );

    let parsed: any = {};
    try {
      const cleaned = result.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      return NextResponse.json(
        { ok: false, error: "AI分析结果解析失败，请重试", rawResult: result },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      analysis: parsed,
    });
  } catch (err) {
    console.error("Interview review error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "服务器内部错误" },
      { status: 500 }
    );
  }
}
