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

⚠️ 极其重要的输出规则：
- personalInfo、education、campusExperience、projects、workExperience、selfEvaluation 这6个字段的值必须是【完整的简历正文内容】
- 这6个字段绝对不能是修改建议、调整说明或分析文字
- 每个字段的内容应该可以直接放入简历展示给HR看
- 修改建议和调整说明只能放在 adjustment_notes 字段中

输出格式：返回纯JSON。

示例（注意看字段值是简历正文，不是建议）：
{
  "personalInfo": "张三 | 产品经理 | 手机：138xxxx | 邮箱：xxx@qq.com",
  "education": "北京大学 计算机科学与技术 本科 2020-2024 GPA 3.8/4.0",
  "campusExperience": "校学生会技术部部长，负责...",
  "projects": "电商推荐系统优化项目\n- 负责用户画像模块设计，DAU提升15%...",
  "workExperience": "字节跳动 产品实习生 2023.06-2023.09\n- 主导...",
  "selfEvaluation": "3年互联网产品经验，擅长数据驱动决策...",
  "adjustment_notes": ["将项目经历中的推荐系统经验前置，匹配JD中的算法要求", "在自我评价中强调了数据分析能力"],
  "match_score": 85,
  "key_matches": ["数据分析", "用户增长"],
  "gaps": ["缺少B端产品经验"]
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

    // 校验：如果简历字段看起来像是建议文字而非简历正文，回退到原始内容
    const suggestionPatterns = /^(建议|应该|可以|需要|调整|优化|修改|补充|将|把|在|针对|根据|突出|强化|增加|删除|替换|这里|此处|该部分)/;
    const resumeKeys = ['personalInfo', 'education', 'campusExperience', 'projects', 'workExperience', 'selfEvaluation'] as const;
    for (const key of resumeKeys) {
      const val = parsed[key];
      if (val && typeof val === 'string') {
        const trimmed = val.trim();
        // 如果内容很短且以建议性词语开头，视为LLM误返回了调整说明
        if (trimmed.length < 80 && suggestionPatterns.test(trimmed)) {
          console.warn(`Resume tailor: ${key} 看起来像建议而非正文，回退到原始内容`);
          parsed[key] = null; // 让下面的 fallback 逻辑使用原始数据
        }
      }
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
