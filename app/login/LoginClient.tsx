"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { normalizeRedirectPath, postLoginTarget } from "@/lib/auth-redirect";
import PhoneAuthForm from "@/components/auth/PhoneAuthForm";
import styles from "./LoginClient.module.css";

type Step = 'email' | 'code';

function LoginContent({ phoneEnabled }: { phoneEnabled: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState<Step>('email');
  const [method, setMethod] = useState<'phone' | 'email'>(phoneEnabled && searchParams.get('method') !== 'email' ? 'phone' : 'email');
  const [hydrated, setHydrated] = useState(false);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const codeInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  useEffect(() => { setHydrated(true); }, []);
  const redirectTarget = normalizeRedirectPath(searchParams.get("redirect"));
  const loginQuery = new URLSearchParams();
  if (redirectTarget) loginQuery.set("redirect", redirectTarget);
  if (searchParams.get("method") === "email") loginQuery.set("method", "email");
  const loginBaseUrl = loginQuery.size ? `/login?${loginQuery}` : "/login";
  const watchaAuthorizeHref = redirectTarget
    ? `/api/auth/watcha/authorize?redirect=${encodeURIComponent(redirectTarget)}`
    : "/api/auth/watcha/authorize";

  const getPostLoginTarget = () => postLoginTarget(redirectTarget);

  // 从 URL 读取 OAuth 错误信息
  useEffect(() => {
    const oauthError = searchParams.get("error");
    if (oauthError) {
      setError(decodeURIComponent(oauthError));
      // 清除 URL 中的 error 参数，但保留 redirect
      router.replace(loginBaseUrl);
    }
  }, [searchParams, router, loginBaseUrl]);

  // 倒计时
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  // 进入验证码步骤时自动聚焦第一个输入框
  useEffect(() => {
    if (step === 'code') {
      setTimeout(() => codeInputRefs.current[0]?.focus(), 100);
    }
  }, [step]);

  const shakeCard = () => {
    if (!cardRef.current) return;
    cardRef.current.style.transform = 'translateX(5px)';
    setTimeout(() => { if (cardRef.current) cardRef.current.style.transform = 'translateX(-5px)'; }, 50);
    setTimeout(() => { if (cardRef.current) cardRef.current.style.transform = 'translateX(5px)'; }, 100);
    setTimeout(() => { if (cardRef.current) cardRef.current.style.transform = 'translateX(0)'; }, 150);
  };

  // 判断输入是否为邮箱
  const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  // 邀请码直接登录
  const handleInviteCodeLogin = async (inviteCode: string) => {
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: `${inviteCode}@invite.local`, code: inviteCode }),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "登录失败");
      }

      if (data.userId) {
        localStorage.setItem("sessionId", data.userId);
      }
      localStorage.setItem("inviteCode", inviteCode);

      router.push(getPostLoginTarget());
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
      shakeCard();
    } finally {
      setIsLoading(false);
    }
  };

  // 发送验证码（或邀请码直接登录）
  const handleSendCode = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError("");

    const trimmed = email.trim();
    if (!trimmed) {
      setError("请输入邮箱或邀请码");
      shakeCard();
      return;
    }

    // 如果不是邮箱格式，当作邀请码直接登录
    if (!isEmail(trimmed)) {
      await handleInviteCodeLogin(trimmed);
      return;
    }

    // 邮箱流程：发送验证码
    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "发送失败");
      }

      setStep('code');
      setCountdown(60);
      setCode(["", "", "", "", "", ""]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "发送失败，请稍后重试");
      shakeCard();
    } finally {
      setIsLoading(false);
    }
  };

  // 验证码输入处理（同时支持粘贴邀请码）
  const handleCodeInput = (index: number, value: string) => {
    const newCode = [...code];

    // 处理粘贴：如果粘贴的内容包含字母，视为邀请码直接提交
    if (value.length > 1) {
      const trimmed = value.trim();
      if (/[A-Za-z]/.test(trimmed)) {
        // 包含字母 → 邀请码，直接提交
        setTimeout(() => handleVerifyCode(trimmed), 100);
        return;
      }
      // 纯数字粘贴，填入6格
      const digits = trimmed.replace(/\D/g, '').slice(0, 6).split('');
      digits.forEach((d, i) => {
        if (i < 6) newCode[i] = d;
      });
      setCode(newCode);
      const nextIndex = Math.min(digits.length, 5);
      codeInputRefs.current[nextIndex]?.focus();

      if (digits.length === 6) {
        setTimeout(() => handleVerifyCode(newCode.join('')), 100);
      }
      return;
    }

    // 单字符输入，只允许数字
    if (!/^\d*$/.test(value)) return;

    newCode[index] = value;
    setCode(newCode);

    // 自动跳到下一个
    if (value && index < 5) {
      codeInputRefs.current[index + 1]?.focus();
    }

    // 自动提交
    const fullCode = newCode.join('');
    if (fullCode.length === 6 && newCode.every(d => d !== '')) {
      setTimeout(() => handleVerifyCode(fullCode), 100);
    }
  };

  const handleCodeKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      codeInputRefs.current[index - 1]?.focus();
    }
  };

  // 验证验证码或邀请码
  const handleVerifyCode = async (fullCode?: string) => {
    setError("");
    const codeStr = fullCode || code.join('');

    if (codeStr.length < 6) {
      setError("请输入完整的验证码");
      shakeCard();
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), code: codeStr }),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "验证失败");
      }

      // 保存到 localStorage（向后兼容）
      if (data.userId) {
        localStorage.setItem("sessionId", data.userId);
      }
      localStorage.setItem("userEmail", email.trim());

      router.push(getPostLoginTarget());
    } catch (err) {
      setError(err instanceof Error ? err.message : "验证失败");
      shakeCard();
      setCode(["", "", "", "", "", ""]);
      codeInputRefs.current[0]?.focus();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <div className={styles.page}>
        <div className={styles.atmosphere} aria-hidden="true" />

        <div ref={cardRef} className={styles.card}>
          <div className={styles.brand}>
            <div className={styles.logo}>
              <img src="/logo.png" alt="益职 AI Logo" />
            </div>
            <h1 className={styles.title}>益职 AI</h1>
            <p className={styles.subtitle}>
              {method === 'phone' ? '登录，继续你的求职准备' : step === 'email' ? '邮箱登录或使用邀请码' : '验证码已发送至您的邮箱'}
            </p>
          </div>

          {phoneEnabled && step === 'email' && <div className={styles.methods} aria-label="登录方式">
            <button type="button" disabled={!hydrated} aria-pressed={method === 'phone'} onClick={() => { setMethod('phone'); setError(''); }}>手机号登录</button>
            <button type="button" disabled={!hydrated} aria-pressed={method === 'email'} onClick={() => { setMethod('email'); setError(''); }}>邮箱 / 邀请码</button>
          </div>}

          {method === 'phone' && <>
            {error && <p role="alert" className={styles.error} style={{ marginBottom: 16 }}>{error}</p>}
            <PhoneAuthForm purpose="login" onSuccess={(data) => {
              localStorage.setItem('sessionId', data.userId);
              localStorage.removeItem('userEmail');
              localStorage.removeItem('inviteCode');
              router.replace(getPostLoginTarget());
              router.refresh();
            }} />
          </>}

          {method === 'email' && step === 'email' && (
            <form onSubmit={handleSendCode} className={styles.stack}>
              <div className={styles.field}>
                {isEmail(email) || !email ? (
                  <svg className={styles.fieldIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                ) : (
                  <svg className={styles.fieldIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                )}
                <input
                  type="text"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={styles.input}
                  placeholder="邮箱地址或邀请码"
                  autoComplete="email"
                  disabled={isLoading}
                  autoFocus
                />
              </div>

              {error && <p className={styles.error}>{error}</p>}

              <button type="submit" disabled={isLoading || !email.trim()} className={styles.primary}>
                {isLoading ? (
                  <span className={styles.spinner} aria-hidden="true" />
                ) : (
                  <>
                    <span>{isEmail(email.trim()) ? '获取验证码' : '登录'}</span>
                    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </>
                )}
              </button>
            </form>
          )}

          {step === 'email' && (
            <div>
              <div className={styles.dividerRow}><span className={styles.divider} /><span className={styles.dividerText}>或</span><span className={styles.divider} /></div>
              <a href={watchaAuthorizeHref} className={styles.oauth}>
                <img src="https://watcha.tos-cn-beijing.volces.com/products/logo/1752064513_guan-cha-insights.png" alt="" />
                <span>观猹账号登录</span>
              </a>
            </div>
          )}

          {step === 'code' && (
            <div className={styles.stack}>
              <div className={styles.emailLine}>
                <span>{email}</span>
                <button type="button" onClick={() => { setStep('email'); setError(''); setCode(["","","","","",""]); }} className={styles.edit}>修改</button>
              </div>

              <div className={styles.codeRow}>
                {code.map((digit, index) => (
                  <input
                    key={index}
                    ref={(el) => { codeInputRefs.current[index] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={digit}
                    onChange={(e) => handleCodeInput(index, e.target.value)}
                    onKeyDown={(e) => handleCodeKeyDown(index, e)}
                    className={styles.code}
                    aria-label={`验证码第 ${index + 1} 位`}
                    disabled={isLoading}
                  />
                ))}
              </div>

              {error && <p className={styles.error} style={{ textAlign: 'center' }}>{error}</p>}

              <div className={styles.stack}>
                <button type="button" onClick={() => handleVerifyCode()} disabled={isLoading || code.some(d => d === '')} className={styles.primary}>
                  {isLoading ? <span className={styles.spinner} aria-hidden="true" /> : <span>验证并登录</span>}
                </button>

                <button type="button" onClick={() => handleSendCode()} disabled={countdown > 0 || isLoading} className={styles.quiet}>
                  {countdown > 0 ? `${countdown}秒后可重新发送` : '重新发送验证码'}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className={styles.footer}>&copy; 2026 益职AI. 版权所有.</div>
      </div>
    </>
  );
}

function LoginRoute({ phoneEnabled }: { phoneEnabled: boolean }) {
  const params = useSearchParams();
  // Same-route recovery navigation must not retain the previous phone tab.
  return <LoginContent key={params.get("method") === "email" ? "email" : "default"} phoneEnabled={phoneEnabled} />;
}

export default function LoginClient({ phoneEnabled }: { phoneEnabled: boolean }) {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <LoginRoute phoneEnabled={phoneEnabled} />
    </Suspense>
  );
}
