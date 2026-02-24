"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { motion, useInView } from "framer-motion";

/**
 * 益职AI Landing Page — 品牌故事 + 数据展示
 */
export default function Home() {
  const router = useRouter();
  const [userCount, setUserCount] = useState(0);

  // 检查是否已有 session
  useEffect(() => {
    const cookies = document.cookie.split(';');
    const hasSessionCookie = cookies.some(cookie =>
      cookie.trim().startsWith('sb-access-token=') ||
      cookie.trim().startsWith('sb-session-user-id=')
    );
    const sessionId = localStorage.getItem("sessionId");
    const inviteCode = localStorage.getItem("inviteCode");

    if (hasSessionCookie || (sessionId && inviteCode)) {
      router.push("/chat");
    }
  }, [router]);

  // 用户数滚动计数动画
  useEffect(() => {
    const target = 1286;
    const duration = 2000;
    const steps = 60;
    const increment = target / steps;
    let current = 0;
    const timer = setInterval(() => {
      current += increment;
      if (current >= target) {
        setUserCount(target);
        clearInterval(timer);
      } else {
        setUserCount(Math.floor(current));
      }
    }, duration / steps);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#fffbf5] via-white to-[#f8f6ff] overflow-hidden">
      {/* Hero Section */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-4 py-20">
        {/* 背景装饰 */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-10 w-72 h-72 bg-orange-100 rounded-full mix-blend-multiply filter blur-xl opacity-40 animate-blob" />
          <div className="absolute top-40 right-10 w-72 h-72 bg-purple-100 rounded-full mix-blend-multiply filter blur-xl opacity-40 animate-blob animation-delay-2000" />
          <div className="absolute bottom-20 left-1/3 w-72 h-72 bg-blue-100 rounded-full mix-blend-multiply filter blur-xl opacity-40 animate-blob animation-delay-4000" />
        </div>

        <motion.div
          className="relative z-10 text-center max-w-4xl mx-auto"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        >
          {/* Logo */}
          <motion.div
            className="inline-flex items-center justify-center w-20 h-20 mb-6"
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <img src="/logo.png" alt="益职 AI" className="w-full h-full object-contain rounded-2xl shadow-lg" />
          </motion.div>

          {/* 品牌名 */}
          <motion.h1
            className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            <span className="bg-gradient-to-r from-orange-500 via-orange-400 to-amber-500 bg-clip-text text-transparent">
              益职 AI
            </span>
          </motion.h1>

          {/* Tagline */}
          <motion.p
            className="text-xl md:text-2xl text-slate-600 font-medium mb-4 leading-relaxed"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
          >
            求职路上，你不是一个人在战斗
          </motion.p>

          <motion.p
            className="text-base md:text-lg text-slate-500 mb-10 max-w-2xl mx-auto"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6 }}
          >
            益老师是你的私人求职导师，从职业规划到Offer决策，<br className="hidden md:block" />
            全程陪伴、智能引导，帮你把每一步都走对
          </motion.p>

          {/* CTA */}
          <motion.div
            className="flex flex-col sm:flex-row gap-4 items-center justify-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.7 }}
          >
            <button
              onClick={() => router.push("/login")}
              className="px-8 py-4 text-lg font-bold text-white bg-gradient-to-r from-orange-500 to-orange-600 rounded-2xl shadow-lg shadow-orange-200/50 hover:shadow-xl hover:shadow-orange-300/50 hover:-translate-y-0.5 transition-all duration-300"
            >
              免费开始使用
            </button>
            <button
              onClick={() => router.push("/resume-score")}
              className="px-8 py-4 text-lg font-semibold text-orange-600 bg-white border-2 border-orange-200 rounded-2xl hover:bg-orange-50 hover:border-orange-300 transition-all duration-300"
            >
              先测测简历分数
            </button>
          </motion.div>
        </motion.div>

        {/* 向下滚动提示 */}
        <motion.div
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
        >
          <div className="flex flex-col items-center gap-2 text-slate-400">
            <span className="text-xs">向下探索</span>
            <motion.div
              animate={{ y: [0, 6, 0] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M7 13l5 5 5-5M7 6l5 5 5-5" />
              </svg>
            </motion.div>
          </div>
        </motion.div>
      </section>

      {/* 数据展示 Section */}
      <DataSection userCount={userCount} />

      {/* 产品特色 Section */}
      <FeaturesSection />

      {/* 7大阶段 Section */}
      <StagesSection />

      {/* 益老师介绍 Section */}
      <TeacherSection />

      {/* 最终CTA Section */}
      <section className="py-24 px-4 bg-gradient-to-br from-orange-50 to-amber-50">
        <div className="max-w-3xl mx-auto text-center">
          <motion.h2
            className="text-3xl md:text-4xl font-bold text-slate-900 mb-6"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            准备好开始你的求职之旅了吗？
          </motion.h2>
          <motion.p
            className="text-lg text-slate-600 mb-8"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
          >
            益老师已就位，等你来聊
          </motion.p>
          <motion.button
            onClick={() => router.push("/login")}
            className="px-10 py-5 text-xl font-bold text-white bg-gradient-to-r from-orange-500 to-orange-600 rounded-2xl shadow-xl shadow-orange-200/50 hover:shadow-2xl hover:shadow-orange-300/60 hover:-translate-y-1 transition-all duration-300"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
          >
            免费开始使用
          </motion.button>
          <p className="mt-4 text-sm text-slate-400">邮箱注册即可，无需下载</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 text-center text-slate-400 text-sm">
        &copy; 2026 益职AI. 版权所有.
      </footer>

      {/* 动画样式 */}
      <style jsx>{`
        @keyframes blob {
          0%, 100% { transform: translate(0, 0) scale(1); }
          25% { transform: translate(30px, -50px) scale(1.1); }
          50% { transform: translate(-20px, 20px) scale(0.9); }
          75% { transform: translate(20px, 50px) scale(1.05); }
        }
        .animate-blob { animation: blob 7s infinite; }
        .animation-delay-2000 { animation-delay: 2s; }
        .animation-delay-4000 { animation-delay: 4s; }
      `}</style>
    </div>
  );
}

/* ========== 数据展示 ========== */
function DataSection({ userCount }: { userCount: number }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true });

  const stats = [
    { number: `${userCount.toLocaleString()}+`, label: "位求职者已加入", icon: "👥" },
    { number: "23%", label: "平均面试通过率提升", icon: "📈" },
    { number: "7", label: "大求职阶段全覆盖", icon: "🎯" },
    { number: "24/7", label: "随时随地在线辅导", icon: "⏰" },
  ];

  return (
    <section ref={ref} className="py-20 px-4 bg-white">
      <div className="max-w-5xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((stat, idx) => (
            <motion.div
              key={idx}
              className="text-center"
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: idx * 0.1 }}
            >
              <div className="text-3xl mb-2">{stat.icon}</div>
              <div className="text-3xl md:text-4xl font-extrabold text-slate-900 mb-1">{stat.number}</div>
              <div className="text-sm text-slate-500">{stat.label}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ========== 产品特色 ========== */
function FeaturesSection() {
  const features = [
    {
      title: "不只是工具，更是导师",
      desc: "益老师不会冷冰冰地甩给你一份模板。她会像真正的职业导师一样，先了解你，再给方案。",
      icon: "💬",
      color: "from-blue-50 to-blue-100",
      border: "border-blue-200",
    },
    {
      title: "智能白板，进度可视化",
      desc: "对话中的关键信息自动沉淀到白板，你的求职画像、项目STAR、目标公司一目了然。",
      icon: "📋",
      color: "from-purple-50 to-purple-100",
      border: "border-purple-200",
    },
    {
      title: "跨阶段记忆，越聊越懂你",
      desc: "益老师记得你说过的每一句话。在面试阶段提到的项目，她会自动关联到简历优化建议。",
      icon: "🧠",
      color: "from-green-50 to-green-100",
      border: "border-green-200",
    },
    {
      title: "AI 模拟面试，实战练兵",
      desc: "真实面试官视角，逐题评分+详细反馈+可分享战报。面试不再是开盲盒。",
      icon: "🎤",
      color: "from-orange-50 to-orange-100",
      border: "border-orange-200",
    },
  ];

  return (
    <section className="py-20 px-4 bg-gradient-to-b from-white to-slate-50">
      <div className="max-w-5xl mx-auto">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">为什么选择益职 AI？</h2>
          <p className="text-lg text-slate-500">不是又一个AI聊天机器人，而是真正懂求职的伙伴</p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {features.map((f, idx) => (
            <motion.div
              key={idx}
              className={`p-6 rounded-2xl bg-gradient-to-br ${f.color} border ${f.border} hover:shadow-lg transition-all duration-300`}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.1 }}
            >
              <div className="text-3xl mb-3">{f.icon}</div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">{f.title}</h3>
              <p className="text-sm text-slate-600 leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ========== 7大阶段 ========== */
function StagesSection() {
  const stages = [
    { name: "职业规划", desc: "明确方向，找到最适合你的赛道", icon: "🧭", color: "bg-blue-500" },
    { name: "项目梳理", desc: "用STAR法则深挖亮点", icon: "📊", color: "bg-purple-500" },
    { name: "简历优化", desc: "逐句打磨，让HR眼前一亮", icon: "📄", color: "bg-green-500" },
    { name: "投递策略", desc: "精准匹配，提高每一次投递的命中率", icon: "🎯", color: "bg-amber-500" },
    { name: "模拟面试", desc: "实战演练，告别面试焦虑", icon: "🎤", color: "bg-orange-500" },
    { name: "薪资沟通", desc: "数据支撑，谈出你应得的价格", icon: "💰", color: "bg-indigo-500" },
    { name: "Offer 决策", desc: "多维对比，做出不后悔的选择", icon: "🏆", color: "bg-emerald-500" },
  ];

  return (
    <section className="py-20 px-4 bg-slate-50">
      <div className="max-w-4xl mx-auto">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">7 大阶段，全流程陪伴</h2>
          <p className="text-lg text-slate-500">从迷茫到拿Offer，每一步都有益老师在你身边</p>
        </motion.div>

        <div className="relative">
          {/* 连接线 */}
          <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-gradient-to-b from-blue-300 via-orange-300 to-emerald-300 hidden md:block" />

          <div className="space-y-6">
            {stages.map((stage, idx) => (
              <motion.div
                key={idx}
                className="flex items-start gap-6"
                initial={{ opacity: 0, x: -30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.08 }}
              >
                {/* 圆点 */}
                <div className={`relative z-10 w-16 h-16 ${stage.color} rounded-2xl flex items-center justify-center text-2xl shadow-lg shrink-0`}>
                  {stage.icon}
                </div>
                {/* 内容 */}
                <div className="flex-1 bg-white rounded-2xl p-5 border border-slate-200 hover:shadow-md hover:border-slate-300 transition-all duration-300">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="text-xs font-bold text-slate-400">STEP {idx + 1}</span>
                    <h3 className="text-lg font-bold text-slate-900">{stage.name}</h3>
                  </div>
                  <p className="text-sm text-slate-500">{stage.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ========== 益老师介绍 ========== */
function TeacherSection() {
  return (
    <section className="py-20 px-4 bg-white">
      <div className="max-w-4xl mx-auto">
        <motion.div
          className="bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50 rounded-3xl p-8 md:p-12 border border-orange-100"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <div className="flex flex-col md:flex-row items-center gap-8">
            <div className="w-24 h-24 bg-gradient-to-br from-orange-400 to-amber-400 rounded-3xl flex items-center justify-center text-5xl shadow-lg shrink-0">
              🧑‍🏫
            </div>
            <div className="flex-1 text-center md:text-left">
              <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-3">
                遇见「益老师」
              </h2>
              <p className="text-slate-600 leading-relaxed mb-4">
                益老师不是一个冷冰冰的 AI，她是你求职路上最有耐心的伙伴。
                她会记住你的每一段经历、每一个目标，在你迷茫时给方向，在你低谷时给鼓励，
                在你冲刺面试时陪你一遍遍练习。
              </p>
              <div className="flex flex-wrap gap-3 justify-center md:justify-start">
                <span className="px-3 py-1.5 bg-white rounded-full text-sm text-orange-600 border border-orange-200 font-medium">
                  🧠 跨阶段记忆
                </span>
                <span className="px-3 py-1.5 bg-white rounded-full text-sm text-orange-600 border border-orange-200 font-medium">
                  💡 个性化建议
                </span>
                <span className="px-3 py-1.5 bg-white rounded-full text-sm text-orange-600 border border-orange-200 font-medium">
                  🎯 精准引导
                </span>
                <span className="px-3 py-1.5 bg-white rounded-full text-sm text-orange-600 border border-orange-200 font-medium">
                  ❤️ 有温度的陪伴
                </span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
