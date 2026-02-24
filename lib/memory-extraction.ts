/**
 * 记忆提取服务
 * 使用LLM从对话中智能提取关键信息
 */

import { callLLM } from './llm';
import { saveMemories, type Stage, type MemoryType } from './memory';

// 提取记忆的Prompt
const EXTRACTION_PROMPT = `你是一个信息提取专家。从用户和AI的对话中提取关键信息，用于后续阶段的个性化指导。

请提取以下类型的信息（如果存在）：

1. **career_goal** (职业目标)
   - 目标岗位、行业、公司类型
   - 职业发展方向
   - 短期和长期目标

2. **project_detail** (项目细节)
   - 项目名称、背景、规模
   - 技术栈、架构
   - 个人角色和贡献
   - 成果和数据

3. **skill** (技能优势)
   - 技术技能
   - 软技能
   - 特长和优势

4. **preference** (求职偏好)
   - 期望地点
   - 公司规模偏好
   - 工作方式偏好（远程/现场）
   - 行业偏好

5. **company_target** (目标公司)
   - 具体公司名称
   - 公司类型（大厂/创业公司等）

6. **salary_expect** (薪资期望)
   - 期望薪资范围
   - 当前薪资
   - 薪资谈判要点

7. **interview_exp** (面试经验)
   - 面试经历
   - 面试中的问题和回答
   - 面试反馈

8. **education** (教育背景)
   - 学历、专业
   - 学校
   - 毕业时间

9. **work_exp** (工作经验)
   - 公司、职位
   - 工作时间
   - 主要职责

**提取规则：**
- 只提取明确提到的信息，不要推测
- 每条记忆应该简洁明了
- 为每条记忆评估重要性（1-10分）
- 重要性评分标准：
  * 9-10分：核心信息（职业目标、关键项目）
  * 7-8分：重要信息（技能、偏好）
  * 5-6分：一般信息（补充细节）
  * 1-4分：次要信息

**返回JSON格式：**
\`\`\`json
{
  "memories": [
    {
      "type": "career_goal",
      "content": {
        "target_role": "Java后端开发工程师",
        "target_industry": "互联网",
        "target_location": "北京"
      },
      "importance": 9
    },
    {
      "type": "skill",
      "content": {
        "category": "技术技能",
        "skills": ["Java", "Spring Boot", "MySQL", "Redis"]
      },
      "importance": 8
    }
  ]
}
\`\`\`

如果没有提取到任何信息，返回：
\`\`\`json
{"memories": []}
\`\`\``;

/**
 * 从对话中提取记忆
 */
export async function extractMemoriesFromConversation(params: {
  userId: string;
  stage: Stage;
  messages: Array<{ role: string; content: string }>;
}): Promise<void> {
  try {
    // 过滤掉system消息，只保留user和assistant的对话
    const conversationMessages = params.messages.filter(
      m => m.role === 'user' || m.role === 'assistant'
    );

    if (conversationMessages.length === 0) {
      return;
    }

    // 构建对话文本
    const conversationText = conversationMessages
      .map(m => `${m.role === 'user' ? '用户' : 'AI'}: ${m.content}`)
      .join('\n\n');

    // 调用LLM提取信息
    const response = await callLLM(
      [
        { role: 'system', content: EXTRACTION_PROMPT },
        { 
          role: 'user', 
          content: `请从以下对话中提取关键信息：\n\n${conversationText}` 
        },
      ],
      {
        temperature: 0.3,
        maxTokens: 2000,
      }
    );

    // 解析返回的JSON
    let result;
    try {
      // 尝试提取JSON（可能被包裹在```json```中）
      const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) || 
                       response.match(/```\s*([\s\S]*?)\s*```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : response;
      result = JSON.parse(jsonStr.trim());
    } catch (parseError) {
      console.error('解析记忆提取结果失败:', parseError);
      console.error('原始响应:', response);
      return;
    }

    // 保存提取的记忆
    if (result.memories && Array.isArray(result.memories) && result.memories.length > 0) {
      const memoriesToSave = result.memories.map((memory: any) => ({
        userId: params.userId,
        stage: params.stage,
        memoryType: memory.type as MemoryType,
        content: memory.content,
        importance: memory.importance || 5,
      }));

      await saveMemories(memoriesToSave);
      console.log(`✓ 成功提取并保存 ${memoriesToSave.length} 条记忆`);
    }
  } catch (error) {
    console.error('记忆提取失败:', error);
    // 不抛出错误，避免影响主流程
  }
}

/**
 * 从单条消息中快速提取关键信息（轻量级）
 */
export async function quickExtractFromMessage(params: {
  userId: string;
  stage: Stage;
  userMessage: string;
  aiResponse: string;
}): Promise<void> {
  // 简化版的提取，只提取最明显的信息
  const simplePrompt = `从以下对话中快速提取1-2条最重要的信息：

用户: ${params.userMessage}
AI: ${params.aiResponse}

只返回JSON格式，如果没有重要信息返回空数组：
{"memories": [{"type": "...", "content": {...}, "importance": 8}]}`;

  try {
    const response = await callLLM(
      [
        { role: 'system', content: EXTRACTION_PROMPT },
        { role: 'user', content: simplePrompt },
      ],
      {
        temperature: 0.2,
        maxTokens: 500,
      }
    );

    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) || 
                     response.match(/```\s*([\s\S]*?)\s*```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : response;
    const result = JSON.parse(jsonStr.trim());

    if (result.memories && result.memories.length > 0) {
      const memoriesToSave = result.memories.map((memory: any) => ({
        userId: params.userId,
        stage: params.stage,
        memoryType: memory.type as MemoryType,
        content: memory.content,
        importance: memory.importance || 5,
      }));

      await saveMemories(memoriesToSave);
    }
  } catch (error) {
    console.error('快速记忆提取失败:', error);
    // 静默失败
  }
}
