"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, Shield, Database, Eye, Trash2, Server, Mail } from "lucide-react";

export default function PrivacyPage() {
  const router = useRouter();

  const sections = [
    {
      icon: Database,
      title: "数据收集范围",
      items: [
        "面试对话记录（用户主动粘贴上传）",
        "面试基础信息（公司名称、轮次、时间、标签）",
        "简历内容（用户选择关联时）",
        "账户基本信息（邮箱、注册时间）",
      ],
    },
    {
      icon: Eye,
      title: "数据使用方式",
      items: [
        "仅用于面试复盘分析、简历评审等产品功能",
        "不会将用户数据用于 AI 模型训练",
        "不会向任何第三方出售或共享用户数据",
        "分析过程中可能调用 DeepSeek 或用户授权的 TokenDance 接口，仅传输完成当前任务所需的文本",
      ],
    },
    {
      icon: Server,
      title: "数据存储与保留",
      items: [
        "面试原始文本默认保留 30 天，到期自动清除",
        "分析结果保留至用户主动删除",
        "部分数据存储在浏览器本地（localStorage），清除浏览器数据即可删除",
        "服务端数据存储在加密数据库中",
        "TokenPay API Key 使用应用层加密保存；断开连接后不再用于模型调用",
      ],
    },
    {
      icon: Trash2,
      title: "用户权利",
      items: [
        "随时查看已保存的面试复盘记录",
        "随时删除单条或全部复盘历史",
        "一键清空所有个人数据",
        "导出个人数据（计划中）",
      ],
    },
    {
      icon: Shield,
      title: "安全措施",
      items: [
        "上传内容自动脱敏处理（手机号、邮箱、姓名等）",
        "所有 API 请求通过身份认证",
        "HTTPS 加密传输",
        "用户上传前需确认不包含受保密协议限制的内容",
      ],
    },
    {
      icon: Mail,
      title: "联系我们",
      items: [
        "如有隐私相关问题或数据删除请求",
        "请通过应用内反馈功能联系我们",
        "我们将在 48 小时内处理您的请求",
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50/50">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-xl border-b border-slate-100">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-2.5">
          <button
            onClick={() => router.back()}
            className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center transition-colors"
          >
            <ArrowLeft className="w-4.5 h-4.5 text-slate-600" />
          </button>
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-orange-500" />
            <h1 className="text-base font-bold text-slate-900">隐私政策</h1>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* 概述 */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <p className="text-sm text-slate-700 leading-relaxed">
            AI求职教练（以下简称“本应用”）非常重视用户隐私。本政策说明我们如何收集、使用、存储和保护您的个人数据。使用本应用即表示您同意本隐私政策的条款。
          </p>
          <p className="text-xs text-slate-400 mt-2">最后更新：2026年9月</p>
        </div>

        {/* 各部分 */}
        {sections.map((section, i) => (
          <div key={i} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
              <section.icon className="w-4 h-4 text-orange-500" />
              {section.title}
            </h2>
            <ul className="space-y-2">
              {section.items.map((item, j) => (
                <li key={j} className="text-xs text-slate-600 leading-relaxed flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0 mt-1.5" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}

        {/* 第三方服务 */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
            <Server className="w-4 h-4 text-orange-500" />
            第三方服务说明
          </h2>
          <p className="text-xs text-slate-600 leading-relaxed mb-3">
            本应用可能使用以下第三方服务完成 AI 分析与账户充值：
          </p>
          <div className="bg-slate-50 rounded-xl p-3 space-y-1.5">
            <p className="text-xs text-slate-700">
              <span className="font-medium">DeepSeek AI</span> — 用于面试内容解析、多角色讨论生成、答案改写等
            </p>
            <p className="text-[10px] text-slate-500">
              传输数据范围：完成当前生成任务所需的文本。具体处理规则以 DeepSeek 的现行政策为准。
            </p>
            <p className="text-xs text-slate-700">
              <span className="font-medium">TokenDance / TokenPay</span> — 用于 OAuth 式 API Key 授权、余额查询、用户确认充值，以及在用户连接后转发模型请求
            </p>
            <p className="text-[10px] text-slate-500">
              完整 API Key 不会发送到浏览器；益职服务端加密保存后，仅在用户发起 AI 请求、查询余额或创建并查询付款会话时使用。付款由用户在 TokenDance 页面确认。
            </p>
          </div>
        </div>

        {/* 底部 */}
        <p className="text-center text-[10px] text-slate-400 pb-6">
          如果您不同意本隐私政策，请停止使用本应用。
        </p>
      </main>
    </div>
  );
}
