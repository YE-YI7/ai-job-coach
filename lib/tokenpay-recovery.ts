import "server-only";

import { NextResponse } from "next/server";
import { TokenPayError, type TokenPayRecoveryAction } from "./tokenpay";

const RECOVERY_STATUS: Record<TokenPayRecoveryAction, number> = {
  top_up_balance: 402,
  reauthorize_api_key: 409,
  api_key_quota: 429,
};

export function isTokenPayRecoveryError(error: unknown): error is TokenPayError & { recoveryAction: TokenPayRecoveryAction } {
  return error instanceof TokenPayError && Boolean(error.recoveryAction);
}

export function tokenPayRecoveryResponse(error: unknown) {
  if (!(error instanceof TokenPayError) || !error.recoveryAction) return null;
  return NextResponse.json({
    ok: false,
    error: error.message,
    recoveryAction: error.recoveryAction,
  }, {
    status: RECOVERY_STATUS[error.recoveryAction],
    headers: { "TokenDance-Recovery-Action": error.recoveryAction },
  });
}
