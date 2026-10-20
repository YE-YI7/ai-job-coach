import { randomUUID } from "node:crypto";
import { getDbClient } from "@/lib/db";
import {
  EVAL_STAGE_NAMES,
  getEvalObserver,
  knowledgeFromRetrieval,
  redactEval,
  withEvalObserver,
  type EvalSpan,
} from "./eval-scope";
import { RESUME_TRACE_EVENT, resumeRequestHash } from "./resume-trace";

/** Deliberate owner allowlist, not every admin and never user-editable metadata. */
export function workspaceEvalEnabled(user: { id: string }) {
  return (process.env.EVAL_ADMIN_USER_IDS || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .includes(user.id);
}
/** Observe the real request without replaying it, adding a model call, or changing old answers. */
export async function recordWorkspaceResume(
  user: { id: string },
  request: Request,
  execute: (request: Request) => Promise<Response>,
): Promise<Response> {
  if (!workspaceEvalEnabled(user) || getEvalObserver()) return execute(request);
  let body;
  try {
    body = await request.clone().json();
    if (!body || typeof body !== "object" || !body.resumeText)
      return execute(request);
  } catch {
    return execute(request);
  }
  // Explicit probe IDs let the browser acceptance form read the same real
  // workspace request without a duplicate billable invocation on retry.
  const probeId =
    typeof body.evalCaptureId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      body.evalCaptureId,
    )
      ? body.evalCaptureId
      : null;
  const id = probeId || randomUUID(),
    requestId = String(body.requestId || id).slice(0, 180),
    started = Date.now();
  const spans: EvalSpan[] = [];
  const run: Record<string, unknown> = {
    id,
    label:
      probeId && typeof body.evalLabel === "string"
        ? body.evalLabel.slice(0, 120)
        : `工作区真实改稿 · ${body.mode === "general_resume" ? "无 JD" : "岗位定制"}`,
    source: "workspace",
    provenance: "production",
    status: "running",
    startedAt: new Date(started).toISOString(),
    input: {
      resume: String(body.resumeText).trim().slice(0, 30000),
      jobDescription: String(body.jobDescription || "")
        .trim()
        .slice(0, 30000),
    },
    spans,
    knowledge: [],
    result: { status: "running", output: null },
    evaluation: null,
    evaluationStatus: "not_requested",
    limitations: [
      "真实业务请求直接采集，不重跑模型。未额外调用付费自评。",
      "阶段耗时为检查点之间的间隔，不与模型耗时相加。",
    ],
  };
  let db: Awaited<ReturnType<typeof getDbClient>>;
  try {
    db = await getDbClient();
    if (!db)
      return probeId
        ? Response.json(
            { error: "评测记录暂不可写，未调用模型。" },
            { status: 503 },
          )
        : execute(request);
    const { error } = await db.from("coach_eval_runs").insert({
      id,
      user_id: user.id,
      label: run.label,
      status: "running",
      run: redactEval(run),
    });
    if (error)
      return probeId
        ? Response.json(
            {
              id,
              replayed: error.code === "23505",
              error: "请按原编号核对已有记录，未重复调用模型。",
            },
            { status: error.code === "23505" ? 202 : 503 },
          )
        : execute(request);
  } catch {
    return probeId
      ? Response.json(
          { error: "评测记录暂不可写，未调用模型。" },
          { status: 503 },
        )
      : execute(request);
  }
  let legacyId: string | null = null;
  const save = async () => {
    run.durationMs = Date.now() - started;
    try {
      const { error } = await db!
        .from("coach_eval_runs")
        .update({
          status: run.status,
          run: redactEval(run),
          legacy_trace_id: legacyId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("user_id", user.id);
      if (error)
        run.captureWarning = "部分采集写入失败；不得将本记录视为完整证据。";
    } catch {
      run.captureWarning = "部分采集写入失败；不得将本记录视为完整证据。";
    }
  };
  const forwarded = new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: JSON.stringify({ ...body, requestId }),
  });
  try {
    const response = await withEvalObserver({ spans, save }, () =>
      execute(forwarded),
    );
    const output = await response.clone().json();
    let trace;
    try {
      const old = await db
        .from("product_events")
        .select("properties")
        .eq("event_name", RESUME_TRACE_EVENT)
        .eq("user_id", user.id)
        .eq("properties->>requestHash", resumeRequestHash(requestId))
        .order("occurred_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (old.error) throw old.error;
      trace = old.data?.properties;
    } catch {
      run.captureWarning = "阶段摘要读取失败；实际输入输出仍保留。";
    }
    legacyId = trace?.traceId || null;
    const knowledge = knowledgeFromRetrieval(trace?.retrieval);
    let previousElapsed = 0;
    run.stages = (trace?.steps || []).map(
      (
        step: { stage: string; code: string; elapsedMs: number },
        index: number,
      ) => {
        const start = previousElapsed;
        previousElapsed = step.elapsedMs;
        return {
          id: `${id}:stage:${index}`,
          kind: "stage",
          name: EVAL_STAGE_NAMES[step.stage] || step.stage,
          code: step.code,
          status: "recorded",
          startedAt: new Date(started + start).toISOString(),
          durationMs: Math.max(0, step.elapsedMs - start),
          input: null,
          output: null,
          knowledge: step.stage === "retrieval" ? knowledge : [],
        };
      },
    );
    run.status = trace?.outcome || (response.ok ? "completed" : "failed");
    run.ruleQuality = trace?.quality || null;
    run.knowledge = knowledge;
    run.result = {
      status: run.status,
      output,
      rawResponse: output,
      httpStatus: response.status,
    };
    await save();
    response.headers.set("x-yizhi-eval-id", id);
    return response;
  } catch (error) {
    run.status = "failed";
    run.result = {
      status: "failed",
      error: "业务请求未完整完成，已采集的输入和错误保留。",
      details: redactEval(
        error instanceof Error
          ? error.message.slice(0, 2000)
          : String(error).slice(0, 2000),
      ),
    };
    await save();
    throw error;
  }
}
