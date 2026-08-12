export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCurrentUserFromRequest } from "@/lib/auth";

const getSupabase = () => createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

// GET: 获取用户某阶段的任务列表
export async function GET(request: Request) {
  try {
    const user = await getCurrentUserFromRequest();
    if (!user) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const stage = searchParams.get("stage");

    if (!stage) {
      return NextResponse.json({ error: "缺少 stage 参数" }, { status: 400 });
    }

    const { data, error } = await getSupabase()
      .from("stage_tasks")
      .select("*")
      .eq("user_id", user.id)
      .eq("stage", stage)
      .order("sort_order", { ascending: true });

    if (error) throw error;

    return NextResponse.json({ tasks: data || [] });
  } catch (err: any) {
    console.error("获取任务失败:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST: 批量创建/更新任务（AI 生成或手动）
export async function POST(request: Request) {
  try {
    const user = await getCurrentUserFromRequest();
    if (!user) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const body = await request.json();
    const { stage, tasks, action } = body;

    if (!stage) {
      return NextResponse.json({ error: "缺少 stage" }, { status: 400 });
    }

    // action: "generate" — AI 生成任务（替换现有）
    // action: "toggle" — 切换单个任务完成状态
    // action: "update" — 更新任务列表

    if (action === "toggle") {
      const { taskId, isCompleted } = body;
      const { error } = await getSupabase()
        .from("stage_tasks")
        .update({
          is_completed: isCompleted,
          completed_at: isCompleted ? new Date().toISOString() : null,
          completed_by: isCompleted ? "user" : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", taskId)
        .eq("user_id", user.id);

      if (error) throw error;

      // 返回更新后的任务列表
      const { data: updatedTasks } = await getSupabase()
        .from("stage_tasks")
        .select("*")
        .eq("user_id", user.id)
        .eq("stage", stage)
        .order("sort_order", { ascending: true });

      return NextResponse.json({ tasks: updatedTasks || [] });
    }

    if (action === "generate" || action === "update") {
      if (!tasks || !Array.isArray(tasks)) {
        return NextResponse.json({ error: "缺少 tasks 数组" }, { status: 400 });
      }

      if (action === "generate") {
        // 先删除该阶段旧任务
        await getSupabase()
          .from("stage_tasks")
          .delete()
          .eq("user_id", user.id)
          .eq("stage", stage);
      }

      // 批量插入新任务
      const tasksToInsert = tasks.map((t: any, idx: number) => ({
        user_id: user.id,
        stage,
        title: t.title,
        description: t.description || null,
        sort_order: idx,
        is_completed: t.is_completed || false,
        completed_at: t.is_completed ? new Date().toISOString() : null,
        completed_by: t.is_completed ? (t.completed_by || "ai") : null,
      }));

      const { data: insertedTasks, error } = await getSupabase()
        .from("stage_tasks")
        .insert(tasksToInsert)
        .select();

      if (error) throw error;

      return NextResponse.json({ tasks: insertedTasks || [] });
    }

    return NextResponse.json({ error: "未知 action" }, { status: 400 });
  } catch (err: any) {
    console.error("任务操作失败:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
