import { STATUS, formatStepMs, preferredSpan, sanitize, text } from "./core.mjs";

const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const array = (value) => Array.isArray(value) ? value : [];
const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[c]);
const labels = {
  source: "本轮原稿", resume: "简历原文", facts: "补充事实", jobDescription: "目标 JD",
  instruction: "本轮要求", confirmedInstructions: "已确认要求", editingRequest: "编辑要求",
  answers: "用户补充", context: "本轮上下文", messages: "消息", options: "调用参数",
  editorialPlan: "编辑计划", mainline: "编辑主线", decisions: "编辑取舍", ambiguities: "待确认项",
  changes: "修改", after: "修改后", before: "修改前", reason: "依据", sourceIds: "引用来源",
  findings: "发现的问题", document: "整稿检查", requestCoverage: "要求覆盖", summary: "摘要",
  actions: "工具调用", arguments: "参数", ready: "选材完成", status: "输出判定",
  recovery: "接续问题", text: "正文", output: "输出", result: "结果",
  knowledge: "已提供的知识条目", contract: "编辑合同与输出约束", feedback: "本轮反馈",
  changeId: "修改 ID", severity: "问题等级", message: "具体问题", category: "类别",
  valueChecks: "修改价值检查", useful: "有价值", kind: "类型", impact: "影响", index: "序号",
};
const errorStates = new Set(["failed", "blocked", "quota_denied"]);

// Parse only recorded JSON, including the model's optional outer code fence.
// Invalid or truncated data remains visible verbatim, never repaired or inferred.
export function parseRecorded(value) {
  if (typeof value !== "string") return value;
  const body = value.trim().replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i, "$1");
  try { return JSON.parse(body); } catch { return value; }
}

export function outputVerdict(span) {
  const output = parseRecorded(span.output);
  const value = object(output) ? output.document?.status ?? output.status : null;
  return typeof value === "string" && Object.hasOwn(STATUS, value) ? value : null;
}

export function spanHasIssue(span) {
  return errorStates.has(span.status) || errorStates.has(outputVerdict(span));
}

export function highlight(value, query = "") {
  const source = String(value ?? "");
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return escape(source);
  const lower = source.toLocaleLowerCase();
  let start = 0, result = "", at = lower.indexOf(needle);
  while (at !== -1) {
    result += escape(source.slice(start, at)) + `<mark>${escape(source.slice(at, at + needle.length))}</mark>`;
    start = at + needle.length;
    at = lower.indexOf(needle, start);
  }
  return result + escape(source.slice(start));
}

function prose(value, query) {
  const content = String(value ?? "").split(/(\*\*[^*\n]+\*\*)/g).map((part) =>
    part.startsWith("**") && part.endsWith("**")
      ? `<strong>${highlight(part.slice(2, -2), query)}</strong>` : highlight(part, query),
  ).join("");
  return `<div class="trace-prose">${content}</div>`;
}

function raw(value, query) {
  return `<pre class="trace-raw">${highlight(text(sanitize(value)), query)}</pre>`;
}

function disclosure(title, body, open = false) {
  return `<details class="trace-disclosure"${open ? " open" : ""}><summary>${title}</summary>${body}</details>`;
}

function section(label, body) {
  return `<section class="trace-section"><h4>${escape(label)}</h4>${body}</section>`;
}

function valueView(value, query, depth = 0) {
  if (value == null) return '<p class="trace-muted">原记录为 null</p>';
  if (typeof value === "string") return prose(value || "（空字符串）", query);
  if (typeof value !== "object") return prose(String(value), query);
  if (depth > 4) return raw(value, query);
  if (Array.isArray(value)) {
    if (!value.length) return '<p class="trace-muted">原记录为空列表</p>';
    if (value.every((item) => item == null || typeof item !== "object")) {
      return `<ul class="trace-reading-list">${value.map((item) => `<li>${prose(String(item ?? "null"), query)}</li>`).join("")}</ul>`;
    }
    return value.map((item, i) => disclosure(`第 ${i + 1} 项`, valueView(item, query, depth + 1), value.length < 6)).join("");
  }
  return Object.entries(value).map(([key, item]) =>
    section(labels[key] || key, valueView(item, query, depth + 1)),
  ).join("");
}

function inputView(span, query) {
  if (span.input == null) return missing("没有输入快照", "这条历史打点没有保存输入，无法还原。不会用其他记录补齐。");
  const input = parseRecorded(span.input);
  if (!object(input) || !Array.isArray(input.messages)) return valueView(input, query);
  const messages = input.messages.map((message, i) => {
    if (!object(message)) return section(`消息 ${i + 1}`, valueView(message, query));
    const role = { system: "系统指令", developer: "开发指令", user: "用户输入", assistant: "助手消息", tool: "工具返回" }[message.role]
      || message.role || "消息";
    const content = sanitize(parseRecorded(message.content));
    const count = typeof message.content === "string" ? ` · ${message.content.length.toLocaleString()} 字符` : "";
    const body = object(content) ? Object.entries(content).map(([key, value]) => {
      const matched = query.trim() && text(value).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
      return ["contract", "knowledge"].includes(key)
        ? disclosure(escape(labels[key]), valueView(value, query), Boolean(matched))
        : section(labels[key] || key, valueView(value, query));
    }).join("") : valueView(content, query);
    const matches = query.trim() && text(content).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
    return disclosure(`${escape(role)}${escape(count)}`, body, Boolean(matches) || !["system", "developer"].includes(message.role));
  }).join("");
  const other = Object.fromEntries(Object.entries(input).filter(([key]) => !["messages", "options"].includes(key)));
  return messages + (Object.keys(other).length ? valueView(other, query) : "");
}

function outputView(span, query) {
  if (span.output == null) return missing("没有输出快照", "此阶段只记录了状态或耗时，不能据此恢复模型输出。");
  const output = sanitize(parseRecorded(span.output));
  if (!object(output)) return valueView(output, query);
  let html = "";
  if (output.editorialPlan) {
    const plan = output.editorialPlan;
    const decisions = array(plan.decisions).map((item) =>
      `<div class="trace-decision"><h5>${highlight(item.topic || "取舍", query)}</h5>`
      + (item.retain ? `<p><span>保留</span>${highlight(item.retain, query)}</p>` : "")
      + (item.change ? `<p><span>改法</span>${highlight(item.change, query)}</p>` : "") + "</div>",
    ).join("");
    const ambiguity = array(plan.ambiguities).length ? section("待确认的说法", valueView(plan.ambiguities, query)) : "";
    html += section("编辑判断", (plan.mainline ? prose(plan.mainline, query) : "")
      + (decisions || ambiguity ? disclosure(`具体取舍 · ${array(plan.decisions).length} 项`, decisions + ambiguity, Boolean(query.trim())) : ""));
  }
  if (Array.isArray(output.changes)) {
    html += output.changes.length ? output.changes.map((change, i) => {
      const extras = Object.fromEntries(Object.entries(change).filter(([key]) => !["after", "before", "section"].includes(key)));
      return section(change.section ? `修改后 · ${change.section}` : `修改 ${i + 1}`,
        change.after != null ? valueView(change.after, query) : valueView(change, query))
        + (change.before != null ? disclosure("修改前", valueView(change.before, query)) : "")
        + (Object.keys(extras).length ? disclosure("修改依据与引用", valueView(extras, query)) : "");
    }).join("") : section("修改", '<p class="trace-muted">原输出没有新的修改条目；不据此判断原因。</p>');
  }
  for (const [key, value] of Object.entries(output)) {
    if (["editorialPlan", "changes"].includes(key)) continue;
    if (key === "status" && outputVerdict(span) === value) continue;
    if (key === "findings" && Array.isArray(value)) {
      html += section("发现的问题", value.length ? value.map((finding) => {
        if (!object(finding)) return valueView(finding, query);
        const metadata = Object.fromEntries(Object.entries(finding).filter(([field]) => field !== "message"));
        return `<div class="trace-finding">${prose(finding.message ?? "原记录没有问题说明", query)}`
          + disclosure("关联修改与判定字段", valueView(metadata, query)) + "</div>";
      }).join("") : '<p class="trace-muted">原输出未列问题条目</p>');
      continue;
    }
    // Repeated field groups remain available without duplicating a whole review on screen.
    const body = valueView(value, query);
    html += ["document", "valueChecks", "requestCoverage", "recovery"].includes(key)
      ? disclosure(escape(labels[key] || key), body, Boolean(query.trim())) : section(labels[key] || key, body);
  }
  return html;
}

function missing(title, body) {
  return `<div class="trace-empty"><strong>${escape(title)}</strong><p>${escape(body)}</p></div>`;
}

export function traceRows(spans) {
  const ids = new Set(spans.map((span) => span.id));
  const ordered = [], visited = new Set();
  function walk(parentId, depth) {
    for (const span of spans) {
      const parent = ids.has(span.parentId) ? span.parentId : null;
      if (parent !== parentId || visited.has(span.id)) continue;
      visited.add(span.id);
      ordered.push({ span, depth });
      walk(span.id, depth + 1);
    }
  }
  walk(null, 0);
  // Canonical validation rejects cycles; retain visibility even for a direct unvalidated caller.
  for (const span of spans) if (!visited.has(span.id)) ordered.push({ span, depth: 0 });
  return ordered;
}

export function matchingSpans(spans, query) {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return spans;
  return spans.filter((span) => [span.id, span.name, span.agent, span.code, span.model, text(span.input), text(span.output)]
    .some((value) => String(value ?? "").toLocaleLowerCase().includes(needle)));
}

export function traceTiming(spans) {
  if (!spans.length) return null;
  const rows = spans.map((span) => ({ id: span.id, start: Date.parse(span.startedAt), duration: span.durationMs }));
  if (rows.some((row) => !Number.isFinite(row.start) || typeof row.duration !== "number" || row.duration <= 0)) return null;
  const origin = Math.min(...rows.map((row) => row.start));
  const extent = Math.max(...rows.map((row) => row.start + row.duration)) - origin;
  return { extent, offsets: new Map(rows.map((row) => [row.id, row.start - origin])) };
}

function callInfo(span, query) {
  const fields = {
    "节点 ID": span.id, "父节点 ID": span.parentId ?? "未记录（不推断父子关系）",
    "调用状态": STATUS[span.status] || "未记录", "模型": span.model ?? "未记录",
    "Agent": span.agent ?? "未记录", "阶段代码": span.code ?? "未记录",
    "阶段耗时": formatStepMs(span.durationMs),
    "计量": span.metrics ?? span.usage ?? null,
    "调用参数": object(span.input) ? span.input.options ?? null : null,
  };
  return valueView(fields, query);
}

export function renderSpanInspector(span, state = {}, knowledge = []) {
  const query = state.query || "";
  const pane = ["output", "input", "meta", "raw"].includes(state.pane) ? state.pane : "output";
  const tabs = [["output", "输出"], ["input", "输入"], ["meta", "调用信息"], ["raw", "原始记录"]];
  const verdict = outputVerdict(span);
  const content = pane === "output" ? outputView(span, query) : pane === "input" ? inputView(span, query)
    : pane === "meta" ? callInfo(span, query) : section("节点原始记录", raw(span, query));
  return `<section class="trace-inspector" aria-label="选中节点的证据"><header class="trace-inspector-head">`
    + `<div><h2>${escape(span.name)}</h2><p>${escape(span.model || "模型未记录")} · ${escape(formatStepMs(span.durationMs))}</p></div>`
    + `<div class="trace-node-states"><span class="status ${escape(span.status)}">调用${escape(STATUS[span.status] || "状态未记录")}</span>`
    + (verdict ? `<span class="status ${escape(verdict)}">输出判定：${escape(STATUS[verdict])}</span>` : "") + `</div></header>`
    + (state.unmatched ? '<p class="trace-filter-note">当前节点未命中搜索；请选左侧匹配节点，或清空搜索。</p>' : "")
    + `<div class="trace-evidence-tabs" role="tablist" aria-label="节点证据">${tabs.map(([key, label]) =>
      `<button type="button" role="tab" id="trace-tab-${key}" data-trace-pane="${key}" aria-selected="${pane === key}"`
      + ` aria-controls="trace-evidence" tabindex="${pane === key ? 0 : -1}">${label}</button>`,
    ).join("")}</div><div id="trace-evidence" role="tabpanel" aria-labelledby="trace-tab-${pane}" tabindex="0">${content}</div>`
    + (array(span.knowledge).length ? disclosure("本节点记录的知识", valueView(span.knowledge, query)) : "")
    + (array(knowledge).length ? disclosure("运行级知识记录（不等于本节点输入）", valueView(knowledge, query)) : "")
    + `</section>`;
}

export function renderTrace(run, state = {}) {
  const spans = array(run.spans);
  if (!spans.length) return missing("没有阶段记录", "这条运行尚未采集到调用节点。");
  const query = state.query || "";
  const span = preferredSpan(spans, state.spanId);
  const matches = matchingSpans(spans, query);
  const matched = new Set(matches.map((item) => item.id));
  const maxDuration = Math.max(1, ...spans.map((item) => Number(item.durationMs) || 0));
  const issues = spans.filter(spanHasIssue);
  const timing = traceTiming(spans);
  const timeline = state.layout === "timeline" && timing;
  const rows = traceRows(spans).filter(({ span: item }) => matched.has(item.id)).map(({ span: item, depth }) => {
    const issue = spanHasIssue(item);
    const duration = typeof item.durationMs === "number" ? formatStepMs(item.durationMs) : "未记录耗时";
    const outputStatus = outputVerdict(item);
    const offset = timeline ? timing.offsets.get(item.id) : 0;
    const width = Math.max(1, Math.round((Number(item.durationMs) || 0) / (timeline ? timing.extent : maxDuration) * 200));
    const x = timeline ? Math.round(offset / timing.extent * 200) : 0;
    return `<button class="trace-node${issue ? " has-issue" : ""}" data-span="${escape(item.id)}"`
      + ` aria-pressed="${item.id === span.id}" data-depth="${Math.min(depth, 8)}">`
      + `<span class="trace-node-line"><span class="trace-node-dot" aria-hidden="true"></span>`
      + `<strong>${highlight(item.name, query)}</strong><span class="trace-duration">${escape(duration)}</span></span>`
      + `<span class="trace-node-meta">${escape(item.agent ? "模型调用" : item.kind === "tool" ? "工具调用" : "阶段")}`
      + ` · ${escape(STATUS[item.status] || "未记录")}${outputStatus ? ` · 输出${escape(STATUS[outputStatus])}` : ""}`
      + `${timeline ? ` · +${escape(formatStepMs(offset))}` : ""}</span>`
      + (item.durationMs > 0 ? `<svg class="trace-duration-track" viewBox="0 0 200 3" preserveAspectRatio="none" aria-hidden="true">`
        + `<rect x="${x}" y="0" width="${Math.min(width, 200 - x)}" height="3"/></svg>` : "") + `</button>`;
  }).join("");
  const notice = run.result?.error ? prose(run.result.error, "") : "";
  const timingExplanation = timeline
    ? "起点与耗时来自原记录，空白为未采集区间；跨度不等于模型活动耗时。"
    : "父子层级仅按已记录的 parentId 展示；未记录起点时不推断并行或等待。";
  return `<div class="trace-toolbar"><div><button class="text-button" data-trace-runs`
    + ` aria-controls="eval-run-list" aria-expanded="${Boolean(state.runs)}">${state.runs ? "收起运行记录" : "运行记录"}</button>`
    + `<strong>调用链</strong><span>${spans.length} 个节点</span>`
    + `<span>${escape(STATUS[run.status] || "状态未记录")}</span></div><div>`
    + `<button class="text-button" data-trace-issue${issues.length ? "" : " disabled"}>${issues.length ? `定位异常 · ${issues.length}` : "未标记异常节点"}</button>`
    + `<button class="text-button" data-trace-assessment aria-expanded="${Boolean(state.assessment)}">评估与反馈</button></div></div>`
    + (notice ? `<details class="trace-run-notice"><summary>运行结论</summary>${notice}</details>` : "")
    + `<div class="trace-workbench"><nav class="trace-tree" aria-label="调用链节点">`
    + `<div class="trace-layout-switch" aria-label="调用链视图">`
    + `<button type="button" data-trace-layout="tree" aria-pressed="${!timeline}">调用树</button>`
    + `<button type="button" data-trace-layout="timeline" aria-pressed="${Boolean(timeline)}"${timing ? "" : ' disabled title="原记录缺少完整起点或耗时"'}>时间线</button></div>`
    + `<label class="trace-search"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5"/><path d="m13 13 4 4"/></svg>`
    + `<input id="trace-search" type="search" maxlength="200" aria-label="搜索节点或输入输出" placeholder="搜索节点或输入输出" value="${escape(query)}" autocomplete="off"></label>`
    + `<p class="trace-tree-note">${timeline ? `从首节点起 · 记录跨度 ${escape(formatStepMs(timing.extent))}` : "按记录顺序 · 横条仅比较单步耗时"}</p>`
    + (query ? `<p class="trace-match-count" role="status">${matches.length} / ${spans.length} 个节点命中</p>` : "")
    + `<div class="trace-nodes">${rows || missing("没有匹配的节点", "换一个关键词，或清空搜索查看全部。")}</div>`
    + `<details class="trace-explanation"><summary>层级与计时说明</summary>`
    + `<p class="trace-tree-footnote">${timingExplanation}</p></details></nav>`
    + renderSpanInspector(span, { ...state, unmatched: Boolean(query) && !matched.has(span.id) }, run.knowledge) + `</div>`;
}
