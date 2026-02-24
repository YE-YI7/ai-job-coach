"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/useAuth';

interface QuotaData {
  free_chat_daily: number;
  free_resume_daily: number;
  paid_chat_remaining: number;
  paid_resume_remaining: number;
  paid_interview_remaining: number;
}

interface ReferralInfo {
  referralCode: string;
  referralLink: string;
  totalInvited: number;
  totalRewarded: number;
  rewardPerInvite: number;
}

export default function ProfilePage() {
  const router = useRouter();
  const [quota, setQuota] = useState<QuotaData | null>(null);
  const [referral, setReferral] = useState<ReferralInfo | null>(null);
  const [email, setEmail] = useState('');
  const [copied, setCopied] = useState(false);

  useAuth();

  useEffect(() => {
    setEmail(localStorage.getItem('userEmail') || '');
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [quotaRes, referralRes] = await Promise.all([
        fetch('/api/quota/check'),
        fetch('/api/referral/info'),
      ]);
      const quotaData = await quotaRes.json();
      const referralData = await referralRes.json();

      if (quotaData.ok) setQuota(quotaData.quota);
      if (referralData.ok) setReferral(referralData);
    } catch {}
  };

  const handleCopyCode = async () => {
    if (!referral) return;
    try {
      await navigator.clipboard.writeText(referral.referralCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = referral.referralCode;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleLogout = () => {
    document.cookie = 'sb-access-token=; path=/; max-age=0';
    document.cookie = 'sb-session-user-id=; path=/; max-age=0';
    localStorage.removeItem('sessionId');
    localStorage.removeItem('inviteCode');
    localStorage.removeItem('userEmail');
    router.push('/login');
  };

  return (
    <>
      <style jsx global>{`
        body {
          font-family: 'Inter', 'Noto Sans SC', -apple-system, sans-serif;
          background: linear-gradient(135deg, #fffbeb 0%, #fff7ed 50%, #fef2f2 100%);
        }
      `}</style>

      <div className="min-h-screen p-6">
        <div className="max-w-lg mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => router.back()}
              className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              返回
            </button>
            <h1 className="text-lg font-bold text-slate-800">个人中心</h1>
            <div className="w-16" />
          </div>

          {/* Profile Card */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-slate-200/60 p-6 shadow-sm">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center text-white text-xl font-bold shadow-md">
                {email ? email[0].toUpperCase() : 'U'}
              </div>
              <div>
                <div className="font-bold text-slate-800">{email || '用户'}</div>
                <div className="text-xs text-slate-500">益职AI用户</div>
              </div>
            </div>
          </div>

          {/* Quota Card */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-slate-200/60 p-6 shadow-sm">
            <h2 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
              <svg className="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              我的额度
            </h2>

            {quota ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-blue-50 rounded-xl p-3 text-center">
                  <div className="text-2xl font-bold text-blue-600">{quota.free_chat_daily}</div>
                  <div className="text-[10px] text-slate-500 mt-1">今日免费对话</div>
                </div>
                <div className="bg-orange-50 rounded-xl p-3 text-center">
                  <div className="text-2xl font-bold text-orange-600">{quota.paid_chat_remaining}</div>
                  <div className="text-[10px] text-slate-500 mt-1">付费对话余量</div>
                </div>
                <div className="bg-green-50 rounded-xl p-3 text-center">
                  <div className="text-2xl font-bold text-green-600">{quota.free_resume_daily}</div>
                  <div className="text-[10px] text-slate-500 mt-1">今日免费简历评分</div>
                </div>
                <div className="bg-purple-50 rounded-xl p-3 text-center">
                  <div className="text-2xl font-bold text-purple-600">{quota.paid_interview_remaining}</div>
                  <div className="text-[10px] text-slate-500 mt-1">付费面试余量</div>
                </div>
              </div>
            ) : (
              <div className="text-center text-slate-400 text-sm py-4">加载中...</div>
            )}
          </div>

          {/* Referral Card */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-slate-200/60 p-6 shadow-sm">
            <h2 className="font-bold text-slate-800 mb-2 flex items-center gap-2">
              <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              邀请好友
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              邀请1位好友注册，双方各得{referral?.rewardPerInvite || 3}次额外AI对话
            </p>

            {referral && (
              <>
                <div className="flex items-center gap-2 mb-4">
                  <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-mono text-sm tracking-wider text-slate-700 text-center">
                    {referral.referralCode}
                  </div>
                  <button
                    onClick={handleCopyCode}
                    className={`px-4 py-3 rounded-xl font-medium text-sm transition-all ${
                      copied
                        ? 'bg-green-500 text-white'
                        : 'bg-orange-500 hover:bg-orange-600 text-white'
                    }`}
                  >
                    {copied ? '已复制' : '复制'}
                  </button>
                </div>

                <div className="flex items-center gap-4 text-center">
                  <div className="flex-1 bg-amber-50 rounded-xl p-3">
                    <div className="text-lg font-bold text-amber-600">{referral.totalInvited}</div>
                    <div className="text-[10px] text-slate-500">已邀请</div>
                  </div>
                  <div className="flex-1 bg-green-50 rounded-xl p-3">
                    <div className="text-lg font-bold text-green-600">{referral.totalRewarded * (referral.rewardPerInvite || 3)}</div>
                    <div className="text-[10px] text-slate-500">获得奖励</div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <button
              onClick={() => router.push('/redeem')}
              className="w-full py-3.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold rounded-xl text-sm hover:shadow-lg transition-all"
            >
              兑换码充值
            </button>
            <button
              onClick={handleLogout}
              className="w-full py-3 bg-white/60 backdrop-blur-sm border border-slate-200 text-slate-600 font-medium rounded-xl text-sm hover:bg-white/80 transition-all"
            >
              退出登录
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
