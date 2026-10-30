import { notFound } from "next/navigation";
import { CockpitApp } from "@/components/cockpit/CockpitApp";
import { demoOpportunities } from "@/lib/opportunities/demo";
import type { Opportunity } from "@/lib/opportunities/types";
import { parseEntryKind } from "@/lib/entry-doors";
import ResumeMentorFixture from "@/components/cockpit/ResumeMentorFixture";
import ExperienceSafetyFixture from '@/components/cockpit/ExperienceSafetyFixture';
import InterviewUiFixture from '@/components/cockpit/InterviewUiFixture';

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

export default async function CockpitPreviewPage({ searchParams }: {
  searchParams: Promise<{
    empty?: string; preparation?: string; tab?: string; longResume?: string;
    narrative?: string; changes?: string; studio?: string; entry?: string; longCopy?: string; mentorUI?: string;safetyUI?:string;
    interviewUI?: string; interviewHistory?: string;
  }>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();
  const params = await searchParams;
  if (params.interviewUI === '1') return <InterviewUiFixture initialHistory={params.interviewHistory === '1'} />;
  if(params.safetyUI==='1')return <ExperienceSafetyFixture/>;
  if(params.mentorUI==='1')return <ResumeMentorFixture/>;
  const longResume = ["测试求职者（纯虚构验收材料）", "教育经历\n示例大学 · 信息管理专业", ...Array.from({length:24},(_,i)=>`项目经历 ${i+1}：知识助手验收项目\n职责：拆解用户问题，编写需求与评测说明。\n动作：设计检索测试集，检查来源与答案是否一致；记录失败路径和改进方案。\n结果：此处仅用于分页验收，不代表真实求职成果。\n完整性标记：RESUME-CHECK-${String(i+1).padStart(2,"0")}`), "简历正文结束 · RESUME-END"].join("\n\n");
  const previewOpportunities = params.preparation === "1"
    ? [preparationPreview, ...demoOpportunities]
    : demoOpportunities;
  // 仅开发环境的虚构材料，用于验证完整纸面和真实控件，不调用模型。
  const studioResume = [
    "林以宁",
    "求职方向：产品经理",
    "电话：138 0000 0000",
    "邮箱：lin@example.test",
    "## 工作经历",
    "### 澄明科技 · 产品经理",
    "2022.07 - 至今",
    "- 负责客服知识助手的需求调研和产品迭代，对接客服、算法和研发团队。",
    "- 整理客服反馈，建立问题清单，按发生频率和影响范围排定迭代优先级。",
    "- 从高频问题中整理 120 条测试用例，检查回答准确性和来源是否一致。",
    "### 松间网络 · 产品助理",
    "2020.07 - 2022.06",
    "- 参与商家入驻流程改版，梳理审核节点与异常场景，跟进验收和上线。",
    "- 访谈 8 位商家，汇总资料填写与审核反馈中的问题，形成需求清单。",
    "## 项目经历",
    "### 客服知识助手 · 产品负责人",
    "2024.03 - 2024.09",
    "- 将客服常见问题整理为检索知识库，和算法团队核对答案与引用来源。",
    "- 组织 12 位客服试用，记录未命中、引用错误和转人工场景，推动两轮迭代。",
    "## 教育经历",
    "示例大学 · 信息管理与信息系统 · 本科",
    "2016.09 - 2020.06",
    "## 技能",
    "需求调研、流程设计、原型与验收；Figma、SQL、Excel。",
  ].join("\n\n");
  const studioOpportunities:Opportunity[]=[{...demoOpportunities[0],id:"studio-ui-preview",company:"示例科技",role:"产品经理",location:"上海",resumeText:studioResume,applicationQuality:undefined,resumeOriginal:undefined,resumeChanges:[{...demoOpportunities[0].resumeChanges[0],id:"studio-expression",section:"工作经历",before:"从高频问题中整理 120 条测试用例，检查回答准确性和来源是否一致。",after:"整理 120 条高频问题测试用例，核对回答准确性与引用来源。",reason:"收紧重复表达，保留测试规模与检查内容。此为虚构交互样例。",status:"pending"}]}];
  const narrativeResume = ["测试求职者，探索人机协作。联系方式：test@example.com。我希望用真实项目展示判断、行动和结果；此为虚构验收材料，不代表用户经历。", "## 我提出的问题，和做出的产品", ...Array.from({length:4},(_,i)=>`### 协作项目 ${i+1} · 从判断到行动\n负责人 | 2024.01 起\n- **实际责任**：定义需求与验收边界，保留真实事实。\n- **验证结果**：完整性标记 NARRATIVE-${i+1}，仅为排版测试。\n[项目来源](https://example.com/project-${i+1})`), "<!-- PAGEBREAK -->", "## 在真实业务里检验判断", "### 示例公司 · 产品经理\n2024.01 - 至今\n- 推动需求评审和质量验收，不捏造业绩。", "## 教育背景\n示例大学 · 本科", "简历正文结束 · NARRATIVE-END"].join("\n\n");

  if (params.longCopy === "1") {
    // 仅开发环境，覆盖旧长 JD 被误当成大标题的布局坏例。
    studioOpportunities[0] = {
      ...studioOpportunities[0],
      recommendationReason: "虚构布局验收材料：已有产品调研与迭代经历，评估岗位时还需核对本人职责和真实交付物。".repeat(8),
      requirements: studioOpportunities[0].requirements.map((item, index) => index ? item : {
        ...item, requirement: "负责需求调研、方案设计、评估标准与上线迭代；与研发协同验证问题，保留来源和真实职责。".repeat(8),
      }),
    };
  }
  return (
    <CockpitApp
      initialOpportunities={params.studio==="1"?studioOpportunities:params.empty === "1" ? [] : params.narrative === "1" ? previewOpportunities.map(item=>({...item,resumeText:narrativeResume,resumeChanges:params.changes === "1" ? [{ ...demoOpportunities[0].resumeChanges[0], id: "narrative-edit", before: "完整性标记 NARRATIVE-1，仅为排版测试。", after: "完整性标记 NARRATIVE-1，已核对排版测试。", status: "pending" as const }] : []})) : params.longResume === "1" ? previewOpportunities.map(item=>({...item,resumeText:longResume,resumeChanges:[]})) : previewOpportunities}
      userEmail="cockpit-preview@example.com"
      dataMode="demo"
      initialTab={params.tab === "interview" ? "interview" : params.tab === "resume" ? "resume" : params.tab === "salary" ? "salary" : undefined}
      initialEntry={parseEntryKind(params.entry) ?? undefined}
    />
  );
}
