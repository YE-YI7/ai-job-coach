export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { callLLM } from "@/lib/llm";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";
import { StageNames, UserStage } from "@/lib/stage";

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ""
);

type Message = {
  role?: "user" | "assistant" | "system";
  content: string;
  isUser?: boolean;
};

export async function POST(request: Request) {
  try {
    const user = await getCurrentUserFromRequest();
    if (!user) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const body = await request.json();
    const { messages = [], stage, existingTasks = [] } = body;

    if (!stage) {
      return NextResponse.json({ error: "缺少 stage" }, { status: 400 });
    }

    // 跳过简历和面试阶段（用户指定）
    if (stage === "resume_optimization" || stage === "interview") {
      return NextResponse.json({ shouldGenerate: false, reason: "该阶段不生成任务卡" });
    }

    const stageName = StageNames[stage as UserStage] || stage;

    // 分析对话判断是否足够了解用户、是否有已完成的任务
    const analysisPrompt = `你是一个求职辅导助手的任务规划模块。当前阶段：${stageName}

你需要做两件事：

## 1. 判断是否应该生成/更新任务规划
分析以下对话，判断 AI 导师是否已经充分了解了用户的情况。
"充分了解"的标准：
- 职业规划阶段：了解用户的背景、兴趣、目标行业/岗位方向
- 项目梳理阶段：了解用户至少1个项目的基本情况
- 投递策略阶段：了解目标公司/岗位方向
- 薪资沟通阶段：了解用户的期望薪资或当前情况
- Offer决策阶段：了解用户手中的offer情况

## 2. 判断已有任务是否被完成
如果有现有任务，根据最新对话内容判断哪些任务已经在对话中被完成了。

已有任务列表：
${existingTasks.length > 0 ? existingTasks.map((t: any, i: number) => `${i + 1}. [${t.is_completed ? '✅' : '⬜'}] ${t.title}`).join('\n') : '(暂无)'}

对话内容（最近10轮）：
${messages.slice(-20).map((m: Message) => `${m.role || (m.isUser ? "user" : "assistant")}: ${m.content}`).join("\n")}

请严格返回 JSON，不要包含任何其他文字：
{
  "shouldGenerate": true/false,
  "reason": "简要说明原因",
  "tasks": [
    {
      "title": "任务标题（简洁明确，6-15字）",
      "description": "任务描述（可选，一句话说明怎么做）"
    }
  ],
  "completedTaskIndices": [0, 2]
}

规则：
- tasks 是当前阶段的完整后续 todo 规划，3-6 项为宜
- 任务要具体、可执行、有逻辑顺序
- completedTaskIndices 是已有任务列表中已被对话完成的索引（0-based）
- 如果不应生成任务，tasks 返回空数组
- 如果已有任务且不需更新，shouldGenerate 返回 false，只返回 completedTaskIndices`;

    const result = await callLLM(
      [
        { role: "system", content: "你是任务规划分析助手。只返回 JSON，不要包含任何其他文字或 markdown。" },
        { role: "user", content: analysisPrompt },
      ],
      {
        temperature: 0.3,
        maxTokens: 800,
        provider: "deepseek",
      }
    );

    // 解析结果
    let parsed: any = {};
    try {
      const cleaned = result.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error("任务分析 JSON 解析失败:", e);
      return NextResponse.json({ shouldGenerate: false, reason: "解析失败" });
    }

    // 处理已完成的任务
    if (parsed.completedTaskIndices && parsed.completedTaskIndices.length > 0 && existingTasks.length > 0) {
      for (const idx of parsed.completedTaskIndices) {
        if (idx >= 0 && idx < existingTasks.length && !existingTasks[idx].is_completed) {
          await getSupabase()
            .from("stage_tasks")
            .update({
              is_completed: true,
              completed_at: new Date().toISOString(),
              completed_by: "ai",
              updated_at: new Date().toISOString(),
            })
            .eq("id", existingTasks[idx].id)
            .eq("user_id", user.id);
        }
      }
    }

    // 如果需要生成新任务
    if (parsed.shouldGenerate && parsed.tasks && parsed.tasks.length > 0) {
      // 删除旧的未完成任务（保留已完成的）
      await getSupabase()
        .from("stage_tasks")
        .delete()
        .eq("user_id", user.id)
        .eq("stage", stage)
        .eq("is_completed", false);

      // 获取已完成的任务
      const { data: completedTasks } = await getSupabase()
        .from("stage_tasks")
        .select("*")
        .eq("user_id", user.id)
        .eq("stage", stage)
        .eq("is_completed", true)
        .order("sort_order", { ascending: true });

      const completedCount = completedTasks?.length || 0;

      // 插入新任务
      const tasksToInsert = parsed.tasks.map((t: any, idx: number) => ({
        user_id: user.id,
        stage,
        title: t.title,
        description: t.description || null,
        sort_order: completedCount + idx,
        is_completed: false,
      }));

      const { data: insertedTasks, error } = await getSupabase()
        .from("stage_tasks")
        .insert(tasksToInsert)
        .select();

      if (error) throw error;

      // 返回完整列表
      const allTasks = [...(completedTasks || []), ...(insertedTasks || [])];
      return NextResponse.json({
        shouldGenerate: true,
        tasks: allTasks,
        reason: parsed.reason,
      });
    }

    // 获取最新的任务列表（包含已更新的完成状态）
    const { data: latestTasks } = await getSupabase()
      .from("stage_tasks")
      .select("*")
      .eq("user_id", user.id)
      .eq("stage", stage)
      .order("sort_order", { ascending: true });

    return NextResponse.json({
      shouldGenerate: false,
      tasks: latestTasks || [],
      completedTaskIndices: parsed.completedTaskIndices || [],
      reason: parsed.reason || "暂不需要生成任务",
    });
  } catch (err: any) {
    console.error("任务生成失败:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
