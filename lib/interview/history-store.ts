import { createHash } from "node:crypto";
import { getDbClient } from "@/lib/db";
import { buildInterviewHistory, type InterviewHistoryRow } from "./history";

export async function recordInterviewProgress(userId: string, sessionId: string,
  input: { action: "setup" | "seen" | "end"; questionId?: string; roundLabel?: string }) {
  const db = await getDbClient();
  if (!db) throw new Error("面试记录暂时无法保存，请保留回答后重试");
  const owned = await db.from("interview_sessions").select("id,opportunity_id")
    .eq("id", sessionId).eq("user_id", userId).maybeSingle();
  if (owned.error) throw owned.error;
  if (!owned.data) return false;
  let questionSnapshot: { questionText?: string; followsQuestionId?: string } = {};
  if (input.action === "seen") {
    const question = await db.from("interview_questions").select("id,question_text,tips")
      .eq("session_id", sessionId).eq("id", input.questionId).maybeSingle();
    if (question.error) throw question.error;
    if (!question.data) return false;
    questionSnapshot = { questionText: question.data.question_text,
      followsQuestionId: question.data.tips?._harness?.linkage?.previousQuestionId };
  }
  const hash = createHash("sha256").update(JSON.stringify([userId, sessionId, input.action, input.questionId || ""])).digest("hex");
  const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
  const metadata = { kind: "interview_progress", sessionId, ...input, ...questionSnapshot };
  const content = JSON.stringify(metadata);
  const result = await db.from("coach_sources").upsert({ id, user_id: userId,
    opportunity_id: owned.data.opportunity_id || null, source_type: "mock_interview", title: "模拟面试进度",
    content, content_hash: createHash("sha256").update(content).digest("hex"), metadata,
    captured_at: new Date().toISOString() }, { onConflict: "id", ignoreDuplicates: true });
  if (result.error) throw result.error;
  return true;
}

const MAX_SEARCH_MATCHES = 1000;
function checked(result: { data: InterviewHistoryRow[] | null; error: unknown }): InterviewHistoryRow[] {
  if (result.error) throw result.error;
  if ((result.data || []).length >= MAX_SEARCH_MATCHES) throw new Error("命中内容较多，请增加关键词或缩小轮次后搜索");
  return result.data || [];
}

export async function readInterviewHistory(userId: string, input: {
  sessionId?: string; opportunityId?: string; query?: string; round?: string; page: number;
}) {
  const db = await getDbClient();
  if (!db) throw new Error("面试记录暂时无法读取");
  let matches: string[] | null = null;
  if (input.query) {
    const pattern = `%${input.query.replace(/[\\%_]/g, "\\$&")}%`;
    // Every child-table search joins the owned parent BEFORE returning IDs.
    const [questions, answers, followups, drafts, rounds, seenQuestions] = await Promise.all([
      db.from("interview_questions").select("session_id,interview_sessions!inner(user_id)")
        .eq("interview_sessions.user_id", userId).ilike("question_text", pattern).limit(1001),
      db.from("interview_answers").select("session_id,interview_sessions!inner(user_id)")
        .eq("interview_sessions.user_id", userId).ilike("answer", pattern).limit(1001),
      db.from("interview_answers").select("session_id,interview_sessions!inner(user_id)")
        .eq("interview_sessions.user_id", userId).ilike("assessment->>followUp", pattern).limit(1001),
      db.from("coach_sources").select("metadata").eq("user_id", userId)
        .eq("metadata->>kind", "interview_pending_answer").ilike("content", pattern).limit(1001),
      db.from("interview_sessions").select("id").eq("user_id", userId).ilike("round_type", pattern).limit(1001),
      db.from("coach_sources").select("metadata").eq("user_id", userId)
        .eq("metadata->>kind", "interview_progress").eq("metadata->>action", "seen")
        .ilike("metadata->>questionText", pattern).limit(1001),
    ]);
    matches = [...new Set<string>([
      ...[questions, answers, followups].flatMap(result => checked(result).map(row => row.session_id || "")),
      ...checked(drafts).map(row => row.metadata?.sessionId || ""), ...checked(rounds).map(row => row.id || ""),
      ...checked(seenQuestions).map(row => row.metadata?.sessionId || ""),
    ].filter(Boolean))];
  }
  if (input.round) {
    const setup = checked(await db.from("coach_sources").select("metadata").eq("user_id", userId)
      .eq("metadata->>kind", "interview_progress").eq("metadata->>action", "setup")
      .eq("metadata->>roundLabel", input.round).limit(1001));
    const roundIds = setup.map(row => String(row.metadata?.sessionId));
    matches = matches ? matches.filter(id => roundIds.includes(id)) : roundIds;
  }
  if (matches?.length === 0) return { sessions: [], total: 0, page: input.page, pageSize: 10 };
  let sessionQuery = db.from("interview_sessions").select("id,opportunity_id,round_type,question_count,created_at", { count: "exact" })
    .eq("user_id", userId);
  if (input.sessionId) sessionQuery = sessionQuery.eq("id", input.sessionId);
  if (input.opportunityId) sessionQuery = sessionQuery.eq("opportunity_id", input.opportunityId);
  if (matches) sessionQuery = sessionQuery.in("id", matches);
  const found = await sessionQuery.order("created_at", { ascending: false }).order("id", { ascending: false })
    .range(input.sessionId ? 0 : (input.page - 1) * 10, input.sessionId ? 0 : input.page * 10 - 1);
  if (found.error) throw found.error;
  const foundSessions = (found.data || []) as InterviewHistoryRow[];
  const ids = foundSessions.map(row => row.id);
  if (!ids.length) return { sessions: [], total: found.count || 0, page: input.page, pageSize: 10 };
  const [questions, answers, sources, jobs] = await Promise.all([
    db.from("interview_questions").select("id,session_id,question_text,tips,created_at").in("session_id", ids).limit(1001),
    db.from("interview_answers").select("id,session_id,question_id,answer,assessment,created_at").in("session_id", ids)
      .order("created_at", { ascending: true }).limit(1001),
    db.from("coach_sources").select("id,content,metadata,captured_at").eq("user_id", userId)
      .in("metadata->>sessionId", ids).in("metadata->>kind", ["interview_progress", "interview_pending_answer"]).limit(1001),
    db.from("coach_opportunities").select("id,company,role").eq("user_id", userId)
      .in("id", foundSessions.map(row => row.opportunity_id).filter(Boolean)),
  ]);
  const q = checked(questions), a = checked(answers), s = checked(sources);
  if (jobs.error) throw jobs.error;
  const jobRows = (jobs.data || []) as Array<{ id: string; company: string; role: string }>;
  return { sessions: foundSessions.map(session => {
    const record = buildInterviewHistory(session, q.filter(row => row.session_id === session.id),
      a.filter(row => row.session_id === session.id), s);
    const job = jobRows.find(row => row.id === session.opportunity_id);
    return { ...record, jobLabel: job ? `${job.company} · ${job.role}` : "未关联岗位" };
  }),
    total: found.count || foundSessions.length, page: input.page, pageSize: 10 };
}
