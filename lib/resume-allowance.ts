/** Display-only preflight. The server's existing atomic reservation remains authoritative. */
export type ResumeStartAdvice = {
  allowed: boolean;
  fee: string;
  note: string;
};

type Check = { allowed: boolean; source: "paid" | "watcha" | "tokenpay" | "free"; remaining: number | null };

export function resumeStartAdvice(check: Check, trialAvailable = false): ResumeStartAdvice {
  if (!check.allowed) return {
    allowed: false,
    fee: "整份改稿额度不足",
    note: trialAvailable
      ? "整份改稿需要 1 次付费简历额度或 1 积分。你仍可返回工作区，免费体验修改一段经历。"
      : "整份改稿需要 1 次付费简历额度或 1 积分。补充额度后再开始；当前不会启动任务或扣费。",
  };
  if (check.source === "tokenpay") return {
    allowed: true,
    fee: "TokenPay 按实际模型用量计费",
    note: "内部可能有多次模型调用，费用随所选模型、简历长度与实际用量变化；本次不扣益职次数或积分。",
  };
  if (check.source === "watcha") return {
    allowed: true,
    fee: `本次 1 积分 · 当前余 ${check.remaining ?? "—"}`,
    note: "开始时预留 1 积分，成功后结算；失败退回。内部多次模型调用不重复扣积分。",
  };
  return {
    allowed: true,
    fee: `本次 1 次简历额度 · 当前余 ${check.remaining ?? "—"}`,
    note: "开始时预留 1 次简历额度，成功后结算；失败退回。内部多次模型调用不重复扣次数。",
  };
}

export async function loadResumeStartAdvice(fetcher: typeof fetch = fetch): Promise<ResumeStartAdvice> {
  const response = await fetcher("/api/quota/check", { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  const body = await response.json();
  const check = body.checks?.resume;
  if (!response.ok || body.ok !== true || typeof check?.allowed !== "boolean"
    || !["paid", "watcha", "tokenpay", "free"].includes(check.source)) {
    throw new Error("暂时无法确认额度，请刷新查询后再开始；当前未启动改稿。");
  }
  const advice = resumeStartAdvice(check, body.resumeTrial?.available === true);
  if (check.source !== "tokenpay" || !check.allowed) return advice;
  // TokenPay connections alone do not establish a usable balance. This is a free account read.
  try {
    const accountResponse = await fetcher("/api/tokenpay/account", { cache: "no-store", signal: AbortSignal.timeout(7_000) });
    const accountBody = await accountResponse.json();
    const recovery = accountResponse.headers.get("TokenDance-Recovery-Action") || accountBody.recoveryAction;
    if (recovery === "top_up_balance") return {
      allowed: false, fee: "TokenPay 余额不足", note: "请先补充 TokenPay 余额，再开始改稿；当前未启动任务。",
    };
    if (recovery === "api_key_quota") return {
      allowed: false, fee: "TokenPay 已达到周期额度", note: "请在付款渠道检查周期额度，恢复后刷新查询；当前未启动任务。",
    };
    if (accountResponse.ok && accountBody.ok && accountBody.account?.connected === false) return {
      allowed: false, fee: "计费连接已变化", note: "TokenPay 已断开，请刷新额度，确认当前可用的计费方式后再开始。",
    };
    if (accountBody.account?.status === "reauthorize" || recovery === "reauthorize_api_key") return {
      allowed: false, fee: "TokenPay 需要重新连接", note: "请先在账户中重新连接 TokenPay，再开始改稿；当前未启动任务。",
    };
    const balance = accountBody.account?.balance;
    if (accountResponse.ok && accountBody.ok && balance?.unit === "CNY"
      && typeof balance.available === "number" && Number.isFinite(balance.available)) {
      if (balance.available <= 0) return {
        allowed: false, fee: "TokenPay 余额不足", note: "请先补充 TokenPay 余额，再开始改稿；当前未启动任务。",
      };
      return {...advice, fee: `${advice.fee} · 余额 ¥${balance.available.toFixed(2)}`};
    }
  } catch { /* An unavailable balance read is not proof of insufficient funds. */ }
  return {...advice, note: `暂未读到 TokenPay 最新余额。${advice.note}`};
}
