import { NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";

export async function POST() {
  try {
    const auth = await getCurrentUserFromRequest();

    if (!auth) {
      return NextResponse.json(
        { ok: false, error: "未认证" },
        { status: 401 }
      );
    }

    return NextResponse.json({
      ok: true,
      user: {
        id: auth.id,
        email: auth.email,
      },
    });
  } catch (err) {
    console.error("❌ /api/load-session error:", err);
    return NextResponse.json(
      { ok: false, error: "内部错误" },
      { status: 500 }
    );
  }
}
