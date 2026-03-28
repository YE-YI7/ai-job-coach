import { NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { buildMemoryContext, injectMemoryIntoPrompt, toMemoryStage } from "@/lib/memory-context-builder";
import { quickExtractFromMessage, flushPendingExtractions } from "@/lib/memory-extraction";
import { checkAndSummarizeIfNeeded } from "@/lib/memory-summarization";
import { saveMessage } from "@/lib/db";
import { callLLM } from "@/lib/llm";
import { createClient } from "@supabase/supabase-js";
import { StageNames, UserStage, getNextStage } from "@/lib/stage";
import { runOrchestrator } from "@/lib/orchestrator";

// 必须使用 Node.js runtime（因为需要调用 LLM）
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    // 认证检查
    const auth = await getCurrentUserFromRequest();
    if (!auth) {
      return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });
    }
    const userId = auth.id;

    // 解析请求体
    let body = null;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON payload" },
        { status: 400 }
      );
    }

    // 阻止前端提交 key
    if (body?.apiKey || body?.key || body?.token) {
      return NextResponse.json(
        { ok: false, error: "Client is not allowed to send LLM keys." },
        { status: 400 }
      );
    }

    // 检查 messages 是否为数组
    if (!Array.isArray(body?.messages)) {
      body.messages = [];
    }

    // 过滤掉非法 item
    body.messages = body.messages.filter(
      (m: any) => m && typeof m.role === "string" && typeof m.content === "string"
    );

    // 如果 messages 为空，自动补一个兜底消息
    if (body.messages.length === 0) {
      body.messages = [{ role: "user", content: "Hello" }];
    }

    const stage = body?.stage || "career_planning";

    // ===== 跨阶段记忆注入 =====
    // 构建记忆上下文，注入到消息中（作为额外的 system context）
    let memoryContextText = "";
    try {
      const memoryContext = await buildMemoryContext(userId, stage);
      if (memoryContext.contextText) {
        memoryContextText = memoryContext.contextText;
        console.log(`[Memory] 注入跨阶段记忆: ${memoryContext.memoriesUsed} 条记忆, ${memoryContext.summariesUsed} 条总结, ~${memoryContext.estimatedTokens} tokens`);
      }
    } catch (memErr) {
      console.warn('[Memory] 记忆上下文构建失败，降级为无记忆模式:', memErr);
    }

    // 构建给编排器的消息（只包含 user/assistant 消息）
    const chatMessages: Array<{ role: "user" | "assistant"; content: string }> = [];

    // 如果有记忆上下文，作为第一条 user 消息的前缀注入
    if (memoryContextText) {
      const firstUserIdx = body.messages.findIndex((m: any) => m.role === "user");
      for (let i = 0; i < body.messages.length; i++) {
        const m = body.messages[i];
        if (m.role === "system") continue; // 跳过 system 消息，编排器会自己添加
        if (i === firstUserIdx && m.role === "user") {
          chatMessages.push({
            role: "user",
            content: `[背景信息]\n${memoryContextText}\n\n[用户消息]\n${m.content}`,
          });
        } else {
          chatMessages.push({
            role: m.role as "user" | "assistant",
            content: m.content,
          });
        }
      }
    } else {
      for (const m of body.messages) {
        if (m.role === "system") continue;
        chatMessages.push({
          role: m.role as "user" | "assistant",
          content: m.content,
        });
      }
    }

    // ===== 调用编排器 =====
    const orchestratorResult = await runOrchestrator({
      userStage: stage,
      messages: chatMessages,
    });

    const reply = orchestratorResult.reply;
    const stageEval = orchestratorResult.stageEval;

    // ===== 阶段完成判断 =====
    let shouldAdvance = false;
    let nextStage: string | null = null;

    if (stageEval?.should_advance) {
      shouldAdvance = true;
      nextStage = getNextStage(stage as UserStage);
      if (nextStage) {
        console.log(`[Stage] 阶段推进建议: ${stage} → ${nextStage} (完成度: ${stageEval.completion}%, 原因: ${stageEval.reason})`);
        // 阶段即将切换，立即刷新记忆缓冲区，确保当前阶段的记忆不丢失
        flushPendingExtractions(userId, toMemoryStage(stage) as any).catch(err => {
          console.warn('[Memory] flush 失败:', err);
        });
      }
    }

    // ===== 异步后处理：消息持久化 + 记忆提取 + 自动总结 =====
    const userMessage = body.messages.filter((m: any) => m.role === 'user').pop()?.content || '';
    const sessionId = body?.sessionId || `session_${userId}`;
    const memoryStage = toMemoryStage(stage);

    processPostChat({
      userId,
      sessionId,
      stage: memoryStage,
      originalStage: stage,
      userMessage,
      aiReply: reply,
    }).catch(err => {
      console.warn('[Memory] 后处理失败:', err);
    });

    // 返回 AI 回复
    return NextResponse.json({
      ok: true,
      result: reply,
      structured: orchestratorResult.structured,
      ...(stageEval ? {
        stageEval: {
          completion: stageEval.completion,
          shouldAdvance,
          nextStage,
        },
      } : {}),
    });
  } catch (err) {
    console.error("API Error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "服务器内部错误" },
      { status: 500 }
    );
  }
}

/**
 * 聊天后异步处理：消息持久化 + 记忆提取 + 自动总结检查 + 待办规划更新
 * fire-and-forget，不影响响应延迟
 */
async function processPostChat(params: {
  userId: string;
  sessionId: string;
  stage: string;
  originalStage: string;
  userMessage: string;
  aiReply: string;
}): Promise<void> {
  const { userId, sessionId, stage, originalStage, userMessage, aiReply } = params;

  try {
    // 1. 持久化消息到数据库
    await Promise.all([
      saveMessage(sessionId, 'user', userMessage, stage, userId),
      saveMessage(sessionId, 'assistant', aiReply, stage, userId),
    ]);
  } catch (err) {
    console.warn('[Memory] 消息持久化失败:', err);
  }

  try {
    // 2. 从对话中提取关键记忆（轻量级单轮提取）
    await quickExtractFromMessage({
      userId,
      stage: stage as any,
      userMessage,
      aiResponse: aiReply,
    });
  } catch (err) {
    console.warn('[Memory] 记忆提取失败:', err);
  }

  try {
    // 3. 检查是否需要自动总结（消息超过阈值时触发）
    await checkAndSummarizeIfNeeded({
      userId,
      stage: stage as any,
    });
  } catch (err) {
    console.warn('[Memory] 自动总结检查失败:', err);
  }

  try {
    // 4. 异步更新待办规划
    const skipTaskStages = ["resume_optimization", "interview"];
    if (!skipTaskStages.includes(originalStage)) {
      await updateTasksAfterChat(userId, originalStage, userMessage, aiReply);
    }
  } catch (err) {
    console.warn('[Tasks] 待办规划更新失败:', err);
  }
}

const getSupabase = () => createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ""
);

/**
 * 聊天后异步更新待办任务
 * AI 自行判断当前对话进度，决定是否生成/更新/完成任务
 */
async function updateTasksAfterChat(
  userId: string,
  stage: string,
  userMessage: string,
  aiReply: string,
): Promise<void> {
  const supabase = getSupabase();
  const stageName = StageNames[stage as UserStage] || stage;

  // 1. 获取当前任务列表
  const { data: existingTasks } = await supabase
    .from("stage_tasks")
    .select("*")
    .eq("user_id", userId)
    .eq("stage", stage)
    .order("sort_order", { ascending: true });

  const tasks = existingTasks || [];

  // 2. 让 AI 分析最近这轮对话，判断是否需要更新待办
  const analysisPrompt = `你是一个求职辅导助手的任务规划模块。当前阶段：${stageName}

分析最新一轮对话，判断：
1. 是否应该生成/更新任务规划（AI导师是否已充分了解用户情况）
2. 已有任务中哪些在对话中被完成了

"充分了解"的标准：
- 职业规划：了解用户背景、兴趣、目标方向
- 项目梳理：了解至少1个项目基本情况
- 投递策略：了解目标公司/岗位方向
- 薪资沟通：了解期望薪资或当前情况
- Offer决策：了解手中offer情况

已有任务列表：
${tasks.length > 0 ? tasks.map((t: any, i: number) => `${i}. [${t.is_completed ? '✅' : '⬜'}] ${t.title}`).join('\n') : '(暂无)'}

最新一轮对话：
user: ${userMessage}
assistant: ${aiReply}

请严格返回 JSON：
{
  "shouldGenerate": true/false,
  "reason": "简要说明",
  "tasks": [{"title": "任务标题（6-15字）", "description": "一句话描述"}],
  "completedTaskIndices": [0, 2]
}

规则：
- shouldGenerate 为 true 时才需要 tasks 数组（3-6项，具体可执行）
- completedTaskIndices 是已完成任务的索引(0-based)
- 如果信息不够充分，shouldGenerate 返回 false
- 如果已有任务且不需更新，只返回 completedTaskIndices`;

  const result = await callLLM(
    [
      { role: "system", content: "你是任务规划分析助手。只返回 JSON，不要包含任何其他文字或 markdown。" },
      { role: "user", content: analysisPrompt },
    ],
    {
      temperature: 0.3,
      maxTokens: 600,
      provider: "deepseek",
    }
  );

  // 3. 解析结果
  let parsed: any = {};
  try {
    const cleaned = result.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    }
  } catch {
    console.warn("[Tasks] AI 返回 JSON 解析失败，跳过更新");
    return;
  }

  // 4. 处理已完成的任务
  if (parsed.completedTaskIndices?.length > 0 && tasks.length > 0) {
    for (const idx of parsed.completedTaskIndices) {
      if (idx >= 0 && idx < tasks.length && !tasks[idx].is_completed) {
        await supabase
          .from("stage_tasks")
          .update({
            is_completed: true,
            completed_at: new Date().toISOString(),
            completed_by: "ai",
            updated_at: new Date().toISOString(),
          })
          .eq("id", tasks[idx].id)
          .eq("user_id", userId);
      }
    }
  }

  // 5. 如果需要生成新任务
  if (parsed.shouldGenerate && parsed.tasks?.length > 0) {
    // 删除旧的未完成任务
    await supabase
      .from("stage_tasks")
      .delete()
      .eq("user_id", userId)
      .eq("stage", stage)
      .eq("is_completed", false);

    // 获取保留的已完成任务数量
    const { data: completedTasks } = await supabase
      .from("stage_tasks")
      .select("id")
      .eq("user_id", userId)
      .eq("stage", stage)
      .eq("is_completed", true);

    const completedCount = completedTasks?.length || 0;

    // 插入新任务
    const tasksToInsert = parsed.tasks.map((t: any, idx: number) => ({
      user_id: userId,
      stage,
      title: t.title,
      description: t.description || null,
      sort_order: completedCount + idx,
      is_completed: false,
    }));

    await supabase.from("stage_tasks").insert(tasksToInsert);
    console.log(`[Tasks] 为 ${stageName} 生成了 ${tasksToInsert.length} 个新任务`);
  }
}
