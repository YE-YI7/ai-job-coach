import { getDbClient } from "@/lib/db";
import { FakeDb } from "./run-ledger/testing/fake-db";
import {
  beginResumeMessage,
  completeResumeMessage,
  claimResumeTask,
  readResumeTask,
  resumeTaskFingerprint,
} from "./resume-task";
import {
  makeResumeReference,
  referencePointer,
} from "@/lib/opportunities/resume-reference";
import { factualResumeAnswers } from "./resume-task-types";
import { resumeConversationMessages } from "./resume-conversation-decision";

jest.mock("@/lib/db");
const text = "负责整理需求记录，交给产品经理每周核对。";
const change = {
  id: "quoted-change",
  section: "工作经历",
  before: text,
  after: "整理需求记录，供产品经理每周核对。",
  status: "pending" as const,
  reason: "精简",
  evidenceId: null,
};
const source = {
  id: "opp",
  resumeRevision: "rev",
  resumeText: text,
  resumeChanges: [change],
};
const id = "44444444-4444-4444-8444-444444444444";
let db: FakeDb;
beforeEach(() => {
  db = new FakeDb({
    coach_opportunities: [
      {
        id: "opp",
        user_id: "owner",
        status: "active",
        jd_text: "",
        metadata: { ...source, workspaceType: "preparation" },
      },
    ],
    coach_resume_tasks: [
      {
        id: "task",
        user_id: "owner",
        opportunity_id: "opp",
        fingerprint: resumeTaskFingerprint(text, "", "rev"),
        state: "ready",
        question: null,
        answers: [],
        result: { changes: [change] },
        version: 1,
        updated_at: new Date().toISOString(),
      },
    ],
    interview_answers: [{ id: "old-answer", answer: "旧作答" }],
    watcha_wallets: [{ id: "old-wallet", balance: 17 }],
  });
  (getDbClient as jest.Mock).mockResolvedValue(db);
});
test("引用落在原消息收据里，刷新仍关联原位置；引用不是新增经历事实", async () => {
  const ref = await makeResumeReference(source, change.id);
  const opened = await beginResumeMessage(
    "owner",
    "opp",
    id,
    "为什么这样改，先别改？",
    referencePointer(ref),
  );
  expect(opened.task.conversation?.[0].resumeReference).toEqual(ref);
  const payload = JSON.parse(
    resumeConversationMessages(opened.source, opened.task).messages[1].content,
  );
  expect(payload.conversation[0].referencedChange).toMatchObject({
    changeId: change.id,
    original: text,
    suggestion: change.after,
  });
  const done = await completeResumeMessage("owner", "opp", id, opened.version, {
    action: "discuss",
    reply: "只解释这处写法。",
    editorBrief: "",
    supplement: null,
  });
  expect(done.answers).toEqual([]);
  expect(
    (await readResumeTask("owner", "opp"))?.conversation?.[0].resumeReference,
  ).toEqual(ref);
  expect(
    (
      await beginResumeMessage(
        "owner",
        "opp",
        id,
        "为什么这样改，先别改？",
        ref,
      )
    ).replayed,
  ).toBe(true);
  expect(db.rows("interview_answers")).toEqual([
    { id: "old-answer", answer: "旧作答" },
  ]);
  expect(db.rows("watcha_wallets")).toEqual([
    { id: "old-wallet", balance: 17 },
  ]);
});
test("导师明确决定改稿后，原编辑收到原文锚点；AI建议不变成事实补充", async () => {
  const ref = await makeResumeReference(source, change.id);
  const opened = await beginResumeMessage("owner", "opp", id, "精简这处", ref);
  await completeResumeMessage("owner", "opp", id, opened.version, {
    action: "revise",
    reply: "只精简这一处。",
    editorBrief: "保留原事实，精简这处。",
    supplement: null,
  });
  const claimed = await claimResumeTask("owner", "opp", {
    action: "conversation",
    messageId: id,
  });
  expect(claimed.task.answers[0]).toMatchObject({
    kind: "instruction",
    sourceExcerpt: text,
  });
  expect(claimed.task.answers[0].answer).toContain(change.id);
  expect(factualResumeAnswers(claimed.task.answers)).toEqual([]);
});
test("无权账号或过期引用在消息写入前拒绝，任务和旧数据不变", async () => {
  const ref = await makeResumeReference(source, change.id);
  const snapshot = JSON.stringify(db.rows("coach_resume_tasks"));
  await expect(
    beginResumeMessage("other", "opp", id, "问这一处", ref),
  ).rejects.toThrow("不可访问");
  await expect(
    beginResumeMessage("owner", "opp", id, "问这一处", {
      ...ref,
      changeHash: "0".repeat(64),
    }),
  ).rejects.toThrow("已更新");
  expect(JSON.stringify(db.rows("coach_resume_tasks"))).toBe(snapshot);
});
test("相同请求不能改绑另一条引用；编辑期间变更建议时不能迟到提交", async () => {
  const ref = await makeResumeReference(source, change.id);
  const opened = await beginResumeMessage("owner", "opp", id, "问这一处", ref);
  await expect(
    beginResumeMessage("owner", "opp", id, "问这一处", {
      ...ref,
      changeId: "another",
    }),
  ).rejects.toThrow("其他内容或引用");
  const metadata = db.rows("coach_opportunities")[0].metadata as {
    resumeChanges: (typeof change)[];
  };
  metadata.resumeChanges[0].after = "这处已在另一个窗口修改。";
  await expect(
    completeResumeMessage("owner", "opp", id, opened.version, {
      action: "discuss",
      reply: "旧回复",
      editorBrief: "",
      supplement: null,
    }),
  ).rejects.toThrow("已更新");
});
