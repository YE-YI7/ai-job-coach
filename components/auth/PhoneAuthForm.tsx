"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { normalizeMainlandPhone, type PhonePurpose } from "@/lib/phone-auth/identity";
import { phoneRetrySeconds, phoneWaitLabel, readPhoneWait, type PhoneWait } from "@/lib/phone-auth/wait";
import styles from "./PhoneAuthForm.module.css";

type Pending = { challengeId: string; maskedPhone: string; expiresAt: string; resendAt: string; recovery?: boolean };
type Success = { userId: string; isNewUser: boolean };

export default function PhoneAuthForm({ purpose, recovery=false, onSuccess }: { purpose: PhonePurpose; recovery?:boolean; onSuccess?: (data: Success) => void }) {
  const id = useId();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [consent, setConsent] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [bound, setBound] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [signName, setSignName] = useState("恒创联众");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [recoverStatus, setRecoverStatus] = useState(false);
  const [wait, setWait] = useState<PhoneWait | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const gate = useRef(false);
  const codeInput = useRef<HTMLInputElement>(null);
  const requestController = useRef<AbortController | null>(null);
  const remaining = pending ? Math.max(0, Math.ceil((Date.parse(pending.resendAt) - now) / 1000)) : 0;
  const expired = pending ? now >= Date.parse(pending.expiresAt) : false;
  const waitSeconds = wait ? Math.max(0, Math.ceil((wait.until - now) / 1000)) : 0;
  const waitKey = `yizhi:phone-wait:${purpose}`;
  const sendBlocked = wait?.action === "send" && waitSeconds > 0;
  const verifyBlocked = wait?.action === "verify" && waitSeconds > 0;
  const saveWait = (value: PhoneWait | null) => {
    setWait(value);
    // UX state only: no phone/OTP; the database always enforces the actual caps.
    try { if (value) sessionStorage.setItem(waitKey, JSON.stringify(value)); else sessionStorage.removeItem(waitKey); } catch { /* Storage is optional. */ }
  };

  const readStatus = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    const controller = new AbortController();
    requestController.current = controller;
    const cancel = () => controller.abort();
    signal?.addEventListener('abort', cancel, { once: true });
    const timeout = setTimeout(cancel, 15_000);
    try {
      const response = await fetch(`/api/auth/phone?purpose=${purpose}`, { cache: "no-store", signal: controller.signal });
      const data = await response.json().catch(() => ({ error: "验证服务暂时不可用，请重试。" }));
      if (!response.ok || !data.ok) throw new Error(data.error || "无法读取验证状态，请重试。");
      setBound(data.boundPhone); setEnabled(data.enabled); setAuthenticated(data.authenticated);
      setSignName(data.signName); setPending(data.pending); setError(""); setRecoverStatus(false);
    } catch (cause) {
      if (signal?.aborted) return;
      setError(cause instanceof TypeError || (cause as Error).name === 'AbortError'
        ? "读取验证状态超时或网络未连接。输入不会丢失，可以重试。" : (cause as Error).message);
    } finally {
      clearTimeout(timeout); signal?.removeEventListener('abort', cancel);
      if (requestController.current === controller) requestController.current = null;
      if (!signal?.aborted) setLoading(false);
    }
  }, [purpose]);

  useEffect(() => {
    const controller = new AbortController();
    try { setWait(readPhoneWait(JSON.parse(sessionStorage.getItem(`yizhi:phone-wait:${purpose}`) || "null"), Date.now())); } catch { /* Storage is optional. */ }
    void readStatus(controller.signal);
    return () => { controller.abort(); requestController.current?.abort(); };
  }, [readStatus, purpose]);

  useEffect(() => {
    if (!pending && !wait) return;
    if (pending) codeInput.current?.focus();
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [pending, wait]);

  useEffect(() => {
    if (wait && wait.until <= now) {
      setWait(null);
      try { sessionStorage.removeItem(`yizhi:phone-wait:${purpose}`); } catch { /* Storage is optional. */ }
    }
  }, [wait, now, purpose]);

  const request = async (action: "send" | "verify") => {
    if (gate.current || (wait?.action === action && wait.until > Date.now())) return;
    setError(""); setRecoverStatus(false);
    if (action === "send" && !normalizeMainlandPhone(phone)) { setError("请输入中国大陆 11 位手机号。"); return; }
    if (action === "send" && !consent) { setError("请先确认接收本次验证码短信。"); return; }
    gate.current = true; setBusy(true);
    const controller = new AbortController(); requestController.current = controller;
    const timeout = setTimeout(() => controller.abort(), 25_000);
    try {
      const response = await fetch(`/api/auth/phone/${action}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify(action === "send" ? { phone, purpose, consent, recovery } : { challengeId: pending?.challengeId, code, purpose, recovery:pending?.recovery===true }),
      });
      const data = await response.json().catch(() => ({ error: "验证服务暂时不可用，请重试。" }));
      if (!response.ok || !data.ok) {
        if (data.code === "expired") setPending(null);
        if (response.status === 429) {
          const retry = phoneRetrySeconds(response.headers.get("Retry-After"));
          const reason = data.reason === "daily" ? "daily" : data.reason === "service" ? "service" : data.code === "provider_limited" ? "provider" : "short";
          saveWait({action,until:Date.now()+retry*1000,reason}); setNow(Date.now());
          return;
        }
        throw new Error(data.error || "验证未完成，请重试。");
      }
      saveWait(null);
      if (action === "send") { setPending(data); setSignName(data.signName); setCode(""); setNow(Date.now()); }
      else {
        setCode(""); setPending(null);
        if (purpose === "bind") setBound(data.boundPhone);
        onSuccess?.(data);
      }
    } catch (cause) {
      const interrupted = cause instanceof TypeError || (cause as Error).name === "AbortError";
      setRecoverStatus(interrupted);
      setError(interrupted ? "连接中断，短信可能已发送。请先查看短信状态。" : (cause as Error).message);
    } finally { clearTimeout(timeout); requestController.current = null; gate.current = false; setBusy(false); }
  };

  if (loading) return <p className={styles.status} role="status">正在读取手机验证状态…</p>;
  if (authenticated && purpose === "login") return <div className={styles.form}>
    <p className={styles.hint}>你已登录。给原账号添加手机号，请前往账号设置绑定。</p>
    <Link className={styles.returnLink} href="/account/phone?recover=1">找回原来的工作区</Link><br />
    <Link className={styles.returnLink} href="/account/phone">绑定当前账号</Link>
    <br /><Link className={styles.returnLink} href="/cockpit">进入工作区</Link>
  </div>;
  if (bound && purpose === "bind") return <div className={styles.form}>
    <p className={styles.success} role="status">已绑定 {bound}</p>
    <p className={styles.hint}>下次可用这个手机号登录同一账号。原来的简历、岗位、额度和作答都留在原处。</p>
    <Link className={styles.returnLink} href="/cockpit">返回工作区</Link>
  </div>;

  return <div className={styles.form}>
    {!enabled ? <>
      <p className={styles.hint}>手机验证暂时不可用，原登录方式不受影响。</p>
      <button className={styles.textButton} type="button" onClick={() => void readStatus()}>重新检查</button>
    </> : pending ? <form key="verify" onSubmit={(event) => { event.preventDefault(); void request("verify"); }}>
      <p className={styles.destination} role="status">验证码已发送至 {pending.maskedPhone}</p>
      <p className={styles.hint}>短信署名「{signName}」· 5 分钟内有效</p>
      <label htmlFor={`${id}-code`}>短信验证码</label>
      <input ref={codeInput} id={`${id}-code`} type="text" inputMode="numeric" autoComplete="one-time-code"
        maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
        aria-describedby={`${id}-message`} disabled={busy} required pattern="[0-9]{6}" />
      {expired && <p className={styles.hint}>验证码已过期，请重新获取。</p>}
      <button className={styles.primary} disabled={busy || expired || verifyBlocked || code.length !== 6} type="submit">
        {busy ? "正在验证…" : verifyBlocked ? phoneWaitLabel(waitSeconds) : pending.recovery ? "验证并关联原账号" : purpose === "bind" ? "验证并绑定" : "登录"}
      </button>
      <div className={styles.actions}><button className={styles.textButton} disabled={busy} type="button"
        onClick={() => { setPending(null); setCode(""); }}>
        {remaining > 0 ? "换一个号码" : "重新获取 / 更换号码"}
      </button>{remaining > 0 && <span className={styles.hint}>{remaining} 秒后可重新获取</span>}</div>
    </form> : <form key="phone" onSubmit={(event) => { event.preventDefault(); void request("send"); }}>
      <label htmlFor={`${id}-phone`}>手机号</label>
      <div className={styles.phoneInput}><span aria-hidden="true">+86</span>
        <input id={`${id}-phone`} aria-label="中国大陆手机号" type="tel" inputMode="tel" autoComplete="tel-national"
          placeholder="11 位手机号" maxLength={20} value={phone}
          disabled={busy} aria-describedby={`${id}-message`} required
          onChange={(event) => { setPhone(event.target.value); if (wait?.action === "send") saveWait(null); setError(""); }} />
      </div>
      <label className={styles.consent}><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} disabled={busy} />
        <span>{recovery ? "同意关联原账号并接收验证码" : "同意接收本次验证码"} · <Link href="/privacy" target="_blank" rel="noreferrer">隐私说明</Link></span>
      </label>
      <button className={styles.primary} type="submit" disabled={busy || sendBlocked || !phone.trim() || !consent}>{busy ? "正在发送…" : sendBlocked ? phoneWaitLabel(waitSeconds) : "获取验证码"}</button>
      {purpose === "login" && <div className={styles.accountHelp}>
        <span>未注册将创建账号</span><Link href="/login?method=email&redirect=%2Faccount%2Fphone%3Frecover%3D1">找回原工作区</Link>
      </div>}
      {recovery && <details className={styles.details}><summary>关联说明</summary><p>验证后，此号码用于登录当前原账号；仅限没有资料和付费额度的手机号账号，不合并或移动简历、作答和余额。</p></details>}
    </form>}
    <div id={`${id}-message`} aria-live="polite" aria-atomic="true">{waitSeconds > 0 && wait && <div className={styles.wait}>
      <p>{wait.reason === "daily" || wait.reason === "service" ? `${wait.reason === "daily" ? "今日验证码次数" : "今日短信服务额度"}已用完，${purpose === "login" ? "可用其他方式登录" : "请等待恢复后继续绑定"}。` : wait.reason === "provider" ? "短信服务暂时限流，请等候后重试。" : "操作较频繁，请等候后重试。"}</p>
      <p className={styles.hint}>可重试时间：{new Date(wait.until).toLocaleString("zh-CN",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit",hour12:false})}</p>
    </div>}{error && <>
      <p className={styles.error}>{error}</p>
      {enabled && recoverStatus && <button className={styles.textButton} type="button" disabled={busy} onClick={() => void readStatus()}>查看短信状态</button>}
    </>}</div>
  </div>;
}
