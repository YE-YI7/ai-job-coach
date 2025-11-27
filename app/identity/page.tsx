'use client';

import { useRouter } from 'next/navigation';
import { User, GraduationCap, Briefcase } from 'lucide-react';

export default function IdentityPage() {
  const router = useRouter();

  const selectIdentity = (type: string) => {
    // 这里可以调用 /api/update-profile 更新用户画像
    // 暂时直接跳到流程图页面
    localStorage.setItem('user_identity', type);
    router.push('/flow');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <h1 className="text-3xl font-bold text-slate-900 mb-2">您当前的求职状态是？</h1>
      <p className="text-slate-500 mb-10">AI 将根据您的身份定制辅导策略</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl w-full">
        <IdentityCard 
          icon={GraduationCap} 
          title="应届毕业生" 
          desc="0-1年经验，寻找校招/实习机会"
          onClick={() => selectIdentity('student')}
        />
        <IdentityCard 
          icon={Briefcase} 
          title="职场人士" 
          desc="有工作经验，寻求跳槽或晋升"
          onClick={() => selectIdentity('professional')}
        />
        <IdentityCard 
          icon={User} 
          title="自由职业/Gap" 
          desc="探索副业或重返职场"
          onClick={() => selectIdentity('freelancer')}
        />
      </div>
    </div>
  );
}

function IdentityCard({ icon: Icon, title, desc, onClick }: any) {
  return (
    <button 
      onClick={onClick}
      className="flex flex-col items-center p-8 bg-white border border-slate-200 rounded-2xl hover:border-blue-500 hover:shadow-xl transition-all group text-center"
    >
      <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors text-slate-600">
        <Icon size={32} />
      </div>
      <h3 className="text-lg font-bold text-slate-800 mb-2">{title}</h3>
      <p className="text-sm text-slate-500">{desc}</p>
    </button>
  );
}