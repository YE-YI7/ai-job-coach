import type { InterviewRoundtableSession } from "@/lib/opportunities/types";

export type InterviewAnswerRecord = {
  id: string;
  answer: string;
  createdAt: string;
  state: "saved" | "pending";
  assessment?: Record<string, unknown>;
};
export type InterviewHistoryQuestion = {
  questionId: string;
  question: string;
  rationale?: string;
  answer?: string;
  assessment?: Record<string, unknown>;
  attempts: InterviewAnswerRecord[];
  seenAt?: string;
  skipped: boolean;
  followsQuestionId?: string;
};
export type InterviewHistorySession = Omit<InterviewRoundtableSession, "turns" | "summary"> & {
  opportunityId: string | null;
  roundType: string;
  jobLabel?: string;
  endedAt?: string;
  turns: InterviewHistoryQuestion[];
  summary?: InterviewRoundtableSession["summary"];
};

export function interviewProgress(session: Pick<InterviewHistorySession, "turns" | "createdAt" | "endedAt">) {
  let answered = 0, skipped = 0, unanswered = 0, unseen = 0, followups = 0;
  let longest: { questionId: string; answer: string; attemptId: string; length: number } | null = null;
  for (const turn of session.turns) {
    if (turn.attempts.some(attempt => attempt.answer.trim())) answered += 1;
    else if (turn.skipped) skipped += 1;
    else if (turn.seenAt) unanswered += 1;
    else unseen += 1;
    if (turn.followsQuestionId && (turn.seenAt || turn.attempts.length || turn.skipped)) followups += 1;
    for (const attempt of turn.attempts) {
      const length = Array.from(attempt.answer).length;
      if (!longest || length > longest.length) {
        longest = { questionId: turn.questionId, attemptId: attempt.id, answer: attempt.answer, length };
      }
    }
  }
  const elapsed = session.endedAt ? Date.parse(session.endedAt) - Date.parse(session.createdAt) : NaN;
  return { answered, skipped, unanswered, unseen, followups, longest,
    seconds: Number.isFinite(elapsed) && elapsed >= 0 ? Math.round(elapsed / 1000) : null };
}

export function questionMatches(turn: InterviewHistoryQuestion, query: string) {
  const needle = query.trim().toLocaleLowerCase();
  return !needle || [turn.question, ...turn.attempts.flatMap(attempt => [
    attempt.answer, typeof attempt.assessment?.followUp === "string" ? attempt.assessment.followUp : "",
  ])].some(text => text.toLocaleLowerCase().includes(needle));
}

export function historyFromRecord(session: InterviewRoundtableSession): InterviewHistorySession {
  return { ...session, opportunityId: session.opportunityId || null, roundType: session.roundType || "模拟面试",
    turns: session.turns.map(turn => ({ ...turn, assessment: turn.assessment as unknown as Record<string, unknown>,
      skipped: turn.skipped || Boolean(turn.answer?.startsWith("[已跳过，未评分]")),
      attempts: turn.attempts || (turn.answer && !turn.answer.startsWith("[已跳过，未评分]") ? [{
        id: `${turn.questionId}-legacy`, answer: turn.answer, createdAt: session.createdAt, state: "saved" as const,
        assessment: turn.assessment as unknown as Record<string, unknown>,
      }] : []) })) };
}

export type InterviewHistoryRow = {
  id?: string; session_id?: string; opportunity_id?: string; question_id?: string;
  round_type?: string; question_text?: string; answer?: string; content?: string;
  created_at?: string; captured_at?: string; assessment?: Record<string, unknown>;
  tips?: { intent?: string; _harness?: { ordinal?: number; linkage?: { previousQuestionId?: string } } };
  metadata?: { kind?: string; sessionId?: string; questionId?: string; questionText?: string;
    followsQuestionId?: string; action?: string; roundLabel?: string; status?: string };
};

/** No question-bank reconstruction and no writes to old answers. */
export function buildInterviewHistory(session: InterviewHistoryRow, questions: InterviewHistoryRow[],
  answers: InterviewHistoryRow[], sources: InterviewHistoryRow[]): InterviewHistorySession {
  const events = sources.filter(source => source.metadata?.kind === "interview_progress"
    && source.metadata.sessionId === session.id);
  const end = events.find(source => source.metadata?.action === "end");
  const setup = events.find(source => source.metadata?.action === "setup");
  const sorted = [...questions].sort((a, b) => {
    const x = a.tips?._harness?.ordinal, y = b.tips?._harness?.ordinal;
    return typeof x === "number" && typeof y === "number" && Number.isInteger(x) && Number.isInteger(y) ? x - y
      : String(a.created_at).localeCompare(String(b.created_at)) || String(a.id).localeCompare(String(b.id));
  });
  const turns: InterviewHistoryQuestion[] = sorted.map(question => {
    const saved = answers.filter(answer => answer.question_id === question.id)
      .map(answer => ({ id: String(answer.id), answer: String(answer.answer || ""),
        createdAt: String(answer.created_at), state: "saved" as const,
        assessment: answer.assessment && typeof answer.assessment === "object" ? answer.assessment : undefined }));
    const drafts = sources.filter(source => source.metadata?.kind === "interview_pending_answer"
      && source.metadata.sessionId === session.id && source.metadata.questionId === question.id);
    const attempts = [...saved, ...drafts.filter(source => source.metadata?.status === "pending"
      && !saved.some(answer => answer.answer === source.content))
      .map(source => ({ id: String(source.id), answer: String(source.content || ""),
        createdAt: String(source.captured_at), state: "pending" as const }))]
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    const last = attempts.at(-1);
    const seen = events.find(event => event.metadata?.action === "seen" && event.metadata?.questionId === question.id);
    const skipped = drafts.some(source => source.metadata?.status === "skipped");
    return { questionId: String(question.id), question: String(seen?.metadata?.questionText || question.question_text || "问题原文未保存"),
      rationale: typeof question.tips?.intent === "string" ? question.tips.intent : undefined,
      attempts, answer: last?.answer, assessment: last && "assessment" in last ? last.assessment : undefined,
      seenAt: seen?.captured_at || attempts[0]?.createdAt || (skipped ? drafts[0]?.captured_at : undefined),
      skipped,
      followsQuestionId: seen?.metadata?.followsQuestionId || (typeof question.tips?._harness?.linkage?.previousQuestionId === "string"
        ? question.tips._harness.linkage.previousQuestionId : undefined) };
  });
  // For older sessions, do not pretend that every generated question was shown.
  // A saved answer awaiting assessment is not permission to advance the question.
  // Resume the last reached question; only an explicit next action records the next one.
  const reached = turns.map((turn, index) => turn.seenAt ? index : -1).filter(index => index >= 0);
  const current = reached.length ? Math.max(...reached) : 0;
  return { id: String(session.id), opportunityId: session.opportunity_id || null,
    round: String(setup?.metadata?.roundLabel || session.round_type), roundType: String(session.round_type),
    createdAt: String(session.created_at), endedAt: end?.captured_at,
    status: end ? "completed" : "running", currentIndex: current, turns };
}
