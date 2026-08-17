/**
 * 面试复盘 - 追问出题 API
 * GET  /api/interview-review/followup?session_id=xxx — 获取某场复盘的所有追问记录
 * POST /api/interview-review/followup — 基于某道题的弱点生成追问题
 * 
 * 支持传入 session_id 自动保存到数据库
 */
import { NextResponse } from "next/server";
import { callLLM } from "@/lib/llm";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { withMeteredAiRoute } from "@/lib/metered-ai-route";
import { getFollowUpDrillPrompt } from "@/lib/interview-review/prompts";
import { saveFollowups, getFollowups } from "@/lib/interview-review/db";
import type { FollowUpQuestion } from "@/lib/interview-review/types";

export const runtime = "nodejs";

/** 获取某场复盘的所有追问记录 */
export async function GET(req: Request) {
  try {
    const auth = await getCurrentUserFromRequest();
    if (!auth) {
      return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("session_id");

    if (!sessionId) {
      return NextResponse.json(
        { ok: false, error: "缺少 session_id" },
        { status: 400 }
      );
    }

    const followups = await getFollowups(sessionId);
    return NextResponse.json({ ok: true, followups });
  } catch (err) {
    console.error("Get followups error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "服务器内部错误" },
      { status: 500 }
    );
  }
}

async function handlePost(req: Request) {
  try {
    const auth = await getCurrentUserFromRequest();
    if (!auth) {
      return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });
    }

    const body = await req.json();
    const { question, answer, weakness_tags, count, session_id, question_index } = body as {
      question: string;
      answer: string;
      weakness_tags: string[];
      count?: number;
      session_id?: string;
      question_index?: number;
    };

    if (!question) {
      return NextResponse.json(
        { ok: false, error: "缺少面试题目" },
        { status: 400 }
      );
    }

    const drillCount = Math.min(Math.max(count || 3, 2), 5);

    const result = await callLLM(
      [
        { role: "system", content: "你是精准的面试追问出题专家。严格输出JSON数组。" },
        {
          role: "user",
          content: getFollowUpDrillPrompt(
            question,
            answer || "",
            weakness_tags || ["需要改进"],
            drillCount
          ),
        },
      ],
      { temperature: 0.5, maxTokens: 1500, provider: "deepseek" }
    );

    let followups: FollowUpQuestion[] = [];
    try {
      const cleaned = result.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        followups = parsed.map((f: any) => ({
          question: f.question || "",
          focus_area: f.focus_area || "",
          difficulty: ["easy", "medium", "hard"].includes(f.difficulty) ? f.difficulty : "medium",
        }));
      }
    } catch {
      return NextResponse.json(
        { ok: false, error: "追问题生成失败，请重试" },
        { status: 500 }
      );
    }

    // 持久化到数据库（如果提供了 session_id + question_index）
    if (session_id && question_index !== undefined) {
      try {
        await saveFollowups(session_id, question_index, followups);
      } catch (e) {
        console.warn("保存追问记录到数据库失败（不影响返回）:", e);
      }
    }

    return NextResponse.json({
      ok: true,
      followups,
    });
  } catch (err) {
    console.error("Interview review followup error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "服务器内部错误" },
      { status: 500 }
    );
  }
}

export const POST = withMeteredAiRoute(handlePost, { operation: "interview_review_followup", quotaType: "interview" });
