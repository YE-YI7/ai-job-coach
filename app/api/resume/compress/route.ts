/**
 * Resume Compression API
 * Compresses resume content using AI to fit within one page
 */

import { NextRequest, NextResponse } from 'next/server';
import { callLLM } from '@/lib/llm';
import { getCurrentUserFromRequest } from '@/lib/auth';
import { withMeteredAiRoute } from '@/lib/metered-ai-route';

interface CompressRequest {
  resumeData: {
    personalInfo?: string;
    workExperience?: string;
    projects?: string;
    education?: string;
    campusExperience?: string;
    selfEvaluation?: string;
  };
  compressionLevel: 1 | 2 | 3;
  targetRatio?: number;
}

interface CompressResponse {
  success: boolean;
  compressedData?: CompressRequest['resumeData'];
  error?: string;
}

/**
 * Generate compression prompt based on level
 */
function getCompressionPrompt(level: 1 | 2 | 3, targetRatio: number): string {
  const basePrompt = `你是一位专业的简历优化专家。请压缩以下简历内容，使其更简洁，同时保留关键信息和成就。

压缩目标：将内容压缩至原长度的 ${Math.round(targetRatio * 100)}%

`;

  const levelInstructions = {
    1: `压缩级别：轻度压缩
- 删除冗余词汇和重复表述
- 合并相似的经历描述
- 保持所有关键成就和数据
- 每段经历保持原有bullet数量`,
    
    2: `压缩级别：中度压缩
- 每段经历最多保留3个最重要的bullet点
- 每个bullet控制在50字以内
- 优先保留有具体数据和成果的内容
- 删除过于宽泛的描述`,
    
    3: `压缩级别：深度压缩
- 每段经历最多2-3个bullet点
- 每个bullet控制在40字以内
- 只保留最核心的成就和技能
- 进行语义层面的精简和重组
- 必要时合并相关经历`,
  };

  return basePrompt + levelInstructions[level] + `

请以JSON格式返回压缩后的内容，保持原有的字段结构。`;
}

async function handlePost(request: NextRequest) {
  try {
    if (!(await getCurrentUserFromRequest())) {
      return NextResponse.json({ success: false, error: '未认证' }, { status: 401 });
    }
    const body: CompressRequest = await request.json();
    const { resumeData, compressionLevel, targetRatio = 0.7 } = body;

    if (!resumeData) {
      return NextResponse.json(
        { success: false, error: 'Resume data is required' },
        { status: 400 }
      );
    }

    if (![1, 2, 3].includes(compressionLevel)) {
      return NextResponse.json(
        { success: false, error: 'Invalid compression level' },
        { status: 400 }
      );
    }

    // Prepare the prompt
    const systemPrompt = getCompressionPrompt(compressionLevel, targetRatio);
    const userContent = JSON.stringify(resumeData, null, 2);

    // Call LLM
    const response = await callLLM(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      {
        temperature: 0.3, // Lower temperature for more consistent compression
        maxTokens: 2000,
      }
    );

    // Parse the response
    let compressedData: CompressRequest['resumeData'];
    try {
      // Try to extract JSON from the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        compressedData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('Failed to parse LLM response:', parseError);
      return NextResponse.json(
        { success: false, error: 'Failed to parse compressed content' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      compressedData,
    });
  } catch (error) {
    console.error('Resume compression error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Compression failed' 
      },
      { status: 500 }
    );
  }
}

export const POST = withMeteredAiRoute(handlePost, { operation: 'resume_compress', quotaType: 'resume' });
