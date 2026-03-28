/**
 * 面试复盘 - SSE 流式分析端点
 * POST /api/interview-review/analyze-stream
 *
 * 逐题分析并通过 SSE 推送结果，实现渐进式揭晓体验
 *
 * SSE 事件协议：
 *   event: roles            → { roles_used: [...] }
 *   event: question_start   → { question_index, total }
 *   event: discussion_turn  → { question_index, turn: DiscussionTurn }
 *   event: question_complete→ { question_index, result: QuestionAnalysisResult }
 *   event: summary          → ReviewSummary
 *   event: done             → {}
 *   event: error            → { message: string }
 */

import { getCurrentUserFromRequest } from "@/lib/auth";
import {
  generateDiscussion,
  scoreAndRewrite,
  generateSummary,
  buildRolesUsed,
} from "@/lib/interview-review/analyzer";
import {
  selectRolesForRound,
  type ParsedQuestion,
  type QuestionAnalysisResult,
} from "@/lib/interview-review/types";
import { saveAnalysisResult } from "@/lib/interview-review/db";

export const runtime = "nodejs";

// Vercel serverless 函数最长执行时间（秒）
export const maxDuration = 300;

/** 构造 SSE 格式的消息 */
function sseMessage(event: string, data: any): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: Request) {
  // 认证
  const auth = await getCurrentUserFromRequest();
  if (!auth) {
    return new Response(JSON.stringify({ ok: false, error: "未认证" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { questions, company, round, tags, resume_text, job_description, session_id } = body as {
    questions: ParsedQuestion[];
    company?: string;
    round?: string;
    tags?: string[];
    resume_text?: string;
    job_description?: string;
    session_id?: string;
  };

  if (!questions || !Array.isArray(questions) || questions.length === 0) {
    return new Response(JSON.stringify({ ok: false, error: "缺少面试题目数据" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 选择参与角色
  const roleIds = selectRolesForRound(round || "", tags || []);

  // 创建 SSE 流
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: any) => {
        try {
          controller.enqueue(new TextEncoder().encode(sseMessage(event, data)));
        } catch {
          // stream 可能已关闭
        }
      };

      try {
        // 1. 推送角色阵容
        send("roles", { roles_used: buildRolesUsed(roleIds) });

        const analysisResults: QuestionAnalysisResult[] = [];

        // 2. 逐题分析
        for (let i = 0; i < questions.length; i++) {
          const q = questions[i];

          // 通知前端开始分析第 N 题
          send("question_start", { question_index: i, total: questions.length });

          // Step 1: 讨论
          const { discussion, discussionSummary } = await generateDiscussion(
            q, roleIds, resume_text, job_description
          );

          // 逐条推送讨论气泡
          for (const turn of discussion) {
            send("discussion_turn", { question_index: i, turn });
          }

          // Step 2: 打分 + 改写
          const { score, answerSkeleton, rewrittenAnswer } = await scoreAndRewrite(
            q, discussionSummary, resume_text, job_description
          );

          // 从讨论中提取训练建议
          const consensusTurn = discussion.find(d => d.role_id === "consensus");
          const trainingTasks = consensusTurn
            ? [consensusTurn.content]
            : ["根据专家讨论要点进行针对性练习"];

          const result: QuestionAnalysisResult = {
            question_index: q.index,
            question: q.question,
            answer: q.answer,
            tags: q.estimated_tags,
            score,
            discussion,
            answer_skeleton: answerSkeleton,
            rewritten_answer: rewrittenAnswer,
            training_tasks: trainingTasks,
          };

          analysisResults.push(result);

          // 推送单题完整结果
          send("question_complete", { question_index: i, result });
        }

        // 3. 生成并推送整场汇总
        const summary = await generateSummary(
          analysisResults, company || "", round || "", job_description, resume_text
        );
        send("summary", summary);

        // 4. 持久化到数据库
        if (session_id) {
          try {
            const rolesUsed = buildRolesUsed(roleIds);
            await saveAnalysisResult(session_id, analysisResults, summary, rolesUsed);
          } catch (e) {
            console.warn("保存分析结果到数据库失败:", e);
          }
        }

        // 5. 结束信号
        send("done", {});
      } catch (err) {
        console.error("SSE analyze-stream error:", err);
        send("error", { message: err instanceof Error ? err.message : "分析过程出错" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
