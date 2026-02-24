"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

type Step = 'email' | 'code';

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState("");
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const codeInputRefs = useRef<(HTMLInputElement | null)[]>([]);

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

  // 发送验证码
  const handleSendCode = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError("");

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError("请输入邮箱地址");
      shakeCard();
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      setError("请输入正确的邮箱地址");
      shakeCard();
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail }),
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

      // 新用户去 onboarding，老用户去 chat
      if (data.isNewUser) {
        router.push("/onboarding");
      } else {
        router.push("/chat");
      }
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
              {step === 'email' ? '您的私人求职导师正在等候' : '验证码已发送至您的邮箱'}
            </p>
          </div>

          {/* Step: Email Input */}
          {step === 'email' && (
            <form onSubmit={handleSendCode} className="space-y-5 animate-slide-up">
              <div className="group">
                <div className="input-field rounded-xl flex items-center px-4 py-4">
                  <svg className="w-4 h-4 text-slate-400 mr-3 shrink-0 group-focus-within:text-orange-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="bg-transparent border-none outline-none text-slate-800 text-base w-full font-medium placeholder:text-slate-400"
                    placeholder="请输入您的邮箱地址"
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
                    <span className="tracking-wide">获取验证码</span>
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
