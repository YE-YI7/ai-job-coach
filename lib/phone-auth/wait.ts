export type PhoneWait = { action: "send" | "verify"; until: number; reason: "daily" | "service" | "short" | "provider" };

export function readPhoneWait(value: unknown, now: number): PhoneWait | null {
  if (!value || typeof value !== "object") return null;
  const wait = value as PhoneWait;
  return ["send", "verify"].includes(wait.action) && ["daily", "service", "short", "provider"].includes(wait.reason)
    && Number.isFinite(wait.until) && wait.until > now && wait.until <= now + 86400_000 ? wait : null;
}

export function phoneWaitLabel(seconds: number) {
  if (seconds >= 3600) return `${Math.ceil(seconds / 3600)} 小时后重试`;
  if (seconds >= 60) return `${Math.ceil(seconds / 60)} 分钟后重试`;
  return `${Math.max(1, seconds)} 秒后重试`;
}

export function phoneRetrySeconds(value: string | null) {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(86400, Math.ceil(seconds)) : 60;
}
