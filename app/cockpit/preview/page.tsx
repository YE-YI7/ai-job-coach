import { notFound } from "next/navigation";
import { CockpitApp } from "@/components/cockpit/CockpitApp";
import { demoOpportunities } from "@/lib/opportunities/demo";
import type { Opportunity } from "@/lib/opportunities/types";

export const dynamic = "force-dynamic";

const preparationPreview: Opportunity = {
  ...demoOpportunities[0],
  id: "preview-preparation",
  workspaceType: "preparation",
  company: "求职准备",
  role: "AI 应用产品经理 / Agent 产品方向",
  location: "地点待确认",
  stage: "captured",
  stageLabel: "准备中",
  sourceLabel: "文件导入 · 简历.md",
  capturedAtLabel: "刚刚",
  jdText: "",
  resumeText: "4 年 AI 产品经历，负责过 Agent 工作流、模型评测和跨团队交付。",
  profileText: "目标方向：AI 应用产品经理 / Agent 产品经理。",
  nextEventLabel: "今天完成第一步",
};

export default async function CockpitPreviewPage({ searchParams }: { searchParams: Promise<{ empty?: string; preparation?: string; tab?: string; longResume?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const params = await searchParams;
  const longResume = ["测试求职者（纯虚构验收材料）", "教育经历\n示例大学 · 信息管理专业", ...Array.from({length:24},(_,i)=>`项目经历 ${i+1}：知识助手验收项目\n职责：拆解用户问题，编写需求与评测说明。\n动作：设计检索测试集，检查来源与答案是否一致；记录失败路径和改进方案。\n结果：此处仅用于分页验收，不代表真实求职成果。\n完整性标记：RESUME-CHECK-${String(i+1).padStart(2,"0")}`), "简历正文结束 · RESUME-END"].join("\n\n");
  const previewOpportunities = params.preparation === "1"
    ? [preparationPreview, ...demoOpportunities.map((item) => ({ ...item, jdText: `${item.role} 岗位职责与任职要求示例。` }))]
    : params.tab === "interview"
      ? demoOpportunities.map((item) => ({ ...item, jdText: `${item.role} 岗位职责与任职要求示例。` }))
      : demoOpportunities;

  return (
    <CockpitApp
      initialOpportunities={params.empty === "1" ? [] : params.longResume === "1" ? previewOpportunities.map(item=>({...item,resumeText:longResume})) : previewOpportunities}
      userEmail="cockpit-preview@example.com"
      dataMode="demo"
      initialTab={params.tab === "interview" ? "interview" : params.tab === "resume" ? "resume" : undefined}
    />
  );
}
