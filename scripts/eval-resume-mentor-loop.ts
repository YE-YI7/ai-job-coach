/** Three synthetic acceptance scenarios. Plan-only unless explicitly enabled.
 * No user workspace endpoints or quota reservations; independent review retained.
 */
import { randomUUID, createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { getDbClient } from "../lib/db";
import {
  resumeConversationMessages,
  parseResumeConversationDecision,
} from "../lib/coach-harness/resume-conversation-decision";
import { resumeConversationLlmOptions } from "../lib/coach-harness/resume-conversation-model";
import {
  observedResumeLLM,
  withEvalObserver,
  redactEval,
  type EvalSpan,
} from "../lib/coach-harness/eval-observer";
import { runWithGenerationContext } from "../lib/generation-context";
import { runResumeDraft } from "../lib/coach-harness/resume-execution";
import { applyResumeChanges } from "../lib/coach-harness/application-quality";
import { readResumeTrace } from "../lib/coach-harness/resume-trace";
import type {
  ResumeAgentAnswer,
  ResumeAgentTask,
  ResumeConversationTurn,
} from "../lib/coach-harness/resume-task-types";

const anchor = "- 参与供应商对接相关工作，整理一些项目材料。";
const resume = [
  "林之遥",
  "求职方向：运营专员",
  "## 工作经历",
  "### 海岚商贸 · 运营助理",
  "2024.07 - 2025.06",
  "- 使用 Excel 整理订单数据，制作周报供店长查看。",
  "## 项目经历",
  "### 星桥门店 · 采购支持项目",
  "2025.01 - 2025.03",
  anchor,
  "## 教育背景",
  "示例大学 · 电子商务 · 本科",
  "2020.09 - 2024.06",
].join("\n");
const history: ResumeConversationTurn[] = [
  {
    id: "delivery",
    message:
      "我交付了供应商对接方案，分析各家供应商的服务范围，分别整理对接方案。",
    reply: "这发生在哪段经历？",
    status: "completed",
    savedAt: "2026-10-24T00:00:00Z",
  },
  {
    id: "wrong-scope",
    message: "在海岚商贸。",
    reply: "这份方案用来做什么？",
    status: "completed",
    savedAt: "2026-10-24T00:01:00Z",
  },
  {
    id: "purpose",
    message: "给门店负责人比较供应商的服务范围。",
    reply: "你采用了什么特别的方法？",
    status: "completed",
    savedAt: "2026-10-24T00:02:00Z",
  },
];
const scenarios = [
  {
    id: "enough-facts-corrected-scope",
    message:
      "我刚说错了，不是海岚商贸，是星桥门店这个项目。方法就是常规的一样。",
    expected: "revise",
  },
  {
    id: "discuss-without-editing",
    message: "为什么强调方案而不是沟通能力？只解释这个判断，先不要修改。",
    expected: "discuss",
  },
  {
    id: "continue-after-editing",
    message:
      "刚才改好的先保留。我没有统计后续数据，先别再改了，解释一下为什么不需要为了显得专业硬加数字？",
    expected: "discuss",
  },
] as const;

async function main() {
  if (!process.argv.includes("--execute")) {
    console.log(JSON.stringify({ scenarios, maxProviderCalls: 7, retries: 0 }));
    return;
  }
  if (
    process.env.EVAL_SITE_MODEL_COST_ACK !== "1" ||
    process.env.LLM_STUB === "1"
  )
    throw Error("Explicit real-model permission required");
  const actor = (
    process.env.EVAL_ACTOR_ID ||
    process.env.EVAL_ADMIN_USER_IDS ||
    ""
  )
    .split(",")
    .map((s) => s.trim())
    .find(Boolean);
  if (!actor || !/^[0-9a-f-]{36}$/i.test(actor))
    throw Error("Existing private Eval owner required");
  const db = await getDbClient();
  if (!db) throw Error("Eval storage unavailable");
  const replayId = process.env.EVAL_REPLAY_DECISION_ID;
  let replay: {
    provenance: string;
    experiment: { fixtureId: string };
    result: { rawResponse: string };
    failure?: { message: string };
    input: { conversation: ResumeConversationTurn[] };
  } | null = null;
  if (replayId) {
    const prior = await db
      .from("coach_eval_runs")
      .select("run")
      .eq("id", replayId)
      .eq("user_id", actor)
      .single();
    replay = prior.data?.run;
    if (
      prior.error ||
      !replay ||
      replay.provenance !== "real_model_synthetic_input" ||
      replay.experiment?.fixtureId !== scenarios[0].id ||
      !replay.result?.rawResponse ||
      replay.failure?.message !== "Multi-turn corrected handoff failed"
    )
      throw Error("Not a resumable synthetic decision");
  }
  const batch = randomUUID(),
    directory = `/tmp/yizhi-mentor-loop-${batch}`;
  await mkdir(directory, { mode: 0o700 });
  const codeHash = createHash("sha256")
    .update(
      await readFile(
        "lib/coach-harness/resume-conversation-decision.ts",
        "utf8",
      ),
    )
    .digest("hex");
  let totalCalls = replay ? 1 : 0,
    failed = 0,
    edited = "",
    previousReply = "";
  for (const scenario of scenarios) {
    const id = randomUUID(),
      started = Date.now(),
      spans: EvalSpan[] = [];
    const currentSource =
      scenario.id === "continue-after-editing" ? edited : resume;
    if (!currentSource)
      throw Error(
        "No delivered editor result; cannot claim post-edit follow-up tested",
      );
    const conversation =
      scenario.id === "enough-facts-corrected-scope" ? [...history] : [];
    if (scenario.id === "continue-after-editing")
      conversation.push({
        id: "prior-edit",
        message: scenarios[0].message,
        reply: previousReply,
        decision: "revise",
        status: "completed",
        savedAt: new Date().toISOString(),
      });
    conversation.push({
      id: randomUUID(),
      message: scenario.message,
      reply: "",
      status: "pending",
      savedAt: new Date().toISOString(),
    });
    if (replay && scenario.id === scenarios[0].id)
      conversation.splice(0, conversation.length, ...replay.input.conversation);
    const task: ResumeAgentTask = {
      id: "synthetic-only",
      state: "ready",
      question: null,
      answers: [],
      result: { changes: [] },
      conversation,
      updatedAt: new Date().toISOString(),
    };
    const run: Record<string, unknown> & {
      status: string;
      result: Record<string, unknown>;
      ruleQuality: {
        expected: string;
        actual: string;
        shortReply: boolean;
        noWritingApproval: boolean;
      };
    } = {
      id,
      label: `导师闭环验收 · ${scenario.id}`,
      source: "isolated_experiment",
      provenance: "real_model_synthetic_input",
      status: "running",
      startedAt: new Date(started).toISOString(),
      input: { resume: currentSource, message: scenario.message, conversation },
      spans,
      experiment: {
        batchId: batch,
        fixtureId: scenario.id,
        strategy: "mentor_decision",
        codeHash,
        replayOf: scenario.id === scenarios[0].id ? replayId || null : null,
      },
      result: { status: "running" },
      ruleQuality: {
        expected: scenario.expected,
        actual: "not_run",
        shortReply: false,
        noWritingApproval: false,
      },
      evaluation: null,
      evaluationStatus: "not_requested",
      limitations: [
        "全部虚构材料；不写原账号简历、作答或积分。",
        "规则断言不是LLM自评分；账单未知。",
        "浏览器持久化与实际PDF另行验收。",
      ],
    };
    const inserted = await db.from("coach_eval_runs").insert({
      id,
      user_id: actor,
      label: run.label,
      status: "running",
      run: redactEval(run),
    });
    if (inserted.error) throw Error("Cannot create private Eval record");
    const save = async () => {
      // The observer calls save BEFORE each provider call. Reject excess before billing.
      if (totalCalls + spans.filter((s) => s.kind === "agent").length > 7)
        throw Error("Provider call safety budget exhausted");
      const saved = await db
        .from("coach_eval_runs")
        .update({
          status: run.status,
          run: redactEval(run),
          legacy_trace_id: typeof run.resumeTraceId === 'string' ? run.resumeTraceId : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("user_id", actor);
      if (saved.error) throw Error("Private Eval persistence failed");
    };
    try {
      await withEvalObserver({ spans, save }, async () => {
        const { messages, knowledge } = resumeConversationMessages(
          { resume: currentSource, jd: "", changes: [] },
          task,
        );
        run.knowledge = knowledge.map((k) => ({
          id: k.id,
          title: k.title,
          included: true,
        }));
        const raw =
          replay && scenario.id === scenarios[0].id
            ? replay.result.rawResponse
            : await runWithGenerationContext(
                {
                  operation: "resume_conversation",
                  requestId: id,
                  knowledgeDocumentIds: knowledge.map((k) => k.id),
                },
                () =>
                  observedResumeLLM(messages, {
                    ...resumeConversationLlmOptions(),
                    siteFunded: true,
                  }),
              );
        const decision = parseResumeConversationDecision(
          raw,
          currentSource,
          conversation,
        );
        run.result = {
          status: "decision_completed",
          output: decision,
          rawResponse: raw,
        };
        run.ruleQuality = {
          expected: scenario.expected,
          actual: decision.action,
          shortReply: decision.reply.length <= 180,
          noWritingApproval: !/你觉得|可以吗|要不要.*改|想突出/.test(
            decision.reply,
          ),
        };
        if (
          decision.action !== scenario.expected ||
          !run.ruleQuality.shortReply ||
          !run.ruleQuality.noWritingApproval
        )
          throw Error("Mentor behavior contract failed");
        if (scenario.id !== "enough-facts-corrected-scope") return;
        const facts =
          decision.supplements ||
          (decision.supplement ? [decision.supplement] : []);
        if (
          facts.length < 2 ||
          facts.some(
            (f) =>
              !anchor.includes(f.sourceExcerpt) || f.turnId === "wrong-scope",
          )
        )
          throw Error("Multi-turn corrected handoff failed");
        const now = new Date().toISOString();
        const answers: ResumeAgentAnswer[] = [
          {
            id: `instruction:${id}`,
            kind: "instruction",
            sourceExcerpt: "",
            field: "context",
            question: "导师确定的目标",
            answer: decision.editorBrief,
            savedAt: now,
          },
          ...facts.map((f, i) => ({
            id: `fact:${id}:${i}`,
            sourceExcerpt: f.sourceExcerpt,
            field: f.field,
            question: "虚构用户自述",
            answer: f.quote,
            claimId: randomUUID(),
            savedAt: now,
          })),
        ];
        const response = await runResumeDraft(
          new Request("https://eval.invalid/internal", {
            method: "POST",
            body: JSON.stringify({
              resumeText: resume,
              jobDescription: "",
              mode: "general_resume",
              requestId: `${id}:editor`,
            }),
          }),
          { id: actor },
          { isolated: true, isolatedAnswers: answers },
        );
        const output = await response.json();
        run.result.editor = { httpStatus: response.status, output };
        if (
          !response.ok ||
          !output.ok ||
          !output.changes?.length ||
          output.documentReview?.status !== "passed"
        )
          throw Error("No independently reviewed editor delivery");
        edited = applyResumeChanges(resume, output.changes).text;
        if (edited === resume) throw Error("No actual text change");
        previousReply = decision.reply;
        run.result.finalText = edited;
        run.result.mentorDecision = decision;
        run.result.decisionRawResponse = raw;
        run.result.output = { text: edited, changes: output.changes };
        run.result.rawResponse = output;
        run.modificationIds = output.changes.map((c: { id: string }) => c.id);
        run.resumeTraceId =
          (await readResumeTrace(actor, `${id}:editor`))?.traceId || null;
      });
      run.status = "completed";
      run.result.status = "completed";
    } catch (error) {
      failed++;
      run.status = "failed";
      run.failure = {
        message: error instanceof Error ? error.message : "failed",
      };
    }
    const agents = spans.filter((s) => s.kind === "agent");
    const sum = (key: "inputTokens" | "outputTokens" | "estimatedCostUsd") =>
      agents.every((s) => s.usage?.[key] != null)
        ? agents.reduce((n, s) => n + Number(s.usage![key]), 0)
        : null;
    run.durationMs = Date.now() - started;
    const metrics = {
      calls: agents.length,
      wallMs: run.durationMs,
      inputTokens: sum("inputTokens"),
      outputTokens: sum("outputTokens"),
      estimatedCostUsd: sum("estimatedCostUsd"),
      actualCost: null,
      pdfVerified: false,
    };
    run.metrics = metrics;
    await save();
    totalCalls += agents.length;
    await writeFile(
      `${directory}/${scenario.id}.json`,
      JSON.stringify(redactEval(run), null, 2),
      { mode: 0o600 },
    );
    console.log(
      JSON.stringify({
        id,
        fixture: scenario.id,
        status: run.status,
        ...metrics,
        checks: run.ruleQuality,
        failure: run.failure,
      }),
    );
    if (run.status === "failed") break; // No retry or silent replacement sample.
  }
  console.log(JSON.stringify({ batch, directory, calls: totalCalls, failed }));
  if (failed) process.exitCode = 1;
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Eval failed");
  process.exitCode = 1;
});
