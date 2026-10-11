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

export default async function CockpitPreviewPage({ searchParams }: { searchParams: Promise<{ empty?: string; preparation?: string; tab?: string; longResume?: string; narrative?: string; changes?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const params = await searchParams;
  const longResume = ["测试求职者（纯虚构验收材料）", "教育经历\n示例大学 · 信息管理专业", ...Array.from({length:24},(_,i)=>`项目经历 ${i+1}：知识助手验收项目\n职责：拆解用户问题，编写需求与评测说明。\n动作：设计检索测试集，检查来源与答案是否一致；记录失败路径和改进方案。\n结果：此处仅用于分页验收，不代表真实求职成果。\n完整性标记：RESUME-CHECK-${String(i+1).padStart(2,"0")}`), "简历正文结束 · RESUME-END"].join("\n\n");
  const previewOpportunities = params.preparation === "1"
    ? [preparationPreview, ...demoOpportunities]
    : demoOpportunities;
  const narrativeResume = ["测试求职者，探索人机协作。联系方式：test@example.com。我希望用真实项目展示判断、行动和结果；此为虚构验收材料，不代表用户经历。", "## 我提出的问题，和做出的产品", ...Array.from({length:4},(_,i)=>`### 协作项目 ${i+1} · 从判断到行动\n负责人 | 2024.01 起\n- **实际责任**：定义需求与验收边界，保留真实事实。\n- **验证结果**：完整性标记 NARRATIVE-${i+1}，仅为排版测试。\n[项目来源](https://example.com/project-${i+1})`), "<!-- PAGEBREAK -->", "## 在真实业务里检验判断", "### 示例公司 · 产品经理\n2024.01 - 至今\n- 推动需求评审和质量验收，不捏造业绩。", "## 教育背景\n示例大学 · 本科", "简历正文结束 · NARRATIVE-END"].join("\n\n");

  return (
    <CockpitApp
      initialOpportunities={params.empty === "1" ? [] : params.narrative === "1" ? previewOpportunities.map(item=>({...item,resumeText:narrativeResume,resumeChanges:params.changes === "1" ? [{ ...demoOpportunities[0].resumeChanges[0], id: "narrative-edit", before: "完整性标记 NARRATIVE-1，仅为排版测试。", after: "完整性标记 NARRATIVE-1，已核对排版测试。", status: "pending" as const }] : []})) : params.longResume === "1" ? previewOpportunities.map(item=>({...item,resumeText:longResume})) : previewOpportunities}
      userEmail="cockpit-preview@example.com"
      dataMode="demo"
      initialTab={params.tab === "interview" ? "interview" : params.tab === "resume" ? "resume" : undefined}
    />
  );
}
