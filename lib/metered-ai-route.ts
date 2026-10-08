import { NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "./auth";
import { runWithGenerationContext } from "./generation-context";
import { finalizeQuota, reserveQuota, reserveFirstCoachingQuota, type QuotaType } from "./quota";
import { tokenPayRecoveryResponse } from "./tokenpay-recovery";

type RouteHandler<TRequest extends Request> = (request: TRequest) => Promise<Response>;

export function withMeteredAiRoute<TRequest extends Request>(
  handler: RouteHandler<TRequest>,
  config: { operation: string; quotaType: QuotaType; firstCoaching?: boolean },
) {
  return async function meteredAiRoute(request: TRequest) {
    const user = await getCurrentUserFromRequest();
    if (!user) {
      return NextResponse.json(
        { ok: false, code: "UNAUTHORIZED", error: "未授权访问" },
        { status: 401 },
      );
    }

    const suppliedKey = request.headers.get("x-idempotency-key")?.trim() || "";
    const requestId = /^[a-zA-Z0-9_-]{8,180}$/.test(suppliedKey) ? suppliedKey : crypto.randomUUID();
    let reservation = await reserveQuota(user.id, config.quotaType, `${config.operation}:${requestId}`);
    if (!reservation && config.firstCoaching && config.operation === "cockpit_agent" && config.quotaType === "chat") {
      reservation = await reserveFirstCoachingQuota(user.id);
    }
    if (!reservation) {
      return NextResponse.json(
        { ok: false, error: "当前 AI 额度已用完", needUpgrade: true },
        { status: 403 },
      );
    }

    try {
      const response = await runWithGenerationContext({
        userId: user.id,
        operation: config.operation,
        requestId,
      }, () => handler(request));
      const finalized = await finalizeQuota(reservation, response.ok);
      if (reservation.source === "first_coaching" && !finalized) throw new Error("首次辅导结算失败，请重试");
      response.headers.set("x-yi-zhi-quota-source", reservation.source);
      if (reservation.remaining !== null) response.headers.set("x-yi-zhi-quota-remaining", String(reservation.remaining));
      return response;
    } catch (error) {
      await finalizeQuota(reservation, false).catch((refundError) => {
        console.error("AI quota refund failed", refundError);
      });
      const recovery = tokenPayRecoveryResponse(error);
      if (recovery) return recovery;
      throw error;
    }
  };
}
