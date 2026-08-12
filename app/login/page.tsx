"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { normalizeRedirectPath } from "@/lib/auth-redirect";

type Step = 'email' | 'code';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState("");
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const codeInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const redirectTarget = normalizeRedirectPath(searchParams.get("redirect"));
  const loginBaseUrl = redirectTarget ? `/login?redirect=${encodeURIComponent(redirectTarget)}` : "/login";
  const watchaAuthorizeHref = redirectTarget
    ? `/api/auth/watcha/authorize?redirect=${encodeURIComponent(redirectTarget)}`
    : "/api/auth/watcha/authorize";

  const getPostLoginTarget = (isNewUser: boolean) => {
    if (!isNewUser) {
      return redirectTarget || "/chat";
    }

    if (redirectTarget?.startsWith("/resume-score")) {
      return redirectTarget;
    }

    return redirectTarget
      ? `/onboarding?redirect=${encodeURIComponent(redirectTarget)}`
      : "/onboarding";
  };

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

      router.push(getPostLoginTarget(data.isNewUser));
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

      router.push(getPostLoginTarget(data.isNewUser));
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
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Noto+Sans+SC:wght@300;400;500;700&display=swap');
        
        body {
          font-family: 'Inter', 'Noto Sans SC', sans-serif;
          background-color: #fffbeb;
          overflow: hidden;
        }

        .gradient-bg-container {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          overflow: hidden;
          background: linear-gradient(40deg, #fffbeb, #fff7ed);
          z-index: 0;
        }

        .svg-filter {
          position: absolute;
          width: 0;
          height: 0;
        }

        .gradients-container {
          width: 100%;
          height: 100%;
          filter: url(#goo) blur(40px);
        }

        .g-blob {
          position: absolute;
          top: 50%;
          left: 50%;
          width: var(--size);
          height: var(--size);
          background: radial-gradient(circle at center, var(--color) 0%, rgba(255,255,255,0) 50%);
          mix-blend-mode: var(--blending);
          transform-origin: center center;
          opacity: 1;
          will-change: transform, opacity;
        }

        :root {
          --size: 800px;
          --blending: hard-light;
          --color1: 255, 107, 74;
          --color2: 251, 146, 60;
          --color3: 251, 113, 133;
          --color4: 244, 114, 182;
          --color5: 254, 202, 202;
        }

        @keyframes moveVertical {
          0% { transform: translateY(-50%) translateX(-50%); }
          50% { transform: translateY(-40%) translateX(-50%); }
          100% { transform: translateY(-50%) translateX(-50%); }
        }

        @keyframes moveInCircle {
          0% { transform: rotate(0deg) translateX(100px) rotate(0deg); }
          100% { transform: rotate(360deg) translateX(100px) rotate(-360deg); }
        }

        @keyframes moveHorizontal {
          0% { transform: translateX(-50%) translateY(-10%); }
          50% { transform: translateX(50%) translateY(10%); }
          100% { transform: translateX(-50%) translateY(-10%); }
        }

        .g1 {
          --color: rgba(var(--color1), 0.8);
          top: calc(50% - var(--size)/2);
          left: calc(50% - var(--size)/2);
          animation: moveVertical 18s ease infinite;
        }

        .g2 {
          --color: rgba(var(--color2), 0.8);
          top: calc(50% - var(--size)/2);
          left: calc(50% - var(--size)/2);
          transform-origin: calc(50% - 400px);
          animation: moveInCircle 12s reverse infinite;
        }

        .g3 {
          --color: rgba(var(--color3), 0.8);
          top: calc(50% - var(--size)/2 + 200px);
          left: calc(50% - var(--size)/2 - 500px);
          transform-origin: calc(50% + 400px);
          animation: moveInCircle 24s linear infinite;
        }

        .g4 {
          --color: rgba(var(--color4), 0.8);
          top: calc(50% - var(--size)/2);
          left: calc(50% - var(--size)/2);
          transform-origin: calc(50% - 200px);
          animation: moveHorizontal 24s ease infinite;
          opacity: 0.7;
        }

        .g5 {
          --color: rgba(var(--color5), 0.8);
          width: calc(var(--size) * 2);
          height: calc(var(--size) * 2);
          top: calc(50% - var(--size));
          left: calc(50% - var(--size));
          transform-origin: calc(50% - 800px) calc(50% + 800px);
          animation: moveInCircle 12s ease infinite;
        }

        .glass-card {
          background: rgba(255, 255, 255, 0.25);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border: 1px solid rgba(255, 255, 255, 0.6);
          box-shadow: 
            0 20px 50px -12px rgba(0, 0, 0, 0.1),
            inset 0 0 0 1px rgba(255, 255, 255, 0.5);
        }

        .input-field {
          background: rgba(255, 255, 255, 0.6);
          border: 1px solid rgba(209, 213, 219, 0.5);
          transition: all 0.3s ease;
        }

        .input-field:focus-within {
          border-color: #f97316;
          background: rgba(255, 255, 255, 0.9);
          box-shadow: 0 0 0 4px rgba(249, 115, 22, 0.1);
        }

        .glow-button {
          background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
          box-shadow: 0 4px 15px rgba(249, 115, 22, 0.3);
          transition: all 0.3s ease;
        }

        .glow-button:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 8px 25px rgba(249, 115, 22, 0.4);
          filter: brightness(1.05);
        }

        .glow-button:active:not(:disabled) {
          transform: translateY(1px);
          box-shadow: 0 2px 10px rgba(249, 115, 22, 0.2);
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .animate-fade-in {
          animation: fadeIn 0.8s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }

        @keyframes slideUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .animate-slide-up {
          animation: slideUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }

        .code-input {
          background: rgba(255, 255, 255, 0.7);
          border: 1.5px solid rgba(209, 213, 219, 0.5);
          transition: all 0.2s ease;
          caret-color: #f97316;
        }

        .code-input:focus {
          border-color: #f97316;
          background: rgba(255, 255, 255, 0.95);
          box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.12);
        }

        .loading-spinner {
          width: 20px;
          height: 20px;
          border: 2px solid rgba(255,255,255,0.3);
          border-radius: 50%;
          border-top-color: #fff;
          animation: spin 1s ease-in-out infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      <div className="min-h-screen w-full flex flex-col items-center justify-center text-slate-800 overflow-hidden relative">
        {/* Dynamic Gradient Background */}
        <div className="gradient-bg-container">
          <svg className="svg-filter">
            <defs>
              <filter id="goo">
                <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur" />
                <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -8" result="goo" />
                <feBlend in="SourceGraphic" in2="goo" />
              </filter>
            </defs>
          </svg>
          <div className="gradients-container">
            <div className="g-blob g1"></div>
            <div className="g-blob g2"></div>
            <div className="g-blob g3"></div>
            <div className="g-blob g4"></div>
            <div className="g-blob g5"></div>
          </div>
        </div>

        {/* Login Card */}
        <div 
          ref={cardRef}
          className="w-full max-w-[420px] p-10 rounded-3xl glass-card animate-fade-in z-10 relative"
        >
          {/* Logo & Title */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 mb-4">
              <img src="/logo.png" alt="益职 AI Logo" className="w-full h-full object-contain rounded-2xl" />
            </div>
            <h1 className="text-3xl font-extrabold text-slate-800 mb-2 tracking-tight">益职 AI</h1>
            <p className="text-slate-500 text-sm font-medium">
              {step === 'email' ? '邮箱登录或使用邀请码' : '验证码已发送至您的邮箱'}
            </p>
          </div>

          {/* Step: Email Input */}
          {step === 'email' && (
            <form onSubmit={handleSendCode} className="space-y-5 animate-slide-up">
              <div className="group">
                <div className="input-field rounded-xl flex items-center px-4 py-4">
                  {isEmail(email) || !email ? (
                    <svg className="w-4 h-4 text-slate-400 mr-3 shrink-0 group-focus-within:text-orange-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 text-slate-400 mr-3 shrink-0 group-focus-within:text-orange-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                    </svg>
                  )}
                  <input
                    type="text"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="bg-transparent border-none outline-none text-slate-800 text-base w-full font-medium placeholder:text-slate-400"
                    placeholder="邮箱地址或邀请码"
                    autoComplete="email"
                    disabled={isLoading}
                    autoFocus
                  />
                </div>
              </div>

              {error && (
                <div className="p-3 bg-red-50/80 backdrop-blur-sm border border-red-200/50 rounded-xl">
                  <p className="text-sm text-red-600 font-medium">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading || !email.trim()}
                className="w-full glow-button text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 group relative overflow-hidden text-base shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <div className="loading-spinner"></div>
                ) : (
                  <>
                    <span className="tracking-wide">{isEmail(email.trim()) ? '获取验证码' : '登录'}</span>
                    <svg 
                      className="w-4 h-4 opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all duration-300"
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </>
                )}
              </button>
            </form>
          )}

          {/* OAuth 第三方登录 */}
          {step === 'email' && (
            <div className="mt-4 animate-slide-up" style={{ animationDelay: '0.1s' }}>
              {/* 分割线 */}
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 h-px bg-slate-300/40"></div>
                <span className="text-xs text-slate-400 font-medium">或</span>
                <div className="flex-1 h-px bg-slate-300/40"></div>
              </div>

              {/* 观猹登录按钮 */}
              <a
                href={watchaAuthorizeHref}
                className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl border border-slate-200/60 bg-white/50 hover:bg-white/80 hover:border-slate-300/60 transition-all duration-200 group"
              >
                <img
                  src="https://watcha.tos-cn-beijing.volces.com/products/logo/1752064513_guan-cha-insights.png"
                  alt="观猹"
                  className="w-5 h-5 rounded object-contain"
                />
                <span className="text-sm font-semibold text-slate-600 group-hover:text-slate-800 transition-colors">
                  观猹账号登录
                </span>
              </a>
            </div>
          )}

          {/* Step: Code Input */}
          {step === 'code' && (
            <div className="space-y-5 animate-slide-up">
              {/* Email display */}
              <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
                <span>{email}</span>
                <button 
                  onClick={() => { setStep('email'); setError(''); setCode(["","","","","",""]); }}
                  className="text-orange-500 hover:text-orange-600 font-medium transition-colors"
                >
                  修改
                </button>
              </div>

              {/* 6-digit code input */}
              <div className="flex justify-center gap-2.5">
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
                    className="code-input w-12 h-14 text-center text-xl font-bold text-slate-800 rounded-xl outline-none"
                    disabled={isLoading}
                  />
                ))}
              </div>

              {error && (
                <div className="p-3 bg-red-50/80 backdrop-blur-sm border border-red-200/50 rounded-xl">
                  <p className="text-sm text-red-600 font-medium text-center">{error}</p>
                </div>
              )}

              {/* Resend & Submit */}
              <div className="space-y-3">
                <button
                  onClick={() => handleVerifyCode()}
                  disabled={isLoading || code.some(d => d === '')}
                  className="w-full glow-button text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 text-base shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <div className="loading-spinner"></div>
                  ) : (
                    <span className="tracking-wide">验证并登录</span>
                  )}
                </button>

                <button
                  onClick={() => handleSendCode()}
                  disabled={countdown > 0 || isLoading}
                  className="w-full text-sm font-medium text-slate-500 hover:text-orange-500 transition-colors py-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {countdown > 0 ? `${countdown}秒后可重新发送` : '重新发送验证码'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="absolute bottom-8 text-slate-400/60 text-xs font-medium tracking-wider z-10">
          &copy; 2026 益职AI. 版权所有.
        </div>
      </div>
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <LoginContent />
    </Suspense>
  );
}
