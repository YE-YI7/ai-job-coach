/**
 * 面试复盘 - 追问回答即时反馈 API
 * POST /api/interview-review/followup-answer
 * 
 * 对用户的追问回答进行结构/深度/说服力三维评估
 */
import { NextResponse } from "next/server";
import { callLLM } from "@/lib/llm";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { withMeteredAiRoute } from "@/lib/metered-ai-route";
import { getFollowUpFeedbackPrompt } from "@/lib/interview-review/prompts";
import type { FollowUpFeedback } from "@/lib/interview-review/types";
import { tokenPayRecoveryResponse } from "@/lib/tokenpay-recovery";

export const runtime = "nodejs";

async function handlePost(req: Request) {
  try {
    const auth = await getCurrentUserFromRequest();
    if (!auth) {
      return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });
    }

    const body = await req.json();
    const { followup_question, focus_area, answer, original_question } = body as {
      followup_question: string;
      focus_area: string;
      answer: string;
      original_question?: string;
    };

    if (!followup_question || !answer || answer.trim().length < 5) {
      return NextResponse.json(
        { ok: false, error: "请输入回答内容（至少5个字）" },
        { status: 400 }
      );
    }

    const result = await callLLM(
      [
        { role: "system", content: "你是精准的面试回答评估专家。严格输出JSON。" },
        {
          role: "user",
          content: getFollowUpFeedbackPrompt(
            followup_question,
            focus_area || "",
            answer.trim(),
            original_question
          ),
        },
      ],
      { temperature: 0.3, maxTokens: 500, provider: "deepseek" }
    );

    let feedback: FollowUpFeedback | null = null;
    try {
      const cleaned = result.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        feedback = {
          grade: parsed.grade || "B",
          structure: parsed.structure || "",
          depth: parsed.depth || "",
          persuasion: parsed.persuasion || "",
          suggestion: parsed.suggestion || "",
        };
      }
    } catch {
      return NextResponse.json(
        { ok: false, error: "反馈生成失败，请重试" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      feedback,
    });
  } catch (err) {
    console.error("Followup answer feedback error:", err);
    const recovery = tokenPayRecoveryResponse(err);
    if (recovery) return recovery;
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "服务器内部错误" },
      { status: 500 }
    );
  }
}

export const POST = withMeteredAiRoute(handlePost, { operation: "interview_review_followup_answer", quotaType: "interview" });
