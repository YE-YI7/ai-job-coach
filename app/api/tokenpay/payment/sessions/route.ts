import { NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { createTokenPayPaymentSession, TokenPayError } from "@/lib/tokenpay";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getCurrentUserFromRequest();
  if (!user) return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });
  try {
    const body = await request.json();
    const session = await createTokenPayPaymentSession(user.id, Number(body.amount));
    return NextResponse.json({ ok: true, session }, { status: 201 });
  } catch (error) {
    const status = error instanceof TokenPayError ? error.status : 500;
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "充值会话创建失败",
      recoveryAction: error instanceof TokenPayError ? error.recoveryAction : undefined,
    }, { status });
  }
}
