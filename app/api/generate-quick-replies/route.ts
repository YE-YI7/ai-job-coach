import { NextResponse } from "next/server";
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

    return NextResponse.json({ ok: true, replies: getFallbackReplies(lastAiMessage.content) });
  } catch (err) {
    console.error("Generate Quick Replies Error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "服务器内部错误" },
      { status: 500 }
    );
  }
}
