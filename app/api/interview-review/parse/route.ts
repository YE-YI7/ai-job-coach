/**
 * 面试复盘 - 解析 API
 * POST /api/interview-review/parse
 * 
 * 将用户粘贴的面试原始内容解析为结构化 Q&A
 * 支持传入 session_id 自动保存到数据库
 */
import { NextResponse } from "next/server";
import { callLLM } from "@/lib/llm";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { withMeteredAiRoute } from "@/lib/metered-ai-route";
import { getParserPrompt, getTagRecommendationPrompt } from "@/lib/interview-review/prompts";
import { saveParseResult, updateSessionTags } from "@/lib/interview-review/db";
import { sanitizeText } from "@/lib/interview-review/sanitize";
import type { ParsedQuestion } from "@/lib/interview-review/types";

export const runtime = "nodejs";

async function handlePost(req: Request) {
  try {
    const auth = await getCurrentUserFromRequest();
    if (!auth) {
      return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });
    }

    const body = await req.json();
    const { raw_content, session_id } = body;

    if (!raw_content || typeof raw_content !== "string" || raw_content.trim().length < 20) {
      return NextResponse.json(
        { ok: false, error: "面试内容太短，请粘贴完整的面试对话记录" },
        { status: 400 }
      );
    }

    // 自动脱敏：在发送给 LLM 前屏蔽手机号/邮箱/链接等敏感信息
    const sanitized = sanitizeText(raw_content.trim());
    const contentForLLM = sanitized.text;

    // 并行调用：解析 + 标签推荐
    const [parseResult, tagResult] = await Promise.all([
      callLLM(
        [
          { role: "system", content: "你是一位专业的面试内容解析专家。严格按要求输出JSON。" },
          { role: "user", content: getParserPrompt(contentForLLM) },
        ],
        { temperature: 0.2, maxTokens: 4000, provider: "deepseek", timeoutMs: 90000 }
      ),
      callLLM(
        [
          { role: "system", content: "你是面试内容分析专家。严格输出JSON数组。" },
          { role: "user", content: getTagRecommendationPrompt(contentForLLM) },
        ],
        { temperature: 0.3, maxTokens: 500, provider: "deepseek" }
      ),
    ]);

    // 解析 questions
    let questions: ParsedQuestion[] = [];
    try {
      const cleaned = parseResult.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        questions = JSON.parse(jsonMatch[0]);
      }
    } catch {
      return NextResponse.json(
        { ok: false, error: "面试内容解析失败，请检查格式后重试", raw: parseResult },
        { status: 500 }
      );
    }

    // 解析推荐标签
    let recommended_tags: string[] = [];
    try {
      const cleanedTags = tagResult.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const tagMatch = cleanedTags.match(/\[[\s\S]*\]/);
      if (tagMatch) {
        recommended_tags = JSON.parse(tagMatch[0]);
      }
    } catch {
      recommended_tags = [];
    }

    // 验证并修正解析结果
    questions = questions
      .filter(q => q.question && typeof q.question === "string")
      .map((q, i) => ({
        index: i + 1,
        question: q.question,
        answer: q.answer || "",
        estimated_tags: Array.isArray(q.estimated_tags) ? q.estimated_tags : [],
      }));

    if (questions.length === 0) {
      return NextResponse.json(
        { ok: false, error: "未能从内容中识别出面试问题，请检查格式" },
        { status: 400 }
      );
    }

    // 持久化到数据库（如果提供了 session_id）
    if (session_id) {
      try {
        await saveParseResult(session_id, raw_content.trim(), questions);
      } catch (e) {
        console.warn("保存解析结果到数据库失败（不影响返回）:", e);
      }
    }

    return NextResponse.json({
      ok: true,
      questions,
      recommended_tags,
      question_count: questions.length,
      sanitize_info: sanitized.maskedCount > 0
        ? { masked_count: sanitized.maskedCount, masked_types: sanitized.maskedTypes }
        : undefined,
    });
  } catch (err) {
    console.error("Interview review parse error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "服务器内部错误" },
      { status: 500 }
    );
  }
}

export const POST = withMeteredAiRoute(handlePost, { operation: "interview_review_parse", quotaType: "interview" });
