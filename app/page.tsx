'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiGet, apiPost } from '@/lib/api';
import { Sparkles, ArrowRight, KeyRound } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 实时校验邀请码 
  const checkCode = async (val: string) => {
    if (val.length < 4) return;
    try {
      // GET /api/invites/check?code=xxx
      const res: any = await apiGet(`/invites/check?code=${val}`);
      if (res.valid) {
        setError(''); 
      }
    } catch (e) {
      // 忽略实时校验的错误，以免打扰用户
    }
  };

  // 兑换并登录
  const handleLogin = async () => {
    if (!code) return;
    setLoading(true);
    setError('');

    // 🔥【新增】测试后门：如果输入 MVP-2025，直接放行
    if (code === "MVP-2025") {
      setTimeout(() => {
        localStorage.setItem('userId', 'test-user-001'); // 模拟一个 userId
        router.push('/identity'); // 跳转到下一步
      }, 500);
      return;
    }

    try {
      // 下面是原本的 API 逻辑
      //  参考文档 3.5.2 兑换邀请码接口
      const res: any = await apiPost('/invites/redeem', { code });
      
      if (res.userId) {
        localStorage.setItem('userId', res.userId);
        router.push('/identity');
      } else {
        throw new Error('无效的邀请码');
      }
    } catch (err: any) {
      setError(err.message || '登录失败，请检查邀请码');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* 简单的背景装饰 */}
      <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_120%,rgba(120,119,198,0.3),rgba(255,255,255,0))]" />
      
      <div className="z-10 w-full max-w-md bg-slate-900/50 backdrop-blur-xl border border-white/10 p-8 rounded-2xl shadow-2xl">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-blue-600/20 rounded-xl flex items-center justify-center mx-auto mb-4 text-blue-400">
            <Sparkles size={24} />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">AI Job Coach</h1>
          <p className="text-slate-400 text-sm">请输入邀请码以开启您的职场进化之旅</p>
        </div>

        <div className="space-y-4">
          <div className="relative">
            <KeyRound className="absolute left-3 top-3 text-slate-500" size={18} />
            <input 
              type="text" 
              placeholder="输入邀请码 (例如: MVP-2025)" 
              className="w-full bg-slate-800/50 border border-slate-700 text-white pl-10 pr-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all placeholder:text-slate-600"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                checkCode(e.target.value);
              }}
            />
          </div>

          {error && <p className="text-red-400 text-xs px-1">{error}</p>}

          <button 
            onClick={handleLogin}
            disabled={loading || !code}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? '验证中...' : '进入平台'}
            {!loading && <ArrowRight size={18} />}
          </button>
        </div>
      </div>
    </div>
  );
}