import { NextResponse } from "next/server";
import { callLLM } from "@/lib/llm";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { withMeteredAiRoute } from "@/lib/metered-ai-route";
import { tokenPayRecoveryResponse } from "@/lib/tokenpay-recovery";
import {
  getPositiveHRPrompt,
  getAdvisoryHRPrompt,
  POSITIVE_HR_NAME,
  ADVISORY_HR_NAME,
  getInitialDiscussionPrompt,
  getFollowUpDiscussionPrompt,
  getQuestionDiscussionPrompt,
} from "@/lib/prompts";

// 使用 Node.js runtime
export const runtime = "nodejs";

/**
 * POST /api/hr-review
 * 获取双HR点评
 */
async function handlePost(req: Request) {
  try {
    // 认证检查
    const auth = await getCurrentUserFromRequest();
    if (!auth) {
      return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });
    }

    // 解析请求体
    const body = await req.json();
    const { resumeContent, type, question, conversationHistory } = body;

    if (!resumeContent || typeof resumeContent !== "string") {
      return NextResponse.json(
        { ok: false, error: "缺少简历内容" },
        { status: 400 }
      );
    }

    // 根据type决定调用哪个HR
    if (type === "initial") {
      // 初始点评：并发调用两个HR
      const [positiveReview, advisoryReview] = await Promise.all([
        generatePositiveReview(resumeContent),
        generateAdvisoryReview(resumeContent),
      ]);

      return NextResponse.json({
        ok: true,
        positive: {
          name: POSITIVE_HR_NAME,
          content: positiveReview,
        },
        advisory: {
          name: ADVISORY_HR_NAME,
          content: advisoryReview,
        },
      });
    } else if (type === "question") {
      // 用户追问：根据问题内容决定由谁回答
      const target = await routeQuestion(question);

      if (target === "positive") {
        const answer = await answerQuestion(
          resumeContent,
          question,
          "positive",
          conversationHistory
        );
        return NextResponse.json({
          ok: true,
          target: "positive",
          answer: {
            name: POSITIVE_HR_NAME,
            content: answer,
          },
        });
      } else if (target === "advisory") {
        const answer = await answerQuestion(
          resumeContent,
          question,
          "advisory",
          conversationHistory
        );
        return NextResponse.json({
          ok: true,
          target: "advisory",
          answer: {
            name: ADVISORY_HR_NAME,
            content: answer,
          },
        });
      } else {
        // both
        const [positiveAnswer, advisoryAnswer] = await Promise.all([
          answerQuestion(resumeContent, question, "positive", conversationHistory),
          answerQuestion(resumeContent, question, "advisory", conversationHistory),
        ]);
        return NextResponse.json({
          ok: true,
          target: "both",
          positive: {
            name: POSITIVE_HR_NAME,
            content: positiveAnswer,
          },
          advisory: {
            name: ADVISORY_HR_NAME,
            content: advisoryAnswer,
          },
        });
      }
    } else if (type === "discussion") {
      // 对谈模式：两位HR围绕简历展开自然对话
      const { previousResumeContent, previousDiscussionSummary } = body;
      
      let conversation;
      if (previousResumeContent && previousDiscussionSummary) {
        // 后续对谈：聚焦简历变化
        conversation = await generateFollowUpDiscussion(
          resumeContent,
          previousResumeContent,
          previousDiscussionSummary
        );
      } else {
        // 首次对谈
        conversation = await generateInitialDiscussion(resumeContent);
      }

      return NextResponse.json({
        ok: true,
        conversation,
      });
    } else if (type === "discussion-question") {
      // 对谈模式下的追问
      const { question: userQuestion, recentDiscussion } = body;
      
      if (!userQuestion) {
        return NextResponse.json(
          { ok: false, error: "缺少问题内容" },
          { status: 400 }
        );
      }

      const conversation = await generateQuestionDiscussion(
        resumeContent,
        userQuestion,
        recentDiscussion || ""
      );

      return NextResponse.json({
        ok: true,
        conversation,
      });
    } else {
      return NextResponse.json(
        { ok: false, error: "无效的type参数" },
        { status: 400 }
      );
    }
  } catch (err) {
    console.error("HR Review API Error:", err);
    const recovery = tokenPayRecoveryResponse(err);
    if (recovery) return recovery;
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "服务器内部错误" },
      { status: 500 }
    );
  }
}

/**
 * 生成正向HR点评
 */
async function generatePositiveReview(resumeContent: string): Promise<string> {
  const prompt = getPositiveHRPrompt(resumeContent);
  const review = await callLLM(
    [
      {
        role: "system",
        content: "你是一位温暖、专业的资深HR，善于发现候选人的优势和亮点。重要：只输出纯文本，不要使用任何markdown格式（如**粗体**、*斜体*、# 标题、- 列表等）。",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    {
      temperature: 0.7,
      maxTokens: 500,
      provider: "deepseek",
      timeoutMs: 60000,
    }
  );
  
  // 清理可能的markdown格式
  return cleanMarkdown(review);
}

/**
 * 生成建议HR点评
 */
async function generateAdvisoryReview(resumeContent: string): Promise<string> {
  const prompt = getAdvisoryHRPrompt(resumeContent);
  const review = await callLLM(
    [
      {
        role: "system",
        content: "你是一位严谨、专业的资深HR，能够敏锐地发现简历的改进空间。重要：只输出纯文本，不要使用任何markdown格式（如**粗体**、*斜体*、# 标题、- 列表等）。",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    {
      temperature: 0.7,
      maxTokens: 600,
      provider: "deepseek",
      timeoutMs: 60000,
    }
  );
  
  // 清理可能的markdown格式
  return cleanMarkdown(review);
}

/**
 * 路由用户问题到合适的HR
 */
async function routeQuestion(question: string): Promise<"positive" | "advisory" | "both"> {
  // 简单的关键词匹配路由
  const positiveKeywords = ["优势", "亮点", "好的地方", "竞争力", "强项", "擅长"];
  const advisoryKeywords = ["改进", "不足", "建议", "优化", "提升", "问题", "缺点"];

  const hasPositive = positiveKeywords.some((kw) => question.includes(kw));
  const hasAdvisory = advisoryKeywords.some((kw) => question.includes(kw));

  if (hasPositive && hasAdvisory) {
    return "both";
  } else if (hasPositive) {
    return "positive";
  } else if (hasAdvisory) {
    return "advisory";
  } else {
    // 默认由建议HR回答（更全面）
    return "advisory";
  }
}

/**
 * 回答用户追问
 */
async function answerQuestion(
  resumeContent: string,
  question: string,
  hrType: "positive" | "advisory",
  conversationHistory?: Array<{ role: string; content: string }>
): Promise<string> {
  const basePrompt =
    hrType === "positive"
      ? getPositiveHRPrompt(resumeContent)
      : getAdvisoryHRPrompt(resumeContent);

  const systemContent =
    hrType === "positive"
      ? "你是一位温暖、专业的资深HR，善于发现候选人的优势和亮点。重要：只输出纯文本，不要使用任何markdown格式（如**粗体**、*斜体*、# 标题、- 列表等）。"
      : "你是一位严谨、专业的资深HR，能够敏锐地发现简历的改进空间。重要：只输出纯文本，不要使用任何markdown格式（如**粗体**、*斜体*、# 标题、- 列表等）。";

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    {
      role: "system",
      content: `${systemContent}\n\n${basePrompt}`,
    },
  ];

  // 添加对话历史
  if (conversationHistory && conversationHistory.length > 0) {
    conversationHistory.forEach((msg) => {
      if (msg.role === "user" || msg.role === "assistant") {
        messages.push({
          role: msg.role as "user" | "assistant",
          content: msg.content,
        });
      }
    });
  }

  // 添加当前问题
  messages.push({
    role: "user",
    content: question,
  });

  const answer = await callLLM(messages, {
    temperature: 0.7,
    maxTokens: 400,
    provider: "deepseek",
    timeoutMs: 60000,
  });

  // 清理可能的markdown格式
  return cleanMarkdown(answer);
}

/**
 * 清理markdown格式
 */
function cleanMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1") // 移除粗体 **text**
    .replace(/\*([^*]+)\*/g, "$1") // 移除斜体 *text*
    .replace(/^#+\s+/gm, "") // 移除标题 # ## ###
    .replace(/^[-*+]\s+/gm, "") // 移除列表符号
    .replace(/^\d+\.\s+/gm, "") // 移除数字列表
    .replace(/^>\s+/gm, "") // 移除引用
    .replace(/`([^`]+)`/g, "$1") // 移除行内代码
    .replace(/```[\s\S]*?```/g, "") // 移除代码块
    .trim();
}

/**
 * 解析LLM返回的对谈JSON
 */
function parseDiscussionResponse(raw: string): Array<{ speaker: string; content: string }> {
  // 尝试从返回内容中提取JSON数组
  let jsonStr = raw.trim();
  
  // 如果被markdown代码块包裹，提取内部内容
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }
  
  // 尝试找到JSON数组的起止位置
  const startIdx = jsonStr.indexOf("[");
  const endIdx = jsonStr.lastIndexOf("]");
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    jsonStr = jsonStr.slice(startIdx, endIdx + 1);
  }

  try {
    const parsed = JSON.parse(jsonStr);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((item: any) => item.speaker && item.content)
        .map((item: any) => ({
          speaker: String(item.speaker),
          content: cleanMarkdown(String(item.content)),
        }));
    }
  } catch {
    // JSON解析失败，尝试按行解析
    console.warn("JSON解析对谈内容失败，尝试按行解析");
  }
  
  // fallback: 返回一条错误消息
  return [
    { speaker: "系统", content: "对谈内容生成失败，请重试" },
  ];
}

/**
 * 生成首次对谈
 */
async function generateInitialDiscussion(
  resumeContent: string
): Promise<Array<{ speaker: string; content: string }>> {
  const prompt = getInitialDiscussionPrompt(resumeContent);
  const raw = await callLLM(
    [
      {
        role: "system",
        content: "你是一个对话生成器，负责模拟两位HR之间的自然对谈。严格按照JSON数组格式输出，不要添加任何其他文字。",
      },
      { role: "user", content: prompt },
    ],
    {
      temperature: 0.8,
      maxTokens: 1200,
      provider: "deepseek",
      timeoutMs: 60000,
    }
  );
  return parseDiscussionResponse(raw);
}

export const POST = withMeteredAiRoute(handlePost, { operation: "resume_hr_review", quotaType: "resume" });

/**
 * 生成后续对谈（简历更新后）
 */
async function generateFollowUpDiscussion(
  newResumeContent: string,
  previousResumeContent: string,
  previousDiscussionSummary: string
): Promise<Array<{ speaker: string; content: string }>> {
  const prompt = getFollowUpDiscussionPrompt(
    newResumeContent,
    previousResumeContent,
    previousDiscussionSummary
  );
  const raw = await callLLM(
    [
      {
        role: "system",
        content: "你是一个对话生成器，负责模拟两位HR之间的后续对谈。严格按照JSON数组格式输出，不要添加任何其他文字。",
      },
      { role: "user", content: prompt },
    ],
    {
      temperature: 0.8,
      maxTokens: 1000,
      provider: "deepseek",
      timeoutMs: 60000,
    }
  );
  return parseDiscussionResponse(raw);
}

/**
 * 生成追问回应对谈
 */
async function generateQuestionDiscussion(
  resumeContent: string,
  question: string,
  recentDiscussion: string
): Promise<Array<{ speaker: string; content: string }>> {
  const prompt = getQuestionDiscussionPrompt(resumeContent, question, recentDiscussion);
  const raw = await callLLM(
    [
      {
        role: "system",
        content: "你是一个对话生成器，负责模拟两位HR回应候选人的追问。严格按照JSON数组格式输出，不要添加任何其他文字。",
      },
      { role: "user", content: prompt },
    ],
    {
      temperature: 0.7,
      maxTokens: 600,
      provider: "deepseek",
      timeoutMs: 60000,
    }
  );
  return parseDiscussionResponse(raw);
}
