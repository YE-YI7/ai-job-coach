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
        "账户基本信息（邮箱、注册时间；选择手机登录或绑定时还包括手机号）",
        "产品使用记录（匿名浏览器标识，登录后的账户标识、页面分类、功能动作、时间及粗粒度来源分类）",
      ],
    },
    {
      icon: Eye,
      title: "数据使用方式",
      items: [
        "用于面试复盘、简历评审等产品功能，以及使用情况统计和故障排查",
        "手机号仅用于你发起的登录或账号绑定验证，不用于营销短信；已有账号需先通过原方式登录后绑定，不自动合并不同账号",
        "益职不会主动将求职材料用于训练模型；模型供应商的数据处理规则以其政策为准",
        "不会出售求职材料；为完成你发起的 AI 分析，会向相应模型供应商传输任务所需文本",
        "模型提供方以材料入口的界面提示为准。网页 AI 使用益职积分，无需另行绑定 TokenDance；已有模型连接仍按原授权范围使用，本次未删除连接或转移余额",
      ],
    },
    {
      icon: Eye,
      title: "公开工具与来源统计",
      items: [
        "简历与 JD 对照、免登录面试复盘模板在当前浏览器内处理输入，不调用模型、不自动写入账号；刷新或离开页面会清空，请自行复制或下载",
        "来源统计在浏览器内将链接来源标签和来源站点转换为预设分类；该埋点不发送原始来源网址、搜索词、简历、JD 或对话正文",
        "浏览器会保存匿名标识、新版首次来源和本次访问来源。清除浏览器站点数据会清除这些本地标记，不会删除账号中的资料",
        "使用统计仅供授权管理员访问；无法识别来源的访问不推测为搜索或 AI 引用，也不补造历史来源",
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
        "账号资料与管理员接口经过身份认证和权限校验；公开页面访问与匿名使用统计不要求登录",
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
          <p className="text-xs text-slate-400 mt-2">最后更新：2026年10月21日</p>
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
            本应用可能使用以下第三方服务完成账号验证、AI 分析与账户充值：
          </p>
          <div className="bg-slate-50 rounded-xl p-3 space-y-1.5">
            <p className="text-xs text-slate-700"><span className="font-medium">阿里云号码认证服务</span> — 按你的请求发送与核验 +86 手机验证码</p>
            <p className="text-xs text-slate-600">为发送和核验短信，服务端向阿里云传输手机号、验证用途及你输入的验证码。验证码由阿里云生成，益职不保存验证码正文；短期验证记录仅限服务端访问，账号手机号用于后续登录，前端只展示脱敏号码。</p>
            <p className="text-xs text-slate-700">
              <span className="font-medium">StepFun（阶跃星辰） / DeepSeek</span> — 站点模型用于求职材料整理、面试辅导与复盘等 AI 任务
            </p>
            <p className="text-[10px] text-slate-500">
              传输数据范围：完成当前任务所需的 JD、简历、经历和上下文文字。供应商可能随站点配置变化，材料入口展示当前提供方；其处理规则以对应供应商的现行政策为准。
            </p>
            <p className="text-xs text-slate-700">
              <span className="font-medium">TokenDance / TokenPay</span> — 用于底层模型服务，以及已有授权连接的模型请求和余额查询；不是网页新用户必须绑定的账户
            </p>
            <p className="text-[10px] text-slate-500">
              完整 API Key 不会发送到浏览器；已有授权凭据由服务端加密保存，仅按相应授权处理请求。网页用户通过益职积分使用 AI，不要求自行到 TokenDance 充值。
            </p>
            <p className="text-xs text-slate-700"><span className="font-medium">观猹</span> — 用于用户选择的观猹授权登录、积分购买和兑换；付款与兑换以相应页面展示的规则及用户确认操作为准。</p>
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
