"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Bot,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  Clock3,
  FileCheck2,
  FileText,
  LogOut,
  Menu,
  MessageSquareText,
  MoreHorizontal,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
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
  missing: { label: "无证据", className: styles.statusMissing },
  unverified: { label: "待确认", className: styles.statusUnverified },
};

function compactAccountLabel(email?: string) {
  if (!email) return "求职者";
  if (email.startsWith("watcha_")) return "观猹用户";
  const local = email.split("@")[0]?.trim();
  return local ? local.slice(0, 12) : "求职者";
}

function formatCoverage(opportunity: Opportunity) {
  const { strong, weak, missing, unverified } = opportunity.evidenceCoverage;
  return strong + weak + missing + unverified;
}

export function CockpitApp({
  initialOpportunities,
  userEmail,
}: {
  initialOpportunities: Opportunity[];
  userEmail?: string;
}) {
  const router = useRouter();
  const [opportunities, setOpportunities] = useState(initialOpportunities);
  const [activeId, setActiveId] = useState(initialOpportunities[0]?.id ?? "");
  const [activeTab, setActiveTab] = useState<CockpitTab>("overview");
  const [query, setQuery] = useState("");
  const [mobileRail, setMobileRail] = useState<"opportunities" | "actions" | null>(null);
  const [copied, setCopied] = useState(false);

  const active = opportunities.find((item) => item.id === activeId) ?? opportunities[0];
  const filteredOpportunities = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("zh-CN");
    if (!normalized) return opportunities;
    return opportunities.filter((item) =>
      `${item.company} ${item.role}`.toLocaleLowerCase("zh-CN").includes(normalized)
    );
  }, [opportunities, query]);

  if (!active) return null;

  const completeAction = (actionId: string) => {
    setOpportunities((current) =>
      current.map((opportunity) =>
        opportunity.id === active.id
          ? {
              ...opportunity,
              actions: opportunity.actions.map((action) =>
                action.id === actionId ? { ...action, status: "done" as const } : action
              ),
            }
          : opportunity
      )
    );
  };

  const selectOpportunity = (id: string) => {
    setActiveId(id);
    setActiveTab("overview");
    setMobileRail(null);
  };

  const copyAgentPrompt = async () => {
    const prompt = "请把我接下来提供的 JD 加入益职作战盘，创建一个新的岗位机会，并先判断是否值得投。";
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  };

  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true">益</span>
          <span>益职</span>
          <span className={styles.previewBadge}>开发预览</span>
        </div>

        <div className={styles.topbarContext}>
          <span className={styles.syncDot} aria-hidden="true" />
          <span>作战盘已同步</span>
          <span className={styles.topbarDivider} />
          <span>{compactAccountLabel(userEmail)}</span>
          <button className={styles.iconButton} onClick={logout} aria-label="退出登录" title="退出登录">
            <LogOut size={17} aria-hidden="true" />
          </button>
        </div>

        <div className={styles.mobileControls}>
          <button onClick={() => setMobileRail("opportunities")} aria-label="打开机会列表">
            <Menu size={20} />
          </button>
          <button onClick={() => setMobileRail("actions")} aria-label="打开今日行动">
            <Target size={20} />
          </button>
        </div>
      </header>

      <div className={styles.workspace}>
        <OpportunityRail
          activeId={active.id}
          opportunities={filteredOpportunities}
          query={query}
          onQueryChange={setQuery}
          onSelect={selectOpportunity}
          onCopyPrompt={copyAgentPrompt}
          copied={copied}
          mobileOpen={mobileRail === "opportunities"}
          onCloseMobile={() => setMobileRail(null)}
        />

        <section className={styles.document} aria-label={`${active.company} ${active.role}作战档案`}>
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
                {tab.id === "evidence" && <span>{formatCoverage(active)}</span>}
                {tab.id === "resume" && active.resumeChanges.length > 0 && <span>{active.resumeChanges.length}</span>}
              </button>
            ))}
          </nav>

          <div className={styles.documentBody}>
            {activeTab === "overview" && <OverviewTab opportunity={active} onOpenEvidence={() => setActiveTab("evidence")} />}
            {activeTab === "evidence" && <EvidenceTab opportunity={active} />}
            {activeTab === "resume" && <ResumeTab opportunity={active} />}
            {activeTab === "interview" && <InterviewTab opportunity={active} />}
            {activeTab === "review" && <ReviewTab />}
            {activeTab === "activity" && <ActivityTab opportunity={active} />}
          </div>
        </section>

        <ActionRail
          opportunity={active}
          onComplete={completeAction}
          mobileOpen={mobileRail === "actions"}
          onCloseMobile={() => setMobileRail(null)}
        />
      </div>
      {mobileRail && <button className={styles.mobileScrim} onClick={() => setMobileRail(null)} aria-label="关闭侧栏" />}
    </main>
  );
}
function OpportunityRail({
  activeId,
  opportunities,
  query,
  onQueryChange,
  onSelect,
  onCopyPrompt,
  copied,
  mobileOpen,
  onCloseMobile,
}: {
  activeId: string;
  opportunities: Opportunity[];
  query: string;
  onQueryChange: (value: string) => void;
  onSelect: (id: string) => void;
  onCopyPrompt: () => void;
  copied: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  return (
    <aside className={`${styles.opportunityRail} ${mobileOpen ? styles.mobileRailOpen : ""}`} aria-label="岗位机会">
      <div className={styles.railHeading}>
        <div>
          <h2>我的机会</h2>
          <p>{opportunities.length} 个正在推进</p>
        </div>
        <button className={styles.mobileClose} onClick={onCloseMobile} aria-label="关闭机会列表"><X size={19} /></button>
      </div>

      <label className={styles.searchBox}>
        <Search size={16} aria-hidden="true" />
        <span className="sr-only">搜索公司或岗位</span>
        <input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="搜索公司或岗位" />
      </label>

      <div className={styles.opportunityList}>
        {opportunities.map((opportunity) => (
          <button
            key={opportunity.id}
            className={`${styles.opportunityItem} ${activeId === opportunity.id ? styles.opportunityActive : ""}`}
            onClick={() => onSelect(opportunity.id)}
            aria-current={activeId === opportunity.id ? "true" : undefined}
          >
            <span className={styles.opportunityCompany}>{opportunity.company}</span>
            <strong>{opportunity.role}</strong>
            <span className={styles.opportunityMeta}>
              <span>{opportunity.stageLabel}</span>
              {opportunity.nextEventLabel && <span>{opportunity.nextEventLabel}</span>}
            </span>
          </button>
        ))}
        {opportunities.length === 0 && <p className={styles.emptySearch}>没有匹配的岗位。</p>}
      </div>

      <div className={styles.addOpportunity}>
        <p>看到新 JD？交给你的 Agent，不必先填表。</p>
        <button onClick={onCopyPrompt}>
          {copied ? <Check size={16} /> : <Plus size={16} />}
          {copied ? "提示词已复制" : "复制收岗位提示词"}
        </button>
      </div>
    </aside>
  );
}

function OpportunityHeader({ opportunity }: { opportunity: Opportunity }) {
  return (
    <header className={styles.opportunityHeader}>
      <div className={styles.opportunityTitleBlock}>
        <div className={styles.companyLine}>
          <span>{opportunity.company}</span>
          <span>{opportunity.location}</span>
          <span>{opportunity.sourceLabel}</span>
        </div>
        <h1>{opportunity.role}</h1>
        <div className={styles.headerStatusRow}>
          <span className={styles.stageToken}>{opportunity.stageLabel}</span>
          <span>收录于 {opportunity.capturedAtLabel}</span>
          {opportunity.nextEventLabel && <span>{opportunity.nextEventLabel}</span>}
        </div>
      </div>
      <button className={styles.moreButton} aria-label="更多岗位操作"><MoreHorizontal size={20} /></button>
    </header>
  );
}

function OverviewTab({ opportunity, onOpenEvidence }: { opportunity: Opportunity; onOpenEvidence: () => void }) {
  const total = formatCoverage(opportunity);
  const strongRatio = total > 0 ? Math.round((opportunity.evidenceCoverage.strong / total) * 100) : 0;
  const evidencePreview = opportunity.requirements.slice(0, 3);

  return (
    <div className={styles.overviewFlow}>
      <section className={styles.decisionSection}>
        <div className={styles.sectionHeading}>
          <div>
            <h2>当前判断</h2>
            <p>由 Agent 根据 JD 与已确认经历生成，等待你补齐关键事实。</p>
          </div>
          <span className={styles.decisionLabel}>{opportunity.recommendationLabel}</span>
        </div>
        <p className={styles.decisionReason}>{opportunity.recommendationReason}</p>
        <div className={styles.decisionFootnote}>
          <ShieldCheck size={16} aria-hidden="true" />
          结论基于证据，不使用学校、年龄、性别等与胜任力无关的信息。
        </div>
      </section>

      <section className={styles.coverageSection}>
        <div className={styles.coverageSummary}>
          <div>
            <h2>证据覆盖</h2>
            <p><strong>{opportunity.evidenceCoverage.strong}</strong> 条强证据覆盖 {total} 条要求</p>
          </div>
          <div className={styles.coverageNumber} aria-label={`强证据覆盖比例 ${strongRatio}%`}>
            {strongRatio}<span>%</span>
          </div>
        </div>
        <div className={styles.coverageBar} aria-hidden="true">
          <span style={{ width: `${strongRatio}%` }} />
        </div>
        <div className={styles.coverageLegend}>
          <span><i className={styles.legendStrong} />强证据 {opportunity.evidenceCoverage.strong}</span>
          <span><i className={styles.legendWeak} />弱证据 {opportunity.evidenceCoverage.weak}</span>
          <span><i className={styles.legendUnverified} />待确认 {opportunity.evidenceCoverage.unverified}</span>
          <span><i className={styles.legendMissing} />缺口 {opportunity.evidenceCoverage.missing}</span>
        </div>
      </section>

      <section className={styles.evidencePreviewSection}>
        <div className={styles.sectionHeading}>
          <div>
            <h2>决定性要求</h2>
            <p>先看最可能影响投递和面试的证据。</p>
          </div>
          <button className={styles.textButton} onClick={onOpenEvidence}>查看全部 <ArrowRight size={15} /></button>
        </div>
        <div className={styles.evidencePreviewList}>
          {evidencePreview.length ? evidencePreview.map((item) => <EvidenceRow key={item.id} item={item} compact />) : <EmptySection label="这个机会还没有完成 JD 拆解。" />}
        </div>
      </section>

      <section className={styles.agentNote}>
        <span className={styles.agentGlyph}><Bot size={18} /></span>
        <div>
          <strong>Agent 刚刚发现</strong>
          <p>商业化经历会显著改变投递判断。与其继续润色措辞，现在更值得先确认你在付费版本中的职责和结果。</p>
        </div>
        <span>10 分钟前</span>
      </section>
    </div>
  );
}

function EvidenceTab({ opportunity }: { opportunity: Opportunity }) {
  return (
    <section>
      <div className={styles.pageIntro}>
        <div>
          <h2>JD 要求与真实证据</h2>
          <p>每条判断都要能回到你的经历或材料；“待确认”不会被写进最终简历。</p>
        </div>
        <button className={styles.secondaryButton}><FileText size={16} />查看原始 JD</button>
      </div>
      <div className={styles.evidenceTableHeader} aria-hidden="true">
        <span>岗位要求</span><span>证据判断</span><span>来源</span>
      </div>
      <div className={styles.fullEvidenceList}>
        {opportunity.requirements.length ? opportunity.requirements.map((item) => <EvidenceRow key={item.id} item={item} />) : <EmptySection label="Agent 尚未为这个机会建立证据矩阵。" />}
      </div>
    </section>
  );
}

function EvidenceRow({ item, compact = false }: { item: RequirementEvidence; compact?: boolean }) {
  const meta = strengthMeta[item.strength];
  return (
    <article className={`${styles.evidenceRow} ${compact ? styles.evidenceRowCompact : ""}`}>
      <div className={styles.requirementCell}>
        <span className={styles.importanceLabel}>{item.importance === "critical" ? "硬要求" : item.importance === "important" ? "重要" : "辅助"}</span>
        <p>{item.requirement}</p>
      </div>
      <div className={styles.evidenceCell}>
        <span className={`${styles.evidenceStatus} ${meta.className}`}>{meta.label}</span>
        <p>{item.evidence}</p>
      </div>
      {!compact && <div className={styles.sourceCell}>{item.source ?? "等待用户确认"}</div>}
    </article>
  );
}

function ResumeTab({ opportunity }: { opportunity: Opportunity }) {
  return (
    <section>
      <div className={styles.pageIntro}>
        <div>
          <h2>岗位简历 V1</h2>
          <p>Agent 只调整证据顺序和表达，不覆盖你的基础简历。</p>
        </div>
        <button className={styles.primaryButton}><FileCheck2 size={16} />审阅全部修改</button>
      </div>
      <div className={styles.versionLine}>
        <span>当前版本 V1</span>
        <span>{opportunity.resumeChanges.filter((item) => item.status === "pending").length} 处待审阅</span>
        <button>查看版本历史 <ChevronDown size={14} /></button>
      </div>
      <div className={styles.resumeChangeList}>
        {opportunity.resumeChanges.length ? opportunity.resumeChanges.map((change) => (
          <article key={change.id} className={styles.resumeChange}>
            <header><strong>{change.section}</strong><span>{change.status === "accepted" ? "已接受" : "待审阅"}</span></header>
            <div className={styles.diffGrid}>
              <div><span>原文</span><p>{change.before}</p></div>
              <div><span>建议</span><p>{change.after}</p></div>
            </div>
            <footer><p>{change.reason}</p><button>查看证据</button></footer>
          </article>
        )) : <EmptySection label="这个机会还没有生成岗位简历。" />}
      </div>
    </section>
  );
}

function InterviewTab({ opportunity }: { opportunity: Opportunity }) {
  return (
    <section>
      <div className={styles.pageIntro}>
        <div>
          <h2>面试作战准备</h2>
          <p>问题来自当前 JD、简历版本和证据风险，不是随机题库。</p>
        </div>
        <button className={styles.primaryButton}><MessageSquareText size={16} />开始针对性模拟</button>
      </div>
      <div className={styles.focusList}>
        {opportunity.interviewFocus.length ? opportunity.interviewFocus.map((focus) => (
          <article key={focus.id} className={styles.focusItem}>
            <span className={`${styles.readinessDot} ${styles[`readiness_${focus.readiness}`]}`} />
            <div><strong>{focus.question}</strong><p>{focus.rationale}</p></div>
            <span>{focus.readiness === "ready" ? "已准备" : focus.readiness === "practice" ? "需练习" : "待补充"}</span>
          </article>
        )) : <EmptySection label="还没有面试计划。进入面试阶段后，Agent 会从当前证据生成追问链。" />}
      </div>
    </section>
  );
}

function ReviewTab() {
  return (
    <EmptySection
      icon={<Sparkles size={22} />}
      label="面试结束后，把录音、转写或零散回忆交给 Agent。复盘会继续更新这个岗位，而不是另开一份孤立报告。"
      actionLabel="复制面后复盘提示词"
    />
  );
}

function ActivityTab({ opportunity }: { opportunity: Opportunity }) {
  return (
    <section>
      <div className={styles.pageIntro}><div><h2>岗位动态</h2><p>用户、Agent 和系统对这个机会的所有关键操作。</p></div></div>
      <div className={styles.activityList}>
        {opportunity.activities.length ? opportunity.activities.map((activity) => (
          <article key={activity.id}>
            <span className={styles.activityIcon}>{activity.actor === "agent" ? <Bot size={16} /> : activity.actor === "system" ? <Clock3 size={16} /> : <BriefcaseBusiness size={16} />}</span>
            <div><strong>{activity.title}</strong><p>{activity.detail}</p></div>
            <time>{activity.timeLabel}</time>
          </article>
        )) : <EmptySection label="这个机会还没有动态。" />}
      </div>
    </section>
  );
}

function ActionRail({
  opportunity,
  onComplete,
  mobileOpen,
  onCloseMobile,
}: {
  opportunity: Opportunity;
  onComplete: (id: string) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  const todoActions = opportunity.actions.filter((action) => action.status !== "done");
  const doneCount = opportunity.actions.length - todoActions.length;

  return (
    <aside className={`${styles.actionRail} ${mobileOpen ? styles.mobileRailOpen : ""}`} aria-label="今日行动">
      <div className={styles.railHeading}>
        <div><h2>今日行动</h2><p>只保留最值得做的事</p></div>
        <button className={styles.mobileClose} onClick={onCloseMobile} aria-label="关闭今日行动"><X size={19} /></button>
      </div>

      <div className={styles.actionList}>
        {todoActions.map((action, index) => (
          <ActionItem key={action.id} action={action} index={index + 1} onComplete={onComplete} />
        ))}
        {todoActions.length === 0 && (
          <div className={styles.allDone} role="status"><CircleCheck size={24} /><strong>今天的关键行动已完成</strong><p>新的变化出现时，Agent 会再更新这里。</p></div>
        )}
      </div>

      {doneCount > 0 && <p className={styles.doneCount}>{doneCount} 项已完成</p>}

      <section className={styles.activeQuestion}>
        <div className={styles.questionLabel}><Bot size={15} /> Agent 想确认</div>
        <strong>商业化项目上线后，有可以公开写入简历的结果指标吗？</strong>
        <p>例如付费转化、收入、续费或客户数量。没有也可以直接说明。</p>
        <div className={styles.questionActions}>
          <button>现在回答</button>
          <button>稍后提醒</button>
        </div>
      </section>

      <section className={styles.privacyNote}>
        <ShieldCheck size={17} />
        <p><strong>材料默认私密</strong><br />演示数据不会写入真实简历；后续同步原文件前会明确说明。</p>
      </section>
    </aside>
  );
}

function ActionItem({ action, index, onComplete }: { action: OpportunityAction; index: number; onComplete: (id: string) => void }) {
  return (
    <article className={styles.actionItem}>
      <div className={styles.actionIndex}>{String(index).padStart(2, "0")}</div>
      <div className={styles.actionContent}>
        <div className={styles.actionTopline}>
          <span className={action.priority === "urgent" ? styles.actionUrgent : styles.actionDue}>{action.dueLabel}</span>
        </div>
        <strong>{action.title}</strong>
        <p>{action.reason}</p>
        <button onClick={() => onComplete(action.id)}><Check size={15} />标记完成</button>
      </div>
    </article>
  );
}

function EmptySection({ icon, label, actionLabel }: { icon?: React.ReactNode; label: string; actionLabel?: string }) {
  return (
    <div className={styles.emptySection}>
      {icon ?? <CircleAlert size={22} />}
      <p>{label}</p>
      {actionLabel && <button>{actionLabel}</button>}
    </div>
  );
}
