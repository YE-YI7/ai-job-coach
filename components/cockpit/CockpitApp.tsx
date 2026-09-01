"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Clock3,
  FileText,
  ListTodo,
  Link2,
  LogOut,
  Menu,
  MessageSquareText,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  X,
} from "lucide-react";
import type {
  EvidenceStrength,
  InterviewReviewReport,
  Opportunity,
  OpportunityAction,
  RequirementEvidence,
} from "@/lib/opportunities/types";
import { TodayCoach } from "./TodayCoach";
import { getTodayMentorPlan } from "@/lib/coach-harness/next-action";
import { trackProductEvent } from "@/lib/product-events";
import { TokenPayWidget } from "@/components/tokenpay/TokenPayWidget";
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

const LOCAL_OPPORTUNITIES_KEY = "yi-zhi-web-opportunities-v1";

function Brand() {
  return (
    <div className={styles.brand}>
      <Image className={styles.brandLogo} src="/logo.png" alt="益职 Logo" width={36} height={36} priority />
      <span>益职</span>
    </div>
  );
}

function compactAccountLabel(email?: string) {
  if (!email) return "求职者";
  if (email.startsWith("watcha_")) return "观猹用户";
  return email.split("@")[0]?.trim().slice(0, 12) || "求职者";
}

function coverageTotal(opportunity: Opportunity) {
  const { strong, weak, missing, unverified } = opportunity.evidenceCoverage;
  return strong + weak + missing + unverified;
}

function useQuotaLabel(type: "chat" | "resume" | "interview") {
  const [label, setLabel] = useState("1 次额度");
  useEffect(() => {
    let active = true;
    fetch("/api/quota/check").then((response) => response.json()).then((result) => {
      const check = result?.checks?.[type];
      if (!active || !check) return;
      if (check.source === "tokenpay") {
        setLabel("使用 TokenPay 余额");
        return;
      }
      setLabel(check.allowed ? `${check.source === "free" ? "免费" : "付费"}剩余 ${check.remaining} 次` : "额度不足");
    }).catch(() => undefined);
    return () => { active = false; };
  }, [type]);
  return label;
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
  const [surface, setSurface] = useState<"today" | "opportunity">("today");
  const [query, setQuery] = useState("");
  const [mobileRail, setMobileRail] = useState<Rail>(null);
  const [notice, setNotice] = useState("");
  const [questionSnoozed, setQuestionSnoozed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createOrigin, setCreateOrigin] = useState<"today" | "opportunity">("today");
  const [generatingResume, setGeneratingResume] = useState(false);
  const [freezingResume, setFreezingResume] = useState(false);
  const [reviewingInterview, setReviewingInterview] = useState(false);
  const [localIds, setLocalIds] = useState<string[]>([]);
  const [localLoaded, setLocalLoaded] = useState(false);
  const viewTracked = useRef(false);

  useEffect(() => {
    if (dataMode !== "live" || viewTracked.current) return;
    viewTracked.current = true;
    trackProductEvent("cockpit_viewed", {
      opportunity_count: initialOpportunities.length,
      has_preparation_workspace: initialOpportunities.some((item) => item.workspaceType === "preparation"),
    });
  }, [dataMode, initialOpportunities]);

  useEffect(() => {
    if (dataMode === "demo") {
      setLocalLoaded(true);
      return;
    }
    try {
      const stored = JSON.parse(window.localStorage.getItem(LOCAL_OPPORTUNITIES_KEY) || "[]") as Opportunity[];
      const valid = stored.filter((item) => item?.id && item?.company && item?.role);
      if (valid.length) {
        setOpportunities((current) => [...valid, ...current.filter((item) => !valid.some((saved) => saved.id === item.id))]);
        setLocalIds(valid.map((item) => item.id));
      }
    } catch {
      window.localStorage.removeItem(LOCAL_OPPORTUNITIES_KEY);
    } finally {
      setLocalLoaded(true);
    }
  }, [dataMode]);

  useEffect(() => {
    if (!localLoaded || dataMode === "demo") return;
    const local = opportunities.filter((item) => localIds.includes(item.id));
    window.localStorage.setItem(LOCAL_OPPORTUNITIES_KEY, JSON.stringify(local));
  }, [dataMode, localIds, localLoaded, opportunities]);

  useEffect(() => {
    if (!localLoaded || dataMode !== "live") return;
    const timer = window.setTimeout(() => {
      for (const opportunity of opportunities.filter((item) => !localIds.includes(item.id))) {
        fetch("/api/coach/opportunities", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ opportunity }),
        }).catch(() => undefined);
      }
    }, 900);
    return () => window.clearTimeout(timer);
  }, [dataMode, localIds, localLoaded, opportunities]);

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

  const completeAction = (actionId: string) => {
    if (!active) return;
    setOpportunities((current) => current.map((opportunity) =>
      opportunity.id === active.id
        ? { ...opportunity, actions: opportunity.actions.map((action) =>
            action.id === actionId ? { ...action, status: "done" as const } : action) }
        : opportunity
    ));
    if (dataMode === "live") trackProductEvent("today_action_completed", { opportunity_id: active.id, action_id: actionId });
    announce(localIds.includes(active.id)
      ? "行动已保存到当前浏览器"
      : dataMode === "live"
        ? "行动已同步到个人工作区"
        : "示例行动已完成；刷新后会恢复");
  };

  const snoozeMentorAction = () => {
    const focus = getTodayMentorPlan(opportunities).focus;
    if (!focus?.opportunityId) {
      announce("没有可延后的行动");
      return;
    }
    const until = new Date();
    until.setDate(until.getDate() + 1);
    until.setHours(10, 0, 0, 0);
    setOpportunities((current) => current.map((opportunity) => opportunity.id !== focus.opportunityId ? opportunity : {
      ...opportunity,
      mentorSnoozes: [
        ...(opportunity.mentorSnoozes || []).filter((item) => item.actionId !== focus.id),
        { actionId: focus.id, until: until.toISOString() },
      ],
      activities: [{
        id: `${opportunity.id}-snooze-${Date.now()}`,
        actor: "user" as const,
        title: "将导师行动延后到明天",
        detail: focus.title,
        timeLabel: "刚刚",
      }, ...opportunity.activities],
    }));
    if (dataMode === "live") trackProductEvent("mentor_action_snoozed", { opportunity_id: focus.opportunityId, action_id: focus.id });
    announce("已延后到明天 10:00；导师会先安排其他更紧急的事");
  };

  const submitMentorFeedback = (input: { reason: "already_done" | "wrong_priority" | "missing_context"; opportunityId: string | null; actionId: string; sourceActionId?: string }) => {
    if (!input.opportunityId) {
      announce("先添加一份材料，我才能调整安排");
      return;
    }
    const labels = {
      already_done: "这件事已经做完",
      wrong_priority: "现在不是最高优先级",
      missing_context: "导师缺少重要背景",
    } as const;
    const until = new Date();
    until.setDate(until.getDate() + 1);
    until.setHours(10, 0, 0, 0);
    setOpportunities((current) => current.map((opportunity) => {
      if (opportunity.id !== input.opportunityId) return opportunity;
      const actions = input.reason === "already_done" && input.sourceActionId
        ? opportunity.actions.map((action) => action.id === input.sourceActionId ? { ...action, status: "done" as const } : action)
        : opportunity.actions;
      const hiddenUntil = input.reason === "already_done" && !input.sourceActionId
        ? new Date("2100-01-01T00:00:00.000Z").toISOString()
        : until.toISOString();
      const mentorSnoozes = input.reason !== "missing_context"
        ? [...(opportunity.mentorSnoozes || []).filter((item) => item.actionId !== input.actionId), { actionId: input.actionId, until: hiddenUntil }]
        : opportunity.mentorSnoozes;
      return {
        ...opportunity,
        actions,
        mentorSnoozes,
        activities: [{ id: `${opportunity.id}-mentor-feedback-${Date.now()}`, actor: "user" as const, title: "纠正导师建议", detail: labels[input.reason], timeLabel: "刚刚" }, ...opportunity.activities],
      };
    }));
    if (dataMode === "live") trackProductEvent("mentor_feedback_submitted", { opportunity_id: input.opportunityId, reason: input.reason });
    if (input.reason === "missing_context") {
      setActiveId(input.opportunityId);
      setActiveTab("evidence");
      setSurface("opportunity");
      announce("已打开经历证据；补一条背景后导师会重新排序");
      return;
    }
    announce(input.reason === "already_done" ? "已标记完成，导师正在重新安排" : "已延后这一步，导师正在重新排序");
  };

  const createOpportunity = async (intake: OpportunityIntake) => {
    if (dataMode === "live") trackProductEvent("material_intake_started", { input_type: intake.file ? "file" : "text_or_link" });
    const requestBody = intake.file ? new FormData() : null;
    const requestId = crypto.randomUUID();
    if (requestBody) {
      requestBody.set("requestId", requestId);
      requestBody.set("file", intake.file as File);
      if (intake.sourceText.trim()) requestBody.set("sourceText", intake.sourceText.trim());
    }
    const response = await fetch("/api/opportunities/analyze", {
      method: "POST",
      headers: requestBody ? undefined : { "Content-Type": "application/json" },
      body: requestBody ?? JSON.stringify({ sourceText: intake.sourceText, requestId }),
    });
    const result = await response.json();
    if (!response.ok || !result.ok || !result.input) {
      if (dataMode === "live") trackProductEvent("material_intake_failed", { input_type: intake.file ? "file" : "text_or_link", status: response.status });
      throw new Error(result.error || "材料暂时读不了，请重试");
    }

    const input = result.input as NewOpportunityInput;
    const analysis = result.analysis as Partial<Opportunity>;

    const localId = `web-${Date.now()}`;
    const opportunityDraft: Omit<Opportunity, "id"> = {
      workspaceType: input.workspaceType || "job",
      company: input.company.trim(),
      role: input.role.trim(),
      location: input.location.trim() || "地点待确认",
      stage: "evaluating",
      stageLabel: input.workspaceType === "preparation" ? "准备中" : "评估中",
      priority: "medium",
      sourceLabel: input.sourceLabel || "网页材料导入",
      capturedAtLabel: "刚刚",
      jdText: input.jdText.trim(),
      resumeText: input.resumeText.trim(),
      profileText: input.profileText?.trim(),
      nextEventLabel: input.workspaceType === "preparation" ? "今天完成第一步" : "今天完成投递判断",
      recommendation: analysis?.recommendation ?? "prepare_then_apply",
      recommendationLabel: analysis?.recommendationLabel ?? "等待完成分析",
      recommendationReason: analysis?.recommendationReason ?? "岗位已收录。当前未形成可靠结论，请继续补充真实经历。",
      evidenceCoverage: analysis?.evidenceCoverage ?? { strong: 0, weak: 0, missing: 1, unverified: 0 },
      requirements: analysis?.requirements ?? [{
        id: `${localId}-req-1`,
        requirement: "将 JD 关键要求与真实经历建立对应",
        importance: "critical",
        strength: "missing",
        evidence: input.resumeText.trim() ? "分析暂未完成，简历原文已保存。" : "尚未提供简历或经历证据。",
        source: input.resumeText.trim() ? "网页提供的简历" : null,
        verified: Boolean(input.resumeText.trim()),
      }],
      actions: analysis?.actions ?? [{ id: `${localId}-action-1`, title: input.resumeText.trim() ? "核对简历与 JD 的对应证据" : "补充简历或经历概览", reason: "没有真实经历证据，不能判断这个岗位是否值得投。", dueLabel: "今天", priority: "urgent", status: "todo" }],
      activities: [{ id: `${localId}-activity-1`, actor: "user", title: "在网页创建岗位机会", detail: `已收录 ${input.company.trim()} · ${input.role.trim()} 的 JD。`, timeLabel: "刚刚" }],
      resumeChanges: [],
      interviewFocus: analysis?.interviewFocus ?? [],
    };
    let opportunity: Opportunity = { ...opportunityDraft, id: localId };
    try {
      const response = await fetch("/api/coach/opportunities", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ opportunity: opportunityDraft }) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "同步失败");
      opportunity = result.opportunity;
    } catch {
      setLocalIds((current) => [localId, ...current]);
    }
    setOpportunities((current) => [opportunity, ...current]);
    setActiveId(opportunity.id);
    setActiveTab("overview");
    setCreating(false);
    if (dataMode === "live") trackProductEvent("material_intake_completed", { opportunity_id: opportunity.id, workspace_type: opportunity.workspaceType || "job", synced: opportunity.id !== localId });
    announce(opportunity.id === localId ? "岗位已保存到当前浏览器，云同步稍后重试" : analysis ? "岗位已同步并完成初步分析" : "岗位已同步，分析暂未完成");
  };

  const updateResumeChange = (changeId: string, status: "accepted" | "rejected") => {
    if (!active) return;
    setOpportunities((current) => current.map((item) => item.id === active.id ? { ...item, resumeChanges: item.resumeChanges.map((change) => change.id === changeId ? { ...change, status } : change) } : item));
    if (dataMode === "live") trackProductEvent("resume_change_reviewed", { opportunity_id: active.id, decision: status });
    announce(status === "accepted" ? "已接受这处修改" : "已保留原文");
  };

  const generateResumeDraft = async () => {
    if (!active?.resumeText || !active.jdText || generatingResume) {
      announce("请先补充简历和 JD");
      return;
    }
    setGeneratingResume(true);
    if (dataMode === "live") trackProductEvent("resume_generation_started", { opportunity_id: active.id });
    try {
      const response = await fetch("/api/coach/resume-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opportunityId: active.id, resumeText: active.resumeText, jobDescription: active.jdText, requestId: `${active.id}:${Date.now()}` }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "生成失败");
      setOpportunities((current) => current.map((item) => item.id === active.id ? {
        ...item,
        resumeChanges: result.changes,
        applicationQuality: result.applicationQuality,
        activities: [{ id: `${item.id}-resume-${Date.now()}`, actor: "analysis" as const, title: "生成岗位简历建议", detail: `${result.changes.length} 处修改已完成事实、独立复核与 ATS 检查。`, timeLabel: "刚刚" }, ...item.activities],
      } : item));
      if (dataMode === "live") trackProductEvent("resume_generation_completed", { opportunity_id: active.id, change_count: result.changes.length });
      announce(`${result.changes.length} 处建议已生成并完成事实校验${typeof result.quota?.remaining === "number" ? ` · 剩余 ${result.quota.remaining} 次` : ""}`);
    } catch (error) {
      if (dataMode === "live") trackProductEvent("resume_generation_failed", { opportunity_id: active.id });
      announce(error instanceof Error ? error.message : "简历生成失败");
    } finally {
      setGeneratingResume(false);
    }
  };

  const freezeResumeVersion = async () => {
    if (!active?.resumeText || !active.jdText || !active.applicationQuality || freezingResume) return;
    if (active.resumeChanges.some((change) => change.status === "pending")) return announce("请先逐条接受或保留原文");
    setFreezingResume(true);
    try {
      const response = await fetch("/api/coach/application-pack", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opportunityId: active.id, artifactId: active.applicationQuality.artifactId, resumeText: active.resumeText, jobDescription: active.jdText, changes: active.resumeChanges }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "保存失败");
      setOpportunities((current) => current.map((item) => item.id !== active.id ? item : {
        ...item, resumeText: result.resumeText,
        applicationQuality: { artifactId: result.artifactId, version: result.version, status: "ready" as const, reviews: [
          { reviewerType: "facts" as const, status: "passed" as const, summary: "投递文本只使用已确认事实。" },
          { reviewerType: "independent_ai" as const, status: "passed" as const, summary: "起草版本已通过独立复核。" },
          { reviewerType: "ats" as const, status: "passed" as const, summary: "文本可被 ATS 解析。" },
          { reviewerType: "pdf" as const, status: "not_run" as const, summary: "导出 PDF 后上传校验文字层。" },
        ] },
        snapshots: [{ id: `snapshot-${Date.now()}`, snapshotType: "submitted_resume" as const, version: result.snapshotVersion, title: "投递简历", frozenAt: new Date().toISOString() }, ...(item.snapshots || [])],
        activities: [{ id: `${item.id}-frozen-${Date.now()}`, actor: "user" as const, title: `冻结投递简历 V${result.snapshotVersion}`, detail: "事实与 ATS 校验通过；等待 PDF 文字层校验。", timeLabel: "刚刚" }, ...item.activities],
      }));
      announce(`投递版本 V${result.snapshotVersion} 已冻结`);
    } catch (error) { announce(error instanceof Error ? error.message : "保存失败"); }
    finally { setFreezingResume(false); }
  };

  const openInterviewRoundtable = () => {
    if (!active?.jdText) return announce("请先补充 JD");
    window.localStorage.setItem("interview_role", active.jdText);
    window.localStorage.setItem("interview_round", "业务面");
    window.localStorage.setItem("interview_questionCount", "3");
    window.localStorage.setItem("yi-zhi-interview-opportunity-id", active.id);
    window.localStorage.removeItem("interview_messages");
    if (dataMode === "live") trackProductEvent("mock_interview_started", { opportunity_id: active.id, round: "business" });
    router.push("/interview/start?from=cockpit");
  };

  const saveQuestionAnswer = (answer: string) => {
    if (!active) return;
    const target = active.requirements.find((item) => item.strength === "unverified");
    if (dataMode === "live" && !localIds.includes(active.id)) {
      void fetch("/api/coach/claims", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        opportunityId: active.id, entityType: "experience", entityKey: `user-answer-${target?.id || Date.now()}`,
        claimType: "user_confirmed_answer", value: answer, displayText: answer, sourceExcerpt: answer,
        status: "confirmed", visibility: "recruiter_safe",
      }) });
    }
    setOpportunities((current) => current.map((item) => item.id !== active.id ? item : {
      ...item,
      requirements: item.requirements.map((requirement) => requirement.id === target?.id ? { ...requirement, evidence: `用户补充：${answer}`, source: "网页回答 · 刚刚", verified: true, strength: "weak" as const } : requirement),
      evidenceCoverage: target ? { ...item.evidenceCoverage, weak: item.evidenceCoverage.weak + 1, unverified: Math.max(0, item.evidenceCoverage.unverified - 1) } : item.evidenceCoverage,
      actions: item.actions.map((action) => action.id === "action-1" ? { ...action, status: "done" as const } : action),
      activities: [{ id: `${item.id}-answer-${Date.now()}`, actor: "user" as const, title: "补充一条关键事实", detail: answer, timeLabel: "刚刚" }, ...item.activities],
    }));
    if (dataMode === "live") trackProductEvent("evidence_confirmed", { opportunity_id: active.id, requirement_id: target?.id || "unknown" });
    announce("已记录为用户确认事实");
  };

  const analyzeReview = async (round: string, notes: string) => {
    if (!active || reviewingInterview) return;
    setReviewingInterview(true);
    const requestId = crypto.randomUUID();
    if (dataMode === "live") trackProductEvent("interview_review_started", { opportunity_id: active.id, round });
    try {
      const response = await fetch("/api/interview/review", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-idempotency-key": requestId },
        body: JSON.stringify({
          interviewContent: notes,
          company: active.company,
          role: active.role,
          round,
          resumeText: active.resumeText || "",
          jobDescription: active.jdText || "",
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok || !result.analysis) throw new Error(result.error || "复盘失败");
      const analysis = result.analysis as Record<string, unknown>;
      const report: InterviewReviewReport = {
        id: `review-${Date.now()}`,
        round,
        grade: String(analysis.overall_grade || "待复核").slice(0, 20),
        overallComment: String(analysis.overall_comment || "已完成复盘。").slice(0, 1200),
        strengths: Array.isArray(analysis.key_strengths) ? analysis.key_strengths.map(String).slice(0, 5) : [],
        improvements: Array.isArray(analysis.key_improvements) ? analysis.key_improvements.map(String).slice(0, 5) : [],
        actions: Array.isArray(analysis.action_items) ? analysis.action_items.map(String).slice(0, 5) : [],
        sourceNotes: notes.slice(0, 30_000),
        createdAt: new Date().toISOString(),
      };
      if (dataMode === "live" && !localIds.includes(active.id)) {
        void fetch("/api/coach/snapshots", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ opportunityId: active.id, snapshotType: "interview_feedback", title: `${round}复盘`, content: report, metadata: { round } }) });
      }
      setOpportunities((current) => current.map((item) => item.id === active.id ? {
        ...item,
        reviewReports: [report, ...(item.reviewReports || [])],
        activities: [{ id: `${item.id}-review-${Date.now()}`, actor: "analysis", title: `完成${round} AI 复盘`, detail: `${report.grade} · ${report.overallComment}`, timeLabel: "刚刚" }, ...item.activities],
      } : item));
      if (dataMode === "live") trackProductEvent("interview_review_completed", { opportunity_id: active.id, round, grade: report.grade });
      announce(`${round}复盘完成${response.headers.get("x-yi-zhi-quota-remaining") ? ` · 剩余 ${response.headers.get("x-yi-zhi-quota-remaining")} 次` : ""}`);
    } catch (error) {
      if (dataMode === "live") trackProductEvent("interview_review_failed", { opportunity_id: active.id, round });
      announce(error instanceof Error ? error.message : "复盘失败");
      throw error;
    } finally {
      setReviewingInterview(false);
    }
  };

  const saveInterviewAnswer = (question: string, answer: string) => {
    if (!active) return;
    setOpportunities((current) => current.map((item) => item.id === active.id ? { ...item, activities: [{ id: `${item.id}-practice-${Date.now()}`, actor: "user", title: `练习面试题：${question}`, detail: answer, timeLabel: "刚刚" }, ...item.activities] } : item));
    if (dataMode === "live") trackProductEvent("interview_practice_saved", { opportunity_id: active.id });
    announce("练习回答已保存到这个岗位");
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  };

  const openFromToday = (tab: CockpitTab) => {
    setActiveTab(tab);
    setCreating(false);
    setSurface("opportunity");
  };

  if (surface === "today" && !creating) {
    return (
      <TodayCoach
        opportunities={opportunities}
        activeId={active?.id ?? ""}
        accountLabel={compactAccountLabel(userEmail)}
        notice={notice}
        onSelect={(id) => { setActiveId(id); setQuestionSnoozed(false); }}
        onOpenTab={openFromToday}
        onCreate={() => { setCreateOrigin("today"); setCreating(true); setSurface("opportunity"); }}
        onSnooze={snoozeMentorAction}
        onFeedback={submitMentorFeedback}
        onShowRules={() => announce("跟踪、提醒与一致性检查免费；生成和模拟面试执行前明示额度")}
      />
    );
  }

  if (!active && !creating) return <EmptyCockpit userEmail={userEmail} onCreate={() => { setCreateOrigin("opportunity"); setCreating(true); }} onLogout={logout} />;

  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.detailBrand}><Brand /><button type="button" onClick={() => { setCreating(false); setSurface("today"); }}>返回今日</button></div>
        <div className={styles.topbarContext}>
          <span className={dataMode === "demo" ? styles.demoState : styles.liveState}>
            {creating ? "新建岗位" : active && localIds.includes(active.id) ? "浏览器数据" : dataMode === "demo" ? "示例工作区" : "个人工作区"}
          </span>
          <span>{compactAccountLabel(userEmail)}</span>
          <TokenPayWidget compact />
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
          activeId={active?.id ?? ""}
          opportunities={filtered}
          totalCount={opportunities.length}
          query={query}
          mobileOpen={mobileRail === "opportunities"}
          onQueryChange={setQuery}
          localCount={localIds.length}
          onSelect={(id) => { setCreating(false); setActiveId(id); setActiveTab("overview"); setQuestionSnoozed(false); setMobileRail(null); }}
          onCreate={() => { setCreateOrigin("opportunity"); setCreating(true); setMobileRail(null); }}
          onClose={() => setMobileRail(null)}
        />

        <section className={styles.document} aria-label={creating ? "新建岗位" : `${active?.company} ${active?.role}作战档案`}>
          {creating ? <NewOpportunityForm onCreate={createOpportunity} onCancel={() => { setCreating(false); setSurface(createOrigin); }} /> : active && <>
          {dataMode === "demo" && !localIds.includes(active.id) && <DemoNotice onCreate={() => { setCreateOrigin("opportunity"); setCreating(true); }} />}
          <OpportunityHeader opportunity={active} />
          <nav className={styles.tabs} aria-label="岗位机会内容">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={activeTab === tab.id ? styles.tabActive : undefined}
                aria-current={activeTab === tab.id ? "page" : undefined}
                onClick={() => setActiveTab(tab.id)}
              >
                {active.workspaceType === "preparation" && tab.id === "evidence" ? "经历证据" : active.workspaceType === "preparation" && tab.id === "resume" ? "基础简历" : tab.label}
                {tab.id === "evidence" && <span>{coverageTotal(active)}</span>}
                {tab.id === "resume" && active.resumeChanges.length > 0 && <span>{active.resumeChanges.length}</span>}
              </button>
            ))}
          </nav>
          <div className={styles.documentBody}>
            {activeTab === "overview" && <OverviewTab opportunity={active} onOpenEvidence={() => setActiveTab("evidence")} />}
            {activeTab === "evidence" && <EvidenceTab opportunity={active} />}
            {activeTab === "resume" && <ResumeTab opportunity={active} onUpdate={updateResumeChange} onGenerate={generateResumeDraft} onFreeze={freezeResumeVersion} generating={generatingResume} freezing={freezingResume} onPdfResult={(status, summary) => setOpportunities((current) => current.map((item) => item.id !== active.id || !item.applicationQuality ? item : { ...item, applicationQuality: { ...item.applicationQuality, reviews: item.applicationQuality.reviews.map((review) => review.reviewerType === "pdf" ? { ...review, status, summary } : review) } }))} />}
            {activeTab === "interview" && <InterviewTab opportunity={active} onSave={saveInterviewAnswer} onOpenRoundtable={openInterviewRoundtable} />}
            {activeTab === "review" && <ReviewTab opportunity={active} onAnalyze={analyzeReview} analyzing={reviewingInterview} />}
            {activeTab === "activity" && <ActivityTab opportunity={active} />}
          </div></>}
        </section>

        {creating ? <CreationRail /> : active && <ActionRail
          opportunity={active}
          mobileOpen={mobileRail === "actions"}
          questionSnoozed={questionSnoozed}
          onComplete={completeAction}
          onAnswer={saveQuestionAnswer}
          onSnooze={() => { setQuestionSnoozed(true); announce("已暂时收起这个问题"); }}
          storageMode={localIds.includes(active.id) ? "local" : dataMode === "live" ? "cloud" : "demo"}
          onClose={() => setMobileRail(null)}
        />}
      </div>
      {mobileRail && <button className={styles.mobileScrim} onClick={() => setMobileRail(null)} aria-label="关闭侧栏" />}
      <div className={`${styles.toast} ${notice ? styles.toastVisible : ""}`} role="status" aria-live="polite">{notice}</div>
    </main>
  );
}

type NewOpportunityInput = { workspaceType?: "job" | "preparation"; company: string; role: string; location: string; jdText: string; resumeText: string; profileText?: string; sourceLabel?: string };
type OpportunityIntake = { sourceText: string; file: File | null };

function EmptyCockpit({ userEmail, onCreate, onLogout }: { userEmail?: string; onCreate: () => void; onLogout: () => void }) {
  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <Brand />
        <div className={styles.topbarContext}><span>{compactAccountLabel(userEmail)}</span><TokenPayWidget compact /><button className={styles.iconButton} onClick={onLogout} aria-label="退出登录"><LogOut size={17} /></button></div>
      </header>
      <section className={styles.emptyCockpit}>
        <div className={styles.emptyCopy}>
          <span className={styles.emptyIcon}><BriefcaseBusiness size={24} /></span>
          <h1>把你手头的材料交给导师</h1>
          <p>岗位链接、简历、经历材料或求职目标都可以。先不用整理格式，益职会识别你现在处于哪一步。</p>
          <button className={styles.primaryButton} onClick={onCreate}><Plus size={16} />交一份现有材料</button>
        </div>
        <ol className={styles.onboardingSteps}>
          <li><strong>你只管给原始材料</strong><span>链接、文字或文件，任选一种。</span></li>
          <li><strong>导师先判断阶段</strong><span>识别岗位、简历或准备目标。</span></li>
          <li><strong>只问真正影响判断的问题</strong><span>不确定的事实再向你确认。</span></li>
        </ol>
      </section>
    </main>
  );
}

function DemoNotice({ onCreate }: { onCreate: () => void }) {
  return (
    <section className={styles.demoNotice} aria-label="示例工作区说明">
      <div><strong>你正在查看示例机会</strong><p>这些公司、经历和结果都不是你的数据；页面操作仅用于体验，刷新后恢复。</p></div>
      <button onClick={onCreate}><Plus size={15} />新建我的岗位</button>
    </section>
  );
}

function OpportunityRail({ activeId, opportunities, totalCount, localCount, query, onQueryChange, onSelect, onCreate, mobileOpen, onClose }: {
  activeId: string; opportunities: Opportunity[]; totalCount: number; query: string;
  localCount: number; onQueryChange: (value: string) => void; onSelect: (id: string) => void; onCreate: () => void;
  mobileOpen: boolean; onClose: () => void;
}) {
  return (
    <aside className={`${styles.opportunityRail} ${mobileOpen ? styles.mobileRailOpen : ""}`} aria-label="岗位机会">
      <div className={styles.railHeading}>
        <div><h2>机会</h2><p>{localCount ? `${localCount} 个我的 · ${totalCount - localCount} 个示例` : `${totalCount} 个示例岗位`}</p></div>
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
      <button className={styles.addOpportunity} onClick={onCreate}><Plus size={16} /><span><strong>添加材料</strong><small>岗位、简历或目标</small></span></button>
    </aside>
  );
}

function NewOpportunityForm({ onCreate, onCancel }: { onCreate: (intake: OpportunityIntake) => Promise<void>; onCancel: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [sourceText, setSourceText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const quotaLabel = useQuotaLabel("chat");
  const canSubmit = Boolean(sourceText.trim() || file);

  const chooseFile = (candidate?: File) => {
    if (!candidate) return;
    const supported = /\.(pdf|docx|txt|md)$/i.test(candidate.name);
    if (!supported) return setError("支持 PDF、DOCX、TXT 或 Markdown 文件");
    if (candidate.size > 10 * 1024 * 1024) return setError("文件不能超过 10MB");
    setFile(candidate);
    setError("");
  };

  return (
    <div className={styles.createPage}>
      <div className={styles.createIntro}>
        <h1>把你手头的东西交给我。</h1>
        <p>岗位链接、JD、简历、经历材料或求职目标都可以。我先识别你在哪一步，再安排下一步。</p>
      </div>
      <form
        className={styles.createForm}
        onSubmit={async (event) => {
          event.preventDefault();
          if (!canSubmit || submitting) return;
          setSubmitting(true);
          setError("");
          try {
            await onCreate({ sourceText, file });
          } catch (submitError) {
            setError(submitError instanceof Error ? submitError.message : "材料暂时读不了，请重试");
          } finally {
            setSubmitting(false);
          }
        }}
      >
        <div
          className={`${styles.intakeComposer} ${dragging ? styles.intakeDragging : ""}`}
          onPaste={(event) => {
            const pastedFile = Array.from(event.clipboardData.files).find((candidate) => /\.(pdf|docx|txt|md)$/i.test(candidate.name));
            if (!pastedFile) return;
            event.preventDefault();
            chooseFile(pastedFile);
          }}
          onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }}
          onDrop={(event) => { event.preventDefault(); setDragging(false); chooseFile(event.dataTransfer.files[0]); }}
        >
          <div className={styles.intakePrompt}><Link2 size={18} /><span>链接、文字或文件</span></div>
          <textarea
            value={sourceText}
            onChange={(event) => { setSourceText(event.target.value); setError(""); }}
            rows={8}
            aria-label="求职材料内容"
            placeholder="粘贴岗位链接、JD、简历片段，或直接写：我想找 AI 产品经理……"
            autoFocus
          />
          {file && <div className={styles.fileChip}><UploadCloud size={16} /><span>{file.name}</span><button type="button" onClick={() => { setFile(null); if (inputRef.current) inputRef.current.value = ""; }} aria-label={`移除 ${file.name}`}><X size={14} /></button></div>}
          <div className={styles.intakeFooter}>
            <label className={styles.attachButton}>
              <UploadCloud size={16} />选择文件
              <input ref={inputRef} type="file" accept=".pdf,.docx,.txt,.md" onChange={(event) => chooseFile(event.target.files?.[0])} />
            </label>
            <span>也可以粘贴或拖进来 · 10MB 以内</span>
          </div>
        </div>
        <div className={styles.mentorPromise}>
          <ShieldCheck size={18} />
          <p><strong>我会先替你判断：</strong>这是岗位、简历还是求职目标，再建对应档案，只追问会影响下一步的内容。</p>
        </div>
        {error && <p className={styles.intakeError} role="alert">{error}</p>}
        <div className={styles.formActions}><button type="button" className={styles.secondaryButton} onClick={onCancel}>返回</button><button type="submit" className={styles.primaryButton} disabled={!canSubmit || submitting}>{submitting ? "正在读材料…" : `让导师整理 · ${quotaLabel}`}<ArrowRight size={16} /></button></div>
      </form>
    </div>
  );
}

function CreationRail() {
  return <aside className={styles.actionRail}><div className={styles.railHeading}><div><h2>不用先整理</h2><p>原始材料就够了</p></div></div><ol className={styles.creationGuide}><li><strong>你提供</strong><span>一个公开链接、一段 JD 或一份文件。</span></li><li><strong>导师处理</strong><span>识别信息，拆要求，建立岗位档案。</span></li><li><strong>需要时再问</strong><span>只追问会改变投递判断的事实。</span></li></ol></aside>;
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
  const decisiveGap = opportunity.requirements.find((item) => item.strength === "unverified" || item.strength === "missing");
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
      {decisiveGap && <section className={styles.insightNote}><span className={styles.insightGlyph}><CircleAlert size={18} /></span><div><strong>{decisiveGap.strength === "unverified" ? "为什么现在需要确认" : "当前最大的证据缺口"}</strong><p>{decisiveGap.strength === "unverified" ? `「${decisiveGap.requirement}」可能改变投递结论。先确认事实，比继续润色简历更有价值。` : `还缺少能证明「${decisiveGap.requirement}」的真实经历。先补材料，再做投递判断。`}</p></div></section>}
    </div>
  );
}

function EvidenceTab({ opportunity }: { opportunity: Opportunity }) {
  const [showJd, setShowJd] = useState(false);
  return (
    <section>
      <div className={styles.pageIntro}><div><h2>{opportunity.workspaceType === "preparation" ? "已有经历与准备缺口" : "JD 要求与真实证据"}</h2><p>{opportunity.workspaceType === "preparation" ? "先建立真实经历底稿；拿到岗位后再逐条匹配 JD。" : "每条判断都能回到材料来源；待确认内容不会进入最终简历。"}</p></div>{opportunity.workspaceType !== "preparation" && <button className={styles.secondaryButton} disabled={!opportunity.jdText} title={opportunity.jdText ? undefined : "这个机会没有保存原始 JD"} onClick={() => setShowJd((value) => !value)}><FileText size={16} />{opportunity.jdText ? showJd ? "收起原始 JD" : "查看原始 JD" : "无原始 JD"}</button>}</div>
      {showJd && opportunity.jdText && <pre className={styles.rawJd}>{opportunity.jdText}</pre>}
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

function ResumeTab({ opportunity, onUpdate, onGenerate, onFreeze, generating, freezing, onPdfResult }: { opportunity: Opportunity; onUpdate: (id: string, status: "accepted" | "rejected") => void; onGenerate: () => void; onFreeze: () => void; generating: boolean; freezing: boolean; onPdfResult: (status: "passed" | "failed", summary: string) => void }) {
  const quotaLabel = useQuotaLabel("resume");
  const [checkingPdf, setCheckingPdf] = useState(false);
  const submittedVersion = Math.max(0, ...(opportunity.snapshots || []).filter((snapshot) => snapshot.snapshotType === "submitted_resume").map((snapshot) => snapshot.version));
  const verifyPdf = async (file: File) => {
    if (!opportunity.applicationQuality) return;
    setCheckingPdf(true);
    try {
      const form = new FormData();
      form.append("file", file); form.append("opportunityId", opportunity.id); form.append("artifactId", opportunity.applicationQuality.artifactId);
      const response = await fetch("/api/coach/application-pack/pdf", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || result.review?.findings?.[0]?.message || "PDF 校验失败");
      onPdfResult("passed", "PDF 文字层可解析且与投递版本一致。");
    } catch (error) { onPdfResult("failed", error instanceof Error ? error.message : "PDF 校验失败"); }
    finally { setCheckingPdf(false); }
  };
  if (opportunity.workspaceType === "preparation") {
    return (
      <section>
        <div className={styles.pageIntro}><div><h2>基础简历</h2><p>这是后续所有岗位版本的事实底稿；拿到 JD 后再生成针对性版本。</p></div></div>
        {opportunity.resumeText ? <pre className={styles.rawJd}>{opportunity.resumeText}</pre> : <EmptySection label="还没有识别到完整简历。继续添加经历材料，导师会合并到事实底稿。" />}
      </section>
    );
  }
  return (
    <section>
      <div className={styles.pageIntro}><div><h2>岗位简历工作室</h2><p>AI 只能改写可追溯到原简历的事实；数字不一致会被拦截。</p></div><button className={styles.primaryButton} onClick={onGenerate} disabled={generating || !opportunity.resumeText || !opportunity.jdText}><Sparkles size={16} />{generating ? "正在生成…" : `${opportunity.resumeChanges.length ? "重新生成" : "AI 生成岗位版本"} · ${quotaLabel}`}</button></div>
      <div className={styles.versionLine}><span>{submittedVersion ? `已冻结投递版本 V${submittedVersion}` : "尚未冻结投递版本"}</span><span>{opportunity.resumeChanges.filter((item) => item.status === "pending").length} 处待审阅</span></div>
      {opportunity.applicationQuality && <div className={styles.qualityGate}>
        <div><strong>投递质检</strong><span>{opportunity.applicationQuality.status === "blocked" ? "有阻断项" : opportunity.resumeChanges.some((item) => item.status === "pending") ? "等待你审阅" : "可以冻结版本"}</span></div>
        <div className={styles.qualityChecks}>{opportunity.applicationQuality.reviews.map((review) => <span key={review.reviewerType} title={review.summary} data-status={review.status}>{review.reviewerType === "facts" ? "事实" : review.reviewerType === "independent_ai" ? "独立复核" : review.reviewerType.toUpperCase()} · {review.status === "passed" ? "通过" : review.status === "failed" ? "未通过" : "待检查"}</span>)}</div>
        <div className={styles.qualityActions}><button className={styles.primaryButton} disabled={freezing || opportunity.applicationQuality.status === "blocked" || opportunity.resumeChanges.some((item) => item.status === "pending")} onClick={onFreeze}>{freezing ? "正在冻结…" : "冻结投递版本"}</button>
          <label className={styles.secondaryButton}>{checkingPdf ? "正在检查…" : "校验导出 PDF"}<input type="file" accept="application/pdf" hidden disabled={checkingPdf} onChange={(event) => { const file = event.target.files?.[0]; if (file) void verifyPdf(file); event.currentTarget.value = ""; }} /></label></div>
      </div>}
      <div className={styles.resumeChangeList}>{opportunity.resumeChanges.length ? opportunity.resumeChanges.map((change) => (
        <article key={change.id} className={styles.resumeChange}>
          <header><strong>{change.section}</strong><span>{change.status === "accepted" ? "已接受" : change.status === "rejected" ? "保留原文" : "待审阅"}</span></header>
          <div className={styles.diffGrid}><div><span>原文</span><p>{change.before}</p></div><div><span>建议</span><p>{change.after}</p></div></div>
          <footer><p>{change.reason}</p><span>{change.evidenceId ? "已关联证据" : "需要补证据"}</span></footer>
          {change.status === "pending" && <div className={styles.changeActions}><button className={styles.primaryButton} onClick={() => onUpdate(change.id, "accepted")}><Check size={15} />接受修改</button><button className={styles.secondaryButton} onClick={() => onUpdate(change.id, "rejected")}>保留原文</button></div>}
        </article>
      )) : <EmptySection label={opportunity.resumeText ? "还没有生成岗位简历。" : "先在岗位档案补充简历，AI 才能开始。"} actionLabel={opportunity.resumeText ? "生成岗位版本" : undefined} onAction={opportunity.resumeText ? onGenerate : undefined} />}</div>
    </section>
  );
}

function InterviewTab({ opportunity, onSave, onOpenRoundtable }: { opportunity: Opportunity; onSave: (question: string, answer: string) => void; onOpenRoundtable: () => void }) {
  const quotaLabel = useQuotaLabel("interview");
  const [practicing, setPracticing] = useState(false);
  const [answer, setAnswer] = useState("");
  const currentQuestion = opportunity.interviewFocus[0];
  return (
    <section>
      <div className={styles.pageIntro}><div><h2>面试作战准备</h2><p>问题来自当前岗位的证据风险，不是随机题库。</p></div><div className={styles.interviewActions}>{currentQuestion && <button className={styles.secondaryButton} onClick={() => setPracticing(true)}><MessageSquareText size={16} />快速练一题（免费）</button>}<button className={styles.primaryButton} onClick={onOpenRoundtable}><Sparkles size={16} />AI 模拟面试圆桌 · {quotaLabel}</button></div></div>
      {practicing && currentQuestion && <section className={styles.practicePanel}><span>第 1 题 · 深挖薄弱证据</span><h3>{currentQuestion.question}</h3><p>{currentQuestion.rationale}</p><textarea value={answer} onChange={(event) => setAnswer(event.target.value)} rows={7} placeholder="先说出你的真实回答。不确定的数字可以明确写“待核实”。" /><div><button className={styles.secondaryButton} onClick={() => setPracticing(false)}>结束本轮</button><button className={styles.primaryButton} disabled={!answer.trim()} onClick={() => { onSave(currentQuestion.question, answer.trim()); setAnswer(""); }}>保存练习回答</button></div></section>}
      <div className={styles.focusList}>{opportunity.interviewFocus.length ? opportunity.interviewFocus.map((focus) => (
        <article key={focus.id} className={styles.focusItem}><span className={`${styles.readinessDot} ${styles[`readiness_${focus.readiness}`]}`} /><div><strong>{focus.question}</strong><p>{focus.rationale}</p></div><span>{focus.readiness === "ready" ? "已准备" : focus.readiness === "practice" ? "需练习" : "待补充"}</span></article>
      )) : <EmptySection label="进入面试阶段后，这里会根据当前证据生成追问链。" />}</div>
    </section>
  );
}

const interviewRounds = ["电话初筛", "一面", "二面", "三面", "终面", "HR 面"];

function ReviewTab({ opportunity, onAnalyze, analyzing }: { opportunity: Opportunity; onAnalyze: (round: string, notes: string) => Promise<void>; analyzing: boolean }) {
  const [notes, setNotes] = useState("");
  const [round, setRound] = useState("一面");
  const quotaLabel = useQuotaLabel("interview");
  const reports = opportunity.reviewReports || [];
  return (
    <section>
      <div className={styles.pageIntro}><div><h2>面试复盘</h2><p>先标记面试轮次，再记录发生了什么。</p></div></div>
      <div className={styles.reviewComposer}>
        <Sparkles size={22} />
        <h3>这是第几面？</h3>
        <p>轮次会和这次复盘一起留在岗位档案里。</p>
        <div className={styles.roundPicker} role="group" aria-label="选择面试轮次">
          {interviewRounds.map((item) => <button key={item} type="button" aria-pressed={round === item} onClick={() => setRound(item)}>{item}</button>)}
        </div>
        <label className={styles.reviewNotesLabel} htmlFor="review-notes">面试记录</label>
        <textarea id="review-notes" value={notes} onChange={(event) => setNotes(event.target.value)} rows={10} placeholder="粘贴逐字稿，或写下你记得的问题和回答…" />
        <button className={styles.primaryButton} disabled={!notes.trim() || analyzing} onClick={async () => { try { await onAnalyze(round, notes.trim()); setNotes(""); } catch { /* toast already explains the failure */ } }}>{analyzing ? "导师正在复盘…" : `AI 复盘${round} · ${quotaLabel}`}<ArrowRight size={16} /></button>
      </div>
      <div className={styles.reviewReportList}>{reports.map((report) => (
        <article key={report.id} className={styles.reviewReport}>
          <header><div><span>{report.round}</span><time dateTime={report.createdAt}>{new Date(report.createdAt).toLocaleDateString("zh-CN")}</time></div><strong>{report.grade}</strong></header>
          <p>{report.overallComment}</p>
          <div className={styles.reviewColumns}>
            <section><h3>保留的优势</h3>{report.strengths.length ? <ul>{report.strengths.map((item) => <li key={item}>{item}</li>)}</ul> : <span>本次没有识别到稳定优势</span>}</section>
            <section><h3>下一轮先改</h3>{report.improvements.length ? <ul>{report.improvements.map((item) => <li key={item}>{item}</li>)}</ul> : <span>暂无明确改进项</span>}</section>
          </div>
          {report.actions.length > 0 && <footer><h3>训练任务</h3><ol>{report.actions.map((item) => <li key={item}>{item}</li>)}</ol></footer>}
          <details><summary>查看原始面试记录</summary><pre>{report.sourceNotes}</pre></details>
        </article>
      ))}</div>
    </section>
  );
}

function ActivityTab({ opportunity }: { opportunity: Opportunity }) {
  return (
    <section><div className={styles.pageIntro}><div><h2>岗位动态</h2><p>你与益职对这个机会的关键操作记录。</p></div></div><div className={styles.activityList}>{opportunity.activities.length ? opportunity.activities.map((activity) => (
      <article key={activity.id}><span className={styles.activityIcon}>{activity.actor === "analysis" ? <Sparkles size={16} /> : activity.actor === "system" ? <Clock3 size={16} /> : <BriefcaseBusiness size={16} />}</span><div><strong>{activity.title}</strong><p>{activity.detail}</p></div><time>{activity.timeLabel}</time></article>
    )) : <EmptySection label="这个机会还没有动态。" />}</div></section>
  );
}

function ActionRail({ opportunity, onComplete, onAnswer, onSnooze, questionSnoozed, storageMode, mobileOpen, onClose }: {
  opportunity: Opportunity; onComplete: (id: string) => void; onAnswer: (answer: string) => void; onSnooze: () => void;
  questionSnoozed: boolean; storageMode: "cloud" | "local" | "demo"; mobileOpen: boolean; onClose: () => void;
}) {
  const todo = opportunity.actions.filter((action) => action.status !== "done");
  const doneCount = opportunity.actions.length - todo.length;
  const evidenceToConfirm = opportunity.requirements.find((item) => item.strength === "unverified");
  const [answering, setAnswering] = useState(false);
  const [answer, setAnswer] = useState("");
  return (
    <aside className={`${styles.actionRail} ${mobileOpen ? styles.mobileRailOpen : ""}`} aria-label="下一步">
      <div className={styles.railHeading}><div><h2>下一步</h2><p>按影响排序，不是全部待办</p></div><button className={styles.mobileClose} onClick={onClose} aria-label="关闭下一步"><X size={19} /></button></div>
      <div className={styles.actionList}>{todo.map((action) => <ActionItem key={action.id} action={action} onComplete={onComplete} />)}{!todo.length && <div className={styles.allDone} role="status"><CircleCheck size={24} /><strong>关键行动已完成</strong><p>岗位出现新变化时，这里会给出新的下一步。</p></div>}</div>
      {doneCount > 0 && <p className={styles.doneCount}>{doneCount} 项已完成</p>}
      {!questionSnoozed && evidenceToConfirm && <section className={styles.activeQuestion}><div className={styles.questionLabel}><CircleAlert size={15} /> 需要你确认</div><strong>{evidenceToConfirm.id === "req-4" ? "商业化项目上线后，有可以公开写入简历的结果指标吗？" : `请补充能证明「${evidenceToConfirm.requirement}」的真实经历、职责和结果。`}</strong><p>这条事实会直接影响投递判断。没有也可以明确回答“没有”。</p>{answering ? <div className={styles.answerComposer}><textarea value={answer} onChange={(event) => setAnswer(event.target.value)} rows={5} placeholder="写下可以公开的结果、时间范围和你的职责。" autoFocus /><div className={styles.questionActions}><button disabled={!answer.trim()} onClick={() => { onAnswer(answer.trim()); setAnswer(""); setAnswering(false); }}>保存回答</button><button onClick={() => setAnswering(false)}>取消</button></div></div> : <div className={styles.questionActions}><button onClick={() => setAnswering(true)}>直接回答</button><button onClick={onSnooze}>稍后处理</button></div>}</section>}
      <section className={styles.privacyNote}><ShieldCheck size={17} /><p><strong>{storageMode === "cloud" ? "已同步到个人工作区" : storageMode === "local" ? "暂存在当前浏览器" : "你正在体验示例机会"}</strong><br />{storageMode === "cloud" ? "岗位、证据、简历修改和复盘会在登录后继续保留。" : storageMode === "local" ? "网络恢复后会自动重试云同步；暂时不要清除浏览器数据。" : "示例操作不会写入你的账号数据。"}</p></section>
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
