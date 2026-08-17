import OpenAI from "openai";

/**
 * 响应类型定义
 */
type AgentResponse =
  | { reply: string }
  | { suggestions: string[] }
  | {
      evaluation: {
        score: number;
        strengths: string[];
        improvements: string[];
      };
    };

/**
 * 最小可运行的 JobCoach Agent
 * 接受用户消息，返回结构化 JSON
 * 
 * @param message 用户输入的消息
 * @returns 结构化 JSON 响应（reply、suggestions 或 evaluation）
 */
export async function simpleJobCoachAgent(
  message: string
): Promise<AgentResponse> {
  const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    throw new Error("API Key not found. Please set DEEPSEEK_API_KEY or OPENAI_API_KEY");
  }

  // 确定使用哪个 API
  const isDeepSeek = !!process.env.DEEPSEEK_API_KEY;
  const baseURL = isDeepSeek ? "https://api.deepseek.com" : undefined;
  const model = isDeepSeek ? "deepseek-v4-flash" : (process.env.OPENAI_MODEL || "gpt-3.5-turbo");

  const openai = new OpenAI({
    apiKey,
    baseURL,
  });

  // 构建系统提示词
  const systemPrompt = `你是一个专业的职业教练。根据用户输入，返回 JSON 格式数据。

规则：
1. 如果用户问职业规划、职业发展相关问题，返回 {"reply": "你的回答内容"}。
2. 如果用户问简历相关问题（如"如何写简历"、"简历优化"、"项目经历怎么写"），返回 {"suggestions": ["建议1", "建议2", "建议3"]}。
3. 如果用户问面试相关问题（如"我的回答怎么样"、"面试表现评估"），返回 {"evaluation": {"score": 85, "strengths": ["优点1", "优点2"], "improvements": ["改进1", "改进2"]}}。

重要：
- 只返回 JSON，不要返回其他文字
- 确保 JSON 格式正确，可以被 JSON.parse() 解析
- score 必须是 0-100 之间的数字
- strengths 和 improvements 必须是字符串数组`;

  try {
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: message,
        },
      ],
      temperature: 0.7,
      max_tokens: 1000,
      response_format: { type: "json_object" }, // 强制 JSON 输出（如果模型支持）
    });

    const content = completion.choices[0]?.message?.content || "";
    
    if (!content) {
      throw new Error("Empty response from API");
    }

    // 清理响应内容，提取 JSON
    let jsonString = content.trim();
    
    // 移除可能的 markdown 代码块标记
    if (jsonString.startsWith("```json")) {
      jsonString = jsonString.replace(/^```json\s*/, "").replace(/\s*```$/, "");
    } else if (jsonString.startsWith("```")) {
      jsonString = jsonString.replace(/^```\s*/, "").replace(/\s*```$/, "");
    }

    // 尝试提取 JSON 对象
    let jsonMatch = jsonString.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }

    // 解析 JSON
    const parsed = JSON.parse(jsonMatch[0]);

    // 验证返回格式
    if ("reply" in parsed && typeof parsed.reply === "string") {
      return { reply: parsed.reply };
    } else if ("suggestions" in parsed && Array.isArray(parsed.suggestions)) {
      return { suggestions: parsed.suggestions };
    } else if (
      "evaluation" in parsed &&
      typeof parsed.evaluation === "object" &&
      typeof parsed.evaluation.score === "number" &&
      Array.isArray(parsed.evaluation.strengths) &&
      Array.isArray(parsed.evaluation.improvements)
    ) {
      return {
        evaluation: {
          score: parsed.evaluation.score,
          strengths: parsed.evaluation.strengths,
          improvements: parsed.evaluation.improvements,
        },
      };
    } else {
      // 如果格式不符合，尝试作为普通回答
      return { reply: JSON.stringify(parsed) };
    }
  } catch (error) {
    console.error("JobCoach Agent 错误:", error);
    
    // 如果解析失败，返回错误消息
    if (error instanceof SyntaxError) {
      throw new Error(`JSON 解析失败: ${error.message}`);
    }
    throw error;
  }
}
