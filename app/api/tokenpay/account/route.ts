import { NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { disconnectTokenPay, getTokenPayAccount, microyuanToYuan, TokenPayError } from "@/lib/tokenpay";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUserFromRequest();
  if (!user) return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });
  try {
    const account = await getTokenPayAccount(user.id);
    if (!account.connected) return NextResponse.json({ ok: true, account });
    return NextResponse.json({
      ok: true,
      account: {
        ...account,
        balance: account.balance ? {
          credits: microyuanToYuan(account.balance.credits),
          creditsUsed: microyuanToYuan(account.balance.credits_used),
          available: microyuanToYuan(account.balance.balance),
          unit: "CNY",
        } : null,
      },
    });
  } catch (error) {
    const status = error instanceof TokenPayError ? error.status : 500;
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "TokenPay 读取失败" }, { status });
  }
}

export async function DELETE() {
  const user = await getCurrentUserFromRequest();
  if (!user) return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });
  try {
    await disconnectTokenPay(user.id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "TokenPay 断开失败" }, { status: 500 });
  }
}
