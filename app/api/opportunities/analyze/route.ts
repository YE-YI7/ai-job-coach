import { NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { callLLM } from "@/lib/llm";
import type { EvidenceStrength, OpportunityRecommendation } from "@/lib/opportunities/types";

export const runtime = "nodejs";

const strengths = new Set<EvidenceStrength>(["strong", "weak", "missing", "unverified"]);
const recommendations = new Set<OpportunityRecommendation>(["apply", "prepare_then_apply", "skip"]);

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" ? value as UnknownRecord : {};
}

function parseJson(text: string) {
  const cleaned = text.replace(/```json\s*/g, "").replace(/```/g, "").trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("AI 未返回可解析的 JSON");
  return JSON.parse(match[0]);
}

export async function POST(request: Request) {
  const user = await getCurrentUserFromRequest();
  if (!user) return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });

  try {
    const body = await request.json();
    const company = String(body.company || "").trim().slice(0, 120);
    const role = String(body.role || "").trim().slice(0, 160);
    const jdText = String(body.jdText || "").trim().slice(0, 30_000);
    const resumeText = String(body.resumeText || "").trim().slice(0, 30_000);
    if (!company || !role || !jdText) {
      return NextResponse.json({ ok: false, error: "请提供公司、职位和 JD" }, { status: 400 });
    }

    const result = await callLLM([
      {
        role: "system",
        content: `你是益职的岗位证据分析模块。请根据 JD 和用户明确提供的经历，做保守、可追溯的投递判断。

约束：
1. 绝不虚构项目、数字、职责或经验。
2. 没有简历时，证据只能是 missing；表述模糊或数字需核对时用 unverified。
3. 不使用性别、年龄、婚育、民族等与胜任力无关的信息。
4. 每条 evidence 必须能在用户经历原文中找到；否则写明“尚无证据”。
5. 只返回 JSON，不要 Markdown。

返回结构：
{
  "recommendation": "apply | prepare_then_apply | skip",
  "recommendationLabel": "优先投递 | 补充后投递 | 暂不投入",
  "recommendationReason": "一到两句具体理由",
  "requirements": [{"requirement":"JD 关键要求","importance":"critical | important | supporting","strength":"strong | weak | missing | unverified","evidence":"真实经历或尚无证据","source":"简历中的可追溯位置或 null","verified":true}],
  "actions": [{"title":"具体下一步","reason":"为什么它优先","dueLabel":"今天 | 投递前 | 本周","priority":"urgent | high | normal"}],
  "interviewFocus": [{"question":"可直接练习的问题","rationale":"为什么会问","readiness":"ready | practice | missing"}]
}`,
      },
      {
        role: "user",
        content: `公司：${company}\n职位：${role}\n\nJD：\n${jdText}\n\n用户提供的简历或经历：\n${resumeText || "（未提供）"}`,
      },
    ], { provider: "deepseek", temperature: 0.2, maxTokens: 3200, timeoutMs: 45_000, maxRetries: 1 });

    const parsed = parseJson(result);
    const requirements = Array.isArray(parsed.requirements) ? parsed.requirements.slice(0, 10).map((value: unknown, index: number) => {
      const item = asRecord(value);
      const importance = String(item.importance || "important");
      const strength = String(item.strength || "unverified") as EvidenceStrength;
      return ({
      id: `req-${index + 1}`,
      requirement: String(item.requirement || "未命名要求").slice(0, 500),
      importance: ["critical", "important", "supporting"].includes(importance) ? importance : "important",
      strength: strengths.has(strength) ? strength : "unverified",
      evidence: String(item.evidence || "尚无证据").slice(0, 1000),
      source: item.source ? String(item.source).slice(0, 300) : null,
      verified: Boolean(item.verified && item.source),
    }); }) : [];
    const evidenceCoverage = requirements.reduce((counts: Record<EvidenceStrength, number>, item: { strength: EvidenceStrength }) => {
      counts[item.strength as EvidenceStrength] += 1;
      return counts;
    }, { strong: 0, weak: 0, missing: 0, unverified: 0 });
    const actions = Array.isArray(parsed.actions) ? parsed.actions.slice(0, 4).map((value: unknown, index: number) => {
      const item = asRecord(value);
      const priority = String(item.priority || "normal");
      return ({
      id: `action-${index + 1}`,
      title: String(item.title || "处理关键证据").slice(0, 300),
      reason: String(item.reason || "提高投递判断的可靠性。").slice(0, 500),
      dueLabel: String(item.dueLabel || "投递前").slice(0, 80),
      priority: ["urgent", "high", "normal"].includes(priority) ? priority : "normal",
      status: "todo",
    }); }) : [];
    const interviewFocus = Array.isArray(parsed.interviewFocus) ? parsed.interviewFocus.slice(0, 5).map((value: unknown, index: number) => {
      const item = asRecord(value);
      const readiness = String(item.readiness || "practice");
      return ({
      id: `focus-${index + 1}`,
      question: String(item.question || "请说明一段相关经历。").slice(0, 500),
      rationale: String(item.rationale || "核对岗位关键要求。").slice(0, 500),
      readiness: ["ready", "practice", "missing"].includes(readiness) ? readiness : "practice",
    }); }) : [];
    const recommendationValue = String(parsed.recommendation || "prepare_then_apply") as OpportunityRecommendation;
    const recommendation = recommendations.has(recommendationValue) ? recommendationValue : "prepare_then_apply";

    return NextResponse.json({ ok: true, analysis: {
      recommendation,
      recommendationLabel: String(parsed.recommendationLabel || "补充后投递").slice(0, 80),
      recommendationReason: String(parsed.recommendationReason || "还需补充关键证据。").slice(0, 800),
      evidenceCoverage,
      requirements,
      actions,
      interviewFocus,
    } });
  } catch (error) {
    console.error("Opportunity analysis failed", error);
    return NextResponse.json({ ok: false, error: "分析暂时失败，岗位仍可保存后继续补充" }, { status: 503 });
  }
}
