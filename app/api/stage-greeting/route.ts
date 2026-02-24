import { NextResponse } from "next/server";
import { callLLM } from "@/lib/llm";

// 必须使用 Node.js runtime（因为需要调用 LLM）
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    // 解析请求体
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

    // 校验 stage 是否存在
    if (!body?.stage || typeof body.stage !== "string") {
      return NextResponse.json(
        { ok: false, error: "Missing or invalid 'stage' field" },
        { status: 400 }
      );
    }

    const stage = body.stage;

    // 根据 stage 构造 prompt
    const prompt = `你是一位专业的职业教练。请为用户当前的阶段生成一句自然、友好、简短的开场白，用来引导他们开始本阶段内容。

当前阶段：${stage}

要求：
- 只能一句话
- 语气专业但有温度
- 不要重复"阶段"二字
- 不要说"欢迎来到……"`;

    // 调用 callLLM
    const messages = [
      { role: "system" as const, content: "你是一位专业职业教练 AI。" },
      { role: "user" as const, content: prompt }
    ];

    const reply = await callLLM(messages);

    // 返回格式
    return NextResponse.json({
      ok: true,
      result: reply
    });
  } catch (err) {
    console.error("API Error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "服务器内部错误" },
      { status: 500 }
    );
  }
}

