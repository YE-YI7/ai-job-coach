export const VERSION = "yizhi.eval/v1";
export const MAX_BYTES = 5 * 1024 * 1024;
export const STATUS = {
  completed: "已完成",
  failed: "失败",
  blocked: "被拦截",
  needs_detail: "待补充",
  running: "运行中",
  unchanged: "无需修改",
  partial: "部分完成",
  cancelled: "已取消",
  quota_denied: "额度不足",
  unknown: "状态未记录",
  recorded: "已记录",
  skipped: "已跳过",
};
export const STAGES = {
  context: "材料与上下文",
  retrieval: "知识检索",
  draft: "生成改稿",
  grounding: "事实校验",
  review: "独立复核",
  save: "结果保存",
  failure: "异常退出",
};
export const PROBLEMS = {
  missing_information: "信息缺口",
  grounding: "事实风险",
  quality: "改稿质量",
  retrieval: "知识检索",
  format: "格式问题",
  system: "系统异常",
  none: "未发现问题",
  unknown: "尚未分类",
};
const record = (x) => x && typeof x === "object" && !Array.isArray(x);
const str = (x) => (typeof x === "string" ? x : "");
const list = (x) => (Array.isArray(x) ? x : []);
const num = (x) =>
  typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : null;
export const text = (x) =>
  x == null ? "" : typeof x === "string" ? x : JSON.stringify(x, null, 2);
export const state = (x) =>
  Object.hasOwn(STATUS, x) ? x : x === "done" ? "completed" : "unknown";

// Never execute imported data. Reject excessive nesting; redact credentials recursively.
export function sanitize(value, depth = 0) {
  if (depth > 22) throw Error("JSON 层级过深，请使用精简的 Trace 导出。");
  if (Array.isArray(value)) {
    if (value.length > 4000) throw Error("单个数组过大，请拆分文件。");
    return value.map((x) => sanitize(x, depth + 1));
  }
  if (record(value))
    return Object.fromEntries(
      Object.entries(value)
        .filter(([k]) => !["__proto__", "prototype", "constructor"].includes(k))
        .map(([k, v]) => [
          k,
          /^(authorization|cookie|set-cookie|api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)$/i.test(
            k,
          )
            ? "[已屏蔽凭据]"
            : sanitize(v, depth + 1),
        ]),
    );
  if (typeof value === "string")
    return value
      .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [已屏蔽]")
      .replace(/\bsk-[A-Za-z0-9_-]{12,}/g, "[已屏蔽 API Key]");
  return value;
}
function evaluation(x) {
  if (!record(x)) return null;
  const source =
    x.source === "llm_self_eval"
      ? "llm_self_eval"
      : x.source === "independent_llm"
        ? "independent_llm"
        : "unspecified";
  const score = num(x.score),
    maxScore = num(x.maxScore) ?? 100;
  if (maxScore === 0 || (score !== null && score > maxScore))
    throw Error("自评分数须在 0 到 maxScore 之间。");
  return {
    ...x,
    source,
    score,
    maxScore,
    reason: str(x.reason),
    criteria: list(x.criteria),
    missingInformation: list(x.missingInformation),
    problemType: Object.hasOwn(PROBLEMS, x.problemType)
      ? x.problemType
      : "unknown",
  };
}
function legacy(row, i) {
  const t = record(row.properties) ? row.properties : row;
  if (!str(t.traceId) || !Array.isArray(t.steps) || !record(t.retrieval))
    throw Error(`第 ${i + 1} 条不是支持的 Trace。请下载模板核对格式。`);
  let previous = 0;
  const spans = t.steps.map((s, n) => {
    const end = num(s.elapsedMs),
      duration = end === null ? null : Math.max(0, end - previous);
    if (end !== null) previous = end;
    return {
      id: `step-${n}`,
      name: STAGES[s.stage] || str(s.stage) || "未命名阶段",
      stage: str(s.stage),
      kind: "stage",
      status: "recorded",
      code: str(s.code),
      durationMs: duration,
      elapsedMs: end,
      count: num(s.count),
      input: null,
      output: null,
    };
  });
  const r = t.retrieval,
    included = new Set(list(r.includedIds)),
    ids = [
      ...new Set([
        ...included,
        ...list(r.methodCandidateIds),
        ...list(r.excludedByBudgetIds),
        ...list(r.matches).map((m) => m.id),
      ]),
    ];
  const knowledge = ids.map((id) => {
    const m = list(r.matches).find((x) => x.id === id);
    return {
      id,
      title: id,
      kind: list(r.methodCandidateIds).includes(id) ? "method" : "example",
      included: included.has(id),
      similarity: m ? num(m.similarity) : null,
      reason: list(r.excludedByBudgetIds).includes(id)
        ? "因上下文预算未纳入"
        : included.has(id)
          ? "实际纳入上下文"
          : "候选，未记录采用",
      dimensions: m?.dimensions || [],
      excerpt: null,
    };
  });
  return {
    id: t.traceId,
    label: t.mode === "target_resume" ? "岗位定制改稿" : "无 JD 简历改稿",
    provenance: "imported",
    format: "resume_trace_v1",
    startedAt: str(row.occurred_at),
    status: state(t.outcome),
    durationMs: num(t.elapsedMs),
    input: null,
    spans,
    knowledge,
    result: { status: state(t.outcome), output: null, error: null },
    evaluation: null,
    ruleQuality: record(t.quality) ? t.quality : null,
    editingValue: t.editingValue || null,
    original: row,
    limitations: [
      "旧版 Trace 未保存输入正文、Agent 输入输出和 LLM 自评原因。",
      "阶段耗时由累计打点相减得到，不代表单个模型的推理时间。",
    ],
  };
}
function canonical(r, i) {
  if (!record(r) || !str(r.id) || !Array.isArray(r.spans))
    throw Error(`第 ${i + 1} 条运行缺少 id 或 spans。`);
  if (r.spans.length > 250)
    throw Error("单次运行最多支持250个阶段，请精简后导入。");
  const ids = new Set();
  const spans = r.spans.map((s, n) => {
    if (!record(s)) throw Error("阶段必须是对象。");
    const id = str(s.id) || `span-${n}`;
    if (ids.has(id)) throw Error("同一运行的阶段 ID 不能重复。");
    ids.add(id);
    return {
      ...s,
      id,
      name: str(s.name) || "未命名阶段",
      kind: str(s.kind) || "stage",
      status: state(s.status),
      durationMs: num(s.durationMs),
      input: s.input ?? null,
      output: s.output ?? null,
      knowledge: list(s.knowledge),
    };
  });
  for (const s of spans) {
    if (!s.parentId) continue;
    if (!ids.has(s.parentId)) throw Error("parentId 指向不存在的阶段。");
    const seen = new Set([s.id]);
    let p = s;
    while (p.parentId) {
      if (seen.has(p.parentId)) throw Error("阶段父子关系存在循环。");
      seen.add(p.parentId);
      p = spans.find((x) => x.id === p.parentId);
    }
  }
  const knowledge = [...list(r.knowledge), ...spans.flatMap((s) => s.knowledge)]
    .filter(record)
    .map((k) => ({
      ...k,
      id: str(k.id),
      title: str(k.title) || str(k.id) || "未命名知识",
      included: k.included === true,
    }));
  return {
    ...r,
    id: r.id,
    label: str(r.label) || r.id,
    format: VERSION,
    provenance:
      r.provenance === "synthetic"
        ? "synthetic"
        : r.provenance === "production"
          ? "production"
          : "imported",
    startedAt: str(r.startedAt),
    status: state(r.status),
    durationMs: num(r.durationMs),
    input: r.input ?? null,
    spans,
    knowledge,
    result: record(r.result)
      ? r.result
      : { status: state(r.status), output: null },
    evaluation: evaluation(r.evaluation),
    ruleQuality: record(r.ruleQuality) ? r.ruleQuality : null,
    original: r,
    limitations: list(r.limitations),
  };
}
export function parseImport(raw) {
  if (typeof raw !== "string" || !raw.trim())
    throw Error("文件内容为空，请选择 Trace JSON。");
  if (new TextEncoder().encode(raw).length > MAX_BYTES)
    throw Error("文件超过5MB，请拆分后导入。");
  let d;
  try {
    d = JSON.parse(raw);
  } catch {
    try {
      d = raw
        .trim()
        .split(/\r?\n/)
        .filter(Boolean)
        .map((s) => JSON.parse(s));
    } catch {
      throw Error("JSON 无法解析，请检查文件格式；现有数据未改变。");
    }
  }
  d = sanitize(d);
  if (record(d) && d.schemaVersion && d.schemaVersion !== VERSION)
    throw Error(`不支持的数据版本：${String(d.schemaVersion).slice(0, 60)}`);
  const rows = Array.isArray(d)
    ? d
    : record(d) && Array.isArray(d.runs)
      ? d.runs
      : record(d) && Array.isArray(d.traces)
        ? d.traces
        : [d];
  if (!rows.length || rows.length > 100)
    throw Error("每个文件需要1至100条运行。");
  const runs = rows.map((r, i) =>
    record(r) && (r.traceId || r.properties?.traceId)
      ? legacy(r, i)
      : canonical(r, i),
  );
  const ids = new Set();
  for (const r of runs) {
    if (ids.has(r.id)) throw Error("文件内有重复的运行 ID。");
    ids.add(r.id);
  }
  return runs;
}
export function coverage(run) {
  return {
    input: run.input != null,
    trace: run.spans.length > 0,
    agents: run.spans.some(
      (s) => s.agent && s.input != null && s.output != null,
    ),
    output: run.result?.output != null,
    evaluation:
      run.evaluation?.source === "llm_self_eval" &&
      run.evaluation.score != null &&
      !!run.evaluation.reason,
  };
}
export function formatMs(ms) {
  if (num(ms) === null) return "未记录";
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}
export function exportBundle(runs, reviews = {}) {
  return {
    schemaVersion: VERSION,
    exportedAt: new Date().toISOString(),
    runs: runs.map((r) => ({
      id: r.id,
      label: r.label,
      provenance: r.provenance,
      startedAt: r.startedAt,
      status: r.status,
      durationMs: r.durationMs,
      input: r.input,
      spans: r.spans,
      knowledge: r.knowledge,
      result: r.result,
      evaluation: r.evaluation,
      ruleQuality: r.ruleQuality,
      limitations: r.limitations,
    })),
    humanReviews: reviews,
  };
}
