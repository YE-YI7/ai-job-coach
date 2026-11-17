type PriorSession = {
  id: string;
  currentIndex: number;
  turns: readonly {
    questionId: string;
    answer?: string;
    assessment?: { status?: string } | null;
  }[];
};

/** Preserve an unsent old answer before replacing the active session. */
export async function preservePriorInterviewDraft({ dataMode, session, answer }: {
  dataMode: "live" | "demo";
  session: PriorSession | null;
  answer: string;
}) {
  const turn = session?.turns[session.currentIndex];
  if (dataMode === "demo" || !session || !turn || !answer.trim() || answer === turn.answer) return;
  const response = await fetch("/api/interview/draft", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId: session.id, questionId: turn.questionId, answer }),
  });
  const body = await response.json();
  if (!response.ok || !body.saved) {
    throw new Error("上一轮回答尚未保存，已保留输入；请重试后再开新一轮。");
  }
}
