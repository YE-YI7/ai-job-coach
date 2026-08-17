export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { isValidStage, type UserStage } from "@/lib/stage";

const getSupabase = () => createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || "",
);

const templates: Partial<Record<UserStage, Array<{ title: string; description: string }>>> = {
  career_planning: [
    { title: "确认目标岗位", description: "写下一个主投方向和一个备选方向。" },
    { title: "盘点经历证据", description: "整理三段能证明目标岗位能力的经历。" },
    { title: "确定本周重点", description: "只选一个最影响求职结果的缺口。" },
  ],
  project_review: [
    { title: "选择核心项目", description: "先选一段与目标岗位最相关的经历。" },
    { title: "补齐过程证据", description: "写清问题、判断、动作和结果。" },
    { title: "准备追问材料", description: "补上指标口径、协作边界和失败复盘。" },
  ],
  application_strategy: [
    { title: "建立岗位清单", description: "收集三到五个真实岗位。" },
    { title: "判断投递优先级", description: "按证据匹配度分为优先、补充、暂缓。" },
    { title: "安排跟进时间", description: "为已投岗位设置下一次跟进日期。" },
  ],
  salary_talk: [
    { title: "确认薪资底线", description: "分别写下底线、目标和理想区间。" },
    { title: "整理谈判筹码", description: "列出岗位匹配、其他机会和入职条件。" },
    { title: "演练关键表达", description: "准备报价、追问和延迟决定的说法。" },
  ],
  offer: [
    { title: "列出选择标准", description: "明确成长、收入、团队和风险的权重。" },
    { title: "核实未知信息", description: "向 HR 或用人经理确认关键条件。" },
    { title: "完成方案比较", description: "把每个选择的收益、成本和后悔风险写清楚。" },
  ],
};

export async function POST(request: Request) {
  try {
    const user = await getCurrentUserFromRequest();
    if (!user) return NextResponse.json({ ok: false, error: "未登录" }, { status: 401 });

    const body = await request.json();
    const stage = typeof body?.stage === "string" ? body.stage : "";
    const existingTasks = Array.isArray(body?.existingTasks) ? body.existingTasks : [];
    if (!isValidStage(stage)) return NextResponse.json({ ok: false, error: "无效的 stage" }, { status: 400 });
    if (stage === "resume_optimization" || stage === "interview") {
      return NextResponse.json({ shouldGenerate: false, tasks: existingTasks, reason: "该阶段使用专用工作台" });
    }
    if (existingTasks.length > 0) {
      return NextResponse.json({ shouldGenerate: false, tasks: existingTasks, reason: "继续完成现有任务" });
    }

    const rows = (templates[stage] || []).map((task, index) => ({
      user_id: user.id,
      stage,
      title: task.title,
      description: task.description,
      sort_order: index,
      is_completed: false,
    }));
    if (!rows.length) return NextResponse.json({ shouldGenerate: false, tasks: [], reason: "暂无任务模板" });

    const { data, error } = await getSupabase().from("stage_tasks").insert(rows).select();
    if (error) throw error;
    return NextResponse.json({ shouldGenerate: true, tasks: data || [], reason: "已按当前求职阶段建立基础行动清单" });
  } catch (error) {
    console.error("任务生成失败:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "服务器内部错误" },
      { status: 500 },
    );
  }
}
