"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Building2,
  Calendar,
  Tag,
  FileText,
  Clipboard,
  Sparkles,
  ChevronDown,
  ChevronUp,
  PenLine,
  Trash2,
  Plus,
  X,
  MessageCircle,
  Lightbulb,
  Target,
  Shield,
  Zap,
  Award,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Send,
  ClipboardCheck,
  History,
  File,
  Briefcase,
} from "lucide-react";
import RoleAvatarSvg from "@/components/interview-review/RoleAvatarSvg";
import AnalyzingPhase from "@/components/interview-review/AnalyzingPhase";
import { useAnalysisStream } from "@/hooks/useAnalysisStream";

// ===== 类型导入 =====
import type {
  ParsedQuestion,
  QuestionAnalysisResult,
  ReviewSummary,
  ReviewRoleId,
  FollowUpQuestion,
  FollowUpFeedback,
  TrainingTask,
} from "@/lib/interview-review/types";
import { REVIEW_ROLES } from "@/lib/interview-review/types";

// ===== 步骤定义 =====
type Step = "info" | "paste" | "preview" | "analyzing" | "revealing" | "result";

// ===== 评级颜色 =====
const gradeConfig: Record<string, { bg: string; text: string; border: string; glow: string }> = {
  S: { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200", glow: "shadow-purple-100" },
  "A+": { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", glow: "shadow-emerald-100" },
  A: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", glow: "shadow-emerald-100" },
  "A-": { bg: "bg-green-50", text: "text-green-700", border: "border-green-200", glow: "shadow-green-100" },
  "B+": { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200", glow: "shadow-blue-100" },
  B: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200", glow: "shadow-blue-100" },
  "B-": { bg: "bg-sky-50", text: "text-sky-700", border: "border-sky-200", glow: "shadow-sky-100" },
  "C+": { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200", glow: "shadow-orange-100" },
  C: { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200", glow: "shadow-orange-100" },
  D: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200", glow: "shadow-red-100" },
};
const getGrade = (g: string) => gradeConfig[g] || gradeConfig["B"];

// ===== 角色头像组件 =====
function RoleAvatar({ roleId, size = "sm" }: { roleId: ReviewRoleId | "consensus"; size?: "sm" | "md" }) {
  const px = size === "md" ? 36 : 28;
  return <RoleAvatarSvg roleId={roleId} size={px} />;
}

// ===== 主组件（包裹 Suspense） =====
export default function InterviewReviewPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50/50 flex items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 text-orange-500 animate-spin mx-auto" />
          <p className="text-sm text-slate-500">加载中...</p>
        </div>
      </div>
    }>
      <InterviewReviewContent />
    </Suspense>
  );
}

// ===== 内容组件 =====
function InterviewReviewContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // 会话 ID（数据库持久化用）
  const [sessionId, setSessionId] = useState<string | null>(null);

  // 流程状态
  const [step, setStep] = useState<Step>("info");
  const [error, setError] = useState<string | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(false);

  // Step 1: 基础信息
  const [company, setCompany] = useState("");
  const [round, setRound] = useState("");
  const [interviewTime, setInterviewTime] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [privacyConsent, setPrivacyConsent] = useState(false);

  // JD 职位描述
  const [jobDescription, setJobDescription] = useState("");

  // 简历关联
  const [resumeText, setResumeText] = useState<string>("");
  const [resumeList, setResumeList] = useState<Array<{ id: string; filename: string; summary: string; created_at: string }>>([]);
  const [selectedResumeId, setSelectedResumeId] = useState<string | null>(null);
  const [isLoadingResumes, setIsLoadingResumes] = useState(false);

  // Step 2: 粘贴内容
  const [rawContent, setRawContent] = useState("");

  // Step 3: 解析预览
  const [parsedQuestions, setParsedQuestions] = useState<ParsedQuestion[]>([]);
  const [recommendedTags, setRecommendedTags] = useState<string[]>([]);
  const [isParsing, setIsParsing] = useState(false);

  // Step 4: 分析结果
  const [analysisResults, setAnalysisResults] = useState<QuestionAnalysisResult[]>([]);
  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  const [rolesUsed, setRolesUsed] = useState<Array<{ id: ReviewRoleId; name: string; tag: string }>>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState(0);

  // 交互状态
  const [expandedQuestions, setExpandedQuestions] = useState<Set<number>>(new Set());
  const [activeTab, setActiveTab] = useState<Record<number, string>>({});

  // 追问
  const [followUps, setFollowUps] = useState<Record<number, FollowUpQuestion[]>>({});
  const [loadingFollowUp, setLoadingFollowUp] = useState<number | null>(null);

  // 追问回答 & 反馈
  const [followUpAnswers, setFollowUpAnswers] = useState<Record<string, string>>({});
  const [followUpFeedbacks, setFollowUpFeedbacks] = useState<Record<string, FollowUpFeedback>>({});
  const [loadingFeedback, setLoadingFeedback] = useState<string | null>(null);

  // 训练任务
  const [trainingTasks, setTrainingTasks] = useState<TrainingTask[]>([]);
  const [isGeneratingTasks, setIsGeneratingTasks] = useState(false);
  const [tasksGenerated, setTasksGenerated] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  // SSE 流式分析
  const analysisStream = useAnalysisStream();

  // SSE 错误时回退到 preview 步骤
  useEffect(() => {
    if (analysisStream.status === "error" && step === "revealing") {
      setError(analysisStream.error || "分析过程出错，请重试");
      setStep("preview");
      setIsAnalyzing(false);
    }
  }, [analysisStream.status, analysisStream.error, step]);

  // ===== 从 URL 加载历史会话 =====
  useEffect(() => {
    const id = searchParams.get("id");
    if (id) {
      loadSession(id);
    }
  }, [searchParams]);

  // ===== 加载用户简历列表 =====
  useEffect(() => {
    loadResumeList();
  }, []);

  const loadResumeList = async () => {
    setIsLoadingResumes(true);
    try {
      const res = await fetch("/api/interview-review/session/resume");
      const data = await res.json();
      if (data.ok && data.resumes) {
        setResumeList(data.resumes);
      }
    } catch {
      // silent
    } finally {
      setIsLoadingResumes(false);
    }
  };

  const loadSession = async (id: string) => {
    setIsLoadingSession(true);
    try {
      const res = await fetch(`/api/interview-review/session?id=${id}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);

      const s = data.session;
      setSessionId(s.id);
      setCompany(s.company || "");
      setRound(s.round || "");
      setInterviewTime(s.interview_time || "");
      setTags(s.tags || []);
      setResumeText(s.resume_snapshot || "");
      setRawContent(s.raw_content || "");
      setParsedQuestions(s.parsed_questions || []);
      setAnalysisResults(s.analysis_results || []);
      setSummary(s.summary || null);

      // 加载追问记录
      try {
        const fuRes = await fetch(`/api/interview-review/followup?session_id=${id}`);
        const fuData = await fuRes.json();
        if (fuData.ok && fuData.followups) {
          setFollowUps(fuData.followups);
        }
      } catch {
        // 追问加载失败不阻塞
      }

      // 加载训练任务
      try {
        const taskRes = await fetch(`/api/interview-review/tasks?session_id=${id}`);
        const taskData = await taskRes.json();
        if (taskData.ok && taskData.tasks?.length > 0) {
          setTrainingTasks(taskData.tasks);
          setTasksGenerated(true);
        }
      } catch {
        // 任务加载失败不阻塞
      }

      if (s.analysis_results?.length > 0 && s.summary) {
        setStep("result");
        setExpandedQuestions(new Set([0]));
      } else if (s.parsed_questions?.length > 0) {
        setStep("preview");
      } else {
        setStep("info");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "未知错误";
      setError("加载历史记录失败：" + message);
    } finally {
      setIsLoadingSession(false);
    }
  };

  // ===== 标签操作 =====
  const addTag = (t: string) => {
    const trimmed = t.trim();
    if (trimmed && !tags.includes(trimmed)) {
      setTags(prev => [...prev, trimmed]);
    }
    setTagInput("");
  };
  const removeTag = (t: string) => setTags(prev => prev.filter(x => x !== t));
  const acceptRecommendedTag = (t: string) => {
    if (!tags.includes(t)) setTags(prev => [...prev, t]);
    setRecommendedTags(prev => prev.filter(x => x !== t));
  };

  // ===== 结果页标签编辑（同步到数据库） =====
  const [editingTags, setEditingTags] = useState(false);
  const [resultTagInput, setResultTagInput] = useState("");

  const addTagAndSync = async (t: string) => {
    const trimmed = t.trim();
    if (!trimmed || tags.includes(trimmed)) return;
    const newTags = [...tags, trimmed];
    setTags(newTags);
    setResultTagInput("");
    if (sessionId) {
      try {
        await fetch("/api/interview-review/session/tags", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sessionId, tags: newTags }),
        });
      } catch { /* silent */ }
    }
  };

  const removeTagAndSync = async (t: string) => {
    const newTags = tags.filter(x => x !== t);
    setTags(newTags);
    if (sessionId) {
      try {
        await fetch("/api/interview-review/session/tags", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sessionId, tags: newTags }),
        });
      } catch { /* silent */ }
    }
  };

  // ===== Step 1 → Step 2: 创建会话 =====
  const handleInfoSubmit = async () => {
    if (!privacyConsent) {
      setError("请先同意隐私政策");
      return;
    }
    setError(null);

    // 创建数据库会话
    try {
      const res = await fetch("/api/interview-review/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company,
          round,
          interview_time: interviewTime,
          tags,
          resume_text: resumeText || undefined,
          job_description: jobDescription || undefined,
        }),
      });
      const data = await res.json();
      if (data.ok && data.session_id) {
        setSessionId(data.session_id);
      }
    } catch {
      // 创建会话失败不阻塞流程，继续使用无持久化模式
      console.warn("创建数据库会话失败，继续使用无持久化模式");
    }

    setStep("paste");
  };

  // ===== Step 2 → Step 3: 解析 =====
  const handleParse = async () => {
    if (!rawContent.trim() || rawContent.trim().length < 20) {
      setError("面试内容太短，请粘贴完整的面试对话");
      return;
    }
    setError(null);
    setIsParsing(true);

    try {
      const res = await fetch("/api/interview-review/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          raw_content: rawContent.trim(),
          session_id: sessionId,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "解析失败");

      setParsedQuestions(data.questions);
      setRecommendedTags(data.recommended_tags || []);
      setStep("preview");
    } catch (err: any) {
      setError(err.message || "解析失败，请重试");
    } finally {
      setIsParsing(false);
    }
  };

  // ===== Step 3 → Step 4: 流式分析 =====
  const handleAnalyze = async () => {
    setError(null);
    setIsAnalyzing(true);
    setStep("revealing");

    analysisStream.startStream({
      questions: parsedQuestions,
      company,
      round,
      tags,
      session_id: sessionId || undefined,
      resume_text: resumeText || undefined,
      job_description: jobDescription || undefined,
    });
  };

  // SSE 流完成后的回调：将结果同步到 page 级状态
  const handleStreamComplete = () => {
    if (analysisStream.completedResults.length > 0) {
      setAnalysisResults(analysisStream.completedResults);
      setSummary(analysisStream.summary);
      setRolesUsed(analysisStream.rolesUsed);
      setExpandedQuestions(new Set([0]));
      setStep("result");
    }
    setIsAnalyzing(false);
  };

  // ===== 追问出题 =====
  const handleFollowUp = async (qIdx: number) => {
    const q = analysisResults[qIdx];
    if (!q) return;
    setLoadingFollowUp(qIdx);

    try {
      const res = await fetch("/api/interview-review/followup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q.question,
          answer: q.answer,
          weakness_tags: q.tags,
          count: 3,
          session_id: sessionId,
          question_index: qIdx,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setFollowUps(prev => ({ ...prev, [qIdx]: data.followups }));
    } catch {
      // silent
    } finally {
      setLoadingFollowUp(null);
    }
  };

  // ===== 追问回答即时反馈 =====
  const handleFollowUpAnswer = async (qIdx: number, fIdx: number) => {
    const feedbackKey = `${qIdx}-${fIdx}`;
    const answer = followUpAnswers[feedbackKey];
    if (!answer || answer.trim().length < 5) return;

    const followUp = followUps[qIdx]?.[fIdx];
    const originalQ = analysisResults[qIdx];
    if (!followUp) return;

    setLoadingFeedback(feedbackKey);

    try {
      const res = await fetch("/api/interview-review/followup-answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          followup_question: followUp.question,
          focus_area: followUp.focus_area,
          answer: answer.trim(),
          original_question: originalQ?.question,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setFollowUpFeedbacks(prev => ({ ...prev, [feedbackKey]: data.feedback }));
    } catch {
      // silent
    } finally {
      setLoadingFeedback(null);
    }
  };

  // ===== 生成训练任务 =====
  const handleGenerateTasks = async () => {
    if (!sessionId || isGeneratingTasks) return;
    setIsGeneratingTasks(true);

    try {
      const res = await fetch("/api/interview-review/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, mode: "generate" }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setTrainingTasks(prev => [...prev, ...data.tasks]);
      setTasksGenerated(true);
    } catch {
      // silent
    } finally {
      setIsGeneratingTasks(false);
    }
  };

  // ===== 切换任务状态 =====
  const handleToggleTask = async (taskId: string) => {
    const task = trainingTasks.find(t => t.id === taskId);
    if (!task) return;
    const newStatus = task.status === "pending" ? "completed" : "pending";

    // 乐观更新
    setTrainingTasks(prev =>
      prev.map(t =>
        t.id === taskId
          ? { ...t, status: newStatus, completed_at: newStatus === "completed" ? new Date().toISOString() : null }
          : t
      )
    );

    try {
      await fetch(`/api/interview-review/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
    } catch {
      // 回滚
      setTrainingTasks(prev =>
        prev.map(t =>
          t.id === taskId
            ? { ...t, status: task.status, completed_at: task.completed_at }
            : t
        )
      );
    }
  };

  // ===== 删除训练任务 =====
  const handleDeleteTask = async (taskId: string) => {
    setTrainingTasks(prev => prev.filter(t => t.id !== taskId));
    try {
      await fetch(`/api/interview-review/tasks/${taskId}`, { method: "DELETE" });
    } catch {
      // silent
    }
  };

  // ===== 题目展开/折叠 =====
  const toggleQuestion = (idx: number) => {
    setExpandedQuestions(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  // ===== 预览编辑 =====
  const updateParsedQuestion = (idx: number, field: "question" | "answer", value: string) => {
    setParsedQuestions(prev =>
      prev.map((q, i) => (i === idx ? { ...q, [field]: value } : q))
    );
  };

  const removeParsedQuestion = (idx: number) => {
    setParsedQuestions(prev =>
      prev.filter((_, i) => i !== idx).map((q, i) => ({ ...q, index: i + 1 }))
    );
  };

  // ===== 重置开始新面试 =====
  const resetAll = () => {
    setSessionId(null);
    setStep("info");
    setError(null);
    setCompany("");
    setRound("");
    setInterviewTime(new Date().toISOString().split("T")[0]);
    setTags([]);
    setTagInput("");
    setPrivacyConsent(false);
    setJobDescription("");
    setResumeText("");
    setSelectedResumeId(null);
    setRawContent("");
    setParsedQuestions([]);
    setRecommendedTags([]);
    setAnalysisResults([]);
    setSummary(null);
    setRolesUsed([]);
    setFollowUps({});
    setFollowUpAnswers({});
    setFollowUpFeedbacks({});
    setLoadingFeedback(null);
    setTrainingTasks([]);
    setIsGeneratingTasks(false);
    setTasksGenerated(false);
    setExpandedQuestions(new Set());
    setActiveTab({});
    setEditingTags(false);
    setResultTagInput("");
    // 清除 URL 参数
    router.replace("/interview/review");
  };

  // ===== 删除当前会话 =====
  const handleDeleteSession = async () => {
    if (!sessionId) return;
    if (!confirm("确定要删除这次面试复盘吗？此操作不可撤销。")) return;

    try {
      const res = await fetch(`/api/interview-review/session?id=${sessionId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.ok) {
        resetAll();
      }
    } catch {
      // silent
    }
  };

  // ===== 加载中 =====
  if (isLoadingSession) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50/50 flex items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 text-orange-500 animate-spin mx-auto" />
          <p className="text-sm text-slate-500">加载复盘记录中...</p>
        </div>
      </div>
    );
  }

  // ===== 渲染 =====
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50/50">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-xl border-b border-slate-100">
        <div className={`${step === "result" ? "max-w-6xl" : "max-w-3xl"} mx-auto px-4 sm:px-6 h-14 flex items-center justify-between`}>
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => {
                if (step === "paste") setStep("info");
                else if (step === "preview") setStep("paste");
                else if (step === "info") router.push("/interview/start");
                else router.push("/interview/start");
              }}
              className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center transition-colors"
            >
              <ArrowLeft className="w-4.5 h-4.5 text-slate-600" />
            </button>
            <div>
              <h1 className="text-base font-bold text-slate-900 tracking-tight">面试复盘</h1>
              <p className="text-[10px] text-slate-400 -mt-0.5">
                {step === "info" && "填写基础信息"}
                {step === "paste" && "粘贴面试内容"}
                {step === "preview" && "确认解析结果"}
                {step === "analyzing" && "AI 深度分析中..."}
                {step === "revealing" && "专家团分析中..."}
                {step === "result" && `${company || "面试"} · ${round || "复盘"}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* 历史记录入口 */}
            {step === "info" && (
              <button
                onClick={() => router.push("/interview/review/history")}
                className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center transition-colors"
                title="查看历史记录"
              >
                <History className="w-4 h-4 text-slate-500" />
              </button>
            )}

            {/* 右侧：分数徽章 */}
            {summary && step === "result" && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className={`px-3.5 py-1.5 rounded-xl ${getGrade(summary.overall_grade).bg} ${getGrade(summary.overall_grade).border} border shadow-sm ${getGrade(summary.overall_grade).glow}`}
              >
                <span className={`text-lg font-black ${getGrade(summary.overall_grade).text}`}>
                  {summary.overall_grade}
                </span>
              </motion.div>
            )}
          </div>
        </div>

        {/* 步骤指示器 */}
        {step !== "result" && (
          <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-2.5">
            <div className="flex gap-1.5">
              {["info", "paste", "preview", "analyzing"].map((s, i) => {
                // "revealing" 等价于 "analyzing" 在进度条中的位置
                const currentStep = step === "revealing" ? "analyzing" : step;
                return (
                  <div
                    key={s}
                    className={`h-1 rounded-full flex-1 transition-all duration-500 ${
                      i <= ["info", "paste", "preview", "analyzing"].indexOf(currentStep)
                        ? "bg-gradient-to-r from-orange-400 to-amber-400"
                        : "bg-slate-100"
                    }`}
                  />
                );
              })}
            </div>
          </div>
        )}
      </header>

      <main className={`${step === "result" ? "max-w-6xl" : "max-w-3xl"} mx-auto px-4 sm:px-6 py-5 space-y-5`} ref={scrollRef}>
        <AnimatePresence mode="wait">
          {/* ========== Step 1: 基础信息 ========== */}
          {step === "info" && (
            <motion.div
              key="info"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="space-y-4"
            >
              {/* 温暖欢迎 */}
              <div className="bg-gradient-to-r from-orange-50/60 via-amber-50/40 to-orange-50/60 rounded-2xl border border-orange-100/40 p-4 flex items-center gap-3">
                <div className="flex -space-x-2">
                  <RoleAvatarSvg roleId="mia" size={28} />
                  <RoleAvatarSvg roleId="kay" size={28} />
                  <RoleAvatarSvg roleId="coco" size={28} />
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  <span className="font-semibold text-slate-700">6 位专家</span>将为你的面试表现做全方位复盘，找到提升方向
                </p>
              </div>

              {/* 公司 & 轮次 */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-slate-500 mb-1.5 flex items-center gap-1">
                      <Building2 className="w-3.5 h-3.5" /> 面试公司
                    </label>
                    <input
                      value={company}
                      onChange={e => setCompany(e.target.value)}
                      placeholder="如：字节跳动（可匿名）"
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300/50 focus:border-orange-300 transition-all placeholder:text-slate-300"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 mb-1.5 flex items-center gap-1">
                      <Target className="w-3.5 h-3.5" /> 面试轮次
                    </label>
                    <input
                      value={round}
                      onChange={e => setRound(e.target.value)}
                      placeholder="如：技术二面"
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300/50 focus:border-orange-300 transition-all placeholder:text-slate-300"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1.5 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" /> 面试时间
                  </label>
                  <input
                    type="date"
                    value={interviewTime}
                    onChange={e => setInterviewTime(e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300/50 focus:border-orange-300 transition-all"
                  />
                </div>

                {/* 自定义标签 */}
                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1.5 flex items-center gap-1">
                    <Tag className="w-3.5 h-3.5" /> 自定义标签
                  </label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {tags.map(t => (
                      <span
                        key={t}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-orange-50 text-orange-700 rounded-lg text-xs font-medium border border-orange-100"
                      >
                        {t}
                        <button onClick={() => removeTag(t)} className="hover:text-orange-900">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-1.5">
                    <input
                      value={tagInput}
                      onChange={e => setTagInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter" && tagInput.trim()) {
                          e.preventDefault();
                          addTag(tagInput);
                        }
                      }}
                      placeholder="输入标签，回车添加"
                      className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-300/50 focus:border-orange-300 transition-all placeholder:text-slate-300"
                    />
                    <button
                      onClick={() => tagInput.trim() && addTag(tagInput)}
                      className="px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-sm text-slate-600 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* 关联 JD */}
                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1.5 flex items-center gap-1">
                    <Briefcase className="w-3.5 h-3.5" /> 职位描述 JD
                    <span className="text-slate-300 font-normal">（可选，提升分析精度）</span>
                  </label>
                  <textarea
                    value={jobDescription}
                    onChange={e => setJobDescription(e.target.value)}
                    placeholder="粘贴职位描述/JD，AI 将结合岗位要求分析你的面试表现..."
                    rows={3}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-orange-300/50 focus:border-orange-300 transition-all placeholder:text-slate-300"
                  />
                  {jobDescription && (
                    <p className="text-[10px] text-slate-400 mt-1">{jobDescription.length} 字</p>
                  )}
                </div>

                {/* 关联简历 */}
                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1.5 flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5" /> 关联简历
                    <span className="text-slate-300 font-normal">（可选）</span>
                  </label>

                  {/* 从历史简历中选择 */}
                  {resumeList.length > 0 && (
                    <div className="space-y-1.5 mb-2">
                      {resumeList.map(r => (
                        <button
                          key={r.id}
                          onClick={() => {
                            if (selectedResumeId === r.id) {
                              setSelectedResumeId(null);
                              setResumeText("");
                            } else {
                              setSelectedResumeId(r.id);
                              setResumeText(r.summary || r.filename);
                            }
                          }}
                          className={`w-full text-left px-3 py-2 rounded-xl border text-xs transition-all flex items-center gap-2 ${
                            selectedResumeId === r.id
                              ? "border-orange-300 bg-orange-50/50 text-orange-700"
                              : "border-slate-200 hover:border-slate-300 text-slate-600"
                          }`}
                        >
                          <File className="w-3.5 h-3.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{r.filename}</p>
                            {r.summary && (
                              <p className="text-[10px] text-slate-400 truncate">{r.summary}</p>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-300 shrink-0">
                            {new Date(r.created_at).toLocaleDateString()}
                          </span>
                          {selectedResumeId === r.id && (
                            <CheckCircle2 className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  {isLoadingResumes && (
                    <p className="text-[10px] text-slate-400 flex items-center gap-1 mb-2">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      加载简历列表...
                    </p>
                  )}

                  {resumeList.length === 0 && !isLoadingResumes && (
                    <p className="text-[10px] text-slate-400 mb-2">
                      暂无已上传的简历，可在简历阶段上传
                    </p>
                  )}
                </div>
              </div>

              {/* 隐私声明 */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <label className="flex items-start gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={privacyConsent}
                    onChange={e => setPrivacyConsent(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-slate-300 text-orange-500 focus:ring-orange-400"
                  />
                  <div className="text-xs text-slate-500 leading-relaxed">
                    <div className="flex items-center gap-1 mb-1">
                      <Shield className="w-3.5 h-3.5 text-slate-400" />
                      <span className="font-medium text-slate-600">隐私声明</span>
                    </div>
                    我确认上传的内容不包含受保密协议限制的面试材料。
                    我了解内容仅用于AI分析，不会用于模型训练。
                    <button
                      onClick={e => {
                        e.preventDefault();
                        router.push("/privacy");
                      }}
                      className="text-orange-500 hover:text-orange-600 ml-1 underline underline-offset-2"
                    >
                      查看隐私政策
                    </button>
                  </div>
                </label>
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-sm text-red-600 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}

              <button
                onClick={handleInfoSubmit}
                className="w-full py-3.5 rounded-2xl text-sm font-semibold text-white bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 transition-all shadow-md shadow-orange-200/50 active:scale-[0.98]"
              >
                下一步：粘贴面试内容
              </button>
            </motion.div>
          )}

          {/* ========== Step 2: 粘贴内容 ========== */}
          {step === "paste" && (
            <motion.div
              key="paste"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="space-y-4"
            >
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="px-5 pt-4 pb-2 flex items-center gap-2">
                  <Clipboard className="w-4 h-4 text-slate-400" />
                  <span className="text-sm font-medium text-slate-700">一键粘贴面试内容</span>
                </div>
                <div className="px-5 pb-1">
                  <textarea
                    value={rawContent}
                    onChange={e => setRawContent(e.target.value)}
                    placeholder={`粘贴面试对话记录...\n\n支持任意格式，例如：\n面试官：请你自我介绍一下\n我：我是xxx，目前在xxx公司担任xxx...\n\n面试官：你在这个项目中具体负责什么？\n我：我主要负责了...`}
                    className="w-full h-64 px-0 py-3 border-0 text-sm leading-relaxed resize-none focus:outline-none focus:ring-0 placeholder:text-slate-300"
                  />
                </div>
                <div className="px-5 pb-4 flex items-center justify-between">
                  <p className="text-[10px] text-slate-400">
                    支持任意格式，AI 会自动识别问题和回答
                  </p>
                  <span className="text-[10px] text-slate-300">
                    {rawContent.length} 字
                  </span>
                </div>
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-sm text-red-600 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}

              <button
                onClick={handleParse}
                disabled={isParsing || rawContent.trim().length < 20}
                className="w-full py-3.5 rounded-2xl text-sm font-semibold text-white bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md shadow-orange-200/50 active:scale-[0.98]"
              >
                {isParsing ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    AI 正在解析面试内容...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    智能解析
                  </span>
                )}
              </button>
            </motion.div>
          )}

          {/* ========== Step 3: 解析预览 ========== */}
          {step === "preview" && (
            <motion.div
              key="preview"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="space-y-4"
            >
              {/* AI 推荐标签 */}
              {recommendedTags.length > 0 && (
                <div className="bg-amber-50/50 rounded-2xl border border-amber-100 p-4">
                  <p className="text-xs font-medium text-amber-700 mb-2 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5" /> AI 推荐标签（点击采纳）
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {recommendedTags.map(t => (
                      <button
                        key={t}
                        onClick={() => acceptRecommendedTag(t)}
                        className="px-2.5 py-1 bg-white text-amber-700 rounded-lg text-xs font-medium border border-amber-200 hover:bg-amber-100 transition-colors"
                      >
                        + {t}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 已选标签 */}
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {tags.map(t => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-orange-50 text-orange-700 rounded-lg text-xs font-medium border border-orange-100"
                    >
                      {t}
                      <button onClick={() => removeTag(t)}>
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* 解析结果卡片 */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-700">
                    解析结果 · {parsedQuestions.length} 题
                  </h3>
                  <p className="text-[10px] text-slate-400">点击可编辑，拖动可调整</p>
                </div>

                {parsedQuestions.map((q, idx) => (
                  <motion.div
                    key={q.index}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center text-xs font-bold">
                          {idx + 1}
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {q.estimated_tags.map(t => (
                            <span key={t} className="px-1.5 py-0.5 bg-slate-50 text-slate-500 rounded text-[10px]">
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>
                      <button
                        onClick={() => removeParsedQuestion(idx)}
                        className="w-6 h-6 rounded-lg hover:bg-red-50 flex items-center justify-center text-slate-300 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-400 uppercase tracking-wider">面试官提问</label>
                      <textarea
                        value={q.question}
                        onChange={e => updateParsedQuestion(idx, "question", e.target.value)}
                        className="w-full mt-1 px-3 py-2 border border-slate-100 rounded-xl text-sm leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-orange-300/50 min-h-[2.5rem]"
                        rows={2}
                      />
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-400 uppercase tracking-wider">你的回答</label>
                      <textarea
                        value={q.answer}
                        onChange={e => updateParsedQuestion(idx, "answer", e.target.value)}
                        className="w-full mt-1 px-3 py-2 border border-slate-100 rounded-xl text-sm leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-orange-300/50 min-h-[3rem]"
                        rows={3}
                      />
                    </div>
                  </motion.div>
                ))}
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-sm text-red-600 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}

              {/* 分析前角色预览 */}
              <div className="bg-gradient-to-r from-orange-50/50 via-amber-50/30 to-orange-50/50 rounded-2xl border border-orange-100/50 p-4">
                <div className="flex items-center justify-center gap-3 mb-3">
                  {(["kay", "mia", "rex", "vivi", "coco", "lu"] as const).slice(0, 4).map((id, i) => (
                    <motion.div
                      key={id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 + i * 0.1 }}
                    >
                      <RoleAvatarSvg roleId={id} size={32} />
                    </motion.div>
                  ))}
                  <span className="text-xs text-slate-400 ml-1">...</span>
                </div>
                <p className="text-xs text-center text-slate-500">
                  专家团将逐题讨论你的面试表现，给出评分和改写建议
                </p>
              </div>

              <button
                onClick={handleAnalyze}
                disabled={parsedQuestions.length === 0}
                className="w-full py-3.5 rounded-2xl text-sm font-semibold text-white bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 disabled:opacity-50 transition-all shadow-md shadow-orange-200/50 active:scale-[0.98]"
              >
                <span className="flex items-center justify-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  开始多角色深度分析（{parsedQuestions.length} 题）
                </span>
              </button>
            </motion.div>
          )}

          {/* ========== Step 4a: 流式揭晓 ========== */}
          {step === "revealing" && (
            <motion.div
              key="revealing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <AnalyzingPhase
                stream={analysisStream}
                onComplete={handleStreamComplete}
              />
            </motion.div>
          )}

          {/* ========== Step 4b: 旧版分析中（兼容历史回退） ========== */}
          {step === "analyzing" && (
            <motion.div
              key="analyzing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-20 space-y-6"
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 3, ease: "linear" }}
                className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-400 to-amber-400 flex items-center justify-center shadow-lg shadow-orange-200"
              >
                <Sparkles className="w-8 h-8 text-white" />
              </motion.div>

              <div className="text-center space-y-2">
                <h3 className="text-lg font-bold text-slate-800">AI 团队正在深度分析</h3>
                <p className="text-sm text-slate-500">
                  {rolesUsed.length > 0
                    ? `${rolesUsed.map(r => r.name).join("、")} 正在讨论你的面试表现...`
                    : "多位面试专家正在讨论你的面试表现..."
                  }
                </p>
              </div>

              <div className="w-64">
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-orange-400 to-amber-400 rounded-full"
                    animate={{ width: `${analyzeProgress}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
                <p className="text-[10px] text-slate-400 text-center mt-2">
                  {analyzeProgress < 30 && "解析面试内容..."}
                  {analyzeProgress >= 30 && analyzeProgress < 60 && "多角色讨论中..."}
                  {analyzeProgress >= 60 && analyzeProgress < 90 && "改写参考答案..."}
                  {analyzeProgress >= 90 && "生成最终报告..."}
                </p>
              </div>
            </motion.div>
          )}

          {/* ========== Step 5: 分析结果 ========== */}
          {step === "result" && summary && (
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-5"
            >
              {/* 左右布局容器 */}
              <div className="lg:grid lg:grid-cols-[380px_1fr] lg:gap-6">
                {/* 左侧：汇总卡片（桌面端 sticky） */}
                <div className="lg:sticky lg:top-[60px] lg:self-start lg:max-h-[calc(100vh-80px)] lg:overflow-y-auto lg:pb-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.1 }}
                className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden"
              >
                <div className="h-1 bg-gradient-to-r from-orange-400 via-amber-400 to-orange-400" />
                <div className="p-5 space-y-4">
                  <p className="text-base font-bold text-slate-800">{summary.one_line_summary}</p>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-emerald-50/50 rounded-xl p-3 border border-emerald-100/50">
                      <div className="flex items-center gap-1 mb-1">
                        <Award className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-[10px] font-semibold text-emerald-600 uppercase">最大亮点</span>
                      </div>
                      <p className="text-xs text-slate-700 leading-relaxed">{summary.biggest_strength}</p>
                    </div>
                    <div className="bg-orange-50/50 rounded-xl p-3 border border-orange-100/50">
                      <div className="flex items-center gap-1 mb-1">
                        <AlertTriangle className="w-3.5 h-3.5 text-orange-600" />
                        <span className="text-[10px] font-semibold text-orange-600 uppercase">核心短板</span>
                      </div>
                      <p className="text-xs text-slate-700 leading-relaxed">{summary.biggest_weakness}</p>
                    </div>
                  </div>

                  {/* 训练建议 */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                      <Zap className="w-3.5 h-3.5" /> 行动计划
                    </p>
                    {summary.training_suggestions.map((s, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="w-5 h-5 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                          {i + 1}
                        </span>
                        <p className="text-xs text-slate-600 leading-relaxed">{s}</p>
                      </div>
                    ))}
                  </div>

                  {/* 训练任务 - 生成按钮 & 汇总级任务展示 */}
                  {sessionId && (
                    <div className="space-y-2">
                      {!tasksGenerated ? (
                        <button
                          onClick={handleGenerateTasks}
                          disabled={isGeneratingTasks}
                          className="w-full py-2.5 rounded-xl border border-dashed border-orange-200 text-xs font-medium text-orange-600 hover:bg-orange-50 transition-colors flex items-center justify-center gap-1.5"
                        >
                          {isGeneratingTasks ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              AI 正在生成训练任务...
                            </>
                          ) : (
                            <>
                              <ClipboardCheck className="w-3.5 h-3.5" />
                              一键生成训练任务
                            </>
                          )}
                        </button>
                      ) : (
                        <>
                          {trainingTasks.filter(t => t.source === "summary").length > 0 && (
                            <div className="bg-orange-50/30 rounded-xl p-3 border border-orange-100/50 space-y-2">
                              <p className="text-[10px] font-semibold text-orange-600 uppercase flex items-center gap-1">
                                <ClipboardCheck className="w-3 h-3" /> 整场训练任务
                              </p>
                              {trainingTasks.filter(t => t.source === "summary").map(task => (
                                <div key={task.id} className="flex items-start gap-2">
                                  <button
                                    onClick={() => handleToggleTask(task.id)}
                                    className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                                      task.status === "completed"
                                        ? "bg-emerald-500 border-emerald-500 text-white"
                                        : "border-slate-300 hover:border-orange-400"
                                    }`}
                                  >
                                    {task.status === "completed" && <CheckCircle2 className="w-3 h-3" />}
                                  </button>
                                  <div className="flex-1 min-w-0">
                                    <p className={`text-xs font-medium leading-snug ${task.status === "completed" ? "text-slate-400 line-through" : "text-slate-700"}`}>
                                      {task.title}
                                    </p>
                                    {task.description && (
                                      <p className="text-[10px] text-slate-400 leading-snug mt-0.5">{task.description}</p>
                                    )}
                                  </div>
                                  <button
                                    onClick={() => handleDeleteTask(task.id)}
                                    className="text-slate-300 hover:text-red-400 transition-colors shrink-0"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                          <div className="flex items-center justify-between">
                            <p className="text-[10px] text-slate-400">
                              {trainingTasks.filter(t => t.status === "completed").length}/{trainingTasks.length} 已完成
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* 标签 - 可编辑 */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold text-slate-400 flex items-center gap-1">
                        <Tag className="w-3 h-3" /> 标签
                      </span>
                      <button
                        onClick={() => setEditingTags(!editingTags)}
                        className="text-[10px] text-slate-400 hover:text-orange-500 transition-colors"
                      >
                        {editingTags ? "完成" : "编辑"}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {[...tags, ...(summary.recommended_tags || [])].filter((t, i, arr) => arr.indexOf(t) === i).map(t => (
                        <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-50 text-slate-500 rounded-md text-[10px] font-medium border border-slate-100">
                          {t}
                          {editingTags && (
                            <button onClick={() => removeTagAndSync(t)} className="hover:text-red-500 transition-colors">
                              <X className="w-2.5 h-2.5" />
                            </button>
                          )}
                        </span>
                      ))}
                    </div>
                    {editingTags && (
                      <div className="flex gap-1.5">
                        <input
                          value={resultTagInput}
                          onChange={e => setResultTagInput(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === "Enter" && resultTagInput.trim()) {
                              e.preventDefault();
                              addTagAndSync(resultTagInput);
                            }
                          }}
                          placeholder="输入新标签"
                          className="flex-1 px-2.5 py-1.5 border border-slate-200 rounded-lg text-[10px] focus:outline-none focus:ring-1 focus:ring-orange-300/50 focus:border-orange-300 transition-all placeholder:text-slate-300"
                        />
                        <button
                          onClick={() => resultTagInput.trim() && addTagAndSync(resultTagInput)}
                          className="px-2 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600 transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* 参与角色 */}
                  {rolesUsed.length > 0 && (
                    <div className="flex items-center gap-2 pt-2 border-t border-slate-50">
                      <span className="text-[10px] text-slate-400">本次参与评审：</span>
                      <div className="flex -space-x-1.5">
                        {rolesUsed.map(r => (
                          <RoleAvatar key={r.id} roleId={r.id} size="sm" />
                        ))}
                      </div>
                      <span className="text-[10px] text-slate-400">
                        {rolesUsed.map(r => r.name).join("、")}
                      </span>
                    </div>
                  )}
                </div>
              </motion.div>
                </div>{/* 左侧结束 */}

                {/* 右侧：逐题分析卡片 */}
                <div className="mt-5 lg:mt-0">
              {/* 逐题分析卡片 */}
              <div>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                  逐题分析 · {analysisResults.length} 题
                </h3>
                <div className="space-y-3">
                  {analysisResults.map((q, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.15 + idx * 0.05 }}
                      className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden"
                    >
                      {/* 卡片头 */}
                      <button
                        onClick={() => toggleQuestion(idx)}
                        className="w-full px-5 py-3.5 flex items-center justify-between text-left hover:bg-slate-50/50 transition-colors"
                      >
                        <div className="flex items-center gap-2.5 flex-1 min-w-0">
                          <span className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${getGrade(q.score).bg} ${getGrade(q.score).text}`}>
                            {q.score}
                          </span>
                          <div className="min-w-0">
                            <span className="text-sm font-medium text-slate-800 line-clamp-1">
                              {q.question}
                            </span>
                            <div className="flex gap-1 mt-0.5">
                              {q.tags.slice(0, 3).map(t => (
                                <span key={t} className="px-1.5 py-0.5 bg-slate-50 text-slate-400 rounded text-[9px]">
                                  {t}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                        {expandedQuestions.has(idx) ? (
                          <ChevronUp className="w-4 h-4 text-slate-400 shrink-0 ml-2" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-slate-400 shrink-0 ml-2" />
                        )}
                      </button>

                      {/* 展开内容 */}
                      <AnimatePresence>
                        {expandedQuestions.has(idx) && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="px-5 pb-5 border-t border-slate-50 pt-3">
                              {/* Tab 切换 */}
                              <div className="flex gap-1 mb-4 bg-slate-50 rounded-xl p-1">
                                {[
                                  { key: "discussion", label: "专家讨论", icon: MessageCircle },
                                  { key: "rewrite", label: "参考答案", icon: PenLine },
                                  { key: "followup", label: "追问训练", icon: Target },
                                  { key: "tasks", label: "训练任务", icon: ClipboardCheck },
                                ].map(tab => (
                                  <button
                                    key={tab.key}
                                    onClick={() => setActiveTab(prev => ({ ...prev, [idx]: tab.key }))}
                                    className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-medium transition-all ${
                                      (activeTab[idx] || "discussion") === tab.key
                                        ? "bg-white text-slate-800 shadow-sm"
                                        : "text-slate-500 hover:text-slate-700"
                                    }`}
                                  >
                                    <tab.icon className="w-3.5 h-3.5" />
                                    {tab.label}
                                  </button>
                                ))}
                              </div>

                              {/* Discussion Tab */}
                              {(activeTab[idx] || "discussion") === "discussion" && (
                                <div className="space-y-3">
                                  {/* 原回答摘要 */}
                                  {q.answer && (
                                    <div className="bg-slate-50/50 rounded-xl p-3 border border-slate-100/50">
                                      <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">你的回答</p>
                                      <p className="text-xs text-slate-600 leading-relaxed line-clamp-4">{q.answer}</p>
                                    </div>
                                  )}

                                  {/* 多角色讨论 */}
                                  <div className="space-y-2.5">
                                    {q.discussion.map((d, di) => (
                                      <motion.div
                                        key={di}
                                        initial={{ opacity: 0, x: -8 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: di * 0.05 }}
                                        className="flex gap-2.5"
                                      >
                                        <RoleAvatar roleId={d.role_id as ReviewRoleId} size="md" />
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-1.5 mb-0.5">
                                            <span className="text-xs font-semibold text-slate-700">{d.speaker}</span>
                                            {d.role_id !== "consensus" && REVIEW_ROLES[d.role_id as ReviewRoleId] && (
                                              <span className={`text-[9px] ${REVIEW_ROLES[d.role_id as ReviewRoleId].colorClass} opacity-60`}>
                                                {REVIEW_ROLES[d.role_id as ReviewRoleId].tag}
                                              </span>
                                            )}
                                          </div>
                                          <div className={`rounded-xl rounded-tl-sm px-3 py-2 text-xs leading-relaxed ${
                                            d.role_id === "consensus"
                                              ? "bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-100 text-slate-700 font-medium"
                                              : REVIEW_ROLES[d.role_id as ReviewRoleId]
                                                ? `${REVIEW_ROLES[d.role_id as ReviewRoleId].bubbleBgClass} text-slate-700`
                                                : "bg-slate-50 text-slate-700"
                                          }`}>
                                            {d.content}
                                          </div>
                                        </div>
                                      </motion.div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Rewrite Tab */}
                              {activeTab[idx] === "rewrite" && (
                                <div className="space-y-3">
                                  {q.answer_skeleton.length > 0 && (
                                    <div className="bg-blue-50/50 rounded-xl p-3 border border-blue-100/50">
                                      <p className="text-[10px] text-blue-600 font-semibold uppercase tracking-wider mb-2 flex items-center gap-1">
                                        <Lightbulb className="w-3.5 h-3.5" /> 回答骨架
                                      </p>
                                      <div className="space-y-1">
                                        {q.answer_skeleton.map((s, si) => (
                                          <p key={si} className="text-xs text-slate-700 flex items-center gap-1.5">
                                            <span className="w-4 h-4 rounded bg-blue-100 text-blue-600 flex items-center justify-center text-[9px] font-bold shrink-0">
                                              {si + 1}
                                            </span>
                                            {s}
                                          </p>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  {q.rewritten_answer && (
                                    <div className="bg-white rounded-xl p-3 border border-slate-100">
                                      <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-2">参考回答</p>
                                      <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">{q.rewritten_answer}</p>
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Follow-up Tab */}
                              {activeTab[idx] === "followup" && (
                                <div className="space-y-3">
                                  {!followUps[idx] && (
                                    <button
                                      onClick={() => handleFollowUp(idx)}
                                      disabled={loadingFollowUp === idx}
                                      className="w-full py-3 rounded-xl border border-dashed border-orange-200 text-sm text-orange-600 hover:bg-orange-50 transition-colors flex items-center justify-center gap-2"
                                    >
                                      {loadingFollowUp === idx ? (
                                        <>
                                          <Loader2 className="w-4 h-4 animate-spin" />
                                          生成追问题中...
                                        </>
                                      ) : (
                                        <>
                                          <Zap className="w-4 h-4" />
                                          基于弱点生成追问题
                                        </>
                                      )}
                                    </button>
                                  )}
                                  {followUps[idx] && (
                                    <div className="space-y-3">
                                      {followUps[idx].map((f, fi) => {
                                        const feedbackKey = `${idx}-${fi}`;
                                        const feedback = followUpFeedbacks[feedbackKey];
                                        const answerText = followUpAnswers[feedbackKey] || "";
                                        const isLoadingThis = loadingFeedback === feedbackKey;

                                        return (
                                          <div key={fi} className="bg-slate-50 rounded-xl p-3 border border-slate-100 space-y-2.5">
                                            <div className="flex items-center justify-between mb-1">
                                              <span className="text-[10px] font-medium text-slate-500">追问 {fi + 1}</span>
                                              <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${
                                                f.difficulty === "easy" ? "bg-green-100 text-green-600" :
                                                f.difficulty === "hard" ? "bg-red-100 text-red-600" :
                                                "bg-amber-100 text-amber-600"
                                              }`}>
                                                {f.difficulty === "easy" ? "基础" : f.difficulty === "hard" ? "困难" : "中等"}
                                              </span>
                                            </div>
                                            <p className="text-sm text-slate-800 font-medium">{f.question}</p>
                                            <p className="text-[10px] text-slate-400">训练方向：{f.focus_area}</p>

                                            {/* 回答输入区 */}
                                            {!feedback && (
                                              <div className="mt-2 space-y-2">
                                                <textarea
                                                  value={answerText}
                                                  onChange={e => setFollowUpAnswers(prev => ({ ...prev, [feedbackKey]: e.target.value }))}
                                                  placeholder="在这里输入你的回答..."
                                                  rows={3}
                                                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-orange-300/50 focus:border-orange-300 bg-white placeholder:text-slate-300"
                                                />
                                                <button
                                                  onClick={() => handleFollowUpAnswer(idx, fi)}
                                                  disabled={isLoadingThis || answerText.trim().length < 5}
                                                  className="w-full py-2 rounded-xl text-xs font-medium text-white bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-1.5"
                                                >
                                                  {isLoadingThis ? (
                                                    <>
                                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                      评估中...
                                                    </>
                                                  ) : (
                                                    <>
                                                      <Send className="w-3.5 h-3.5" />
                                                      提交回答
                                                    </>
                                                  )}
                                                </button>
                                              </div>
                                            )}

                                            {/* 反馈展示 */}
                                            {feedback && (
                                              <motion.div
                                                initial={{ opacity: 0, y: 6 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                className="mt-2 bg-white rounded-xl p-3 border border-slate-100 space-y-2"
                                              >
                                                {/* 你的回答 */}
                                                <div className="bg-slate-50/50 rounded-lg p-2">
                                                  <p className="text-[9px] text-slate-400 mb-0.5">你的回答</p>
                                                  <p className="text-xs text-slate-600 leading-relaxed">{answerText}</p>
                                                </div>

                                                {/* 评级 */}
                                                <div className="flex items-center gap-2">
                                                  <span className={`px-2 py-0.5 rounded-lg text-xs font-bold ${getGrade(feedback.grade).bg} ${getGrade(feedback.grade).text} ${getGrade(feedback.grade).border} border`}>
                                                    {feedback.grade}
                                                  </span>
                                                  <span className="text-[10px] text-slate-400">即时评估</span>
                                                </div>

                                                {/* 三维评分 */}
                                                <div className="grid grid-cols-3 gap-2">
                                                  {[
                                                    { label: "结构", value: feedback.structure, bg: "bg-blue-50/50", border: "border-blue-100/50", text: "text-blue-600" },
                                                    { label: "深度", value: feedback.depth, bg: "bg-purple-50/50", border: "border-purple-100/50", text: "text-purple-600" },
                                                    { label: "说服力", value: feedback.persuasion, bg: "bg-amber-50/50", border: "border-amber-100/50", text: "text-amber-600" },
                                                  ].map(dim => (
                                                    <div key={dim.label} className={`${dim.bg} rounded-lg p-2 border ${dim.border}`}>
                                                      <p className={`text-[9px] font-semibold ${dim.text} mb-0.5`}>{dim.label}</p>
                                                      <p className="text-[10px] text-slate-600 leading-snug">{dim.value}</p>
                                                    </div>
                                                  ))}
                                                </div>

                                                {/* 建议 */}
                                                {feedback.suggestion && (
                                                  <div className="flex items-start gap-1.5 bg-orange-50/50 rounded-lg p-2 border border-orange-100/50">
                                                    <Lightbulb className="w-3 h-3 text-orange-500 mt-0.5 shrink-0" />
                                                    <p className="text-[10px] text-slate-700 leading-snug">{feedback.suggestion}</p>
                                                  </div>
                                                )}

                                                {/* 重新回答按钮 */}
                                                <button
                                                  onClick={() => {
                                                    setFollowUpFeedbacks(prev => {
                                                      const next = { ...prev };
                                                      delete next[feedbackKey];
                                                      return next;
                                                    });
                                                  }}
                                                  className="text-[10px] text-slate-400 hover:text-orange-500 transition-colors"
                                                >
                                                  重新回答
                                                </button>
                                              </motion.div>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Tasks Tab */}
                              {activeTab[idx] === "tasks" && (
                                <div className="space-y-3">
                                  {(() => {
                                    const questionTasks = trainingTasks.filter(t => t.question_index === idx);
                                    if (!tasksGenerated) {
                                      return (
                                        <div className="text-center py-4">
                                          <p className="text-xs text-slate-400 mb-2">请先在汇总卡片中生成训练任务</p>
                                          {sessionId && (
                                            <button
                                              onClick={handleGenerateTasks}
                                              disabled={isGeneratingTasks}
                                              className="px-4 py-2 rounded-xl border border-dashed border-orange-200 text-xs text-orange-600 hover:bg-orange-50 transition-colors inline-flex items-center gap-1.5"
                                            >
                                              {isGeneratingTasks ? (
                                                <>
                                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                  生成中...
                                                </>
                                              ) : (
                                                <>
                                                  <ClipboardCheck className="w-3.5 h-3.5" />
                                                  一键生成训练任务
                                                </>
                                              )}
                                            </button>
                                          )}
                                        </div>
                                      );
                                    }
                                    if (questionTasks.length === 0) {
                                      return (
                                        <p className="text-xs text-slate-400 text-center py-4">本题暂无训练任务</p>
                                      );
                                    }
                                    return (
                                      <div className="space-y-2">
                                        {questionTasks.map(task => {
                                          const typeConfig: Record<string, { label: string; bg: string; text: string }> = {
                                            practice: { label: "结构练习", bg: "bg-blue-50", text: "text-blue-600" },
                                            review: { label: "知识复习", bg: "bg-purple-50", text: "text-purple-600" },
                                            drill: { label: "追问训练", bg: "bg-orange-50", text: "text-orange-600" },
                                            expression: { label: "表达优化", bg: "bg-emerald-50", text: "text-emerald-600" },
                                          };
                                          const tc = typeConfig[task.task_type] || typeConfig.practice;
                                          return (
                                            <div key={task.id} className="bg-slate-50 rounded-xl p-3 border border-slate-100 flex items-start gap-2.5">
                                              <button
                                                onClick={() => handleToggleTask(task.id)}
                                                className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 mt-0.5 transition-all ${
                                                  task.status === "completed"
                                                    ? "bg-emerald-500 border-emerald-500 text-white"
                                                    : "border-slate-300 hover:border-orange-400"
                                                }`}
                                              >
                                                {task.status === "completed" && <CheckCircle2 className="w-3 h-3" />}
                                              </button>
                                              <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-1.5 mb-0.5">
                                                  <p className={`text-xs font-medium ${task.status === "completed" ? "text-slate-400 line-through" : "text-slate-700"}`}>
                                                    {task.title}
                                                  </p>
                                                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${tc.bg} ${tc.text}`}>
                                                    {tc.label}
                                                  </span>
                                                </div>
                                                {task.description && (
                                                  <p className="text-[10px] text-slate-400 leading-snug">{task.description}</p>
                                                )}
                                              </div>
                                              <button
                                                onClick={() => handleDeleteTask(task.id)}
                                                className="text-slate-300 hover:text-red-400 transition-colors shrink-0 mt-0.5"
                                              >
                                                <Trash2 className="w-3 h-3" />
                                              </button>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    );
                                  })()}
                                </div>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  ))}
                </div>
              </div>
                </div>{/* 右侧结束 */}
              </div>{/* 左右布局容器结束 */}

              {/* 底部操作 */}
              <div className="text-center pb-6 space-y-3">
                <div className="flex items-center justify-center gap-4">
                  <button
                    onClick={resetAll}
                    className="text-sm text-slate-500 hover:text-slate-700 transition-colors"
                  >
                    分析新的面试
                  </button>
                  <span className="text-slate-200">|</span>
                  <button
                    onClick={() => router.push("/interview/review/history")}
                    className="text-sm text-orange-500 hover:text-orange-600 transition-colors flex items-center gap-1"
                  >
                    <History className="w-3.5 h-3.5" />
                    查看历史记录
                  </button>
                  {sessionId && (
                    <>
                      <span className="text-slate-200">|</span>
                      <button
                        onClick={handleDeleteSession}
                        className="text-sm text-red-400 hover:text-red-600 transition-colors flex items-center gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        删除本次
                      </button>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
