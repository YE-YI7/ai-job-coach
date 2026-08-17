"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/useAuth';

export default function RedeemPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  useAuth();

  const handleRedeem = async () => {
    if (!code.trim()) return;
    setIsLoading(true);
    setResult(null);

    try {
      const res = await fetch('/api/quota/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json();
      setResult({
        ok: data.ok,
        message: data.ok ? '额度已加入账号' : (data.error || '兑换失败'),
      });
      if (data.ok) setCode('');
    } catch {
      setResult({ ok: false, message: '网络错误' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <style jsx global>{`
        body {
          font-family: 'Inter', 'Noto Sans SC', -apple-system, sans-serif;
          background: linear-gradient(135deg, #fffbeb 0%, #fff7ed 50%, #fef2f2 100%);
        }
      `}</style>

      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-md">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <button
              onClick={() => router.back()}
              className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              返回
            </button>
          </div>

          <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-slate-200/60 p-8 shadow-sm text-center">
            <div className="text-4xl mb-4">🎁</div>
            <h1 className="text-xl font-bold text-slate-800 mb-2">内测额度兑换</h1>
            <p className="text-sm text-slate-500 mb-6">输入内测或活动兑换码，额度会立即加入账号</p>

            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="请输入兑换码"
              className="w-full px-4 py-3.5 border border-slate-300 rounded-xl text-center font-mono text-lg tracking-widest focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 transition-all mb-4"
              disabled={isLoading}
            />

            {result && (
              <div className={`mb-4 p-3 rounded-xl text-sm font-medium ${
                result.ok
                  ? 'bg-green-50 text-green-600 border border-green-200'
                  : 'bg-red-50 text-red-600 border border-red-200'
              }`}>
                {result.message}
              </div>
            )}

            <button
              onClick={handleRedeem}
              disabled={isLoading || !code.trim()}
              className="w-full py-3.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold rounded-xl text-sm hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? '兑换中...' : '立即兑换'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
