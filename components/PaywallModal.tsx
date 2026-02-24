"use client";

import { useState } from 'react';

interface PaywallModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PRODUCT_PACKS = [
  {
    id: 'interview_pack',
    name: '面试冲刺包',
    price: '¥39.9',
    desc: '10次AI模拟面试 + 详细评分报告',
    icon: '🎯',
    highlight: true,
    features: ['10次模拟面试', '每次详细评分', '个性化建议'],
  },
  {
    id: 'vip_monthly',
    name: '全流程VIP',
    price: '¥99/月',
    desc: '30天不限次数使用所有功能',
    icon: '👑',
    highlight: false,
    features: ['无限AI对话', '无限面试练习', '无限简历评分'],
  },
  {
    id: 'resume_pack',
    name: '简历急救包',
    price: '¥19.9',
    desc: '3次专业AI简历优化',
    icon: '📄',
    highlight: false,
    features: ['3次简历优化', '多维度评分', '针对性建议'],
  },
];

export default function PaywallModal({ isOpen, onClose }: PaywallModalProps) {
  const [redeemMode, setRedeemMode] = useState(false);
  const [redeemCode, setRedeemCode] = useState('');
  const [redeemLoading, setRedeemLoading] = useState(false);
  const [redeemResult, setRedeemResult] = useState<{ ok: boolean; message: string } | null>(null);

  if (!isOpen) return null;

  const handleRedeem = async () => {
    if (!redeemCode.trim()) return;
    setRedeemLoading(true);
    setRedeemResult(null);

    try {
      const res = await fetch('/api/quota/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: redeemCode.trim() }),
      });
      const data = await res.json();
      setRedeemResult({
        ok: data.ok,
        message: data.ok ? '兑换成功！额度已充值' : (data.error || '兑换失败'),
      });
      if (data.ok) {
        setRedeemCode('');
        setTimeout(() => onClose(), 2000);
      }
    } catch {
      setRedeemResult({ ok: false, message: '网络错误' });
    } finally {
      setRedeemLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-[fadeIn_0.3s_ease]">
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-500 to-amber-500 px-6 py-5 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold">升级解锁更多</h2>
              <p className="text-sm text-white/80 mt-0.5">选择适合你的方案</p>
            </div>
            <button 
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {!redeemMode ? (
            <>
              <div className="space-y-3">
                {PRODUCT_PACKS.map((pack) => (
                  <div
                    key={pack.id}
                    className={`p-4 rounded-xl border-2 transition-all cursor-pointer hover:shadow-md ${
                      pack.highlight
                        ? 'border-orange-300 bg-orange-50/50'
                        : 'border-slate-200 bg-white hover:border-orange-200'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{pack.icon}</span>
                        <div>
                          <h3 className="font-bold text-slate-800 text-sm">{pack.name}</h3>
                          <p className="text-xs text-slate-500 mt-0.5">{pack.desc}</p>
                        </div>
                      </div>
                      <span className="text-orange-600 font-bold text-sm whitespace-nowrap">{pack.price}</span>
                    </div>
                    <div className="flex gap-2 mt-3 flex-wrap">
                      {pack.features.map((f, i) => (
                        <span key={i} className="text-[11px] px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <p className="text-center text-xs text-slate-400 mt-4">
                购买后获得兑换码，在下方兑换
              </p>

              <button
                onClick={() => setRedeemMode(true)}
                className="w-full mt-3 py-3 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold rounded-xl hover:shadow-lg transition-all text-sm"
              >
                我有兑换码
              </button>
            </>
          ) : (
            <div className="space-y-4">
              <button
                onClick={() => { setRedeemMode(false); setRedeemResult(null); }}
                className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                返回
              </button>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">输入兑换码</label>
                <input
                  type="text"
                  value={redeemCode}
                  onChange={(e) => setRedeemCode(e.target.value.toUpperCase())}
                  placeholder="请输入您的兑换码"
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm font-mono tracking-wider focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 transition-all"
                  disabled={redeemLoading}
                />
              </div>

              {redeemResult && (
                <div className={`p-3 rounded-xl text-sm font-medium ${
                  redeemResult.ok 
                    ? 'bg-green-50 text-green-600 border border-green-200' 
                    : 'bg-red-50 text-red-600 border border-red-200'
                }`}>
                  {redeemResult.message}
                </div>
              )}

              <button
                onClick={handleRedeem}
                disabled={redeemLoading || !redeemCode.trim()}
                className="w-full py-3 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold rounded-xl hover:shadow-lg transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {redeemLoading ? '兑换中...' : '立即兑换'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
