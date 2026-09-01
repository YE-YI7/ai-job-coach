import { NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { buildTokenPayAuthorizeUrl, createPkcePair, createTokenPayState } from "@/lib/tokenpay";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getCurrentUserFromRequest();
  const requestUrl = new URL(request.url);
  const baseUrl = `${requestUrl.protocol}//${requestUrl.host}`;
  if (!user) {
    const loginUrl = new URL("/login", baseUrl);
    loginUrl.searchParams.set("redirect", "/api/tokenpay/authorize");
    return NextResponse.redirect(loginUrl);
  }

  const state = createTokenPayState();
  const { verifier, challenge } = createPkcePair();
  const callbackUrl = new URL("/api/tokenpay/callback", baseUrl);
  callbackUrl.searchParams.set("state", state);
  const response = NextResponse.redirect(buildTokenPayAuthorizeUrl({
    callbackUrl: callbackUrl.toString(),
    challenge,
  }));
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 60 * 10,
    path: "/api/tokenpay",
  };
  response.cookies.set("tokenpay_oauth_state", state, cookieOptions);
  response.cookies.set("tokenpay_pkce_verifier", verifier, cookieOptions);
  return response;
}
