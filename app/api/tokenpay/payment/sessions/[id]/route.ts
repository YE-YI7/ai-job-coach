import { NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { getTokenPayPaymentSession, TokenPayError } from "@/lib/tokenpay";
import { tokenPayRecoveryResponse } from "@/lib/tokenpay-recovery";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUserFromRequest();
  if (!user) return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });
  try {
    const { id } = await context.params;
    const session = await getTokenPayPaymentSession(user.id, id);
    return NextResponse.json({ ok: true, session });
  } catch (error) {
    const recovery = tokenPayRecoveryResponse(error);
    if (recovery) return recovery;
    const status = error instanceof TokenPayError ? error.status : 500;
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "支付状态读取失败" }, { status });
  }
}
