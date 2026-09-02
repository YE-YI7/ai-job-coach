/**
 * 面试复盘 - 训练任务 API
 * GET  /api/interview-review/tasks  — 获取任务列表
 * POST /api/interview-review/tasks  — 生成训练任务（AI生成 或 手动添加）
 */
import { NextResponse } from "next/server";
import { callLLM } from "@/lib/llm";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { withMeteredAiRoute } from "@/lib/metered-ai-route";
import { getTrainingTaskPrompt } from "@/lib/interview-review/prompts";
import {
  createTrainingTasks,
  getTrainingTasks,
  getReviewSession,
} from "@/lib/interview-review/db";
import type { QuestionAnalysisResult } from "@/lib/interview-review/types";
import { tokenPayRecoveryResponse } from "@/lib/tokenpay-recovery";

export const runtime = "nodejs";

function parseJsonResponse(raw: string): any {
  const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const objMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objMatch) return JSON.parse(objMatch[0]);
  return null;
}

// GET: 获取任务列表
export async function GET(req: Request) {
  try {
    const auth = await getCurrentUserFromRequest();
    if (!auth) {
      return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("session_id") || undefined;
    const status = searchParams.get("status") as "pending" | "completed" | undefined;
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("page_size") || "50");

    const result = await getTrainingTasks({
      userId: auth.id,
      sessionId,
      status,
      page,
      pageSize,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("Get training tasks error:", err);
    return NextResponse.json(
      { ok: false, error: "获取训练任务失败" },
      { status: 500 }
    );
  }
}

// POST: 生成或添加训练任务
async function handlePost(req: Request) {
  try {
    const auth = await getCurrentUserFromRequest();
    if (!auth) {
      return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });
    }

    const body = await req.json();
    const { session_id, mode } = body as {
      session_id: string;
      mode: "generate" | "manual";
    };

    // 手动添加模式
    if (mode === "manual") {
      const { title, description, task_type, question_index, context } = body;
      if (!title) {
        return NextResponse.json({ ok: false, error: "任务标题不能为空" }, { status: 400 });
      }
      const tasks = await createTrainingTasks(auth.id, [{
        sessionId: session_id || null,
        questionIndex: question_index ?? null,
        title,
        description: description || "",
        taskType: task_type || "practice",
        source: "manual",
        context: context || {},
      }]);
      return NextResponse.json({ ok: true, tasks });
    }

    // AI 生成模式
    if (!session_id) {
      return NextResponse.json({ ok: false, error: "缺少 session_id" }, { status: 400 });
    }

    // 获取会话数据
    const session = await getReviewSession(session_id, auth.id);
    if (!session || !session.analysis_results?.length || !session.summary) {
      return NextResponse.json({ ok: false, error: "会话数据不完整，请先完成分析" }, { status: 400 });
    }

    // 构建 Prompt 输入
    const questionsInput = session.analysis_results.map((r: QuestionAnalysisResult) => ({
      question: r.question,
      answer: r.answer,
      score: r.score,
      tags: r.tags,
      consensus: r.discussion
        .filter(d => d.role_id === "consensus")
        .map(d => d.content)
        .join("; ") || "无",
      training_tasks: r.training_tasks || [],
    }));

    const summaryInput = {
      biggest_weakness: session.summary.biggest_weakness,
      training_suggestions: session.summary.training_suggestions,
    };

    // 调用 LLM 生成训练任务
    const raw = await callLLM(
      [
        { role: "system", content: "你是面试训练计划专家。严格输出JSON。" },
        { role: "user", content: getTrainingTaskPrompt(questionsInput, summaryInput) },
      ],
      { temperature: 0.4, maxTokens: 2000, provider: "deepseek", timeoutMs: 60000 }
    );

    const parsed = parseJsonResponse(raw);
    if (!parsed) {
      return NextResponse.json({ ok: false, error: "训练任务生成失败" }, { status: 500 });
    }

    // 组装任务列表
    const taskInserts: Array<{
      sessionId: string | null;
      questionIndex: number | null;
      title: string;
      description: string;
      taskType: string;
      source: string;
      context?: Record<string, any>;
    }> = [];

    // 逐题任务
    if (Array.isArray(parsed.question_tasks)) {
      for (const qt of parsed.question_tasks) {
        const qIdx = qt.question_index;
        const analysisQ = session.analysis_results[qIdx];
        for (const t of qt.tasks || []) {
          taskInserts.push({
            sessionId: session_id,
            questionIndex: qIdx,
            title: t.title,
            description: t.description || "",
            taskType: t.task_type || "practice",
            source: "question",
            context: {
              company: session.company,
              round: session.round,
              question: analysisQ?.question,
              score: analysisQ?.score,
            },
          });
        }
      }
    }

    // 整场任务
    if (Array.isArray(parsed.summary_tasks)) {
      for (const t of parsed.summary_tasks) {
        taskInserts.push({
          sessionId: session_id,
          questionIndex: null,
          title: t.title,
          description: t.description || "",
          taskType: t.task_type || "practice",
          source: "summary",
          context: {
            company: session.company,
            round: session.round,
          },
        });
      }
    }

    if (taskInserts.length === 0) {
      return NextResponse.json({ ok: false, error: "未生成有效的训练任务" }, { status: 500 });
    }

    const tasks = await createTrainingTasks(auth.id, taskInserts);

    return NextResponse.json({ ok: true, tasks, count: tasks.length });
  } catch (err) {
    console.error("Create training tasks error:", err);
    const recovery = tokenPayRecoveryResponse(err);
    if (recovery) return recovery;
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "服务器内部错误" },
      { status: 500 }
    );
  }
}

export const POST = withMeteredAiRoute(handlePost, { operation: "interview_review_tasks", quotaType: "interview" });
