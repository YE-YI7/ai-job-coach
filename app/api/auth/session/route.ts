import { NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUserFromRequest();
  if (!user) return NextResponse.json({ authenticated: false }, { status: 401 });
  return NextResponse.json({ authenticated: true, user });
}
