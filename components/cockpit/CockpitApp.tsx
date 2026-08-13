"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Bot,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Clock3,
  Copy,
  FileCheck2,
  FileText,
  ListTodo,
  LogOut,
  Menu,
  MessageSquareText,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import type {
  EvidenceStrength,
  Opportunity,
  OpportunityAction,
  RequirementEvidence,
} from "@/lib/opportunities/types";
import styles from "./CockpitApp.module.css";

type CockpitTab = "overview" | "evidence" | "resume" | "interview" | "review" | "activity";
type Rail = "opportunities" | "actions" | null;

const tabs: Array<{ id: CockpitTab; label: string }> = [
  { id: "overview", label: "概览" },
  { id: "evidence", label: "JD 与证据" },
  { id: "resume", label: "简历" },
  { id: "interview", label: "面试" },
  { id: "review", label: "复盘" },
  { id: "activity", label: "动态" },
];

const strengthMeta: Record<EvidenceStrength, { label: string; className: string }> = {
  strong: { label: "强证据", className: styles.statusStrong },
  weak: { label: "弱证据", className: styles.statusWeak },
  missing: { label: "证据缺口", className: styles.statusMissing },
  unverified: { label: "待确认", className: styles.statusUnverified },
};

const capturePrompt = "请用益职创建一个岗位机会。读取我接下来提供的 JD 和简历，先判断是否值得投，再把证据、结论和下一步写入作战盘。";

function compactAccountLabel(email?: string) {
  if (!email) return "求职者";
  if (email.startsWith("watcha_")) return "观猹用户";
  return email.split("@")[0]?.trim().slice(0, 12) || "求职者";
}

function coverageTotal(opportunity: Opportunity) {
  const { strong, weak, missing, unverified } = opportunity.evidenceCoverage;
  return strong + weak + missing + unverified;
}

export function CockpitApp({
  initialOpportunities,
  userEmail,
  dataMode = "demo",
}: {
  initialOpportunities: Opportunity[];
  userEmail?: string;
  dataMode?: "demo" | "live";
}) {
  const router = useRouter();
  const [opportunities, setOpportunities] = useState(initialOpportunities);
  const [activeId, setActiveId] = useState(initialOpportunities[0]?.id ?? "");
  const [activeTab, setActiveTab] = useState<CockpitTab>("overview");
  const [query, setQuery] = useState("");
  const [mobileRail, setMobileRail] = useState<Rail>(null);
  const [notice, setNotice] = useState("");
  const [questionSnoozed, setQuestionSnoozed] = useState(false);

  const active = opportunities.find((item) => item.id === activeId) ?? opportunities[0];
  const filtered = useMemo(() => {
    const value = query.trim().toLocaleLowerCase("zh-CN");
    if (!value) return opportunities;
    return opportunities.filter((item) =>
      `${item.company} ${item.role}`.toLocaleLowerCase("zh-CN").includes(value)
    );
  }, [opportunities, query]);

  const announce = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2600);
  };

  const copyForAgent = async (prompt: string, success = "已复制，回到 Agent 粘贴即可") => {
    try {
      await navigator.clipboard.writeText(prompt);
      announce(success);
    } catch {
      announce("浏览器没有开放剪贴板权限，请手动复制页面中的指令");
    }
  };

  const completeAction = (actionId: string) => {
    if (!active) return;
    setOpportunities((current) => current.map((opportunity) =>
      opportunity.id === active.id
        ? { ...opportunity, actions: opportunity.actions.map((action) =>
            action.id === actionId ? { ...action, status: "done" as const } : action) }
        : opportunity
    ));
    announce(dataMode === "demo" ? "示例行动已完成；刷新后会恢复" : "行动已完成");
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  };

  if (!active) {
    return <EmptyCockpit userEmail={userEmail} onCopy={() => copyForAgent(capturePrompt)} onLogout={logout} />;
  }

  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true">益</span>
          <span>益职</span>
        </div>
        <div className={styles.topbarContext}>
          <span className={dataMode === "demo" ? styles.demoState : styles.liveState}>
            {dataMode === "demo" ? "示例工作区" : "已连接 Agent"}
          </span>
          <span>{compactAccountLabel(userEmail)}</span>
          <button className={styles.iconButton} onClick={logout} aria-label="退出登录" title="退出登录">
            <LogOut size={17} aria-hidden="true" />
          </button>
        </div>
        <div className={styles.mobileControls}>
          <button onClick={() => setMobileRail("opportunities")} aria-label="打开机会列表"><Menu size={19} /></button>
          <button onClick={() => setMobileRail("actions")} aria-label="打开下一步"><ListTodo size={19} /></button>
        </div>
      </header>

      <div className={styles.workspace}>
        <OpportunityRail
          activeId={active.id}
          opportunities={filtered}
          totalCount={opportunities.length}
          query={query}
          mobileOpen={mobileRail === "opportunities"}
          onQueryChange={setQuery}
          onSelect={(id) => { setActiveId(id); setActiveTab("overview"); setMobileRail(null); }}
          onCopy={() => copyForAgent(capturePrompt)}
          onClose={() => setMobileRail(null)}
        />

        <section className={styles.document} aria-label={`${active.company} ${active.role}作战档案`}>
          {dataMode === "demo" && <DemoNotice onCopy={() => copyForAgent(capturePrompt)} />}
          <OpportunityHeader opportunity={active} />
          <nav className={styles.tabs} aria-label="岗位机会内容">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={activeTab === tab.id ? styles.tabActive : undefined}
                aria-current={activeTab === tab.id ? "page" : undefined}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
                {tab.id === "evidence" && <span>{coverageTotal(active)}</span>}
                {tab.id === "resume" && active.resumeChanges.length > 0 && <span>{active.resumeChanges.length}</span>}
              </button>
            ))}
          </nav>
          <div className={styles.documentBody}>
            {activeTab === "overview" && <OverviewTab opportunity={active} onOpenEvidence={() => setActiveTab("evidence")} />}
            {activeTab === "evidence" && <EvidenceTab opportunity={active} />}
            {activeTab === "resume" && <ResumeTab opportunity={active} onCopy={copyForAgent} />}
            {activeTab === "interview" && <InterviewTab opportunity={active} onCopy={copyForAgent} />}
            {activeTab === "review" && <ReviewTab opportunity={active} onCopy={copyForAgent} />}
            {activeTab === "activity" && <ActivityTab opportunity={active} />}
          </div>
        </section>

        <ActionRail
          opportunity={active}
          mobileOpen={mobileRail === "actions"}
          questionSnoozed={questionSnoozed}
          onComplete={completeAction}
          onAnswer={() => copyForAgent(`关于「${active.company} · ${active.role}」：商业化项目上线后，我可以公开写入简历的结果是：`)}
          onSnooze={() => { setQuestionSnoozed(true); announce("已暂时收起；真实连接后会在明天再次提醒"); }}
          onClose={() => setMobileRail(null)}
        />
      </div>
      {mobileRail && <button className={styles.mobileScrim} onClick={() => setMobileRail(null)} aria-label="关闭侧栏" />}
      <div className={`${styles.toast} ${notice ? styles.toastVisible : ""}`} role="status" aria-live="polite">{notice}</div>
    </main>
  );
}

function EmptyCockpit({ userEmail, onCopy, onLogout }: { userEmail?: string; onCopy: () => void; onLogout: () => void }) {
  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.brand}><span className={styles.brandMark}>益</span><span>益职</span></div>
        <div className={styles.topbarContext}><span>{compactAccountLabel(userEmail)}</span><button className={styles.iconButton} onClick={onLogout} aria-label="退出登录"><LogOut size={17} /></button></div>
      </header>
      <section className={styles.emptyCockpit}>
        <div className={styles.emptyCopy}>
          <span className={styles.emptyIcon}><BriefcaseBusiness size={24} /></span>
          <h1>从一个真实岗位开始</h1>
          <p>不用在网页里重复填表。让你的 Agent 读取 JD 和简历，益职会把判断、证据和下一步整理到同一个机会里。</p>
          <button className={styles.primaryButton} onClick={onCopy}><Copy size={16} />复制给 Agent 的指令</button>
        </div>
        <ol className={styles.onboardingSteps}>
          <li><strong>把 JD 和简历交给 Agent</strong><span>本地材料只读取完成任务所需的内容。</span></li>
          <li><strong>Agent 创建岗位机会</strong><span>结论、证据和产物不再散落在聊天里。</span></li>
          <li><strong>回到作战盘做决定</strong><span>只处理待确认事实和今天最重要的行动。</span></li>
        </ol>
      </section>
    </main>
  );
}

function DemoNotice({ onCopy }: { onCopy: () => void }) {
  return (
    <section className={styles.demoNotice} aria-label="示例工作区说明">
      <div><strong>你正在查看示例机会</strong><p>这些公司、经历和结果都不是你的数据；页面操作仅用于体验，刷新后恢复。</p></div>
      <button onClick={onCopy}><Copy size={15} />用我的岗位开始</button>
    </section>
  );
}

function OpportunityRail({ activeId, opportunities, totalCount, query, onQueryChange, onSelect, onCopy, mobileOpen, onClose }: {
  activeId: string; opportunities: Opportunity[]; totalCount: number; query: string;
  onQueryChange: (value: string) => void; onSelect: (id: string) => void; onCopy: () => void;
  mobileOpen: boolean; onClose: () => void;
}) {
  return (
    <aside className={`${styles.opportunityRail} ${mobileOpen ? styles.mobileRailOpen : ""}`} aria-label="岗位机会">
      <div className={styles.railHeading}>
        <div><h2>机会</h2><p>{totalCount} 个示例岗位</p></div>
        <button className={styles.mobileClose} onClick={onClose} aria-label="关闭机会列表"><X size={19} /></button>
      </div>
      <label className={styles.searchBox}><Search size={16} aria-hidden="true" /><span className="sr-only">搜索公司或岗位</span><input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="搜索公司或岗位" /></label>
      <div className={styles.opportunityList}>
        {opportunities.map((opportunity) => (
          <button key={opportunity.id} className={`${styles.opportunityItem} ${activeId === opportunity.id ? styles.opportunityActive : ""}`} onClick={() => onSelect(opportunity.id)} aria-current={activeId === opportunity.id ? "true" : undefined}>
            <span className={styles.opportunityCompany}>{opportunity.company}</span>
            <strong>{opportunity.role}</strong>
            <span className={styles.opportunityMeta}><span>{opportunity.stageLabel}</span><span>{opportunity.nextEventLabel ?? "等待下一步"}</span></span>
          </button>
        ))}
        {opportunities.length === 0 && <div className={styles.emptySearch}><Search size={18} /><span>没有匹配的岗位</span><button onClick={() => onQueryChange("")}>清除搜索</button></div>}
      </div>
      <button className={styles.addOpportunity} onClick={onCopy}><Plus size={16} /><span><strong>收录新岗位</strong><small>复制指令，让 Agent 创建</small></span></button>
    </aside>
  );
}

function OpportunityHeader({ opportunity }: { opportunity: Opportunity }) {
  return (
    <header className={styles.opportunityHeader}>
      <div className={styles.opportunityTitleBlock}>
        <div className={styles.companyLine}><span>{opportunity.company}</span><span>{opportunity.location}</span></div>
        <h1>{opportunity.role}</h1>
        <div className={styles.headerStatusRow}><span className={styles.stageToken}>{opportunity.stageLabel}</span><span>{opportunity.sourceLabel}</span><span>{opportunity.nextEventLabel ?? "暂无截止事项"}</span></div>
      </div>
    </header>
  );
}

function OverviewTab({ opportunity, onOpenEvidence }: { opportunity: Opportunity; onOpenEvidence: () => void }) {
  const total = coverageTotal(opportunity);
  const strongRatio = total ? Math.round((opportunity.evidenceCoverage.strong / total) * 100) : 0;
  return (
    <div className={styles.overviewFlow}>
      <section className={styles.decisionSection}>
        <div className={styles.sectionHeading}><div><h2>当前判断</h2><p>基于 JD 和已确认经历；待确认内容不计作事实。</p></div><span className={styles.decisionLabel}>{opportunity.recommendationLabel}</span></div>
        <p className={styles.decisionReason}>{opportunity.recommendationReason}</p>
        <div className={styles.decisionFootnote}><ShieldCheck size={16} />结论按胜任证据形成，不使用与能力无关的个人信息。</div>
      </section>
      <section className={styles.coverageSection}>
        <div className={styles.coverageSummary}><div><h2>证据覆盖</h2><p>{opportunity.evidenceCoverage.strong} 条强证据 / {total} 条要求</p></div><strong>{strongRatio}%</strong></div>
        <div className={styles.coverageBar} aria-label={`强证据覆盖 ${strongRatio}%`}><span style={{ width: `${strongRatio}%` }} /></div>
        <div className={styles.coverageLegend}><span><i className={styles.legendStrong} />强证据 {opportunity.evidenceCoverage.strong}</span><span><i className={styles.legendWeak} />弱证据 {opportunity.evidenceCoverage.weak}</span><span><i className={styles.legendUnverified} />待确认 {opportunity.evidenceCoverage.unverified}</span><span><i className={styles.legendMissing} />缺口 {opportunity.evidenceCoverage.missing}</span></div>
      </section>
      <section className={styles.evidencePreviewSection}>
        <div className={styles.sectionHeading}><div><h2>决定性要求</h2><p>先处理最可能改变投递判断的证据。</p></div><button className={styles.textButton} onClick={onOpenEvidence}>查看全部 <ArrowRight size={15} /></button></div>
        <div className={styles.evidencePreviewList}>{opportunity.requirements.slice(0, 3).map((item) => <EvidenceRow key={item.id} item={item} compact />)}</div>
      </section>
      <section className={styles.agentNote}><span className={styles.agentGlyph}><Bot size={18} /></span><div><strong>为什么现在问你</strong><p>商业化结果是唯一可能改变投递结论的事实。先确认它，比继续润色简历更有价值。</p></div></section>
    </div>
  );
}

function EvidenceTab({ opportunity }: { opportunity: Opportunity }) {
  return (
    <section>
      <div className={styles.pageIntro}><div><h2>JD 要求与真实证据</h2><p>每条判断都能回到材料来源；待确认内容不会进入最终简历。</p></div><button className={styles.secondaryButton} disabled title="示例机会没有保存原始 JD"><FileText size={16} />示例无原始 JD</button></div>
      <div className={styles.evidenceTableHeader} aria-hidden="true"><span>岗位要求</span><span>证据判断</span><span>来源</span></div>
      <div className={styles.fullEvidenceList}>{opportunity.requirements.length ? opportunity.requirements.map((item) => <EvidenceRow key={item.id} item={item} />) : <EmptySection label="这个示例还没有证据矩阵。" />}</div>
    </section>
  );
}

function EvidenceRow({ item, compact = false }: { item: RequirementEvidence; compact?: boolean }) {
  const meta = strengthMeta[item.strength];
  return (
    <article className={`${styles.evidenceRow} ${compact ? styles.evidenceRowCompact : ""}`}>
      <div className={styles.requirementCell}><span className={styles.importanceLabel}>{item.importance === "critical" ? "硬要求" : item.importance === "important" ? "重要" : "辅助"}</span><p>{item.requirement}</p></div>
      <div className={styles.evidenceCell}><span className={`${styles.evidenceStatus} ${meta.className}`}>{meta.label}</span><p>{item.evidence}</p></div>
      {!compact && <div className={styles.sourceCell}>{item.source ?? "等待用户确认"}</div>}
    </article>
  );
}

function ResumeTab({ opportunity, onCopy }: { opportunity: Opportunity; onCopy: (prompt: string, success?: string) => void }) {
  return (
    <section>
      <div className={styles.pageIntro}><div><h2>岗位简历 V1</h2><p>这里只显示相对基础简历的修改，不会覆盖原文件。</p></div><button className={styles.primaryButton} onClick={() => onCopy(`请在益职中继续审阅「${opportunity.company} · ${opportunity.role}」的岗位简历，逐项向我确认待审阅修改。`)}><FileCheck2 size={16} />回到 Agent 审阅</button></div>
      <div className={styles.versionLine}><span>当前版本 V1</span><span>{opportunity.resumeChanges.filter((item) => item.status === "pending").length} 处待审阅</span></div>
      <div className={styles.resumeChangeList}>{opportunity.resumeChanges.length ? opportunity.resumeChanges.map((change) => (
        <article key={change.id} className={styles.resumeChange}>
          <header><strong>{change.section}</strong><span>{change.status === "accepted" ? "已接受" : "待审阅"}</span></header>
          <div className={styles.diffGrid}><div><span>原文</span><p>{change.before}</p></div><div><span>建议</span><p>{change.after}</p></div></div>
          <footer><p>{change.reason}</p><span>{change.evidenceId ? "已关联证据" : "需要补证据"}</span></footer>
        </article>
      )) : <EmptySection label="这个机会还没有岗位简历。" />}</div>
    </section>
  );
}

function InterviewTab({ opportunity, onCopy }: { opportunity: Opportunity; onCopy: (prompt: string, success?: string) => void }) {
  return (
    <section>
      <div className={styles.pageIntro}><div><h2>面试作战准备</h2><p>问题来自当前岗位的证据风险，不是随机题库。</p></div><button className={styles.primaryButton} onClick={() => onCopy(`请针对益职中的「${opportunity.company} · ${opportunity.role}」开始一轮模拟面试。一次只问一个问题，优先追问证据薄弱处。`)}><MessageSquareText size={16} />开始模拟</button></div>
      <div className={styles.focusList}>{opportunity.interviewFocus.length ? opportunity.interviewFocus.map((focus) => (
        <article key={focus.id} className={styles.focusItem}><span className={`${styles.readinessDot} ${styles[`readiness_${focus.readiness}`]}`} /><div><strong>{focus.question}</strong><p>{focus.rationale}</p></div><span>{focus.readiness === "ready" ? "已准备" : focus.readiness === "practice" ? "需练习" : "待补充"}</span></article>
      )) : <EmptySection label="进入面试阶段后，Agent 会从当前证据生成追问链。" />}</div>
    </section>
  );
}

function ReviewTab({ opportunity, onCopy }: { opportunity: Opportunity; onCopy: (prompt: string, success?: string) => void }) {
  return <EmptySection icon={<Sparkles size={22} />} label="面试结束后，把转写、笔记或零散回忆交给 Agent。复盘结果会继续更新这个岗位。" actionLabel="复制复盘指令" onAction={() => onCopy(`请复盘我刚结束的「${opportunity.company} · ${opportunity.role}」面试。先逐步帮我还原问题，再把决定性片段和训练任务写回益职。`)} />;
}

function ActivityTab({ opportunity }: { opportunity: Opportunity }) {
  return (
    <section><div className={styles.pageIntro}><div><h2>岗位动态</h2><p>用户、Agent 和系统对这个机会的关键操作记录。</p></div></div><div className={styles.activityList}>{opportunity.activities.length ? opportunity.activities.map((activity) => (
      <article key={activity.id}><span className={styles.activityIcon}>{activity.actor === "agent" ? <Bot size={16} /> : activity.actor === "system" ? <Clock3 size={16} /> : <BriefcaseBusiness size={16} />}</span><div><strong>{activity.title}</strong><p>{activity.detail}</p></div><time>{activity.timeLabel}</time></article>
    )) : <EmptySection label="这个机会还没有动态。" />}</div></section>
  );
}

function ActionRail({ opportunity, onComplete, onAnswer, onSnooze, questionSnoozed, mobileOpen, onClose }: {
  opportunity: Opportunity; onComplete: (id: string) => void; onAnswer: () => void; onSnooze: () => void;
  questionSnoozed: boolean; mobileOpen: boolean; onClose: () => void;
}) {
  const todo = opportunity.actions.filter((action) => action.status !== "done");
  const doneCount = opportunity.actions.length - todo.length;
  return (
    <aside className={`${styles.actionRail} ${mobileOpen ? styles.mobileRailOpen : ""}`} aria-label="下一步">
      <div className={styles.railHeading}><div><h2>下一步</h2><p>按影响排序，不是全部待办</p></div><button className={styles.mobileClose} onClick={onClose} aria-label="关闭下一步"><X size={19} /></button></div>
      <div className={styles.actionList}>{todo.map((action) => <ActionItem key={action.id} action={action} onComplete={onComplete} />)}{!todo.length && <div className={styles.allDone} role="status"><CircleCheck size={24} /><strong>关键行动已完成</strong><p>新的变化出现时，Agent 会更新这里。</p></div>}</div>
      {doneCount > 0 && <p className={styles.doneCount}>{doneCount} 项已完成</p>}
      {!questionSnoozed && <section className={styles.activeQuestion}><div className={styles.questionLabel}><Bot size={15} /> Agent 想确认</div><strong>商业化项目上线后，有可以公开写入简历的结果指标吗？</strong><p>这条事实会直接影响投递判断。没有也可以明确回答“没有”。</p><div className={styles.questionActions}><button onClick={onAnswer}>去回答</button><button onClick={onSnooze}>明天再问</button></div></section>}
      <section className={styles.privacyNote}><ShieldCheck size={17} /><p><strong>示例与真实数据分开</strong><br />当前操作不会写入你的简历或账号数据。</p></section>
    </aside>
  );
}

function ActionItem({ action, onComplete }: { action: OpportunityAction; onComplete: (id: string) => void }) {
  return (
    <article className={styles.actionItem}><span className={`${styles.priorityMark} ${action.priority === "urgent" ? styles.priorityUrgent : ""}`} aria-hidden="true" /><div className={styles.actionContent}><div className={styles.actionTopline}><span className={action.priority === "urgent" ? styles.actionUrgent : styles.actionDue}>{action.dueLabel}</span></div><strong>{action.title}</strong><p>{action.reason}</p><button onClick={() => onComplete(action.id)}><Check size={15} />完成</button></div></article>
  );
}

function EmptySection({ icon, label, actionLabel, onAction }: { icon?: React.ReactNode; label: string; actionLabel?: string; onAction?: () => void }) {
  return <div className={styles.emptySection}>{icon ?? <CircleAlert size={22} />}<p>{label}</p>{actionLabel && <button onClick={onAction}>{actionLabel}<ChevronRight size={14} /></button>}</div>;
}
