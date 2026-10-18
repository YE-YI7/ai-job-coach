"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { normalizeMainlandPhone, type PhonePurpose } from "@/lib/phone-auth/identity";
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
  const [now, setNow] = useState(() => Date.now());
  const gate = useRef(false);
  const codeInput = useRef<HTMLInputElement>(null);
  const requestController = useRef<AbortController | null>(null);
  const remaining = pending ? Math.max(0, Math.ceil((Date.parse(pending.resendAt) - now) / 1000)) : 0;
  const expired = pending ? now >= Date.parse(pending.expiresAt) : false;

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
      setSignName(data.signName); setPending(data.pending); setError("");
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
    void readStatus(controller.signal);
    return () => { controller.abort(); requestController.current?.abort(); };
  }, [readStatus]);

  useEffect(() => {
    if (!pending) return;
    codeInput.current?.focus();
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [pending]);

  const request = async (action: "send" | "verify") => {
    if (gate.current) return;
    setError("");
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
        const retry = Number(response.headers.get("Retry-After"));
        if (retry > 0 && pending) setPending({ ...pending, resendAt: new Date(Date.now() + retry * 1000).toISOString() });
        throw new Error(data.error || "验证未完成，请重试。");
      }
      if (action === "send") { setPending(data); setSignName(data.signName); setCode(""); setNow(Date.now()); }
      else {
        setCode(""); setPending(null);
        if (purpose === "bind") setBound(data.boundPhone);
        onSuccess?.(data);
      }
    } catch (cause) {
      setError(cause instanceof TypeError || (cause as Error).name === "AbortError"
        ? "网络连接中断或等待超时。短信可能已发送；可刷新恢复验证，或稍后重试。" : (cause as Error).message);
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
      <p className={styles.hint}>短信署名为「{signName}」，5 分钟内有效。请勿转发验证码。</p>
      <label htmlFor={`${id}-code`}>短信验证码</label>
      <input ref={codeInput} id={`${id}-code`} type="text" inputMode="numeric" autoComplete="one-time-code"
        maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
        aria-describedby={`${id}-message`} disabled={busy} required pattern="[0-9]{6}" />
      {expired && <p className={styles.hint}>验证码已过期，请重新获取。</p>}
      <button className={styles.primary} disabled={busy || expired || code.length !== 6} type="submit">
        {busy ? "正在验证…" : pending.recovery ? "验证并关联原账号" : purpose === "bind" ? "验证并绑定当前账号" : "验证并登录"}
      </button>
      <div className={styles.actions}><button className={styles.textButton} disabled={busy} type="button"
        onClick={() => { setPending(null); setCode(""); }}>
        {remaining > 0 ? "换一个号码" : "重新获取 / 更换号码"}
      </button>{remaining > 0 && <span className={styles.hint}>{remaining} 秒后可重新获取</span>}</div>
    </form> : <form key="phone" onSubmit={(event) => { event.preventDefault(); void request("send"); }}>
      {recovery&&<p className={styles.hint}>验证后，此号码将用于登录当前原账号。只处理没有资料和付费额度的手机号账号，不合并或移动任何简历、作答和余额。</p>}
      <label htmlFor={`${id}-phone`}>手机号</label>
      <div className={styles.phoneInput}><span aria-hidden="true">+86</span>
        <input id={`${id}-phone`} aria-label="中国大陆手机号" type="tel" inputMode="tel" autoComplete="tel-national"
          placeholder="11 位手机号" maxLength={20} value={phone} onChange={(event) => setPhone(event.target.value)}
          disabled={busy} aria-describedby={`${id}-message`} required />
      </div>
      <label className={styles.consent}><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} disabled={busy} />
        <span>{recovery?'同意验证后将此号码关联到当前原账号，并接收本次验证码短信。':`接收本次${purpose === "bind" ? "绑定" : "登录"}验证码短信，不用于营销。`}</span>
      </label>
      <button className={styles.primary} type="submit" disabled={busy || !phone.trim() || !consent}>{busy ? "正在发送…" : "获取验证码"}</button>
      {purpose === "login" && <p className={styles.hint}>未注册的号码将创建账号。已有求职资料？<Link className={styles.returnLink} href="/login?method=email&redirect=%2Faccount%2Fphone%3Frecover%3D1">用原账号继续</Link>，再关联手机号。</p>}
      <p className={styles.privacy}>手机号用于账号验证，将发送至阿里云号码认证服务。<Link href="/privacy" target="_blank" rel="noreferrer">隐私说明</Link></p>
    </form>}
    <div id={`${id}-message`} aria-live="polite" aria-atomic="true">{error && <>
      <p className={styles.error}>{error}</p>
      {enabled && <button className={styles.textButton} type="button" disabled={busy} onClick={() => void readStatus()}>重新读取验证状态</button>}
    </>}</div>
  </div>;
}
