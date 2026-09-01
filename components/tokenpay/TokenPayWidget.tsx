"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, CheckCircle2, CircleDollarSign, LoaderCircle, RefreshCw, ShieldCheck, WalletCards, X } from "lucide-react";
import styles from "./TokenPayWidget.module.css";

type TokenPayAccount = {
  connected: boolean;
  status?: "active" | "reauthorize";
  keyFingerprint?: string;
  connectedAt?: string;
  checkedAt?: string | null;
  balance?: { credits: number; creditsUsed: number; available: number; unit: "CNY" } | null;
};

type PaymentSession = {
  id: string;
  amount: number;
  status: "pending" | "paid" | "failed" | "closed" | "refunded";
  payment_url: string;
  expired_at: number;
  paid_at?: number;
};

const amountOptions = [10, 30, 50, 100];
let accountCache: TokenPayAccount | null = null;
let accountRequest: Promise<TokenPayAccount> | null = null;

async function fetchAccount(force = false) {
  if (!force && accountCache) return accountCache;
  if (accountRequest) return accountRequest;
  accountRequest = (async () => {
    const response = await fetch("/api/tokenpay/account", { cache: "no-store" });
    const result = await response.json();
    if (response.status === 401) return { connected: false } satisfies TokenPayAccount;
    if (!response.ok || !result.ok) throw new Error(result.error || "TokenPay 读取失败");
    return result.account as TokenPayAccount;
  })();
  try {
    accountCache = await accountRequest;
    return accountCache;
  } finally {
    accountRequest = null;
  }
}

function money(value: number | undefined) {
  return `¥${(value || 0).toFixed(2)}`;
}

export function TokenPayWidget({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [account, setAccount] = useState<TokenPayAccount | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [amount, setAmount] = useState(30);
  const [creatingPayment, setCreatingPayment] = useState(false);
  const [session, setSession] = useState<PaymentSession | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const loadAccount = useCallback(async (force = false) => {
    setLoading(true);
    setError("");
    try {
      setAccount(await fetchAccount(force));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "TokenPay 读取失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const status = new URL(window.location.href).searchParams.get("tokenpay");
    void loadAccount(status === "connected");
    if (!status) return;
    setOpen(true);
    if (status === "connected") setError("");
    else setError(status === "security_error" ? "授权安全校验失败，请重新连接" : "TokenPay 授权未完成，请重试");
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete("tokenpay");
    window.history.replaceState({}, "", `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
  }, [loadAccount]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!session || session.status !== "pending") return;
    const tick = async () => {
      if (Date.now() >= session.expired_at * 1000) {
        setSession((current) => current ? { ...current, status: "closed" } : current);
        return;
      }
      try {
        const response = await fetch(`/api/tokenpay/payment/sessions/${encodeURIComponent(session.id)}`, { cache: "no-store" });
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.error || "支付状态读取失败");
        setSession(result.session);
        if (result.session.status === "paid") await loadAccount(true);
      } catch (pollError) {
        setError(pollError instanceof Error ? pollError.message : "支付状态读取失败");
      }
    };
    const timer = window.setInterval(() => void tick(), 3_000);
    return () => window.clearInterval(timer);
  }, [loadAccount, session]);

  const createPayment = async () => {
    if (!Number.isInteger(amount) || amount < 1 || amount > 100_000) {
      setError("充值金额必须是 1 到 100000 元的整数");
      return;
    }
    setCreatingPayment(true);
    setError("");
    try {
      const response = await fetch("/api/tokenpay/payment/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "充值会话创建失败");
      setSession(result.session);
      window.open(result.session.payment_url, "_blank", "noopener,noreferrer");
    } catch (paymentError) {
      setError(paymentError instanceof Error ? paymentError.message : "充值会话创建失败");
    } finally {
      setCreatingPayment(false);
    }
  };

  const disconnect = async () => {
    if (!window.confirm("断开后，益职将不再使用这把 TokenPay API Key。确定断开吗？")) return;
    const response = await fetch("/api/tokenpay/account", { method: "DELETE" });
    if (!response.ok) return setError("断开失败，请重试");
    accountCache = { connected: false };
    setAccount(accountCache);
    setSession(null);
  };

  const isConnected = Boolean(account?.connected && account.status === "active");
  const buttonLabel = loading && !account
    ? "TokenPay"
    : isConnected
      ? money(account?.balance?.available)
      : account?.status === "reauthorize"
        ? "重新连接"
        : "连接 TokenPay";

  return (
    <>
      <button className={`${styles.trigger} ${compact ? styles.triggerCompact : ""}`} type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}>
        <WalletCards size={16} />
        <span><strong>TokenPay</strong><small>{buttonLabel}</small></span>
      </button>

      {open && <div className={styles.layer} role="presentation">
        <button className={styles.scrim} type="button" aria-label="关闭 TokenPay" onClick={() => setOpen(false)} />
        <section className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby="tokenpay-title">
          <header className={styles.sheetHeader}>
            <div>
              <span className={styles.tokenMark}><CircleDollarSign size={19} /></span>
              <div><h2 id="tokenpay-title">TokenPay</h2><p>AI 时代的支付宝</p></div>
            </div>
            <button ref={closeButtonRef} type="button" onClick={() => setOpen(false)} aria-label="关闭"><X size={20} /></button>
          </header>

          {loading && !account ? <div className={styles.loading}><LoaderCircle size={22} className={styles.spin} /><span>正在读取账户…</span></div> : !account?.connected ? (
            <div className={styles.connectState}>
              <h3>一次授权，完成模型配置和充值。</h3>
              <p>你会前往 TokenDance 确认 Key 名称、额度、周期和过期时间。益职只在服务端加密保存新 Key，完整 Key 不会进入浏览器。</p>
              <a href="/api/tokenpay/authorize">连接 TokenPay <ArrowUpRight size={16} /></a>
              <div><ShieldCheck size={16} /><span>使用 Authorization Code + S256 PKCE；可随时断开。</span></div>
            </div>
          ) : account.status === "reauthorize" ? (
            <div className={styles.connectState}>
              <h3>这把 Key 已失效。</h3>
              <p>它可能已被禁用、删除、过期或达到不刷新的总额度。重新授权会创建一把新 Key。</p>
              <a href="/api/tokenpay/authorize">重新连接 <ArrowUpRight size={16} /></a>
            </div>
          ) : (
            <div className={styles.accountBody}>
              <section className={styles.balanceBlock}>
                <div><span>可用余额</span><button type="button" onClick={() => void loadAccount(true)} disabled={loading} aria-label="刷新余额"><RefreshCw size={15} className={loading ? styles.spin : ""} /></button></div>
                <strong>{money(account.balance?.available)}</strong>
                <p>累计充值 {money(account.balance?.credits)} · 已使用 {money(account.balance?.creditsUsed)}</p>
              </section>

              {session ? <section className={styles.paymentState} data-status={session.status}>
                {session.status === "paid" ? <CheckCircle2 size={22} /> : <LoaderCircle size={22} className={session.status === "pending" ? styles.spin : ""} />}
                <div><strong>{session.status === "pending" ? `等待支付 ${money(session.amount)}` : session.status === "paid" ? "充值已到账" : "本次支付未完成"}</strong><span>{session.status === "pending" ? "支付完成后余额会自动刷新" : session.status === "paid" ? `已到账 ${money(session.amount)}` : "可以重新创建充值会话"}</span></div>
                {session.status === "pending" && <a href={session.payment_url} target="_blank" rel="noreferrer">打开付款页</a>}
                {session.status !== "pending" && <button type="button" onClick={() => setSession(null)}>返回充值</button>}
              </section> : <section className={styles.topUp}>
                <h3>账户充值</h3>
                <p>款项进入这把 API Key 所属的 TokenDance 账户。</p>
                <div className={styles.amountOptions}>{amountOptions.map((value) => <button type="button" key={value} aria-pressed={amount === value} onClick={() => setAmount(value)}>¥{value}</button>)}</div>
                <label><span>其他整数金额</span><div><span>¥</span><input type="number" min="1" max="100000" step="1" value={amount} onChange={(event) => setAmount(Number(event.target.value))} /></div></label>
                <button className={styles.payButton} type="button" disabled={creatingPayment} onClick={() => void createPayment()}>{creatingPayment ? "正在创建付款…" : `确认充值 ${money(amount)}`}</button>
                <small>点击后才创建付款会话；益职不会自动扣款。</small>
              </section>}

              <footer className={styles.connectionMeta}>
                <span>Key 指纹 {account.keyFingerprint || "—"}</span>
                <button type="button" onClick={() => void disconnect()}>断开连接</button>
              </footer>
            </div>
          )}
          {error && <p className={styles.error} role="alert">{error}</p>}
        </section>
      </div>}
    </>
  );
}
