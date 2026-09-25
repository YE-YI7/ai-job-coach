"use client";

import Image from "next/image";
import AgentConversation, {type CoachingStart} from "./AgentConversation";
import { mentorOpening } from "@/lib/opportunities/mentor-opening";
import ChatResizeHandle from "./ChatResizeHandle";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BriefcaseBusiness,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  FileText,
  GripVertical,
  Link2,
  LogOut,
  Menu,
  MessageSquareText,
  Pin,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import type {
  EvidenceStrength,
  InterviewPracticeFeedback,
  InterviewReviewReport,
  InterviewRoundtableSession,
  InterviewRoundtableTurn,
  Opportunity,
  OpportunityStage,
  RequirementEvidence,
} from "@/lib/opportunities/types";
import JobTimeline from "./JobTimeline";
import ResumeExport from "./ResumeExport";
import ResumeBlockBoard from "./ResumeWorkbench";
import VoiceControls from "./VoiceControls";
import {currentJourneyStage, normalizeRoundLabel, phoneScreeningLabel, resumeProgress, stageStatusWord, STAGE_STATUS_WORDS} from "@/lib/opportunities/timeline";
import {reorderIds, sortOpportunitiesForRail, togglePin} from "@/lib/opportunities/rail-order";
import {
  ROUND_REFLECTION_QUESTIONS,
  formatRoundReflection,
  hasRoundReflectionContent,
  resolveRoundCompletionPhase,
} from "@/lib/interview/round-completion";
import { EntryGate } from "./EntryGate";
import {
  needsMoreInputHints,
  normalizeInterviewAssessment,
  normalizeRoundSummary,
  resolveNextStep,
  toOpportunityActions,
} from "./interview-assessment-logic";
import type {
  InterviewAssessmentView,
  InterviewRoundNextActionView,
  InterviewRoundSummaryView,
} from "./interview-assessment-logic";
import { detectLowInfoAnswer } from "@/lib/interview/low-info-detector";
import { shareBaseResumeAcrossOpportunities } from "@/lib/opportunities/material-intake";
import { uncoverableGap } from "@/lib/opportunities/evidence-gaps";
import { applyUserResumeEdit } from "@/lib/opportunities/resume-edit";
import { applyReorderToOpportunity } from "@/lib/opportunities/resume-blocks";
import { commitStage, mergeStageResult } from "@/lib/opportunities/stage-save";
import { trackProductEvent } from "@/lib/product-events";
import { TokenPayWidget } from "@/components/tokenpay/TokenPayWidget";
import styles from "./CockpitApp.module.css";

type CockpitTab = "overview" | "evidence" | "resume" | "interview" | "review" | "salary";
type Rail = "opportunities" | "actions" | null;


const strengthMeta: Record<EvidenceStrength, { label: string; className: string }> = {
  strong: { label: "强证据", className: styles.statusStrong },
  weak: { label: "弱证据", className: styles.statusWeak },
  missing: { label: "证据缺口", className: styles.statusMissing },
  unverified: { label: "待确认", className: styles.statusUnverified },
};

const LOCAL_OPPORTUNITIES_KEY = "yi-zhi-web-opportunities-v1";
const RAIL_ORDER_KEY = "yi-zhi-rail-order-v1";
const RAIL_PINS_KEY = "yi-zhi-rail-pins-v1";
const TOKENPAY_RECOVERY_ACTIONS = new Set(["top_up_balance", "reauthorize_api_key", "api_key_quota"]);

function apiResponseError(response: Response, result: Record<string, unknown>, fallback: string) {
  const action = response.headers.get("TokenDance-Recovery-Action") || String(result.recoveryAction || "");
  if (TOKENPAY_RECOVERY_ACTIONS.has(action)) {
    window.dispatchEvent(new CustomEvent("yi-zhi:tokenpay-recovery", { detail: { action } }));
  }
  return new Error(String(result.error || fallback));
}

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
  initialTab,
}: {
  initialOpportunities: Opportunity[];
  userEmail?: string;
  dataMode?: "demo" | "live";
  initialTab?: CockpitTab;
}) {
  const router = useRouter();
  const [opportunities, setOpportunities] = useState(() => shareBaseResumeAcrossOpportunities(initialOpportunities));
  const [activeId, setActiveId] = useState(initialOpportunities[0]?.id ?? "");
  const [activeTab, setActiveTab] = useState<CockpitTab>(initialTab || (initialOpportunities[0] ? currentJourneyStage(initialOpportunities[0]) : "overview"));
  const [, setSurface] = useState<"today" | "opportunity">(initialTab ? "opportunity" : "today");
  const [coachingStart,setCoachingStart]=useState<CoachingStart|null>(null);
  const gapCoachingFired = useRef<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [mobileRail, setMobileRail] = useState<Rail>(null);
  const [notice, setNotice] = useState("");
  const [creating, setCreating] = useState(false);
  const [newEntry, setNewEntry] = useState<"direction" | "resume" | "interview">("resume");
  const [createOrigin, setCreateOrigin] = useState<"today" | "opportunity">("today");
  const [generatingResume, setGeneratingResume] = useState(false);
  const [validatingResume, setValidatingResume] = useState(false);
  const [supplementingMaterial, setSupplementingMaterial] = useState(false);
  const [resumeUploadOpen, setResumeUploadOpen] = useState(false);
  const [freezingResume, setFreezingResume] = useState(false);
  const [reviewingInterview, setReviewingInterview] = useState(false);
  const [localIds, setLocalIds] = useState<string[]>([]);
  const [localLoaded, setLocalLoaded] = useState(false);
  const [railOrder, setRailOrder] = useState<string[]>([]);
  const [railPins, setRailPins] = useState<string[]>([]);
  // 右栏对话的「实时上下文」：用户在中间面板做过的动作，导师据此主动追问。
  const [recentActions, setRecentActions] = useState<Array<{ at: number; text: string }>>([]);
  const localStorageHealthy = useRef(true);
  // First-use guidance lives inline; advanced plans stay available without a second blocking wizard.
  const [entryGateOpen, setEntryGateOpen] = useState(false);
  // 「管理 Offer 条款」要直接落到条款表单，不是重新走一遍选目标向导；view 留空 = 走默认（有计划看计划）
  const [entryGateInitial, setEntryGateInitial] = useState<{ view?: "entries" | "offers"; opportunityId?: string }>({});
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
        setOpportunities((current) => shareBaseResumeAcrossOpportunities([...valid, ...current.filter((item) => !valid.some((saved) => saved.id === item.id))]));
        setLocalIds(valid.map((item) => item.id));
      }
    } catch {
      // Preserve unreadable local data for recovery; never overwrite it with [].
      localStorageHealthy.current=false;
    } finally {
      setLocalLoaded(true);
    }
  }, [dataMode]);

  useEffect(() => {
    try {
      const order = JSON.parse(window.localStorage.getItem(RAIL_ORDER_KEY) || "[]") as unknown;
      const pins = JSON.parse(window.localStorage.getItem(RAIL_PINS_KEY) || "[]") as unknown;
      if (Array.isArray(order)) setRailOrder(order.filter((x): x is string => typeof x === "string"));
      if (Array.isArray(pins)) setRailPins(pins.filter((x): x is string => typeof x === "string"));
    } catch { /* 读不到排序就退回默认顺序，不影响主流程 */ }
  }, []);
  useEffect(() => {
    try { window.localStorage.setItem(RAIL_ORDER_KEY, JSON.stringify(railOrder)); } catch { /* 忽略隐私模式写入失败 */ }
  }, [railOrder]);
  useEffect(() => {
    try { window.localStorage.setItem(RAIL_PINS_KEY, JSON.stringify(railPins)); } catch { /* 忽略隐私模式写入失败 */ }
  }, [railPins]);

  useEffect(() => {
    if (!localLoaded || dataMode === "demo" || !localStorageHealthy.current) return;
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
          body: JSON.stringify({ opportunity, preserveStage: true }),
        }).then(async (response) => {
          if (!response.ok) throw new Error(`岗位云同步失败（${response.status}）`);
        }).catch((error) => {
          // 同步失败不能无声吞掉：本地有、云端没有，就会出现「界面有 JD、接口报缺 JD」的矛盾。
          console.error("岗位云同步失败（本地状态与云端可能不一致）:", error);
        });
      }
    }, 900);
    return () => window.clearTimeout(timer);
  }, [dataMode, localIds, localLoaded, opportunities]);

  const active = opportunities.find((item) => item.id === activeId) ?? opportunities[0];
  const relatedJobs = opportunities.filter((item) => item.id !== active?.id && item.workspaceType !== "preparation" && item.jdText?.trim());
  const orderedOpportunities = useMemo(
    () => sortOpportunitiesForRail(opportunities, railOrder, railPins),
    [opportunities, railOrder, railPins],
  );
  const filtered = useMemo(() => {
    const value = query.trim().toLocaleLowerCase("zh-CN");
    if (!value) return orderedOpportunities;
    return orderedOpportunities.filter((item) =>
      `${item.company} ${item.role}`.toLocaleLowerCase("zh-CN").includes(value)
    );
  }, [orderedOpportunities, query]);

  const announce = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2600);
  };

  // 只登记用户真正完成的动作（不记失败/提示），供导师主动追问。
  const logAction = (text: string) => {
    setRecentActions((current) => [{ at: Date.now(), text }, ...current].slice(0, 6));
  };

  const TAB_PAGE_LABELS: Record<CockpitTab, string> = {
    overview: "岗位概览", evidence: "证据补充", resume: "简历修改",
    interview: "模拟面试", review: "面试复盘", salary: "谈薪",
  };
  // 发给导师的实时上下文：当前岗位 + 正在看的页面 + 工作台现状 + 最近完成的动作（最多 6 条）。
  // 现状一行让导师不用猜「用户做到哪了」：简历进度、面试与复盘的真实数量都在这里。
  const chatContext = active
    ? (() => {
        const resume = resumeProgress(active);
        const practiceCount = (active.interviewPractices || []).length;
        const doneRounds = (active.mockInterviews || []).filter((item) => item.summary).length;
        const material = active.requirements?.length
          ? `JD 要求 ${active.requirements.length} 条（证据未核实 ${active.requirements.filter((r) => r.strength === "unverified" || r.strength === "missing").length} 条）`
          : "还没有 JD 要求拆解";
        let resumeState = "简历还没有生成建议";
        if (active.resumeChanges.length) {
          const frozen = resume.frozenVersion
            ? `投递版本 V${resume.frozenVersion}${active.frozenStale ? "（正文改过、已过期）" : " 已冻结"}`
            : resume.action === "check" ? "尚未冻结，待检查" : "尚未冻结";
          resumeState = `简历建议 ${active.resumeChanges.length} 处、${resume.pending} 处待确认，${frozen}`;
        }
        return [
          `当前岗位：${active.company} · ${active.role}（阶段：${stageStatusWord(active)}）`,
          `用户此刻在「${TAB_PAGE_LABELS[activeTab]}」页面`,
          `工作台现状：${material}；${resumeState}`,
          `面试训练：重点题 ${active.interviewFocus?.length || 0} 道、单题速练 ${practiceCount} 次、已完成整轮 ${doneRounds} 轮${(active.snapshots || []).some((s) => s.snapshotType === "interview_feedback") ? "，有已保存的复盘素材" : ""}`,
          recentActions.length ? `最近操作：${recentActions.map((a) => a.text).join("；")}` : "",
        ].filter(Boolean).join("\n");
      })()
    : "";

  const removeOpportunityLocally = (id: string) => {
    setOpportunities((current) => {
      const next = current.filter((item) => item.id !== id);
      if (activeId === id) setActiveId(next[0]?.id ?? "");
      return next;
    });
    setLocalIds((current) => current.filter((x) => x !== id));
    setRailOrder((current) => current.filter((x) => x !== id));
    setRailPins((current) => current.filter((x) => x !== id));
  };

  const toggleOpportunityPin = (id: string) => {
    const willPin = !railPins.includes(id);
    setRailPins((current) => togglePin(current, id));
    announce(willPin ? "已置顶，会一直排在最前" : "已取消置顶");
  };

  const reorderOpportunities = (movingId: string, targetId: string) => {
    setRailOrder(reorderIds(orderedOpportunities.map((item) => item.id), movingId, targetId));
  };

  const deleteOpportunity = async (id: string) => {
    const target = opportunities.find((item) => item.id === id);
    if (!target) return;
    const isCloud = dataMode === "live" && !localIds.includes(id);
    const label = `${target.company} · ${target.role}`;
    if (isCloud) {
      try {
        const res = await fetch(`/api/coach/opportunities?id=${encodeURIComponent(id)}`, { method: "DELETE" });
        const result = await res.json().catch(() => ({}));
        if (!res.ok || !result?.ok) { announce(result?.error || "删除失败，岗位仍保留"); return; }
      } catch { announce("网络异常，未删除"); return; }
    }
    removeOpportunityLocally(id);
    announce(isCloud ? `已删除 ${label}` : `已从工作区移除 ${label}${dataMode === "demo" ? "（示例岗位刷新后会恢复）" : ""}`);
  };

  // actions 数据链路保留：整轮总结（syncRoundtableSession / 服务端 metadata）仍会写回
  // opportunity.actions；右栏「待办与提醒」UI 已按需求下线，这两个写回器留给后续入口复用。
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

  const createOpportunity = async (intake: OpportunityIntake, entry: "direction" | "resume" | "interview" = "resume") => {
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
      throw apiResponseError(response, result, "材料暂时读不了，请重试");
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
    setOpportunities((current) => shareBaseResumeAcrossOpportunities([opportunity, ...current]));
    setActiveId(opportunity.id);
    setActiveTab(entry === "interview" ? "interview" : entry === "resume" && opportunity.resumeText && opportunity.jdText ? "resume" : "overview");
    setCreating(false);
    if (dataMode === "live") trackProductEvent("material_intake_completed", { opportunity_id: opportunity.id, workspace_type: opportunity.workspaceType || "job", synced: opportunity.id !== localId });
    announce(opportunity.id === localId ? "岗位已保存到当前浏览器，云同步稍后重试" : analysis ? "岗位已同步并完成初步分析" : "岗位已同步，分析暂未完成");
  };

  const supplementOpportunity = async (supplement: OpportunitySupplement) => {
    if (!active || supplementingMaterial) return;
    setSupplementingMaterial(true);
    if (dataMode === "live") trackProductEvent("opportunity_material_started", { opportunity_id: active.id, material_kind: supplement.kind, input_type: supplement.file ? "file" : "text" });
    try {
      const form = new FormData();
      form.set("requestId", crypto.randomUUID());
      form.set("materialKindHint", supplement.kind);
      form.set("company", active.company);
      form.set("role", active.role);
      form.set("location", active.location);
      form.set("jdText", active.jdText || "");
      form.set("resumeText", active.resumeText || "");
      if (supplement.sourceText.trim()) form.set("sourceText", supplement.sourceText.trim());
      if (supplement.file) form.set("file", supplement.file);
      const response = await fetch("/api/opportunities/analyze", { method: "POST", body: form });
      const result = await response.json();
      // A "material stored, analysis deferred" response is a success, not a
      // failure: the server returns 200 with input + analysis:null + a softer
      // message when the LLM call timed out but the text was captured. Requiring
      // result.analysis here turned that stored-but-deferred case into a thrown
      // error, so users saw "总是服务失败" even though their resume was saved.
      if (!response.ok || !result.ok || !result.input) throw apiResponseError(response, result, "材料暂时读不了，请重试");
      const input = result.input as NewOpportunityInput;
      const analysis = (result.analysis || {}) as Partial<Opportunity>;
      const updated: Opportunity = {
        ...active,
        workspaceType: input.workspaceType || active.workspaceType,
        company: input.company || active.company,
        role: input.role || active.role,
        location: input.location || active.location,
        stage: input.workspaceType === "job" && active.workspaceType === "preparation" ? "evaluating" : active.stage,
        stageLabel: input.workspaceType === "job" && active.workspaceType === "preparation" ? "评估中" : active.stageLabel,
        jdText: input.jdText,
        resumeText: input.resumeText,
        profileText: input.profileText || active.profileText,
        recommendation: analysis.recommendation ?? active.recommendation,
        recommendationLabel: analysis.recommendationLabel ?? active.recommendationLabel,
        recommendationReason: analysis.recommendationReason ?? active.recommendationReason,
        evidenceCoverage: analysis.evidenceCoverage ?? active.evidenceCoverage,
        requirements: analysis.requirements ?? active.requirements,
        actions: analysis.actions ?? active.actions,
        interviewFocus: analysis.interviewFocus ?? active.interviewFocus,
        resumeChanges: [],
        applicationQuality: undefined,
        nextEventLabel: input.workspaceType === "job" ? "今天完成投递判断" : active.nextEventLabel,
        activities: [{
          id: `${active.id}-material-${Date.now()}`,
          actor: "user",
          title: supplement.kind === "job" ? "补充岗位 JD" : supplement.kind === "resume" ? "补充个人简历" : "补充项目经历",
          detail: supplement.file?.name || supplement.sourceText.trim().slice(0, 160),
          timeLabel: "刚刚",
        }, ...active.activities],
      };
      setOpportunities((current) => shareBaseResumeAcrossOpportunities(current.map((item) => item.id === active.id ? updated : item)));
      if (dataMode === "live") trackProductEvent("opportunity_material_completed", { opportunity_id: active.id, material_kind: supplement.kind });
      announce(result.analysis
        ? `已补充${supplement.kind === "job" ? " JD" : supplement.kind === "resume" ? "简历" : "经历"}并重新判断`
        : `已收到${supplement.kind === "job" ? "岗位 JD" : supplement.kind === "resume" ? "简历" : "经历"}，材料已保存，AI 判断稍后自动补上`);
      raiseGapCoaching(updated);
    } catch (error) {
      if (dataMode === "live") trackProductEvent("opportunity_material_failed", { opportunity_id: active.id, material_kind: supplement.kind });
      throw error;
    } finally {
      setSupplementingMaterial(false);
    }
  };

  const updateResumeChange = (changeId: string, status: "accepted" | "rejected") => {
    if (!active) return;
    setOpportunities((current) => current.map((item) => item.id === active.id ? { ...item, resumeCheckStale: true, frozenStale: item.frozenStale || Boolean(item.snapshots?.some((snapshot) => snapshot.snapshotType === "submitted_resume")), resumeChanges: item.resumeChanges.map((change) => change.id === changeId ? { ...change, status } : change) } : item));
    if (dataMode === "live") trackProductEvent("resume_change_reviewed", { opportunity_id: active.id, decision: status });
    logAction(status === "accepted" ? "接受了一处简历修改建议" : "对一处简历修改保留了原文");
    announce(status === "accepted" ? "已选择这个版本；全部选好后检查并保存投递版" : "已选择保留原文");
  };

  const editResumeChange = (changeId: string, after: string) => {
    if (!active) return;
    setOpportunities((current) => current.map((item) => item.id === active.id
      ? applyUserResumeEdit(item, changeId, after)
      : item));
    if (dataMode === "live") trackProductEvent("resume_change_edited", { opportunity_id: active.id, change_id: changeId });
    logAction(`自己改写了一处简历建议：「${after.slice(0, 40)}」`);
    announce("修改已保存，请重新检查后再冻结版本");
  };

  // 拖拽分块 = 真的改写简历正文顺序，导出/质检/冻结都读这份新顺序，不再只是视觉。
  const reorderResumeBlocks = (fromId: string, toId: string) => {
    if (!active?.resumeText) return;
    const applied = applyReorderToOpportunity(active, fromId, toId);
    if (!applied.changed) return;
    setOpportunities((current) => current.map((item) => item.id === active.id ? applied.opportunity : item));
    if (dataMode === "live") trackProductEvent("resume_reordered", { opportunity_id: active.id, invalidated_freeze: applied.invalidatedFreeze });
    announce(applied.invalidatedFreeze
      ? "已按新顺序改写简历。原投递版本是按旧正文冻结的，已标记过期——导出现在用当前正文，重新检查并冻结后才能再导投递版"
      : "已按新顺序改写简历，导出与检查都会用这个顺序");
    logAction(applied.invalidatedFreeze ? "调整了简历分块顺序（投递版本已过期，需重新冻结）" : "调整了简历分块顺序");
  };

  const validateResumeChanges = async () => {
    if (!active?.resumeText || !active.jdText || !active.resumeChanges.length || validatingResume) return;
    setValidatingResume(true);
    try {
      if (dataMode === "demo" && !localIds.includes(active.id)) {
        await new Promise((resolve) => window.setTimeout(resolve, 500));
        setOpportunities((current) => current.map((item) => item.id !== active.id || item.resumeText !== active.resumeText || JSON.stringify(item.resumeChanges) !== JSON.stringify(active.resumeChanges) ? item : { ...item, resumeCheckStale: false, applicationQuality: {
          artifactId: item.applicationQuality?.artifactId || `demo-review-${item.id}`,
          version: item.applicationQuality?.version || 1,
          status: "ready",
          reviews: item.applicationQuality?.reviews.map((review) => review.reviewerType === "pdf" ? review : { ...review, status: "passed", summary: "示例修改已通过检查。" }) || [
            { reviewerType: "facts", status: "passed", summary: "示例事实检查通过。" },
            { reviewerType: "independent_ai", status: "passed", summary: "示例独立复核通过。" },
            { reviewerType: "ats", status: "passed", summary: "示例 ATS 检查通过。" },
            { reviewerType: "pdf", status: "not_run", summary: "冻结版本后再校验 PDF。" },
          ],
        } }));
        announce("示例修改已重新检查");
        return;
      }
      const response = await fetch("/api/coach/resume-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opportunityId: active.id, resumeText: active.resumeText, jobDescription: active.jdText, changes: active.resumeChanges, requestId: crypto.randomUUID() }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok || !result.applicationQuality) throw apiResponseError(response, result, "简历修改检查失败");
      setOpportunities((current) => current.map((item) => item.id !== active.id || item.resumeText !== active.resumeText || JSON.stringify(item.resumeChanges) !== JSON.stringify(active.resumeChanges) ? item : {
        ...item,
        resumeChanges: result.changes,
        resumeCheckStale: false,
        applicationQuality: result.applicationQuality,
        activities: [{ id: `${item.id}-resume-recheck-${Date.now()}`, actor: "analysis" as const, title: "重新检查用户修改", detail: result.applicationQuality.status === "ready" ? "事实、独立复核与 ATS 检查通过。" : "发现阻断项，请根据质检结果继续修改。", timeLabel: "刚刚" }, ...item.activities],
      }));
      if (dataMode === "live") trackProductEvent("resume_change_revalidated", { opportunity_id: active.id, status: result.applicationQuality.status });
      logAction(`做了一次简历检查：${result.applicationQuality.status === "ready" ? "通过" : "发现阻断项"}`);
      announce(result.applicationQuality.status === "ready" ? "检查已通过，可以保存投递版" : "检查未通过，请查看下方具体原因；可以自行修改或保留原文");
    } catch (error) {
      announce(error instanceof Error ? error.message : "简历修改检查失败");
    } finally {
      setValidatingResume(false);
    }
  };

  // 不是改简历措辞或练回答能补的差距（缺真实经历/证据待核实）→ 让右栏导师主动提问。
  // 导师对话只在云端工作区可用；示例与本地岗位不触发，避免点了没人回应的假任务。
  const raiseGapCoaching = (item: Opportunity) => {
    if (dataMode !== "live" || localIds.includes(item.id)) return;
    const gap = uncoverableGap(item.requirements);
    if (!gap) return;
    const key = `${item.id}:${gap.id}`;
    if (gapCoachingFired.current.has(key)) return;
    gapCoachingFired.current.add(key);
    // proactive：这条是导师主动开口，界面不展示这条代发指令，只呈现导师的提问。
    setCoachingStart({ id: crypto.randomUUID(), opportunityId: item.id, title: "改简历补不了的差距", proactive: true, prompt: `（系统代发的辅导请求，用户看不到这段）档案检查发现：这个岗位的一条硬要求「${gap.requirement}」${gap.strength === "unverified" ? "还没有可核实的证据" : "在简历里缺少对应经历"}。请以导师口吻主动跟用户说一句话，说明你注意到了什么，然后只问一个具体问题，帮他判断有没有没写进简历的相关经历、或能短期补上证据的办法。先看简历原文，里面已有的信息不要反问；不要替用户编造经历。` });
    setMobileRail("actions");
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
      if (!response.ok || !result.ok) throw apiResponseError(response, result, "生成失败");
      setOpportunities((current) => current.map((item) => item.id === active.id ? {
        ...item,
        resumeChanges: result.changes,
        applicationQuality: result.applicationQuality,
        activities: [{ id: `${item.id}-resume-${Date.now()}`, actor: "analysis" as const, title: "生成岗位简历建议", detail: `${result.changes.length} 处修改已完成事实、独立复核与 ATS 检查。`, timeLabel: "刚刚" }, ...item.activities],
      } : item));
      if (dataMode === "live") trackProductEvent("resume_generation_completed", { opportunity_id: active.id, change_count: result.changes.length });
      logAction(`生成了 ${result.changes.length} 处岗位简历建议，等待逐条确认`);
      announce(`${result.changes.length} 处建议已生成并完成事实校验${typeof result.quota?.remaining === "number" ? ` · 剩余 ${result.quota.remaining} 次` : ""}`);
      raiseGapCoaching(active);
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
        ...item, resumeText: result.resumeText, frozenStale: false, resumeCheckStale: false,
        resumeChanges: item.resumeChanges.map((change) => change.status === "accepted" ? { ...change, before: change.after } : change),
        applicationQuality: { artifactId: result.artifactId, version: result.version, status: "ready" as const, reviews: [
          { reviewerType: "facts" as const, status: "passed" as const, summary: result.retainedOriginal ? "保留用户原文，未新增 AI 表述。" : "投递文本已通过事实规则检查。" },
          { reviewerType: "independent_ai" as const, status: result.retainedOriginal ? "not_run" as const : "passed" as const, summary: result.retainedOriginal ? "保留原文，无 AI 修改需复核。" : "起草版本已通过独立复核。" },
          { reviewerType: "ats" as const, status: "passed" as const, summary: "文本可被 ATS 解析。" },
          { reviewerType: "pdf" as const, status: "not_run" as const, summary: "导出 PDF 后上传校验文字层。" },
        ] },
        snapshots: [{ id: `snapshot-${Date.now()}`, snapshotType: "submitted_resume" as const, version: result.snapshotVersion, title: "投递简历", frozenAt: new Date().toISOString() }, ...(item.snapshots || [])],
        activities: [{ id: `${item.id}-frozen-${Date.now()}`, actor: "user" as const, title: `冻结投递简历 V${result.snapshotVersion}`, detail: "事实与 ATS 校验通过；等待 PDF 文字层校验。", timeLabel: "刚刚" }, ...item.activities],
      }));
      announce(`投递版本 V${result.snapshotVersion} 已冻结`);
      logAction(`冻结了投递简历 V${result.snapshotVersion}`);
    } catch (error) { announce(error instanceof Error ? error.message : "保存失败"); }
    finally { setFreezingResume(false); }
  };

  // 同上：证据确认写回链路保留（claims + requirements + coverage），等后续在档案区内重新挂载。
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
      if (!response.ok || !result.ok || !result.analysis) throw apiResponseError(response, result, "复盘失败");
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
      raiseGapCoaching(active);
    } catch (error) {
      if (dataMode === "live") trackProductEvent("interview_review_failed", { opportunity_id: active.id, round });
      announce(error instanceof Error ? error.message : "复盘失败");
      throw error;
    } finally {
      setReviewingInterview(false);
    }
  };

  /** 引导式复盘：先只存素材，不生成整轮结论；保存确认成功后才开启导师带练。 */
  const guideReview = async (round: string, notes: string): Promise<boolean> => {
    if (!active || !notes.trim()) return false;
    const material = notes.trim();
    const record: InterviewReviewReport = {
      id: `review-guide-${Date.now()}`,
      round,
      grade: "待引导复盘",
      overallComment: "已记录本次面试。先不替你下结论——导师会一步步带你自己回看。",
      strengths: [], improvements: [], actions: [],
      sourceNotes: material.slice(0, 30_000),
      createdAt: new Date().toISOString(),
    };
    if (dataMode === "live" && !localIds.includes(active.id)) {
      // 「已保存」必须是一次确认过的写入，不能是乐观提示：保存失败就不开启辅导。
      try {
        const response = await fetch("/api/coach/snapshots", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ opportunityId: active.id, snapshotType: "interview_feedback", title: `${round}素材`, content: record, metadata: { round, guided: true } }) });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.ok) throw new Error(String(result.error || "面试素材保存失败"));
      } catch (error) {
        announce(`${error instanceof Error && error.message ? error.message : "面试素材保存失败"}——素材还留在输入框里，请稍后重试`);
        return false;
      }
    }
    setOpportunities((current) => current.map((item) => item.id === active.id ? {
      ...item,
      reviewReports: [record, ...(item.reviewReports || [])],
      activities: [{ id: `${item.id}-review-guide-${Date.now()}`, actor: "user", title: `记录${round}面试素材`, detail: "已保存，等待引导式复盘。", timeLabel: "刚刚" }, ...item.activities],
    } : item));
    setCoachingStart({
      id: crypto.randomUUID(),
      opportunityId: active.id,
      title: `${round}引导式复盘`,
      prompt: `我刚面完${round}，下面是我这轮记下的原始内容（已存进岗位档案）：\n${material.slice(0, 1500)}\n请不要一上来就给整体结论或打分。用聊天的方式一次只问我一个问题，带我自己回看：先问「这轮整体感觉怎么样、哪一题心里最没底」，等我回答后再追问「那题对方具体问了什么、你怎么答的」，再一起看「哪里其实可以提升」和「下一轮这个岗位我会怎么应对」。每一步都等我先说，不要替我编答案。`,
    });
    setMobileRail("actions");
    announce("素材已保存，导师会在右侧带你一步步复盘。");
    logAction(`记录了${round}的真实面试素材（${material.slice(0, 60)}…），等待引导复盘`);
    return true;
  };

  const analyzeInterviewAnswer = async (question: string, answer: string) => {
    if (!active) throw new Error("请先选择岗位");
    const opportunityId = active.id;
    if (dataMode === "live") trackProductEvent("interview_practice_started", { opportunity_id: opportunityId });
    let record: InterviewPracticeFeedback;
    if (dataMode === "demo" && !localIds.includes(opportunityId)) {
      await new Promise((resolve) => window.setTimeout(resolve, 450));
      record = {
        id: `demo-practice-${Date.now()}`,
        question,
        answer,
        verdict: "证据不足",
        summary: "示例反馈（演示数据，非真实模型输出）：回答提到了方法，但还没有说清你的个人动作和验证结果。",
        strengths: ["示例数据 · 方向与问题相关"],
        gaps: ["缺少个人负责的动作", "缺少可核实的结果"],
        followUp: "示例追问：你具体定义了哪个指标，最后看到什么变化？",
        improvedOutline: ["先给结论", "说明你负责的动作", "补充验证方法", "给出真实结果或明确待核实"],
        createdAt: new Date().toISOString(),
      };
    } else {
      const response = await fetch("/api/coach/interview-practice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opportunityId, question, answer, jobDescription: active.jdText || "", resumeText: active.resumeText || "" }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok || !result.record) throw apiResponseError(response, result, "分析失败");
      record = result.record as InterviewPracticeFeedback;
    }
    setOpportunities((current) => current.map((item) => item.id !== opportunityId ? item : {
      ...item,
      interviewPractices: [record, ...(item.interviewPractices || []).filter((entry) => entry.id !== record.id)],
      activities: [{ id: `${item.id}-practice-${Date.now()}`, actor: "analysis", title: `完成单题练习 · ${record.verdict}`, detail: record.summary, timeLabel: "刚刚" }, ...item.activities],
    }));
    if (dataMode === "live") trackProductEvent("interview_practice_completed", { opportunity_id: opportunityId, verdict: record.verdict });
    announce("回答已保存，导师反馈已生成");
    logAction(`练了一道单题（${record.verdict}）：${question.slice(0, 40)}`);
    return record;
  };

  const syncRoundtableSession = (session: InterviewRoundtableSession, nextActions?: InterviewRoundNextActionView[]) => {
    if (!active) return;
    const opportunityId = active.id;
    const summaryView = session.summary as unknown as InterviewRoundSummaryView | undefined;
    // id 稳定（mock-<sessionId>-<index>），整轮同步会重复调用，这里按 id 去重。
    const incomingActions = nextActions?.length ? toOpportunityActions(session.id, nextActions) : [];
    setOpportunities((current) => current.map((item) => {
      if (item.id !== opportunityId) return item;
      const previous = (item.mockInterviews || []).find((entry) => entry.id === session.id);
      const newActivity = !previous
        ? { id: `${item.id}-mock-start-${Date.now()}`, actor: "system" as const, title: `开始${session.round}模拟面试`, detail: `${session.turns.length} 道问题已与当前 JD、简历关联。`, timeLabel: "刚刚" }
        : previous.status !== "completed" && session.status === "completed"
          ? { id: `${item.id}-mock-complete-${Date.now()}`, actor: "analysis" as const, title: `完成${session.round}模拟面试`, detail: summaryView ? `${summaryView.grade} · ${summaryView.verdict || "已生成整轮总结"}` : "回答和逐题反馈已保存，整轮总结未生成。", timeLabel: "刚刚" }
          : null;
      const existingIds = new Set(item.actions.map((action) => action.id));
      return {
        ...item,
        mockInterviews: [session, ...(item.mockInterviews || []).filter((entry) => entry.id !== session.id)],
        actions: incomingActions.length ? [...incomingActions.filter((action) => !existingIds.has(action.id)), ...item.actions] : item.actions,
        activities: newActivity ? [newActivity, ...item.activities] : item.activities,
      };
    }));
    if (dataMode === "live" && session.status === "completed") trackProductEvent("mock_interview_completed", { opportunity_id: opportunityId, round: session.round, has_summary: Boolean(summaryView) });
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  };


  // 四类入口弹层（PRD §3.1）：首访自动弹出；「我的计划」按钮随时可找回。
  // 抽成共享节点，今日视图和岗位工作台两个渲染路径都能挂载。
  const entryGateModal = entryGateOpen ? (
    <div
      role="dialog"
      aria-label="选择你的目标"
      style={{
        position: "fixed", inset: 0, zIndex: 60,
        background: "rgba(27, 26, 23, 0.4)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      }}
    >
      <div style={{ width: "min(680px, 100%)", maxHeight: "90vh", overflow: "auto", borderRadius: 14 }}>
        <EntryGate
          onClose={() => setEntryGateOpen(false)}
          initialView={entryGateInitial.view}
          initialOpportunityId={entryGateInitial.opportunityId}
          onOpenInterview={() => {
            setEntryGateOpen(false);
            if (active) { setSurface("opportunity"); setActiveTab("interview"); }
          }}
        />
      </div>
    </div>
  ) : null;

  if (!active && !creating) return <EmptyCockpit userEmail={userEmail} onCreate={(entry) => { setNewEntry(entry); setCreateOrigin("opportunity"); setCreating(true); }} onLogout={logout} />;

  return (
    <main className={styles.shell}>
      {entryGateModal}
      <header className={styles.topbar}>
        <div className={styles.detailBrand}><Brand /></div>
        <div className={styles.topbarContext}>
          <span className={dataMode === "demo" ? styles.demoState : styles.liveState}>
            {creating ? "新建岗位" : active && localIds.includes(active.id) ? "浏览器数据" : dataMode === "demo" ? "示例工作区" : "个人工作区"}
          </span>
          {/* 四类入口可随时找回（PRD §3.1）：首访自动弹层之外，常驻入口不依赖弹出 */}
          {dataMode !== "demo" && (
            <button
              type="button"
              onClick={() => { setEntryGateInitial({}); setEntryGateOpen(true); }}
              title="查看当前计划 / 切换目标"
              style={{ border: "0", background: "transparent", color: "inherit", fontSize: 12, cursor: "pointer", padding: "4px 6px", borderRadius: 8 }}
            >
              我的计划
            </button>
          )}
          <span>{compactAccountLabel(userEmail)}</span>
          <TokenPayWidget compact />
          <button className={styles.iconButton} onClick={logout} aria-label="退出登录" title="退出登录">
            <LogOut size={17} aria-hidden="true" />
          </button>
        </div>
        <div className={styles.mobileControls}>
          <button onClick={() => setMobileRail("opportunities")} aria-label="打开机会列表"><Menu size={19} /></button>
          <button onClick={() => setMobileRail("actions")} aria-label="打开导师对话"><MessageSquareText size={19} /></button>
        </div>
      </header>

      <div className={styles.workspace} data-chat-layout="workspace"><ChatResizeHandle/>
        <OpportunityRail
          activeId={active?.id ?? ""}
          opportunities={filtered}
          totalCount={opportunities.length}
          query={query}
          mobileOpen={mobileRail === "opportunities"}
          onQueryChange={setQuery}
          localCount={dataMode === "live" ? opportunities.length : localIds.length}
          pinnedIds={railPins}
          canReorder={!query.trim()}
          onSelect={(id) => { setCreating(false); setActiveId(id); setActiveTab(currentJourneyStage(opportunities.find(o=>o.id===id)!)); setMobileRail(null); }}
          onTogglePin={toggleOpportunityPin}
          onReorder={reorderOpportunities}
          onDelete={deleteOpportunity}
          onCreate={() => { setCreateOrigin("opportunity"); setCreating(true); setMobileRail(null); }}
          onClose={() => setMobileRail(null)}
        />

        <section className={styles.document} aria-label={creating ? "新建岗位" : `${active?.company} ${active?.role}作战档案`}>
          {creating ? <NewOpportunityForm initialEntry={newEntry} onCreate={createOpportunity} onCancel={() => { setCreating(false); setSurface(createOrigin); }} /> : active && <>
          {dataMode === "demo" && !localIds.includes(active.id) && <DemoNotice onCreate={() => { setCreateOrigin("opportunity"); setCreating(true); }} />}
          <JobTimeline opportunity={active} selected={activeTab} onSelect={setActiveTab}/>
          <div className={styles.documentBody}>
            {activeTab==="resume"&&!active.resumeText&&<ContextMaterialAction kind="resume" title="上传简历开始修改" description="拖入文件或粘贴内容，不会覆盖已有岗位。" placeholder="粘贴简历内容" loading={supplementingMaterial} onSubmit={supplementOpportunity}/>}
            {activeTab==="resume"&&active.resumeText&&!resumeUploadOpen&&<p className={styles.ctaHint} style={{margin:"0 0 12px"}}>已有简历。要换一份或补充经历？<button type="button" onClick={()=>setResumeUploadOpen(true)} style={{marginLeft:6,padding:0,border:"none",background:"none",color:"var(--accent,#c2410c)",font:"inherit",cursor:"pointer",textDecoration:"underline"}}>上传 / 替换简历</button></p>}
            {activeTab==="resume"&&active.resumeText&&resumeUploadOpen&&<ContextMaterialAction kind="resume" title="上传 / 替换简历" description="拖入文件或粘贴内容，会更新当前岗位的简历文本。" placeholder="粘贴新的简历内容" loading={supplementingMaterial} onSubmit={async (s)=>{try{await supplementOpportunity(s);setResumeUploadOpen(false);}finally{}}}/>}
            {activeTab === "overview" && <OverviewTab key={active.id} opportunity={active} relatedJobs={relatedJobs} onOpenEvidence={() => setActiveTab("evidence")} onSelectJob={(id) => { setActiveId(id); }} onSupplement={supplementOpportunity} onConfirmEvidence={(requirement)=>{setCoachingStart({id:crypto.randomUUID(),opportunityId:active.id,title:"补齐关键经历",prompt:`请带我梳理能证明「${requirement}」的真实经历，先问一个具体问题，不要替我编造。`});setMobileRail("actions");}} supplementing={supplementingMaterial} />}
            {activeTab === "evidence" && <EvidenceTab opportunity={active} />}
            {activeTab === "resume" && <ResumeTab opportunity={active} onOpenEvidence={() => setActiveTab("evidence")} onUpdate={updateResumeChange} onEdit={editResumeChange} onReorder={reorderResumeBlocks} onGenerate={generateResumeDraft} onValidate={validateResumeChanges} onFreeze={freezeResumeVersion} generating={generatingResume} validating={validatingResume} freezing={freezingResume} onPdfResult={(status, summary) => setOpportunities((current) => current.map((item) => item.id !== active.id || !item.applicationQuality ? item : { ...item, applicationQuality: { ...item.applicationQuality, reviews: item.applicationQuality.reviews.map((review) => review.reviewerType === "pdf" ? { ...review, status, summary } : review) } }))} />}
            {/* 面试台不再挂「概览+优先练题清单」：开练入口就在训练台上，
                导师聊天保留在右栏，练面试时随时能就题问导师。 */}
            {activeTab === "interview" && <div className={styles.interviewWorkbench}>
              <InterviewTab opportunity={active} relatedJobs={relatedJobs} onSelectJob={setActiveId} onSupplement={supplementOpportunity} supplementing={supplementingMaterial} onAnalyze={analyzeInterviewAnswer} onSyncRoundtable={syncRoundtableSession} dataMode={dataMode} exampleRecords={dataMode === "demo" && !localIds.includes(active.id)} />
            </div>}
            {activeTab === "review" && <ReviewTab opportunity={active} onAnalyze={analyzeReview} onGuide={guideReview} analyzing={reviewingInterview} />}
            {activeTab === "salary" && <>{active.workspaceType === "offer" && active.offerComparison && <OfferSnapshotSummary comparison={active.offerComparison} />}<section><h2>谈薪与 Offer</h2><p>先核对薪酬结构、截止时间与自己的取舍。不要求重新做简历或课程。</p><button className={styles.primaryButton} onClick={()=>{setEntryGateInitial({view:"offers",opportunityId:active.id});setEntryGateOpen(true);}}>管理 Offer 条款</button><button className={styles.secondaryButton} onClick={()=>{setCoachingStart({id:crypto.randomUUID(),opportunityId:active.id,title:"谈薪准备",prompt:"请帮我检查这个岗位谈薪前需要确认的条款，先问我一个最重要的问题，不要猜测市场薪资。"});setMobileRail("actions");}}>请导师帮我准备沟通</button></section></>}
          </div></>}
        </section>

        {creating ? <CreationRail /> : active && <ActionRail
          opportunity={active}
          mobileOpen={mobileRail === "actions"}
          startRequest={coachingStart}
          onStartConsumed={()=>setCoachingStart(null)}
          onStageAdvanced={async (stage)=>{
            const stageLabel=STAGE_STATUS_WORDS[stage]||active.stageLabel;
            const result=await commitStage({
              opportunities,
              activeId:active.id,
              stage,
              stageLabel,
              isCloud: dataMode==="live" && !localIds.includes(active.id),
              patch:(opportunity)=>fetch("/api/coach/opportunities",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({stageUpdate:{id:opportunity.id,stage:opportunity.stage}})}).then(async(response)=>{const body=await response.json().catch(()=>({}));return {ok:response.ok&&Boolean(body.ok),error:typeof body.error==="string"?body.error:`岗位状态保存失败（${response.status}）`};}),
            });
            setOpportunities((current)=>mergeStageResult(current, result, active.id));
            if(result.saved){logAction(`把岗位状态更新为「${stageLabel}」`);return true;}
            announce(`状态没有保存：${result.error}——岗位仍是「${STAGE_STATUS_WORDS[active.stage]||active.stageLabel}」，确认条还在，请稍后重试`);
            return false;
          }}
          chatContext={chatContext}
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
type OpportunitySupplement = { kind: "job" | "resume" | "experience"; sourceText: string; file: File | null };

function EmptyCockpit({ userEmail, onCreate, onLogout }: { userEmail?: string; onCreate: (entry: "direction" | "resume" | "interview") => void; onLogout: () => void }) {
  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <Brand />
        <div className={styles.topbarContext}><span>{compactAccountLabel(userEmail)}</span><TokenPayWidget compact /><button className={styles.iconButton} onClick={onLogout} aria-label="退出登录"><LogOut size={17} /></button></div>
      </header>
      <section className={styles.emptyCockpit}>
        <div className={styles.emptyCopy}>
          <span className={styles.emptyIcon}><BriefcaseBusiness size={24} /></span>
          <h1>你现在想推进哪一步？</h1>
          <p>不用先弄懂整个工具。选一个起点，下一屏会告诉你需要什么；随时可以换方向。</p>
          <div className={styles.intakeChoices}><button onClick={() => onCreate("direction")}>还没找到岗位</button><button onClick={() => onCreate("resume")}>有岗位，改简历</button><button onClick={() => onCreate("interview")}>准备面试</button></div>
        </div>
        <ol className={styles.onboardingSteps}>
          <li><strong>还没找到岗位</strong><span>先传简历或说一个目标，整理方向与经历。</span></li>
          <li><strong>已经有心仪岗位</strong><span>贴招聘链接或 JD，再检查简历该怎么改。</span></li>
          <li><strong>马上要面试</strong><span>带上岗位与简历，开始针对性练习。</span></li>
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

function OpportunityRail({ activeId, opportunities, totalCount, localCount, query, onQueryChange, onSelect, onCreate, mobileOpen, onClose, pinnedIds, canReorder, onTogglePin, onReorder, onDelete }: {
  activeId: string; opportunities: Opportunity[]; totalCount: number; query: string;
  localCount: number; onQueryChange: (value: string) => void; onSelect: (id: string) => void; onCreate: () => void;
  mobileOpen: boolean; onClose: () => void;
  pinnedIds: string[]; canReorder: boolean;
  onTogglePin: (id: string) => void; onReorder: (movingId: string, targetId: string) => void; onDelete: (id: string) => void;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const pinSet = new Set(pinnedIds);
  const clearDrag = () => { setDraggingId(null); setOverId(null); };
  return (
    <aside className={`${styles.opportunityRail} ${mobileOpen ? styles.mobileRailOpen : ""}`} aria-label="岗位机会">
      <div className={styles.railHeading}>
        <div><h2>机会</h2><p>{localCount === totalCount ? `${totalCount} 个我的岗位` : localCount ? `${localCount} 个我的 · ${totalCount - localCount} 个示例` : `${totalCount} 个示例岗位`}</p></div>
        <button className={styles.mobileClose} onClick={onClose} aria-label="关闭机会列表"><X size={19} /></button>
      </div>
      <label className={styles.searchBox}><Search size={16} aria-hidden="true" /><span className="sr-only">搜索公司或岗位</span><input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="搜索公司或岗位" /></label>
      <div className={styles.opportunityList} role="list">
        {opportunities.map((opportunity) => {
          const pinned = pinSet.has(opportunity.id);
          const confirming = confirmId === opportunity.id;
          return (
            <div
              key={opportunity.id}
              role="listitem"
              className={`${styles.opportunityRow} ${activeId === opportunity.id ? styles.opportunityActive : ""} ${draggingId === opportunity.id ? styles.opportunityDragging : ""} ${overId === opportunity.id && draggingId && draggingId !== opportunity.id ? styles.opportunityDropTarget : ""}`}
              draggable={canReorder}
              onDragStart={() => canReorder && setDraggingId(opportunity.id)}
              onDragOver={(event) => { if (draggingId) { event.preventDefault(); setOverId(opportunity.id); } }}
              onDragLeave={() => setOverId((current) => current === opportunity.id ? null : current)}
              onDrop={(event) => { event.preventDefault(); if (draggingId && draggingId !== opportunity.id) onReorder(draggingId, opportunity.id); clearDrag(); }}
              onDragEnd={clearDrag}
            >
              {canReorder && <span className={styles.rowGrip} aria-hidden="true" title="拖动排序"><GripVertical size={14} /></span>}
              <button type="button" className={styles.opportunityItem} onClick={() => onSelect(opportunity.id)} aria-current={activeId === opportunity.id ? "true" : undefined}>
                <span className={styles.opportunityCompany}>{pinned && <Pin size={11} aria-hidden="true" className={styles.rowPinIcon} />}{opportunity.company}</span>
                <strong>{opportunity.role}</strong>
                <span className={styles.opportunityMeta}><span>{stageStatusWord(opportunity)}</span></span>
                <small className={styles.matchEvidence} title="已有强证据支持的要求数 / 岗位要求总数，不是录用概率">{!opportunity.resumeText ? "补简历后查看匹配" : !opportunity.jdText ? "补岗位后查看匹配" : opportunity.requirements.length ? `匹配证据 ${opportunity.requirements.filter((item) => item.strength === "strong").length}/${opportunity.requirements.length}` : "匹配待评估"}</small>
              </button>
              <span className={styles.rowActions}>
                <button type="button" className={styles.rowAction} aria-pressed={pinned} title={pinned ? "取消置顶" : "置顶"} aria-label={pinned ? "取消置顶" : "置顶"} onClick={() => { setConfirmId(null); onTogglePin(opportunity.id); }}><Pin size={14} /></button>
                {confirming ? (
                  <>
                    <button type="button" className={`${styles.rowAction} ${styles.rowActionDanger}`} title="确认删除" aria-label="确认删除该岗位" onClick={() => { setConfirmId(null); onDelete(opportunity.id); }}><Trash2 size={14} /></button>
                    <button type="button" className={styles.rowAction} title="取消" aria-label="取消删除" onClick={() => setConfirmId(null)}><X size={14} /></button>
                  </>
                ) : (
                  <button type="button" className={styles.rowAction} title="删除" aria-label="删除该岗位" onClick={() => setConfirmId(opportunity.id)}><Trash2 size={14} /></button>
                )}
              </span>
            </div>
          );
        })}
        {opportunities.length === 0 && <div className={styles.emptySearch}><Search size={18} /><span>没有匹配的岗位</span><button onClick={() => onQueryChange("")}>清除搜索</button></div>}
        <button className={styles.addOpportunity} onClick={onCreate}><Plus size={16} /><span><strong>添加岗位</strong><small>粘贴招聘链接、JD，也可先传简历</small></span></button>
      </div>
    </aside>
  );
}

function NewOpportunityForm({ onCreate, onCancel, initialEntry = "resume" }: { onCreate: (intake: OpportunityIntake, entry: "direction" | "resume" | "interview") => Promise<void>; onCancel: () => void; initialEntry?: "direction" | "resume" | "interview" }) {
  const [entry, setEntry] = useState(initialEntry);
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
    if (candidate.size > 4 * 1024 * 1024) return setError("文件不能超过 4MB，请压缩 PDF 或上传文字版");
    setFile(candidate);
    setError("");
  };

  return (
    <div className={styles.createPage}>
      <div className={styles.createIntro}>
        <h1>{entry === "direction" ? "先找到适合你的方向" : entry === "interview" ? "为这场面试做准备" : "看看这个岗位，简历怎么改"}</h1>
        <div className={styles.intakeChoices} role="group" aria-label="选择求职起点">{([ ["direction", "还没找到岗位"], ["resume", "有岗位，改简历"], ["interview", "准备面试"] ] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={entry === value} onClick={() => setEntry(value)}>{label}</button>)}</div>
        <p>{entry === "direction" ? "先上传简历，或写下想做的方向。不要求先有 JD；这里先整理目标，尚不自动搜索招聘网站。" : entry === "interview" ? "粘贴这次面试的 JD 或招聘链接。已有简历也可以一起上传，建立档案后进入模拟面试。" : "先粘贴 JD 或招聘链接，也可以上传简历。缺的材料会在下一步提醒你补，不用一次填完。"}</p>
      </div>
      <form
        className={styles.createForm}
        onSubmit={async (event) => {
          event.preventDefault();
          if (!canSubmit || submitting) return;
          setSubmitting(true);
          setError("");
          try {
            await onCreate({ sourceText, file }, entry);
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
            <span>也可以粘贴或拖进来 · 4MB 以内</span>
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

function ContextMaterialAction({ kind, title, description, placeholder, loading, onSubmit }: {
  kind: OpportunitySupplement["kind"];
  title: string;
  description: string;
  placeholder: string;
  loading: boolean;
  onSubmit: (input: OpportunitySupplement) => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [sourceText, setSourceText] = useState("");
  const [error, setError] = useState("");
  const quotaLabel = useQuotaLabel("chat");

  const submit = async (file: File | null = null) => {
    if (loading || (!file && !sourceText.trim())) return;
    if (file && !/\.(pdf|docx|txt|md)$/i.test(file.name)) return setError("支持 PDF、DOCX、TXT 或 Markdown 文件");
    if (file && file.size > 4 * 1024 * 1024) return setError("文件不能超过 4MB，请压缩 PDF 或上传文字版");
    setError("");
    try {
      await onSubmit({ kind, sourceText, file });
      setSourceText("");
      setExpanded(false);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "材料暂时读不了，请重试");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div
      className={`${styles.contextAction} ${dragging ? styles.contextActionDragging : ""}`}
      aria-busy={loading}
      onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }}
      onDrop={(event) => { event.preventDefault(); setDragging(false); void submit(event.dataTransfer.files[0] || null); }}
    >
      <div className={styles.contextActionLead}>
        <span className={styles.contextActionIcon}>{kind === "job" ? <Link2 size={18} /> : <UploadCloud size={18} />}</span>
        <div><strong>{loading ? "正在读取并重新判断…" : title}</strong><p>{loading ? "我会保留已有材料，只更新受影响的判断。" : description}</p></div>
      </div>
      {!loading && <div className={styles.contextActionButtons}>
        <button type="button" className={styles.contextPrimaryAction} onClick={() => inputRef.current?.click()}><UploadCloud size={15} />上传文件</button>
        <button type="button" className={styles.contextSecondaryAction} onClick={() => setExpanded((value) => !value)}>{kind === "job" ? <Link2 size={15} /> : <FileText size={15} />}{expanded ? "收起输入" : kind === "job" ? "粘贴 JD / 链接" : "粘贴内容"}</button>
        <input ref={inputRef} className={styles.materialFileInput} type="file" accept=".pdf,.docx,.txt,.md" onChange={(event) => void submit(event.target.files?.[0] || null)} />
      </div>}
      {expanded && !loading && <div className={styles.contextComposer}>
        <textarea value={sourceText} onChange={(event) => { setSourceText(event.target.value); setError(""); }} rows={4} placeholder={placeholder} autoFocus />
        <div><span>也可把文件拖到这里 · {quotaLabel}</span><button type="button" onClick={() => void submit()} disabled={!sourceText.trim()}>补充并重新判断 <ArrowRight size={15} /></button></div>
      </div>}
      {error && <p className={styles.contextActionError} role="alert">{error}</p>}
    </div>
  );
}

function QuickEvidenceAction({ requirement, onConfirm }: { requirement: string; onConfirm: (answer: string) => void }) {
 return <div className={styles.quickEvidenceAction}><strong>{requirement}</strong><button className={styles.secondaryButton} onClick={()=>onConfirm(requirement)}>请导师带我梳理这条经历</button></div>;
}

function ExistingJobPicker({ jobs, onSelect, title = "选择一个已有岗位继续" }: { jobs: Opportunity[]; onSelect: (id: string) => void; title?: string }) {
  return (
    <section className={styles.existingJobPicker} aria-label="选择已有岗位">
      <div><strong>{title}</strong><p>基础简历会自动带入目标岗位，不需要重新上传。</p></div>
      <div className={styles.existingJobList}>{jobs.map((job) => (
        <button type="button" key={job.id} onClick={() => onSelect(job.id)}>
          <span><small>{job.company}</small><strong>{job.role}</strong></span><ArrowRight size={16} />
        </button>
      ))}</div>
    </section>
  );
}

function OverviewTab({ opportunity, relatedJobs, onOpenEvidence, onSelectJob, onSupplement, onConfirmEvidence, supplementing }: {
  opportunity: Opportunity;
  relatedJobs: Opportunity[];
  onOpenEvidence: () => void;
  onSelectJob: (id: string) => void;
  onSupplement: (input: OpportunitySupplement) => Promise<void>;
  onConfirmEvidence: (answer: string) => void;
  supplementing: boolean;
}) {
  const total = coverageTotal(opportunity);
  const strongRatio = total ? Math.round((opportunity.evidenceCoverage.strong / total) * 100) : 0;
  const decisiveGap = opportunity.requirements.find((item) => item.strength === "unverified" || item.strength === "missing");
  const missingResume = !opportunity.resumeText?.trim();
  const missingJd = !opportunity.jdText?.trim();
  return (
    <div className={styles.overviewFlow}>
      <section className={styles.decisionSection}>
        <div className={styles.sectionHeading}><div><h2>当前判断</h2><p>基于 JD 和已确认经历；待确认内容不计作事实。</p></div><span className={styles.decisionLabel}>{opportunity.recommendationLabel}</span></div>
        <p className={styles.decisionReason}>{opportunity.recommendationReason}</p>
        {missingResume ? <ContextMaterialAction
          kind="resume"
          title="补一份简历，我来重新判断"
          description="上传、拖进来，或直接粘贴简历内容；不用重新填写岗位信息。"
          placeholder="粘贴简历、项目经历或个人背景……"
          loading={supplementing}
          onSubmit={onSupplement}
        /> : missingJd && relatedJobs.length ? <ExistingJobPicker jobs={relatedJobs} onSelect={onSelectJob} title={`你已经有 ${relatedJobs.length} 个 JD，选一个继续`} /> : missingJd ? <ContextMaterialAction
          kind="job"
          title="补充目标岗位或 JD"
          description="贴岗位链接也可以，我会读取岗位要求并和已有简历一起分析。"
          placeholder="粘贴公开岗位链接或完整 JD……"
          loading={supplementing}
          onSubmit={onSupplement}
        /> : decisiveGap?.strength === "unverified" ? <QuickEvidenceAction requirement={decisiveGap.requirement} onConfirm={onConfirmEvidence} /> : decisiveGap ? <ContextMaterialAction
          kind="experience"
          title="补一段相关经历，填上最大缺口"
          description={`当前最缺「${decisiveGap.requirement}」的真实证据。可补项目材料或经历说明。`}
          placeholder="补充你做过的相关项目、职责、动作和结果……"
          loading={supplementing}
          onSubmit={onSupplement}
        /> : null}
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

function ResumeTab({ opportunity, onOpenEvidence, onUpdate, onEdit, onReorder, onGenerate, onValidate, onFreeze, generating, validating, freezing, onPdfResult }: { opportunity: Opportunity; onOpenEvidence: () => void; onUpdate: (id: string, status: "accepted" | "rejected") => void; onEdit: (id: string, after: string) => void; onReorder: (fromId: string, toId: string) => void; onGenerate: () => void; onValidate: () => void; onFreeze: () => void; generating: boolean; validating: boolean; freezing: boolean; onPdfResult: (status: "passed" | "failed", summary: string) => void }) {
  const quotaLabel = useQuotaLabel("resume");
  const [checkingPdf, setCheckingPdf] = useState(false);
  const progress = resumeProgress(opportunity);
  const pendingCount = progress.pending;
  const failedReviews = opportunity.applicationQuality?.reviews.filter((review) => review.status === "failed") || [];
  const pdfReview = opportunity.applicationQuality?.reviews.find((review) => review.reviewerType === "pdf");
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
        {opportunity.resumeText ? (
          <>
            <ResumeBlockBoard opportunity={opportunity} onOpenEvidence={onOpenEvidence} onUpdate={onUpdate} onEdit={onEdit} onReorder={onReorder} />
            <div className={styles.resumeExportRow}><div><strong>底稿随时可导出；生成岗位版时会以它为事实来源。</strong></div><ResumeExport opportunityId={opportunity.id} baseText={opportunity.resumeText}/></div>
          </>
        ) : <EmptySection label="还没有识别到完整简历。继续添加经历材料，导师会合并到事实底稿。" />}
      </section>
    );
  }
  return (
    <section className={styles.resumeStudio}>
      <div className={`${styles.pageIntro} ${styles.resumeStudioIntro}`}><div><span className={styles.eyebrow}>岗位版本</span><h2>把简历改到可以投</h2><p>先看整体、再逐块决定改动；改完做一次事实与岗位检查，通过后冻结，避免误投旧版本。</p></div><button className={styles.primaryButton} onClick={onGenerate} disabled={generating || !opportunity.resumeText || !opportunity.jdText}><Sparkles size={16} />{generating ? "正在生成…" : `${opportunity.resumeChanges.length ? "重新生成建议" : "一键生成岗位版"} · ${quotaLabel}`}</button></div>
      <div className={styles.resumeSteps} aria-label="简历处理进度">{progress.steps.map((step, index) => <span key={step.id} data-state={step.state}><b>{index + 1}</b>{step.label}</span>)}</div>
      <div className={styles.resumeActionRow}>
        <p>{progress.hint}</p>
        <div>
          {progress.action === "check" && <button className={styles.primaryButton} disabled={validating} onClick={onValidate}><ShieldCheck size={15} />{validating ? "正在检查修改…" : "检查我的修改"}</button>}
          {progress.action === "freeze" && <button className={styles.primaryButton} disabled={freezing} onClick={onFreeze}>{freezing ? "正在保存…" : "保存投递版"}</button>}
          {progress.action === "export" && <label className={styles.secondaryButton}>{checkingPdf ? "正在检查…" : pdfReview?.status === "passed" ? "重新校验导出 PDF" : "校验导出 PDF"}<input type="file" accept="application/pdf" hidden disabled={checkingPdf} onChange={(event) => { const file = event.target.files?.[0]; if (file) void verifyPdf(file); event.currentTarget.value = ""; }} /></label>}
        </div>
      </div>
      {failedReviews.length > 0 && <details className={styles.resumeCheckDetails}><summary>有修改需要核对 · 在对应区块选择版本</summary>{failedReviews.map(review => <p key={review.reviewerType}>{review.summary}</p>)}</details>}
      {opportunity.resumeText ? (
        <>
          <ResumeBlockBoard opportunity={opportunity} onOpenEvidence={onOpenEvidence} onUpdate={onUpdate} onEdit={onEdit} onReorder={onReorder} />
          <div className={styles.resumeExportRow}><div><strong>{progress.frozenVersion ? `投递版本 V${progress.frozenVersion}${opportunity.frozenStale ? "（旧版本：修改后请重新保存）" : ""}` : "还没有保存投递版"}</strong></div><ResumeExport opportunityId={opportunity.id} artifactId={opportunity.applicationQuality?.artifactId} baseText={opportunity.resumeText} disabledReason={pendingCount>0||opportunity.resumeCheckStale||opportunity.frozenStale||(opportunity.resumeChanges.length>0&&progress.action!=="export")?"先检查并保存当前投递版，再导出 PDF。":undefined}/></div>
        </>
      ) : <EmptySection label="先在岗位档案补充简历，AI 才能开始。" />}
    </section>
  );
}

const mockRoundOptions = ["业务面", "技术面", "项目深挖", "总监面", "HR面"];

/**
 * 面试轮次选择器：模拟面试与面试复盘共用同一个组件、同一套归一化语义。
 * 快捷项覆盖常见轮次，其余自己填——「四面」「第6轮」「5」都认，超过三面完全没问题；
 * 识别不了就如实提示，不悄悄归到某个默认值。
 */
function RoundPicker({ value, onChange }: { value: string; onChange: (label: string) => void }) {
  const quickOptions = [phoneScreeningLabel, "一面", "二面", "三面", "终面", "HR面"];
  const [draft, setDraft] = useState("");
  const normalized = normalizeRoundLabel(draft);
  const invalid = Boolean(draft.trim()) && !normalized;
  const commit = () => {
    if (!normalized) return;
    onChange(normalized);
    setDraft("");
  };
  return (
    <div className={styles.roundPickerRow}>
      <div className={styles.roundPicker} role="group" aria-label="快速选择面试轮次">
        {quickOptions.map((item) => <button key={item} type="button" aria-pressed={value === item} onClick={() => onChange(item)}>{item}</button>)}
      </div>
      <span className={styles.roundCurrentChip} aria-live="polite">记为：{value}</span>
      <label className={styles.roundCustomInput}><span>或自己填</span><input value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commit(); } }} placeholder="如：四面 / 6" aria-label="填写第几面，如四面或 6" /></label>
      <button type="button" className={styles.secondaryButton} disabled={invalid || !draft.trim()} onClick={commit}>用这轮</button>
      {invalid && <p className={styles.inlineError} role="alert">没认出「{draft.trim()}」。可以写「四面」「第五轮」，或只写数字「5」。</p>}
    </div>
  );
}

/**
 * 圆桌会话的视图类型：逐题评估用 InterviewAssessmentView（带 status / evidence），
 * 整轮总结用 InterviewRoundSummaryView。落库时再按 InterviewRoundtableSession 兼容形态同步，
 * 因此这里统一在边界处做一次受控的类型转换。
 */
type RoundtableTurnView = Omit<InterviewRoundtableTurn, "assessment"> & { assessment?: InterviewAssessmentView };
type RoundtableSessionView = Omit<InterviewRoundtableSession, "turns" | "summary"> & {
  turns: RoundtableTurnView[];
  summary?: InterviewRoundSummaryView;
};

const toSessionRecord = (session: RoundtableSessionView) => session as unknown as InterviewRoundtableSession;
const toSessionView = (session: InterviewRoundtableSession) => session as unknown as RoundtableSessionView;

/** demo 模式下的示例反馈：必须标注为示例，不得冒充真实模型输出。 */
function buildDemoAssessment(answer: string): InterviewAssessmentView | null {
  const lowInfo = detectLowInfoAnswer(answer);
  if (lowInfo.isLowInfo) {
    return normalizeInterviewAssessment({
      status: "needs_more_input",
      score: null,
      summary: "示例模式：这段回答信息不足，先补充事实再评。",
      evidence: [],
      missingEvidence: ["回答中未提供具体事实或经历"],
      dimensions: [],
      rewritePlan: ["补一个具体事例：你做了什么、怎么判断的、结果是什么"],
      followUp: "先告诉我最近一次你亲自做的决定是什么？",
    }, "demo");
  }
  return normalizeInterviewAssessment({
    status: "assessed",
    score: 68,
    summary: "示例反馈：回答方向正确，但个人决策和结果证据还不够具体。",
    evidence: ["示例数据 · 仅用于演示界面，不是真实模型输出"],
    missingEvidence: ["个人动作、指标口径和最终结果"],
    dimensions: [
      { name: "用人经理", score: 70, comment: "示例：能听懂你做了什么，但暂时无法判断影响有多大。" },
      { name: "证据审校", score: 62, comment: "示例：个人动作、指标口径和最终结果需要补齐。" },
    ],
    rewritePlan: ["先给结论", "说明你负责的动作", "补充验证方法", "给出真实结果或明确待核实"],
    followUp: "如果只保留一个结果指标，你会选哪个？",
  }, "demo");
}

function InterviewTab({ opportunity, relatedJobs, onSelectJob, onSupplement, supplementing, onAnalyze, onSyncRoundtable, dataMode, exampleRecords = false }: {
  opportunity: Opportunity;
  relatedJobs: Opportunity[];
  onSelectJob: (id: string) => void;
  onSupplement: (input: OpportunitySupplement) => Promise<void>;
  supplementing: boolean;
  onAnalyze: (question: string, answer: string) => Promise<InterviewPracticeFeedback>;
  onSyncRoundtable: (session: InterviewRoundtableSession, nextActions?: InterviewRoundNextActionView[]) => void;
  dataMode: "demo" | "live";
  // Built-in demo seed data is fabricated (see buildDemoAssessment / demo
  // summarizeRound). When the active opportunity is one of those examples, tag
  // its mock-interview records so a pre-populated round never reads as if the
  // system invented a real interview the user never took.
  exampleRecords?: boolean;
}) {
  const quotaLabel = useQuotaLabel("interview");
  const [practicing, setPracticing] = useState(false);
  // 重点题逐题呈现（一次只给一题），不再整页罗列
  const [focusIndex, setFocusIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [practiceError, setPracticeError] = useState("");
  const [practiceFeedback, setPracticeFeedback] = useState<InterviewPracticeFeedback | null>(opportunity.interviewPractices?.[0] || null);
  // Which question the shown feedback belongs to. Decoupling this from the
  // feedback's own `.question` string avoids the "保存并分析没反应" bug: the
  // analysis succeeded but the card was gated on an exact string match against
  // currentQuestion, so a server-normalized or cross-question record hid it.
  const [feedbackFor, setFeedbackFor] = useState<string | null>(opportunity.interviewPractices?.[0]?.question || null);
  const [analyzingPractice, setAnalyzingPractice] = useState(false);
  const [roundtableOpen, setRoundtableOpen] = useState(false);
  const [round, setRound] = useState("业务面");
  const [questionCount, setQuestionCount] = useState(3);
  // 轮次（第几面）与题型（业务面/技术面…）拆开：轮次由用户自己填、和复盘侧同一套语义；
  // 题型只是出题追问的视角，交给 /api/interview/start 的 roundType。
  const [roundOrdinalLabel, setRoundOrdinalLabel] = useState("一面");
  const [reflectionAnswers, setReflectionAnswers] = useState<string[]>(() => ROUND_REFLECTION_QUESTIONS.map(() => ""));
  const [selfReflection, setSelfReflection] = useState<{ questions: string[]; answers: string[] } | null>(null);
  const [startingRoundtable, setStartingRoundtable] = useState(false);
  const [submittingRoundtable, setSubmittingRoundtable] = useState(false);
  const [summarizingRoundtable, setSummarizingRoundtable] = useState(false);
  const [roundtableAnswer, setRoundtableAnswer] = useState("");
  const [roundtableError, setRoundtableError] = useState("");
  const [roundtable, setRoundtable] = useState<RoundtableSessionView | null>(() => {
    const running = opportunity.mockInterviews?.find((item) => item.status === "running") || null;
    return running ? toSessionView(running) : null;
  });
  /** 当前题目的反馈：needs_more_input 时停在本题，assessed 时才允许推进。 */
  const [lastFeedback, setLastFeedback] = useState<InterviewAssessmentView | null>(null);
  const roundtableWorkspaceRef = useRef<HTMLElement>(null);
  const [practiceQuestionId, setPracticeQuestionId] = useState<string | null>(null);
  const currentQuestion = opportunity.interviewFocus.find((item) => item.id === practiceQuestionId) || opportunity.interviewFocus[0] || {id:"intro",question:"请介绍一个你真实做过的项目，说明你的职责和目前的进展。",rationale:"没有上线或结果也可以如实说明，先练清楚事实和职责。",readiness:"practice" as const};
  const practiceRef=useRef<HTMLElement>(null);
  useEffect(()=>{if(practicing){const panel=practiceRef.current;panel?.scrollIntoView({behavior:"smooth",block:"start"});panel?.querySelector("textarea")?.focus({preventScroll:true});}},[practicing]);
  const hasJd = Boolean(opportunity.jdText?.trim());

  useEffect(() => {
    if (!roundtableOpen) return;
    roundtableWorkspaceRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [roundtableOpen, roundtable?.currentIndex, roundtable?.status]);

  useEffect(() => {
    const running = opportunity.mockInterviews?.find((item) => item.status === "running") || null;
    setRoundtable(running ? toSessionView(running) : null);
    setRoundtableOpen(Boolean(running));
    setLastFeedback(null);
    const restoredPractice = opportunity.interviewPractices?.[0] || null;
    setPracticeFeedback(restoredPractice);
    setFeedbackFor(restoredPractice?.question || null);
    setAnswer("");
    setPracticeError("");
    setRoundtableAnswer("");
    setRoundtableError("");
    setSelfReflection(null);
    setReflectionAnswers(ROUND_REFLECTION_QUESTIONS.map(() => ""));
    setFocusIndex(0);
    // Switching jobs resets the local composer; updates within the same job are
    // already applied locally before the opportunity snapshot is synchronized.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opportunity.id]);

  const startRoundtable = async () => {
    if (!hasJd || startingRoundtable) return;
    setStartingRoundtable(true);
    setRoundtableError("");
    try {
      let session: RoundtableSessionView;
      if (dataMode === "demo") {
        const sourceQuestions = opportunity.interviewFocus.length ? opportunity.interviewFocus : [{ id: "demo-question", question: "请介绍一个最能证明你适合这个岗位的项目。", rationale: "先验证核心岗位证据。", readiness: "practice" as const }];
        const turns = Array.from({ length: questionCount }, (_, index) => {
          const source = sourceQuestions[index % sourceQuestions.length];
          return { questionId: `${source.id}-${index}`, question: source.question, rationale: source.rationale };
        });
        session = { id: `demo-roundtable-${Date.now()}`, round: roundOrdinalLabel, status: "running", currentIndex: 0, turns, createdAt: new Date().toISOString() };
      } else {
        const response = await fetch("/api/interview/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jd: opportunity.jdText || "", roundType: round, questionCount, opportunityId: opportunity.id, resumeText: opportunity.resumeText || "", requestId: crypto.randomUUID() }),
        });
        const result = await response.json();
        if (!response.ok || !result.session_id || !Array.isArray(result.questions)) throw apiResponseError(response, result, "圆桌启动失败");
        session = {
          id: String(result.session_id), round: roundOrdinalLabel, status: "running", currentIndex: 0, createdAt: new Date().toISOString(),
          turns: result.questions.map((question: Record<string, unknown>) => ({
            questionId: String(question.id),
            question: String(question.question_text),
            rationale: String((question.tips as Record<string, unknown> | undefined)?.intent || "根据当前岗位与简历继续追问。"),
          })),
        };
        trackProductEvent("mock_interview_started", { opportunity_id: opportunity.id, round, round_label: roundOrdinalLabel });
      }
      setRoundtable(session);
      setRoundtableOpen(true);
      setLastFeedback(null);
      setSelfReflection(null);
      setReflectionAnswers(ROUND_REFLECTION_QUESTIONS.map(() => ""));
      onSyncRoundtable(toSessionRecord(session));
    } catch (error) {
      setRoundtableError(error instanceof Error ? error.message : "圆桌启动失败");
    } finally {
      setStartingRoundtable(false);
    }
  };

  /** 整轮总结：失败就是失败，不用假报告补齐。reflectionText 是用户先写的自我复盘，AI 点评要先回应它。 */
  const summarizeRound = async (session: RoundtableSessionView, reflectionText: string) => {
    setSummarizingRoundtable(true);
    setRoundtableError("");
    try {
      if (dataMode === "demo") {
        const scored = session.turns.filter((turn) => turn.assessment?.status === "assessed");
        if (scored.length === 0) throw new Error("示例模式：本轮没有可评分的回答，整轮总结未生成。");
        const completed: RoundtableSessionView = { ...session, status: "completed", summary: {
          overallScore: 68,
          grade: "B · 示例",
          verdict: "示例模式下的整轮总结，不是真实模型输出。",
          strengths: ["示例：回答方向与问题相关"],
          weaknesses: ["示例：个人动作与结果证据不足"],
          dimensions: [
            { name: "专业深度", score: 65, comment: "示例：能讲清做法，但没讲清机制与权衡。" },
            { name: "逻辑表达", score: 72, comment: "示例：结论先行，排序环节跳步。" },
            { name: "应变能力", score: 60, comment: "示例：被追问后重复同一答案。" },
            { name: "项目理解", score: 70, comment: "示例：责任边界基本清楚，数字口径不清。" },
            { name: "沟通技巧", score: 74, comment: "示例：信息密度尚可，偶有冗余。" },
            { name: "自我认知", score: 66, comment: "示例：有认识但偏空泛。" },
            { name: "文化匹配", score: 64, comment: "示例：对岗位理解停留在公司层面。" },
          ],
          questionBreakdown: scored.map((turn, index) => ({
            questionId: turn.questionId,
            score: turn.assessment?.score ?? null,
            decisiveFinding: `示例：第 ${index + 1} 题缺少可核验的结果证据。`,
          })),
          nextActions: [
            { title: "补齐指标口径", reason: "示例：多题出现数字但没说基线与时间窗", doneWhen: "示例：能说出分子分母、时间窗与归因方式", priority: "urgent" },
            { title: "重答最弱的一题", reason: "示例：该题没有可引用的结果证据", doneWhen: "示例：能讲清个人决策与结果", priority: "high" },
          ],
        } };
        setRoundtable(completed);
        onSyncRoundtable(toSessionRecord(completed), completed.summary?.nextActions);
        return;
      }
      // 走 /api/interview/complete：它才负责落库（interview_feedback snapshot + opportunity actions），
      // GET /api/interview/summary 只是临时生成，不写快照、不写入下一步。
      const response = await fetch("/api/interview/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: session.id, opportunityId: opportunity.id, userReflection: reflectionText }),
      });
      const result = await response.json();
      const summary = normalizeRoundSummary(result?.payload?.summary ?? result?.summary);
      if (!response.ok || !summary) throw apiResponseError(response, result, "整轮总结生成失败");
      const completed: RoundtableSessionView = { ...session, status: "completed", summary };
      setRoundtable(completed);
      onSyncRoundtable(toSessionRecord(completed), summary.nextActions);
    } catch (error) {
      setRoundtableError(error instanceof Error ? error.message : "整轮总结生成失败");
    } finally {
      setSummarizingRoundtable(false);
    }
  };

  const submitRoundtableAnswer = async () => {
    if (!roundtable || !roundtableAnswer.trim() || submittingRoundtable) return;
    const currentTurn = roundtable.turns[roundtable.currentIndex];
    if (!currentTurn) return;
    setSubmittingRoundtable(true);
    setRoundtableError("");
    try {
      let assessment: InterviewAssessmentView | null;
      if (dataMode === "demo") {
        await new Promise((resolve) => window.setTimeout(resolve, 450));
        assessment = buildDemoAssessment(roundtableAnswer.trim());
      } else {
        const response = await fetch("/api/interview/answer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: roundtable.id, question_id: currentTurn.questionId, answer: roundtableAnswer.trim(), opportunityId: opportunity.id, resumeText: opportunity.resumeText || "" }),
        });
        const result = await response.json();
        if (!response.ok || !result.assessment) throw apiResponseError(response, result, "本题分析失败");
        assessment = normalizeInterviewAssessment(result.assessment);
      }
      if (!assessment) throw new Error("本题反馈不可用，请重试");

      // 只保存回答和反馈，题号推进由 goNextQuestion 决定：needs_more_input 停在本题。
      const updated: RoundtableSessionView = {
        ...roundtable,
        turns: roundtable.turns.map((turn, index) => index === roundtable.currentIndex ? { ...turn, answer: roundtableAnswer.trim(), assessment } : turn),
      };
      setRoundtable(updated);
      setLastFeedback(assessment);
      if (assessment.status === "assessed") setRoundtableAnswer("");
      onSyncRoundtable(toSessionRecord(updated));
    } catch (error) {
      setLastFeedback(null);
      setRoundtableError(error instanceof Error ? error.message : "本题分析失败");
    } finally {
      setSubmittingRoundtable(false);
    }
  };

  const goNextQuestion = async () => {
    if (!roundtable || lastFeedback?.status !== "assessed") return;
    const step = resolveNextStep(roundtable.currentIndex, roundtable.turns.length, "assessed");
    const advanced: RoundtableSessionView = { ...roundtable, currentIndex: step.currentIndex, status: step.completed ? "completed" : "running" };
    setRoundtable(advanced);
    setLastFeedback(null);
    onSyncRoundtable(toSessionRecord(advanced));
    // 最后一题答完不再直接让 AI 写整轮结论：先进入「你自己先复盘」这一步。
  };

  /** 收尾第一步：用户先写自己的复盘，提交之后 AI 才补点评（/api/interview/complete 会先回应这段判断）。 */
  const submitSelfReflection = () => {
    if (!roundtable) return;
    const reflection = formatRoundReflection(ROUND_REFLECTION_QUESTIONS, reflectionAnswers);
    if (!reflection) return;
    setSelfReflection({ questions: [...ROUND_REFLECTION_QUESTIONS], answers: [...reflectionAnswers] });
    void summarizeRound(roundtable, reflection);
  };

  /** 复盘已提交但 AI 点评失败：不再让用户重写，直接重试点评。 */
  const retryAiSummary = () => {
    if (!roundtable || !selfReflection) return;
    void summarizeRound(roundtable, formatRoundReflection(selfReflection.questions, selfReflection.answers));
  };

  if (roundtableOpen) {
    const turn = roundtable?.turns[roundtable.currentIndex];
    const isAssessed = lastFeedback?.status === "assessed";
    const isBlocked = lastFeedback?.status === "needs_more_input";
    const hints = lastFeedback ? needsMoreInputHints(lastFeedback) : [];
    const isLastQuestion = Boolean(roundtable && roundtable.currentIndex >= roundtable.turns.length - 1);
    const answeredCount = roundtable?.turns.filter((item) => item.answer).length ?? 0;
    const completionPhase = resolveRoundCompletionPhase({
      roundCompleted: roundtable?.status === "completed",
      hasSelfReflection: Boolean(selfReflection),
      hasAiSummary: Boolean(roundtable?.summary),
    });
    return (
      <section ref={roundtableWorkspaceRef} className={styles.roundtableWorkspace}>
        <header className={styles.roundtableHeader}>
          <div><button type="button" className={styles.textButton} onClick={() => setRoundtableOpen(false)}>返回面试准备</button><h2>模拟面试圆桌</h2><p>{opportunity.company} · {opportunity.role} · {roundtable?.round || `${roundOrdinalLabel} · ${round}`}</p></div>
          {roundtable && <span className={styles.roundtableProgress}>{roundtable.status === "completed" ? "本轮完成" : `${roundtable.currentIndex + 1} / ${roundtable.turns.length}`}</span>}
        </header>
        {!roundtable ? <div className={styles.roundtableStart}>
          <div className={styles.interviewStageHero}>
            <div className={styles.interviewSignal} aria-hidden="true"><span /><MessageSquareText size={26} /></div>
            <div><span className={styles.eyebrow}>AI 面试官已就位</span><h3>现在，练一场真的</h3><p>围绕当前岗位连续追问，答完每题立刻指出证据和缺口。</p></div>
          </div>
          <div className={styles.interviewFlow} aria-label="模拟面试流程"><span data-state="ready"><b>1</b>岗位材料</span><span><b>2</b>{questionCount} 题实战</span><span><b>3</b>逐题反馈</span><span><b>4</b>你先复盘</span><span><b>5</b>AI 再点评</span></div>
          <div className={styles.roundtableSetup}>
            <div className={styles.setupLabel}><span>这是第几面？</span><small>和面试复盘共用同一套轮次记录，可超过三面</small></div>
            <RoundPicker value={roundOrdinalLabel} onChange={setRoundOrdinalLabel} />
            <div className={styles.setupLabel}><span>出题视角（面试类型）</span><small>决定题目难度和追问口吻，按当前{opportunity.resumeText ? " JD + 简历" : " JD"}出 3 题</small></div>
            <div className={styles.roundPicker} role="group" aria-label="选择模拟面试类型">{mockRoundOptions.map((item) => <button key={item} type="button" aria-pressed={round === item} onClick={() => setRound(item)}>{item}</button>)}</div>
            <div className={styles.setupLabel}><span>这轮练几题？</span><small>题越多越接近真实强度，也越耗额度</small></div>
            <div className={styles.roundPicker} role="group" aria-label="选择题数">{[3, 5, 8].map((count) => <button key={count} type="button" aria-pressed={questionCount === count} onClick={() => setQuestionCount(count)}>{count} 题</button>)}</div>
            <div className={styles.roundtableSourceLine}><ShieldCheck size={15} /><span>材料已同步</span><span>当前 JD</span><span>{opportunity.resumeText ? "基础简历" : "未关联简历，将只按 JD 提问"}</span></div>
            <button className={`${styles.primaryButton} ${styles.startInterviewButton}`} disabled={!hasJd || startingRoundtable} onClick={startRoundtable}>{startingRoundtable ? "正在为你准备问题…" : `进入 ${roundOrdinalLabel} · ${round} · ${questionCount} 题`}<span>{quotaLabel}</span><ArrowRight size={17} /></button>
          </div>
          {!hasJd && <p className={styles.inlineError}>当前岗位还没有 JD，圆桌只能按真实 JD 出题，先回岗位档案补上再开始。</p>}
          {roundtableError && <p className={styles.inlineError}>{roundtableError}</p>}
        </div> : roundtable.status === "completed" ? <div className={styles.roundtableComplete}>
          {!roundtable.summary ? (completionPhase === "self_reflection" ? <>
            <Sparkles size={26} />
            <h3>这一轮答完了：先按你自己的感觉复盘</h3>
            <p>{answeredCount} 条回答和逐题反馈已保存。在 AI 给整轮点评之前，先写下你自己的判断——接下来的点评会先回应这段，再补充它的观察。</p>
            <section className={styles.selfReviewPanel} aria-label="自我复盘">
              {ROUND_REFLECTION_QUESTIONS.map((question, index) => (
                <div key={question} className={styles.selfReviewQuestion}>
                  <label htmlFor={`round-reflection-${index}`}>{index + 1}. {question}</label>
                  <textarea id={`round-reflection-${index}`} rows={2} value={reflectionAnswers[index] ?? ""} onChange={(event) => setReflectionAnswers((current) => current.map((item, position) => (position === index ? event.target.value : item)))} placeholder={index === 0 ? "哪一题、卡在哪个环节" : "可不写全，但至少认真答一条"} />
                </div>
              ))}
              <div className={styles.selfReviewActions}>
                <span>{hasRoundReflectionContent(reflectionAnswers) ? "写好了就交给 AI：它会先回应你的判断" : "至少写一条；全空的话，AI 就又开始替你复盘了"}</span>
                <button className={styles.primaryButton} disabled={!hasRoundReflectionContent(reflectionAnswers)} onClick={submitSelfReflection}>提交我的复盘，再听 AI 点评<ArrowRight size={15} /></button>
              </div>
            </section>
            {roundtableError && <p className={styles.inlineError}>{roundtableError}</p>}
            <div><button className={styles.secondaryButton} onClick={() => setRoundtableOpen(false)}>先回到面试准备（复盘可以下次再写）</button></div>
          </> : <>
            <CircleAlert size={26} />
            <h3>{summarizingRoundtable ? "AI 正在回应你的复盘、整理点评…" : "你的复盘已保存，AI 点评还没生成"}</h3>
            <p>{answeredCount} 条回答、逐题反馈和你写的自我复盘都已保存。点评失败时不会用样例数据补齐，可以重试，也可以先回岗位档案。</p>
            <div>
              <button className={styles.secondaryButton} onClick={() => setRoundtableOpen(false)}>回到面试准备</button>
              <button className={styles.primaryButton} disabled={summarizingRoundtable} onClick={retryAiSummary}><RotateCcw size={15} />重新生成 AI 点评</button>
            </div>
            {roundtableError && <p className={styles.inlineError}>{roundtableError}</p>}
          </>) : <>
            <RoundSummary summary={roundtable.summary} turns={roundtable.turns} selfReflection={selfReflection} />
            <div>
              <button className={styles.primaryButton} onClick={() => setRoundtableOpen(false)}>回到作战板<ArrowRight size={15} /></button>
              <button className={styles.secondaryButton} onClick={() => { setRoundtable(null); setRoundtableAnswer(""); setLastFeedback(null); setSelfReflection(null); setReflectionAnswers(ROUND_REFLECTION_QUESTIONS.map(() => "")); }}>再练一轮</button>
            </div>
          </>}
        </div> : <>
          {roundtable.currentIndex > 0 && <div className={styles.roundtableTranscript} aria-label="本轮对话记录">
            {roundtable.turns.slice(0, roundtable.currentIndex).map((past, index) => <div key={past.questionId} className={styles.transcriptTurn}>
              <div className={styles.transcriptQ}><div className={styles.transcriptAvatar} aria-hidden="true"><span>AI</span></div><p><b>第 {index + 1} 题</b>{past.question}</p></div>
              {past.answer && <p className={styles.transcriptA}>{past.answer}</p>}
              {past.assessment?.status === "assessed" && <details className={styles.transcriptFeedback}><summary>用人经理点评 · {past.assessment.score} 分{past.assessment.source === "demo" ? " · 示例" : ""}</summary><p>{past.assessment.summary}</p>{past.assessment.followUp && <p><b>当时追问：</b>{past.assessment.followUp}</p>}</details>}
            </div>)}
          </div>}
          {turn && <article className={styles.roundtableQuestion}>
            <div className={styles.interviewScene}>
              <div className={styles.interviewerAvatar} aria-hidden="true"><span>AI</span><i /></div>
              <div className={styles.questionBubble}>
                <div className={styles.questionMeta}><span>{round}</span><div aria-label={`第 ${roundtable.currentIndex + 1} 题，共 ${roundtable.turns.length} 题`}>{roundtable.turns.map((item, index) => <i key={item.questionId} data-state={index < roundtable.currentIndex ? "done" : index === roundtable.currentIndex ? "current" : "waiting"} />)}</div></div>
                <h3>{turn.question}</h3>
                <p>{turn.rationale}</p>
              </div>
            </div>
            <details className={styles.coachingHint}><summary><Sparkles size={15} />卡住了？看答题提示</summary><div><p>先说结论，再说你实际负责的动作、判断依据和结果；最后说明取舍。没有做过的部分明确说明，不补造数字。</p><p><b>这道题重点考察：</b>{turn.rationale||"回答是否有清楚的判断与可追溯的证据"}</p></div></details>
            {!isAssessed && <div className={styles.answerComposer}><label htmlFor={`roundtable-answer-${turn.questionId}`}><span>你的回答</span><small>{roundtableAnswer.trim().length ? `${roundtableAnswer.trim().length} 字` : "可以打字，也可以直接说"}</small></label><textarea id={`roundtable-answer-${turn.questionId}`} rows={8} value={roundtableAnswer} onChange={(event) => setRoundtableAnswer(event.target.value)} placeholder={isBlocked ? "根据反馈把证据补完整…" : "像真实面试一样回答，不确定的数字可以明确说待核实…"} /><VoiceControls key={turn.questionId} value={roundtableAnswer} onChange={setRoundtableAnswer} readText={turn.question} disabled={submittingRoundtable}/></div>}
            {isAssessed && turn.answer && <p className={styles.transcriptA}><b>你的回答</b>{turn.answer}</p>}
          </article>}
          {isBlocked && lastFeedback && <section className={styles.assessmentBlocked}>
            <header><CircleAlert size={16} /><strong>信息不足，暂不评分</strong>{lastFeedback.source === "demo" && <em className={styles.demoBadge}>示例</em>}</header>
            <p>{lastFeedback.summary}</p>
            {hints.length > 0 && <div className={styles.assessmentBlock}><b>还缺什么</b><ul>{hints.map((hint) => <li key={hint}>{hint}</li>)}</ul></div>}
            {lastFeedback.followUp && <footer><b>先回答这一个</b><p>{lastFeedback.followUp}</p></footer>}
          </section>}
          {isAssessed && lastFeedback && <section className={styles.assessmentCard}>
            <header><span>用人经理的反应</span>{lastFeedback.source === "demo" && <em className={styles.demoBadge}>示例</em>}<strong>{lastFeedback.score}<small>分</small></strong></header>
            <p className={styles.assessmentSummary}>{lastFeedback.summary}</p>
            <details className={styles.assessmentDetail}><summary>这题的详细点评 · {lastFeedback.dimensions.length} 个维度 · {lastFeedback.evidence.length + lastFeedback.missingEvidence.length} 条证据{lastFeedback.rewritePlan.length ? ` · 重答路线 ${lastFeedback.rewritePlan.length} 步` : ""}</summary>
            {lastFeedback.dimensions.length > 0 && <div className={styles.dimensionBars}>{lastFeedback.dimensions.map((dimension) => {
              const pct = typeof dimension.score === "number" ? Math.max(0, Math.min(100, dimension.score)) : null;
              return <div key={dimension.name} className={styles.dimensionRow} title={dimension.comment}>
                <span>{dimension.name}</span>
                <i className={styles.dimensionTrack}><b style={{ width: pct === null ? "0%" : `${pct}%` }} data-tone={pct === null ? "na" : pct >= 70 ? "good" : pct >= 45 ? "mid" : "low"} /></i>
                <em>{pct === null ? "未评分" : pct}</em>
              </div>;
            })}</div>}
            {(lastFeedback.evidence.length > 0 || lastFeedback.missingEvidence.length > 0) && <div className={styles.assessmentSplit}>
              {lastFeedback.evidence.length > 0 && <section><b>站得住的证据</b><ul className={styles.dotListGood}>{lastFeedback.evidence.map((item) => <li key={item}>{item}</li>)}</ul></section>}
              {lastFeedback.missingEvidence.length > 0 && <section><b>缺口与冲突</b><ul className={styles.dotListWarn}>{lastFeedback.missingEvidence.map((item) => <li key={item}>{item}</li>)}</ul></section>}
            </div>}
            {lastFeedback.rewritePlan.length > 0 && <div className={styles.rewriteSteps}><b>重答走这条线</b><ol>{lastFeedback.rewritePlan.map((item, index) => <li key={item}><i>{index + 1}</i>{item}</li>)}</ol></div>}
            </details>
            {lastFeedback.followUp && <footer><b>面试官会继续问</b><p>{lastFeedback.followUp}</p></footer>}
          </section>}
          <div className={styles.roundtableActions}>
            <span>{isAssessed ? (isLastQuestion ? "这一轮聊完了：收尾两步——你先复盘，AI 再回应。" : "看完反应，面试官接着往下问。") : isBlocked ? "补充后重新提交，本题不会跳过。" : "提交后会保存回答，信息不足则不评分、不推进。"}</span>
            {isAssessed&&<button className={styles.secondaryButton} onClick={()=>{setRoundtableAnswer(turn?.answer||"");setLastFeedback(null);}}>按反馈重新回答</button>}
            {isAssessed
              ? <button className={styles.primaryButton} onClick={() => void goNextQuestion()}>{isLastQuestion ? "完成本轮，先写自我复盘" : "下一题"}<ArrowRight size={15} /></button>
              : <button className={styles.primaryButton} disabled={!roundtableAnswer.trim() || submittingRoundtable} onClick={() => void submitRoundtableAnswer()}>{submittingRoundtable ? "圆桌分析中…" : isBlocked ? "重新提交补充回答" : "提交回答"}{!isBlocked && <ArrowRight size={15} />}</button>}
          </div>
          {roundtableError && <div className={styles.retryBlock}><p className={styles.inlineError}>{roundtableError}</p><button className={styles.secondaryButton} disabled={submittingRoundtable} onClick={() => void submitRoundtableAnswer()}><RotateCcw size={15} />重试本题</button></div>}
        </>}
      </section>
    );
  }

  return (
    <section>
      <div className={`${styles.pageIntro} ${styles.interviewIntro}`}><div><span className={styles.eyebrow}>面试训练</span><h2>先练最可能被追问的题</h2><p>一条流程：选题开练 → 自己标第几面 → 逐题作答、逐题反馈 → 一轮结束你先写复盘，AI 再回应你的判断。题目来自{opportunity.resumeText ? "当前 JD 与你的简历" : "当前 JD（尚未关联简历，不会凭空引用你的经历）"}。</p></div><div className={styles.interviewActions}>{currentQuestion && <button className={styles.secondaryButton} onClick={() => { setPracticing(true); setPracticeError(""); }}><MessageSquareText size={16} />单题速练</button>}<button className={styles.primaryButton} disabled={!hasJd} onClick={() => { setRoundtable(null); setRoundtableAnswer(""); setLastFeedback(null); setSelfReflection(null); setRoundtableOpen(true); }}><Sparkles size={16} />{hasJd ? `开始模拟面试 · ${quotaLabel}` : "模拟面试 · 需要 JD"}</button></div>
      {!hasJd && <p className={styles.ctaHint}>这个岗位还没有 JD。圆桌的每一题都必须能追溯到当前 JD，缺 JD 时不会用通用题顶上。</p>}
      </div>
      {!hasJd && (relatedJobs.length ? <ExistingJobPicker jobs={relatedJobs} onSelect={onSelectJob} title={`选择面试岗位 · 已有 ${relatedJobs.length} 个 JD`} /> : <ContextMaterialAction
        kind="job"
        title="先补一个目标岗位"
        description="贴岗位链接、上传文件或粘贴 JD，基础简历会自动带入。"
        placeholder="粘贴公开岗位链接或完整 JD……"
        loading={supplementing}
        onSubmit={onSupplement}
      />)}
      {practicing && currentQuestion && <section ref={practiceRef} className={styles.practicePanel}><span>单题速练 · 不生成新题，只对你选的这题给反馈（{exampleRecords ? "示例工作区给出的是演示反馈，不消耗额度" : "会消耗一次额度"}）；回答会保存到当前岗位</span>{opportunity.interviewFocus.length > 1 && <div className={styles.practiceQuestionPicker} role="group" aria-label="选择要练的重点题">{opportunity.interviewFocus.slice(0, 6).map((focus, index) => <button key={focus.id} type="button" title={focus.question} aria-pressed={focus.id === currentQuestion.id} onClick={() => { if (focus.id !== currentQuestion.id) { setPracticeQuestionId(focus.id); setAnswer(""); setPracticeError(""); } }}>第{index + 1}题</button>)}</div>}<h3>{currentQuestion.question}</h3><p>{currentQuestion.rationale}</p><textarea value={answer} onChange={(event) => setAnswer(event.target.value)} rows={7} placeholder="先说出你的真实回答。不确定的数字可以明确写“待核实”。" />{practiceFeedback && feedbackFor === currentQuestion.question && <article className={styles.practiceResult} data-verdict={practiceFeedback.verdict}><header><span>{practiceFeedback.verdict}</span><time>{new Date(practiceFeedback.createdAt).toLocaleDateString("zh-CN")}</time></header><strong>{practiceFeedback.summary}</strong><div><section><b>保留</b>{practiceFeedback.strengths.length ? <ul className={styles.dotListGood}>{practiceFeedback.strengths.map((item) => <li key={item}>{item}</li>)}</ul> : <p>暂未识别到稳定优势</p>}</section><section><b>重答先补</b><ul className={styles.dotListWarn}>{practiceFeedback.gaps.map((item) => <li key={item}>{item}</li>)}</ul></section></div><footer><b>面试官会继续问</b><p>{practiceFeedback.followUp}</p></footer></article>}{practiceError && <p className={styles.inlineError}>{practiceError}</p>}<div><button className={styles.secondaryButton} onClick={() => setPracticing(false)}>收起</button><button className={styles.primaryButton} disabled={!answer.trim() || analyzingPractice} onClick={async () => { setAnalyzingPractice(true); setPracticeError(""); try { const feedback = await onAnalyze(currentQuestion.question, answer.trim()); setPracticeFeedback(feedback); setFeedbackFor(currentQuestion.question); } catch (error) { setPracticeError(error instanceof Error ? error.message : "分析失败"); } finally { setAnalyzingPractice(false); } }}>{analyzingPractice ? "导师分析中…" : "保存并分析回答"}</button></div></section>}
      {practicing && currentQuestion && <VoiceControls key={`${opportunity.id}:${currentQuestion.question}`} value={answer} onChange={setAnswer} readText={currentQuestion.question} disabled={analyzingPractice}/>}
      {!practicing && practiceFeedback && <button type="button" className={styles.savedPractice} onClick={() => setPracticing(true)}><span><CircleCheck size={15} />最近一次单题反馈</span><strong>{practiceFeedback.verdict} · {practiceFeedback.summary}</strong><ChevronRight size={16} /></button>}
      {opportunity.interviewFocus.length > 0 ? <details className={styles.focusStepper}><summary>岗位重点题 · 共 {opportunity.interviewFocus.length} 题，逐题看</summary>
        {(() => {
          const safeIndex = Math.min(focusIndex, opportunity.interviewFocus.length - 1);
          const focus = opportunity.interviewFocus[safeIndex];
          return <div className={styles.focusOne}>
            <div className={styles.focusDots} aria-label={`第 ${safeIndex + 1} 题，共 ${opportunity.interviewFocus.length} 题`}>
              {opportunity.interviewFocus.map((item, index) => <i key={item.id} data-state={index < safeIndex ? "done" : index === safeIndex ? "current" : "waiting"} />)}
            </div>
            <article><span className={`${styles.readinessDot} ${styles[`readiness_${focus.readiness}`]}`} /><div><strong>{focus.question}</strong><p>{focus.rationale}</p></div><em>{focus.readiness === "ready" ? "已准备" : focus.readiness === "practice" ? "需练习" : "待补充"}</em></article>
            <div className={styles.focusStepperActions}>
              <button type="button" className={styles.secondaryButton} disabled={safeIndex === 0} onClick={() => setFocusIndex(safeIndex - 1)}>上一题</button>
              <button type="button" className={styles.secondaryButton} onClick={() => { setPracticeQuestionId(focus.id); setAnswer(""); setPracticeError(""); setPracticing(true); }}><MessageSquareText size={15} />练这一题</button>
              {safeIndex < opportunity.interviewFocus.length - 1 && <button type="button" className={styles.primaryButton} onClick={() => setFocusIndex(safeIndex + 1)}>下一题<ArrowRight size={15} /></button>}
            </div>
          </div>;
        })()}
      </details> : <details><summary>查看岗位重点题（0）</summary><div className={styles.focusList}><EmptySection label="岗位重点题尚未生成，可以先练基础项目介绍。" /></div></details>}
      {(opportunity.mockInterviews || []).length > 0 && <section className={styles.mockHistory}><header><h3>模拟记录{exampleRecords ? <span style={{marginLeft:6,fontSize:12,color:"#9a6b1f"}}>· 示例数据</span> : null}</h3><span>{opportunity.mockInterviews?.length} 轮</span></header>{opportunity.mockInterviews?.slice(0, 3).map((session) => <button type="button" key={session.id} onClick={() => { setRoundtable(toSessionView(session)); setRoundOrdinalLabel(normalizeRoundLabel(session.round) || session.round || roundOrdinalLabel); setLastFeedback(null); setSelfReflection(null); setRoundtableOpen(true); }}><span><strong>{session.round}</strong><small>{new Date(session.createdAt).toLocaleDateString("zh-CN")} · {session.turns.filter((turn) => turn.answer).length}/{session.turns.length} 题{exampleRecords ? " · 示例" : ""}</small></span><em>{session.status === "completed" ? "已完成" : "继续练习"}</em></button>)}</section>}
    </section>
  );
}

/** 整轮总结：先回放用户自己的复盘，再给七维评价 + 逐题决定性问题 + 最多 3 个下一步。缺什么就不展示什么，不补假数据。 */
function RoundSummary({ summary, turns, selfReflection }: { summary: InterviewRoundSummaryView; turns: RoundtableTurnView[]; selfReflection?: { questions: string[]; answers: string[] } | null }) {
  const questionText = (questionId: string) => turns.find((turn) => turn.questionId === questionId)?.question || "";
  const reflectionEntries = (selfReflection?.questions || []).map((question, index) => ({ question, answer: (selfReflection?.answers || [])[index] || "" })).filter((entry) => entry.answer.trim());
  return (
    <article className={styles.roundSummary}>
      <header>
        <div><span className={styles.eyebrow}>整轮总结</span><strong className={styles.roundGrade}><i>{summary.grade}</i>{summary.overallScore}<small>/100</small></strong></div>
        {summary.verdict && <p>{summary.verdict}</p>}
      </header>
      {reflectionEntries.length > 0 && <section className={styles.summarySection}>
        <h3>你自己先写的复盘（AI 点评围绕这段展开）</h3>
        <ul className={styles.selfReviewRecap}>{reflectionEntries.map((entry) => <li key={entry.question}><b>{entry.question}</b><p>{entry.answer}</p></li>)}</ul>
      </section>}
      {summary.dimensions.length > 0 && <section className={styles.summarySection}>
        <h3>七维评价</h3>
        <div className={styles.summaryDimensions}>{summary.dimensions.map((dimension) => {
          const pct = Math.max(0, Math.min(100, dimension.score));
          return <div key={dimension.name} className={styles.summaryDimRow}>
            <div className={styles.summaryDimHead}><span>{dimension.name}</span><i className={styles.dimensionTrack}><b style={{ width: `${pct}%` }} data-tone={pct >= 70 ? "good" : pct >= 45 ? "mid" : "low"} /></i><em>{dimension.score}</em></div>
            <p>{dimension.comment}</p>
          </div>;
        })}</div>
      </section>}
      {summary.questionBreakdown.length > 0 && <section className={styles.summarySection}>
        <h3>逐题决定性问题</h3>
        <ol className={styles.breakdownList}>{summary.questionBreakdown.map((entry, index) => (
          <li key={`${entry.questionId || index}-${index}`} className={styles.breakdownItem}>
            <span data-tone={entry.score === null ? "na" : entry.score >= 70 ? "good" : entry.score >= 45 ? "mid" : "low"}>{entry.score === null ? "未评分" : entry.score}</span>
            <div>{questionText(entry.questionId) && <b>{questionText(entry.questionId)}</b>}<p>{entry.decisiveFinding}</p></div>
          </li>
        ))}</ol>
      </section>}
      {(summary.strengths.length > 0 || summary.weaknesses.length > 0) && <section className={styles.summarySection}>
        <div className={styles.summaryColumns}>
          {summary.strengths.length > 0 && <div><h3>保留</h3><ul className={styles.dotListGood}>{summary.strengths.map((item) => <li key={item}>{item}</li>)}</ul></div>}
          {summary.weaknesses.length > 0 && <div><h3>先改</h3><ul className={styles.dotListWarn}>{summary.weaknesses.map((item) => <li key={item}>{item}</li>)}</ul></div>}
        </div>
      </section>}
      {summary.nextActions.length > 0 && <section className={styles.summarySection}>
        <h3>下一步（已放进作战板 · 最多 3 个）</h3>
        <div className={styles.nextActionList}>{summary.nextActions.map((action, index) => (
          <article key={`${action.title}-${index}`} className={styles.nextActionItem}>
            <div><b>{action.title}</b><span className={styles.priorityChip} data-priority={action.priority}>{action.priority === "urgent" ? "紧急" : action.priority === "high" ? "重要" : "常规"}</span></div>
            <p>{action.reason}</p>
            <footer>完成标准：{action.doneWhen || "——"}</footer>
          </article>
        ))}</div>
      </section>}
    </article>
  );
}

function ReviewTab({ opportunity, onAnalyze, onGuide, analyzing }: { opportunity: Opportunity; onAnalyze: (round: string, notes: string) => Promise<void>; onGuide: (round: string, notes: string) => Promise<boolean>; analyzing: boolean }) {
  const [notes, setNotes] = useState("");
  const [round, setRound] = useState("一面");
  const [guiding, setGuiding] = useState(false);
  const quotaLabel = useQuotaLabel("interview");
  const reports = opportunity.reviewReports || [];
  const hasNotes = Boolean(notes.trim());
  return (
    <section>
      <div className={styles.pageIntro}><div><h2>面试复盘</h2><p>先把这轮发生了什么记下来。默认不替你下结论——导师会在右侧一次一个问题带你自己回看；想要一份完整报告时再生成。</p></div></div>
      <div className={styles.reviewComposer}>
        <div className={styles.reviewComposerHead}><span>这是第几面？</span><small>轮次用词和「模拟面试」一致，四面、五面直接填就行。</small></div>
        <RoundPicker value={round} onChange={setRound} />
        <div className={styles.reviewNotesHeader}><label htmlFor="review-notes">面试记录</label><VoiceControls value={notes} onChange={setNotes} readText={notes} disabled={analyzing || guiding} /></div>
        <textarea id="review-notes" value={notes} onChange={(event) => setNotes(event.target.value)} rows={9} placeholder="写下或口述你记得的问题和回答：被追问了什么、哪题最没底、对方给了什么反馈…" />
        <div className={styles.reviewActions}>
          <button className={styles.primaryButton} disabled={!hasNotes || guiding} onClick={async () => { setGuiding(true); try { if (await onGuide(round, notes.trim())) setNotes(""); } finally { setGuiding(false); } }}>{guiding ? "正在保存素材…" : "存下素材，让导师带我复盘"}</button>
          <button className={styles.secondaryButton} disabled={!hasNotes || analyzing || guiding} onClick={async () => { try { await onAnalyze(round, notes.trim()); setNotes(""); } catch { /* toast already explains the failure */ } }}>{analyzing ? "正在生成报告…" : `直接生成整轮报告 · ${quotaLabel}`}</button>
        </div>
      </div>
      <div className={styles.reviewReportList}>{reports.map((report) => {
        const guided = report.grade === "待引导复盘";
        return (
          <article key={report.id} className={`${styles.reviewReport} ${guided ? styles.reviewReportPending : ""}`}>
            <header><div><span>{report.round}</span><time dateTime={report.createdAt}>{new Date(report.createdAt).toLocaleDateString("zh-CN")}</time></div><strong>{report.grade}</strong></header>
            <p>{report.overallComment}</p>
            {guided ? <details><summary>查看已保存的面试素材</summary><pre>{report.sourceNotes}</pre></details> : <>
              <div className={styles.reviewColumns}>
                <section><h3>保留的优势</h3>{report.strengths.length ? <ul className={styles.dotListGood}>{report.strengths.map((item) => <li key={item}>{item}</li>)}</ul> : <span>本次没有识别到稳定优势</span>}</section>
                <section><h3>下一轮先改</h3>{report.improvements.length ? <ul className={styles.dotListWarn}>{report.improvements.map((item) => <li key={item}>{item}</li>)}</ul> : <span>暂无明确改进项</span>}</section>
              </div>
              {report.actions.length > 0 && <footer className={styles.reviewSteps}><h3>训练任务</h3><ol>{report.actions.map((item, index) => <li key={item}><i>{index + 1}</i>{item}</li>)}</ol></footer>}
              <details><summary>查看原始面试记录</summary><pre>{report.sourceNotes}</pre></details>
            </>}
          </article>
        );
      })}</div>
    </section>
  );
}

function ActionRail({ opportunity, storageMode, mobileOpen, onClose, startRequest, onStartConsumed, onStageAdvanced, chatContext }: {
  opportunity: Opportunity;
  startRequest?: CoachingStart|null; onStartConsumed?: (id:string)=>void;
  onStageAdvanced?: (stage: OpportunityStage)=>void|Promise<boolean>;
  chatContext?: string;
  storageMode: "cloud" | "local" | "demo"; mobileOpen: boolean; onClose: () => void;
}) {
  // 右栏现在只做一件事：导师对话。面试工作台已搬去中栏，练面试时也能随时问导师，不再整栏被工具占住。
  // 「待办与提醒」折叠块按需求下线（actions 数据链路仍在：整轮总结写回 opportunity.actions 与云端 metadata）。
  const storageLabel = storageMode === "cloud" ? "已同步到个人工作区" : storageMode === "local" ? "暂存在当前浏览器" : "示例工作区";
  const storageDetail = storageMode === "cloud"
    ? "岗位、证据、简历修改和复盘会在登录后继续保留。"
    : storageMode === "local"
      ? "网络恢复后会自动重试云同步；暂时不要清除浏览器数据。"
      : "示例操作不会写入你的账号数据。";
  return (
    <aside className={`${styles.actionRail} ${mobileOpen ? styles.mobileRailOpen : ""}`} aria-label="导师对话">
      <button className={styles.mobileClose} onClick={onClose} aria-label="关闭导师对话"><X size={19}/></button>
      <AgentConversation opening={mentorOpening(opportunity)} startRequest={startRequest} onStartConsumed={onStartConsumed} onStageAdvanced={onStageAdvanced} chatContext={chatContext} key={opportunity.id} opportunityId={opportunity.id} label={`${opportunity.company} · ${opportunity.role}`} enabled={storageMode === "cloud"} />
      <details className={styles.privacyLine}><summary><ShieldCheck size={13} />{storageLabel}</summary><p>{storageDetail}</p></details>
    </aside>
  );
}

function EmptySection({ icon, label, actionLabel, onAction }: { icon?: React.ReactNode; label: string; actionLabel?: string; onAction?: () => void }) {
  return <div className={styles.emptySection}>{icon ?? <CircleAlert size={22} />}<p>{label}</p>{actionLabel && <button onClick={onAction}>{actionLabel}<ChevronRight size={14} /></button>}</div>;
}

/** 从 offer 对比器存进来的机会：把当时算清的数字在 salary 页回显（只读，不含实时重算）。 */
function OfferSnapshotSummary({ comparison }: { comparison: NonNullable<Opportunity["offerComparison"]> }) {
  const money = (n: number) => (Number.isFinite(n) ? n.toLocaleString("zh-CN", { maximumFractionDigits: 0 }) : "—");
  const hourly = (n: number) => (Number.isFinite(n) ? n.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—");
  const bestNet = comparison.offers.reduce((acc, o, i) => (o.computed.annualNet > (comparison.offers[acc]?.computed.annualNet ?? -Infinity) ? i : acc), 0);
  return (
    <section style={{ marginBottom: 16 }}>
      <div className={styles.pageIntro}><div><span className={styles.eyebrow}>来自 Offer 对比器</span><h2>你算清并保存的这几份 offer</h2><p>存进来的是当时对比的输入与结论（估算 · 以实际账单/当地社保公积金与申报为准），不是实时重算。钱算清后，岗位内容、leader 与晋升节奏还要一起比。</p></div></div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead><tr style={{ textAlign: "left", color: "#78716c" }}>
            <th style={{ padding: "8px 10px" }}>Offer</th>
            <th style={{ padding: "8px 10px" }}>税前年包</th>
            <th style={{ padding: "8px 10px" }}>税后年到手</th>
            <th style={{ padding: "8px 10px" }}>税后时薪</th>
            <th style={{ padding: "8px 10px" }}>首年净得</th>
          </tr></thead>
          <tbody>
            {comparison.offers.map((offer, i) => (
              <tr key={i} style={{ borderTop: "1px solid #eee" }}>
                <td style={{ padding: "8px 10px" }}><strong>{offer.name}</strong>{offer.cityLabel ? <span style={{ color: "#a8a29e", marginLeft: 6 }}>{offer.cityLabel}</span> : null}{i === bestNet && comparison.offers.length > 1 ? <span style={{ marginLeft: 6, fontSize: 11, color: "#c2410c" }}>· 到手最高</span> : null}</td>
                <td style={{ padding: "8px 10px", fontVariantNumeric: "tabular-nums" }}>{money(offer.computed.grossAnnualPackage)}</td>
                <td style={{ padding: "8px 10px", fontVariantNumeric: "tabular-nums" }}>{money(offer.computed.annualNet)}</td>
                <td style={{ padding: "8px 10px", fontVariantNumeric: "tabular-nums" }}>{hourly(offer.computed.hourlyNet)}</td>
                <td style={{ padding: "8px 10px", fontVariantNumeric: "tabular-nums" }}>{money(offer.computed.firstYearTotalNet)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {comparison.note ? <p style={{ marginTop: 8, fontSize: 13, color: "#57534e" }}>你的备注：{comparison.note}</p> : null}
    </section>
  );
}
