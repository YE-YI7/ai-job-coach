import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getCurrentUserFromRequest } from '@/lib/auth';

export const runtime = 'nodejs';

// 频率限制（内存实现，生产环境应使用 Redis）
const rateLimit = new Map<string, { count: number; resetAt: number }>();

/**
 * POST /api/resume/score
 * AI简历评分（PLG Lead Magnet 核心 API）
 * 
 * 请求体: { text: string, mode?: 'free' | 'full' }
 * 
 * 返回（免费版 mode='free'）:
 *   总分 + 等级 + 5 维度分数 + 3 条改进建议摘要 + 最大减分项提示
 *   detailedAnalysis 和 actionPlan 字段为 null（引导注册）
 * 
 * 返回（完整版 mode='full'，需登录）:
 *   以上全部 + 逐模块深度分析 + 可执行修改方案 + ATS 关键词建议
 */
export async function POST(request: Request) {
  try {
    // IP频率限制
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    const now = Date.now();
    const limit = rateLimit.get(ip);

    if (limit && limit.resetAt > now && limit.count >= 10) {
      return NextResponse.json(
        { ok: false, error: '请求过于频繁，请稍后再试' },
        { status: 429 }
      );
    }

    if (!limit || limit.resetAt <= now) {
      rateLimit.set(ip, { count: 1, resetAt: now + 3600000 });
    } else {
      limit.count++;
    }

    const body = await request.json().catch(() => null);
    const text = body?.text?.trim();
    const mode = body?.mode || 'free';

    if (mode === 'full' && !(await getCurrentUserFromRequest())) {
      return NextResponse.json({ ok: false, error: '完整报告需要登录' }, { status: 401 });
    }

    if (!text || text.length < 50) {
      return NextResponse.json(
        { ok: false, error: '简历内容太短，请提供更完整的简历文本' },
        { status: 400 }
      );
    }

    if (text.length > 15000) {
      return NextResponse.json(
        { ok: false, error: '简历内容过长，请精简后重试' },
        { status: 400 }
      );
    }

    // AI评分
    const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
    const baseURL = process.env.DEEPSEEK_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.deepseek.com';

    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: 'AI服务未配置' },
        { status: 503 }
      );
    }

    const client = new OpenAI({ apiKey, baseURL });

    const systemPrompt = `你是一位资深HR和ATS简历优化专家，曾帮助上万人优化简历。请全面评估以下简历，给出精准评分和深度分析。

输出严格JSON格式：
{
  "score": 0-100的整数,
  "level": "S/A/B/C/D",
  "summary": "一句话总结简历质量（不超过30字）",
  "dimensions": {
    "结构完整性": 0-100,
    "内容丰富度": 0-100,
    "量化成果": 0-100,
    "关键词匹配": 0-100,
    "排版规范": 0-100
  },
  "topIssue": "最影响通过率的一个核心问题（不超过40字，用于免费版展示）",
  "suggestions": ["简短建议1", "简短建议2", "简短建议3"],
  "detailedAnalysis": [
    {
      "section": "模块名称（如：工作经历/教育背景/项目经验/技能描述/自我评价）",
      "score": 0-100,
      "status": "excellent/good/warning/critical",
      "comment": "详细评价（2-3句话）",
      "fixes": ["具体修改建议1", "具体修改建议2"]
    }
  ],
  "actionPlan": [
    "优先级1：最应该立即修改的内容和具体做法",
    "优先级2：第二优先修改项",
    "优先级3：第三优先修改项"
  ],
  "atsKeywords": ["建议添加的ATS关键词1", "关键词2", "关键词3", "关键词4", "关键词5"]
}

评分标准：
- 90+: S级，优秀简历，几乎无需修改
- 80-89: A级，良好简历，少量可优化点
- 70-79: B级，一般简历，有明显改进空间
- 60-69: C级，需要较大优化
- <60: D级，建议重写

评估维度说明：
- 结构完整性：是否包含教育、工作经历、项目、技能等核心模块
- 内容丰富度：描述是否详实，是否有足够的细节
- 量化成果：是否用数据量化工作成果（如提升XX%、管理N人团队）
- 关键词匹配：是否包含岗位常见关键词，ATS通过率预估
- 排版规范：结构是否清晰，格式是否规范

只输出JSON，不要其他内容。`;

    const response = await client.chat.completions.create({
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `请评估以下简历：\n\n${text.slice(0, 10000)}` },
      ],
      temperature: 0.3,
      max_tokens: 3000,
    });

    const content = response.choices[0]?.message?.content || '';
    
    // 解析JSON
    let result;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found');
      result = JSON.parse(jsonMatch[0]);
    } catch {
      // 返回降级结果
      result = {
        score: 65,
        level: 'C',
        summary: '简历有较大优化空间',
        topIssue: '缺少量化成果，建议用数据说话',
        dimensions: { "结构完整性": 60, "内容丰富度": 60, "量化成果": 50, "关键词匹配": 55, "排版规范": 70 },
        suggestions: ['增加量化指标', '优化项目描述结构', '突出核心技能'],
        detailedAnalysis: [],
        actionPlan: [],
        atsKeywords: [],
      };
    }

    // 根据 mode 决定返回内容
    if (mode === 'full') {
      // 完整版（需登录后调用）
      return NextResponse.json({
        ok: true,
        mode: 'full',
        score: result.score,
        level: result.level,
        summary: result.summary,
        topIssue: result.topIssue,
        dimensions: result.dimensions,
        suggestions: result.suggestions,
        detailedAnalysis: result.detailedAnalysis || [],
        actionPlan: result.actionPlan || [],
        atsKeywords: result.atsKeywords || [],
      });
    }

    // 免费版：给足够多的信息制造 Aha Moment，但隐藏可执行细节
    return NextResponse.json({
      ok: true,
      mode: 'free',
      score: result.score,
      level: result.level,
      summary: result.summary,
      topIssue: result.topIssue,
      dimensions: result.dimensions,
      suggestions: result.suggestions?.slice(0, 3) || [],
      // 告知用户有多少条详细分析和修改方案（但不给内容）
      detailedAnalysisCount: result.detailedAnalysis?.length || 0,
      actionPlanCount: result.actionPlan?.length || 0,
      atsKeywordsCount: result.atsKeywords?.length || 0,
      // 这些字段为 null，引导注册
      detailedAnalysis: null,
      actionPlan: null,
      atsKeywords: null,
    });
  } catch (err) {
    console.error('resume score error:', err);
    return NextResponse.json(
      { ok: false, error: '评分服务暂不可用' },
      { status: 500 }
    );
  }
}
