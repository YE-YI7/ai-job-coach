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
        "益职不会主动将求职材料用于训练模型；模型供应商的数据处理规则以其政策为准",
        "不会出售求职材料；为完成你发起的 AI 分析，会向相应模型供应商传输任务所需文本",
        "站点模型可能使用 StepFun（阶跃星辰）或 DeepSeek；连接 TokenPay 后使用用户授权的 TokenDance 模型服务。材料入口展示当前提供方",
      ],
    },
    {
      icon: Server,
      title: "数据存储与保留",
      items: [
        "已保存的原文、事实来源和分析结果进入账号云端工作区；目前不承诺 30 天自动清除",
        "可删除界面中的岗位或复盘；底层来源与备份的完整清除需申请处理，界面删除不等于立即清除全部副本",
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
        "可申请清除账号相关数据；目前不承诺一键清空全部副本",
        "导出个人数据（计划中）",
      ],
    },
    {
      icon: Shield,
      title: "安全措施",
      items: [
        "上传前请自行删除不必要的联系方式与敏感信息；不承诺所有材料都会自动脱敏",
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
        "申请处理时间以实际回复为准",
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
          <p className="text-xs text-slate-400 mt-2">最后更新：2026年10月9日</p>
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
              <span className="font-medium">StepFun（阶跃星辰） / DeepSeek</span> — 站点模型用于求职材料整理、面试辅导与复盘等 AI 任务
            </p>
            <p className="text-[10px] text-slate-500">
              传输数据范围：完成当前任务所需的 JD、简历、经历和上下文文字。供应商可能随站点配置变化，材料入口展示当前提供方；其处理规则以对应供应商的现行政策为准。
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
