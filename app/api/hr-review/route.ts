import { NextResponse } from "next/server";
import { callLLM } from "@/lib/llm";
import { getCurrentUserFromRequest } from "@/lib/auth";
import {
  getPositiveHRPrompt,
  getAdvisoryHRPrompt,
  POSITIVE_HR_NAME,
  ADVISORY_HR_NAME,
} from "@/lib/prompts";

// 使用 Node.js runtime
export const runtime = "nodejs";

/**
 * POST /api/hr-review
 * 获取双HR点评
 */
export async function POST(req: Request) {
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
    } else {
      return NextResponse.json(
        { ok: false, error: "无效的type参数" },
        { status: 400 }
      );
    }
  } catch (err) {
    console.error("HR Review API Error:", err);
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
