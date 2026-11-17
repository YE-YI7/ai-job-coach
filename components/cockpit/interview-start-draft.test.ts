import { preservePriorInterviewDraft } from "./interview-start-draft";

const session = { id: "old", currentIndex: 0, turns: [{ questionId: "old-question", answer: "已存回答" }] };
beforeEach(() => { global.fetch = jest.fn(); });

test("saves pending answer against the old question without alteration", async () => {
  (fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ saved: true }) });
  await preservePriorInterviewDraft({ dataMode: "live", session, answer: " 原始草稿\n" });
  expect(JSON.parse((fetch as jest.Mock).mock.calls[0][1].body)).toEqual({
    sessionId: "old", questionId: "old-question", answer: " 原始草稿\n",
  });
});

test("does not rewrite unchanged assessed or empty answers", async () => {
  for (const candidate of [session, { ...session, turns: [{ ...session.turns[0], assessment: { status: "assessed" } }] }]) {
    await preservePriorInterviewDraft({ dataMode: "live", session: candidate, answer: "已存回答" });
  }
  await preservePriorInterviewDraft({ dataMode: "live", session, answer: "" });
  expect(fetch).not.toHaveBeenCalled();
});

test("failed persistence blocks replacement instead of losing the old draft", async () => {
  (fetch as jest.Mock).mockResolvedValue({ ok: false, json: async () => ({ saved: false }) });
  await expect(preservePriorInterviewDraft({ dataMode: "live", session, answer: "未保存" }))
    .rejects.toThrow("已保留输入");
});
