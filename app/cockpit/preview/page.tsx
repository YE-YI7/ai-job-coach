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

export default async function CockpitPreviewPage({ searchParams }: { searchParams: Promise<{ empty?: string; preparation?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const params = await searchParams;
  const previewOpportunities = params.preparation === "1"
    ? [preparationPreview, ...demoOpportunities.map((item) => ({ ...item, jdText: `${item.role} 岗位职责与任职要求示例。` }))]
    : demoOpportunities;

  return (
    <CockpitApp
      initialOpportunities={params.empty === "1" ? [] : previewOpportunities}
      userEmail="cockpit-preview@example.com"
      dataMode="demo"
    />
  );
}
