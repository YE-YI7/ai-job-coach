import { NextResponse } from "next/server";
import { callLLM } from "@/lib/llm";
import { getCurrentUserFromRequest } from "@/lib/auth";

export const runtime = "nodejs";

// 通用降级建议
function getFallbackReplies(aiMessage: string): string[] {
  const message = aiMessage.toLowerCase();
  
  // 如果AI在提问
  if (message.includes("？") || message.includes("?") || message.includes("吗")) {
    return ["是的", "不太确定", "能详细说说吗"];
  }
  
  // 如果AI在给建议
  if (message.includes("建议") || message.includes("可以") || message.includes("试试")) {
    return ["好的，我试试", "具体怎么做", "还有其他方法吗"];
  }
  
  // 如果AI在总结
  if (message.includes("总结") || message.includes("综上") || message.includes("因此")) {
    return ["明白了", "接下来呢", "还需要注意什么"];
  }
  
  // 默认通用建议
  return ["继续", "能展开说说吗", "我想了解更多"];
}

const QUICK_REPLY_SYSTEM_PROMPT = `你是一个智能回复建议生成器，帮助用户快速回应AI导师。

【任务】
根据用户和AI导师的对话历史，生成3个用户可能想说的话，作为用户的"嘴替"。

【要求】
1. 每个建议不超过12个字
2. 语气自然、口语化，像真实用户的回应
3. 基于最后一条AI回复，预测用户可能的回答或反馈
4. 不使用emoji
5. 建议要实用，帮助用户快速表达想法

【生成逻辑】
- 如果AI提问，生成可能的回答
- 如果AI给建议，生成认同/疑问/请求展开的回应
- 如果AI总结，生成确认/补充/下一步的回应

【输出格式】
直接返回3个回复建议，用换行符分隔，不要编号，不要其他说明文字。

【示例】
输入：AI问"你之前做过什么项目？"
输出：
做过电商系统开发
主要负责后端接口
有个数据分析项目

输入：AI说"建议你突出项目中的数据成果"
输出：
好的，我记下了
具体怎么写比较好？
我的数据不够明显

输入：AI总结"你的技术栈很适合这个岗位"
输出：
谢谢，我也这么觉得
还需要补充什么吗？
接下来该做什么？`;

export async function POST(req: Request) {
  try {
    // 认证检查
    const auth = await getCurrentUserFromRequest();
    if (!auth) {
      return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });
    }

    // 解析请求体
    const body = await req.json();
    const { messages } = body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Invalid messages" },
        { status: 400 }
      );
    }

    // 获取最后一条AI回复
    const lastAiMessage = messages
      .slice()
      .reverse()
      .find((m: any) => !m.isUser);

    if (!lastAiMessage) {
      return NextResponse.json({ ok: true, replies: [] });
    }

    // 构建对话历史（最近5条消息）
    const recentMessages = messages.slice(-5).map((m: any) => ({
      role: m.isUser ? "user" : "assistant",
      content: m.content,
    }));

    // 调用LLM生成追问建议 - 使用较短的超时时间
    const prompt = `最近的对话：\n${recentMessages
      .map((m) => `${m.role === "user" ? "用户" : "AI"}：${m.content}`)
      .join("\n")}\n\n请生成3个追问建议：`;

    try {
      const reply = await callLLM(
        [
          { role: "system", content: QUICK_REPLY_SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
        {
          timeoutMs: 10000, // 10秒超时，快速回复不应该等太久
          maxRetries: 1, // 只重试1次
          maxTokens: 100, // 减少token数量，加快响应
          temperature: 0.8, // 稍高的温度增加多样性
        }
      );

      // 解析回复，按行分割
      const replies = reply
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && line.length <= 15)
        .slice(0, 3);

      return NextResponse.json({ ok: true, replies });
    } catch (llmError) {
      // LLM调用失败时返回通用建议
      console.warn("Quick replies LLM timeout/error, using fallback:", llmError);
      
      // 根据最后一条AI消息的类型返回通用建议
      const fallbackReplies = getFallbackReplies(lastAiMessage.content);
      return NextResponse.json({ ok: true, replies: fallbackReplies });
    }
  } catch (err) {
    console.error("Generate Quick Replies Error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "服务器内部错误" },
      { status: 500 }
    );
  }
}
