import { NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import {
  classifyTokenPayCallback,
  exchangeTokenPayCode,
  getTokenPayAccount,
  hasActiveTokenPayConnection,
  saveTokenPayConnection,
} from "@/lib/tokenpay";

export const runtime = "nodejs";

function clearOAuthCookies(response: NextResponse) {
  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 0,
    path: "/api/tokenpay",
  };
  response.cookies.set("tokenpay_oauth_state", "", options);
  response.cookies.set("tokenpay_pkce_verifier", "", options);
  return response;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const baseUrl = `${requestUrl.protocol}//${requestUrl.host}`;
  const cockpitUrl = new URL("/cockpit", baseUrl);
  const user = await getCurrentUserFromRequest();
  if (!user) {
    const loginUrl = new URL("/login", baseUrl);
    loginUrl.searchParams.set("redirect", "/cockpit?tokenpay=login_required");
    return clearOAuthCookies(NextResponse.redirect(loginUrl));
  }

  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const cookieHeader = request.headers.get("cookie") || "";
  const cookieMap = new Map(cookieHeader.split(";").map((part) => {
    const [key, ...rest] = part.trim().split("=");
    return [key, decodeURIComponent(rest.join("="))];
  }));
  const expectedState = cookieMap.get("tokenpay_oauth_state");
  const verifier = cookieMap.get("tokenpay_pkce_verifier");

  let disposition = classifyTokenPayCallback({ code, state, expectedState, verifier, alreadyConnected: false });
  if (disposition === "security_error" && code && !expectedState && !verifier) {
    disposition = classifyTokenPayCallback({
      code,
      state,
      expectedState,
      verifier,
      alreadyConnected: await hasActiveTokenPayConnection(user.id),
    });
  }

  if (disposition === "connected_replay") {
    cockpitUrl.searchParams.set("tokenpay", "connected");
    return clearOAuthCookies(NextResponse.redirect(cockpitUrl));
  }

  if (disposition !== "exchange" || !code || !verifier) {
    cockpitUrl.searchParams.set("tokenpay", "security_error");
    return clearOAuthCookies(NextResponse.redirect(cockpitUrl));
  }

  try {
    const apiKey = await exchangeTokenPayCode(code, verifier);
    await saveTokenPayConnection(user.id, apiKey);
    await getTokenPayAccount(user.id).catch((balanceError) => {
      console.warn("TokenPay connected but initial balance refresh failed", balanceError instanceof Error ? balanceError.message : "unknown error");
    });
    cockpitUrl.searchParams.set("tokenpay", "connected");
  } catch (error) {
    console.error("TokenPay OAuth callback failed", error instanceof Error ? error.message : "unknown error");
    cockpitUrl.searchParams.set("tokenpay", "failed");
  }
  return clearOAuthCookies(NextResponse.redirect(cockpitUrl));
}
