/**
 * 面试日历 - 创建面试条目
 * POST /api/calendar/create
 * 
 * 接收公司、岗位、面试日期，AI 自动生成备考计划
 */

import { NextRequest, NextResponse } from "next/server";
import { getDbClient } from "@/lib/db";
import { getCurrentUserId } from "@/lib/auth";
import { callLLM } from "@/lib/llm";
import { runWithGenerationContext } from "@/lib/generation-context";
import { finalizeQuota, reserveQuota, type QuotaReservation } from "@/lib/quota";

export async function POST(request: NextRequest) {
  let reservation: QuotaReservation | null = null;
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const body = await request.json();
    const { company, position, interviewDate, useAI = false } = body;

    if (!company || !position || !interviewDate) {
      return NextResponse.json(
        { error: "请填写公司、岗位和面试日期" },
        { status: 400 }
      );
    }

    // 校验日期格式和有效性
    const dateObj = new Date(interviewDate);
    if (isNaN(dateObj.getTime())) {
      return NextResponse.json({ error: "日期格式无效" }, { status: 400 });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (dateObj < today) {
      return NextResponse.json({ error: "面试日期不能是过去的日期" }, { status: 400 });
    }

    // 计算距离面试的天数
    const daysUntil = Math.ceil((dateObj.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    // AI 生成备考计划
    let prepPlan = generateDefaultPrepPlan(daysUntil, company, position);
    let aiPlanStatus: "not_requested" | "generated" | "quota_required" | "fallback" = "not_requested";
    let quota: { source: string; remaining: number | null } | null = null;

    if (useAI === true) {
      const requestId = String(body.requestId || crypto.randomUUID()).slice(0, 180);
      reservation = await reserveQuota(userId, "chat", `calendar-plan:${requestId}`);
      if (!reservation) {
        aiPlanStatus = "quota_required";
      } else {
        try {
          const content = await runWithGenerationContext({
            userId,
            operation: "calendar_interview_plan",
            requestId,
          }, () => callLLM([
            {
              role: "system",
              content: `你是一位资深求职辅导专家。根据用户提供的面试信息，生成一个结构化的面试备考计划。

请严格返回以下 JSON 格式（不要返回其他内容）：
{
  "milestones": [
    {
      "day": "D-7",
      "title": "简历/背景准备",
      "tasks": ["具体任务1", "具体任务2", "具体任务3"],
      "priority": "high"
    }
  ],
  "keyTips": ["关键提醒1", "关键提醒2", "关键提醒3"],
  "focusAreas": ["重点准备方向1", "重点准备方向2"]
}`
            },
            {
              role: "user",
              content: `我将在 ${daysUntil} 天后（${interviewDate}）在 ${company} 面试 ${position} 岗位。请为我生成个性化的备考计划。`
            }
          ], {
          provider: "deepseek",
          temperature: 0.7,
          maxTokens: 1500,
          timeoutMs: 45_000,
          maxRetries: 1,
        }));

        if (content) {
          // 清理 markdown 代码块标记
          const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
          prepPlan = JSON.parse(cleaned);
        }
          await finalizeQuota(reservation, true);
          quota = { source: reservation.source, remaining: reservation.remaining };
          reservation = null;
          aiPlanStatus = "generated";
        } catch (aiError) {
          await finalizeQuota(reservation, false).catch(() => false);
          reservation = null;
          aiPlanStatus = "fallback";
          console.warn("AI 生成备考计划失败，使用默认计划:", aiError);
        }
      }
    }

    // 存入数据库
    const client = await getDbClient();
    if (!client) {
      return NextResponse.json({ error: "数据库不可用" }, { status: 500 });
    }

    const { data, error } = await client
      .from("interview_calendar")
      .insert({
        user_id: userId,
        company,
        position,
        interview_date: interviewDate,
        prep_plan: prepPlan,
      })
      .select()
      .single();

    if (error) {
      console.error("创建面试日历失败:", error);
      return NextResponse.json({ error: "创建失败" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data, aiPlanStatus, quota });
  } catch (err: any) {
    if (reservation) await finalizeQuota(reservation, false).catch((refundError) => console.error("Calendar quota refund failed", refundError));
    console.error("Calendar create error:", err);
    return NextResponse.json({ error: err.message || "服务器错误" }, { status: 500 });
  }
}

/**
 * 生成默认备考计划（当 AI 不可用时的兜底）
 */
function generateDefaultPrepPlan(daysUntil: number, company: string, position: string) {
  const milestones = [];

  if (daysUntil >= 7) {
    milestones.push({
      day: "D-7",
      title: "背景调研",
      tasks: [
        `深入了解 ${company} 的业务模式和行业地位`,
        `研究 ${position} 岗位的核心要求和技能栈`,
        "梳理自己的项目经历，准备 STAR 故事",
      ],
      priority: "medium",
    });
  }

  if (daysUntil >= 3) {
    milestones.push({
      day: "D-3",
      title: "重点攻克",
      tasks: [
        "针对岗位要求准备高频面试题答案",
        "练习自我介绍（1分钟版和3分钟版）",
        "准备 2-3 个向面试官提的好问题",
      ],
      priority: "high",
    });
  }

  if (daysUntil >= 1) {
    milestones.push({
      day: "D-1",
      title: "实战模拟",
      tasks: [
        "完整模拟一轮面试流程",
        "检查面试着装和设备准备",
        "确认面试时间、地点/链接",
      ],
      priority: "high",
    });
  }

  milestones.push({
    day: "D-Day",
    title: "面试当天",
    tasks: [
      "提前 15 分钟到达/上线",
      "保持积极心态，展现真实自我",
      "面试结束后及时记录复盘要点",
    ],
    priority: "high",
  });

  return {
    milestones,
    keyTips: [
      "面试前一晚保证充足睡眠",
      "准备好简历打印件/电子版",
      `关注 ${company} 最近的新闻动态`,
    ],
    focusAreas: [
      `${position} 岗位核心技能`,
      "项目经历的量化表达",
    ],
  };
}
