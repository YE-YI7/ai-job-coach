import { NextResponse } from 'next/server';
import OpenAI from 'openai';

export const runtime = 'nodejs';

// 频率限制（内存实现，生产环境应使用 Redis）
const rateLimit = new Map<string, { count: number; resetAt: number }>();

/**
 * POST /api/resume/score
 * AI简历评分
 * 请求体: { text: string }
 * 返回: { ok: boolean, score: number, summary: string, suggestions: string[], dimensions?: object }
 */
export async function POST(request: Request) {
  try {
    // IP频率限制
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    const now = Date.now();
    const limit = rateLimit.get(ip);

    if (limit && limit.resetAt > now && limit.count >= 5) {
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

    const systemPrompt = `你是一位资深HR和简历优化专家。请评估以下简历的质量，给出评分和改进建议。

输出严格JSON格式：
{
  "score": 0-100的整数,
  "level": "S/A/B/C/D",
  "summary": "一句话总结简历质量",
  "dimensions": {
    "结构完整性": 0-100,
    "内容丰富度": 0-100,
    "量化成果": 0-100,
    "关键词匹配": 0-100,
    "排版规范": 0-100
  },
  "suggestions": ["建议1", "建议2", "建议3"],
  "detailedAnalysis": [
    {"section": "工作经历", "score": 85, "comment": "详细评价"},
    {"section": "教育背景", "score": 90, "comment": "详细评价"},
    {"section": "技能描述", "score": 70, "comment": "详细评价"}
  ]
}

评分标准：
- 90+: S级，优秀简历，几乎无需修改
- 80-89: A级，良好简历，少量可优化点
- 70-79: B级，一般简历，有明显改进空间
- 60-69: C级，需要较大优化
- <60: D级，建议重写

只输出JSON，不要其他内容。`;

    const response = await client.chat.completions.create({
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `请评估以下简历：\n\n${text.slice(0, 10000)}` },
      ],
      temperature: 0.3,
      max_tokens: 2000,
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
        summary: '简历评分服务暂时出错，请稍后重试',
        dimensions: { "结构完整性": 60, "内容丰富度": 60, "量化成果": 50, "关键词匹配": 55, "排版规范": 70 },
        suggestions: ['建议增加量化指标', '优化项目描述结构', '突出核心技能'],
        detailedAnalysis: [],
      };
    }

    return NextResponse.json({
      ok: true,
      score: result.score,
      level: result.level,
      summary: result.summary,
      dimensions: result.dimensions,
      suggestions: result.suggestions?.slice(0, 3), // 免费只给3条
      detailedAnalysis: result.detailedAnalysis, // 完整分析需登录查看
    });
  } catch (err) {
    console.error('resume score error:', err);
    return NextResponse.json(
      { ok: false, error: '评分服务暂不可用' },
      { status: 500 }
    );
  }
}
