import { NextResponse } from "next/server";
import { callLLM } from "@/lib/llm";
import { getCurrentUserFromRequest } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const auth = await getCurrentUserFromRequest();
    if (!auth) {
      return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });
    }

    const body = await req.json();
    const { resumeData, jobDescription } = body;

    if (!resumeData || !jobDescription) {
      return NextResponse.json(
        { ok: false, error: "缺少简历数据或岗位JD" },
        { status: 400 }
      );
    }

    const systemPrompt = `你是一位资深简历优化专家。用户将提供自己的简历内容和目标岗位的JD（职位描述）。
你的任务是根据JD的核心要求，针对性地调整简历内容，使简历更匹配该岗位。

调整原则：
1. 突出与JD匹配的技能和经验，将最相关的内容前置
2. 用JD中的关键词替换简历中的同义表达（提升ATS通过率）
3. 针对JD要求的能力维度，补充或强化相关描述
4. 保持事实准确，不虚构经历，只调整表达方式和侧重点
5. 量化指标尽量保留并强化
6. 语气专业但不夸张

输出格式：返回JSON，包含针对性调整后的各分区内容，以及adjustment_notes（调整说明）。
JSON格式：
{
  "personalInfo": "调整后的个人信息",
  "education": "调整后的教育信息",
  "campusExperience": "调整后的在校经历",
  "projects": "调整后的项目经历",
  "workExperience": "调整后的工作经历",
  "selfEvaluation": "调整后的个人评价",
  "adjustment_notes": [
    "调整说明1：...",
    "调整说明2：..."
  ],
  "match_score": 85,
  "key_matches": ["匹配的关键能力1", "匹配的关键能力2"],
  "gaps": ["需要补强的方面1"]
}

只返回JSON，不要包含markdown标记或其他文字。`;

    const userPrompt = `## 我的简历内容

个人信息：
${resumeData.personalInfo || "(空)"}

教育信息：
${resumeData.education || "(空)"}

在校经历：
${resumeData.campusExperience || "(空)"}

项目经历：
${resumeData.projects || "(空)"}

工作/实习经历：
${resumeData.workExperience || "(空)"}

个人评价：
${resumeData.selfEvaluation || "(空)"}

---

## 目标岗位JD

${jobDescription}

---

请根据上述JD，针对性地调整我的简历，使其更匹配该岗位要求。`;

    const result = await callLLM(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      {
        temperature: 0.4,
        maxTokens: 3000,
        provider: "deepseek",
      }
    );

    // 解析 JSON
    let parsed: any = {};
    try {
      const cleaned = result.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      return NextResponse.json(
        { ok: false, error: "AI返回格式解析失败，请重试" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      tailoredResume: {
        personalInfo: parsed.personalInfo || resumeData.personalInfo,
        education: parsed.education || resumeData.education,
        campusExperience: parsed.campusExperience || resumeData.campusExperience,
        projects: parsed.projects || resumeData.projects,
        workExperience: parsed.workExperience || resumeData.workExperience,
        selfEvaluation: parsed.selfEvaluation || resumeData.selfEvaluation,
      },
      adjustmentNotes: parsed.adjustment_notes || [],
      matchScore: parsed.match_score || null,
      keyMatches: parsed.key_matches || [],
      gaps: parsed.gaps || [],
    });
  } catch (err) {
    console.error("Resume tailor error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "服务器内部错误" },
      { status: 500 }
    );
  }
}
