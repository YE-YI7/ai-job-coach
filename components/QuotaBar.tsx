"use client";

import { useState, useEffect } from 'react';

interface QuotaData {
  free_chat_daily: number;
  free_resume_daily: number;
  paid_chat_remaining: number;
  paid_resume_remaining: number;
  paid_interview_remaining: number;
}

interface QuotaBarProps {
  onUpgradeClick?: () => void;
}

export default function QuotaBar({ onUpgradeClick }: QuotaBarProps) {
  const [quota, setQuota] = useState<QuotaData | null>(null);

  useEffect(() => {
    fetchQuota();
  }, []);

  const fetchQuota = async () => {
    try {
      const res = await fetch('/api/quota/check');
      const data = await res.json();
      if (data.ok) {
        setQuota(data.quota);
      }
    } catch {
      // 静默失败
    }
  };

  if (!quota) return null;

  const totalChat = quota.free_chat_daily + quota.paid_chat_remaining;
  const isLow = totalChat <= 1 && quota.paid_chat_remaining === 0;

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
      isLow 
        ? 'bg-orange-50 text-orange-600 border border-orange-200' 
        : 'bg-slate-50 text-slate-500 border border-slate-200'
    }`}>
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
      <span>
        今日剩余 {quota.free_chat_daily} 次
        {quota.paid_chat_remaining > 0 && (
          <span className="text-blue-500"> + {quota.paid_chat_remaining} 次付费</span>
        )}
      </span>
      {isLow && onUpgradeClick && (
        <button
          onClick={onUpgradeClick}
          className="ml-1 text-orange-600 hover:text-orange-700 underline underline-offset-2 font-semibold transition-colors"
        >
          获取更多
        </button>
      )}
    </div>
  );
}
