import { NextResponse } from "next/server";

/**
 * Demo API Route handler for chat functionality.
 * 这是一个简单的演示 API，用于测试和演示目的。
 * 注意：生产环境应使用 /api/chat 路由，它集成了完整的 orchestrator 和 LLM。
 * 
 * Next.js App Router API 路由使用标准的 Web Request 和 Response 对象。
 */

// 必须使用 Node.js runtime
export const runtime = "nodejs";

// 定义 POST 请求处理器，用于处理聊天消息
export async function POST(req: Request) {
  try {
    // 1. 解析传入的请求体 (期望是 JSON)
    let body = null;
    try {
      body = await req.json();
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON payload" },
        { status: 400 }
      );
    }

    // 阻止前端提交 key
    if (body?.apiKey || body?.key || body?.token) {
      return NextResponse.json(
        { ok: false, error: "Client is not allowed to send LLM keys." },
        { status: 400 }
      );
    }

    // 2. 获取消息内容
    const message = body?.message || body?.messages?.[body.messages.length - 1]?.content || "";

    if (!message) {
      return NextResponse.json(
        { ok: false, error: '请求体中缺少 "message" 字段。' },
        { status: 400 }
      );
    }

    // 3. 模拟一个简单的 AI 回复（不调用真实 LLM）
    const aiResponse = `您好！您发送了消息: "${message}"。这是一个模拟的聊天回复，表明 API 路由工作正常。\n\n提示：生产环境请使用 /api/chat 路由获取真实的 AI 回复。`;

    // 4. 返回响应（格式与 /api/chat 保持一致）
    return NextResponse.json({ 
      ok: true,
      result: aiResponse,
      timestamp: new Date().toISOString(),
      note: "This is a demo response. Use /api/chat for production."
    });
  } catch (error) {
    console.error('处理 demo chat 请求时出错:', error);
    return NextResponse.json(
      { ok: false, error: '处理聊天请求时发生内部服务器错误。' },
      { status: 500 }
    );
  }
}

// 可选：定义一个 GET 处理器用于健康检查/测试
export async function GET() {
  return NextResponse.json({ 
    ok: true,
    status: 'ok', 
    route: 'demo-chat API is running',
    note: 'This is a demo API. Use /api/chat for production chat functionality.'
  });
}

