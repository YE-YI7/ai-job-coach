import {
  parseImport,
  coverage,
  formatMs,
  formatStepMs,
  exportBundle,
  text,
  STATUS,
  PROBLEMS,
  VERSION,
  MAX_BYTES,
  preferredSpan,
} from "./core.mjs";
import { samples } from "./samples.mjs";
import { renderTrace, spanHasIssue } from "./trace-view.mjs";
import { renderFlow, executionLabel } from "./trace-flow.mjs";
const $ = (id) => document.getElementById(id);
// The URL, storage and every DOM binding are read inside boot() so this module
// stays importable by the unit tests, which have no browser.
let live = false,
  workspaceEntry = false;
let runs = [],
  selected = null,
  tab = "trace",
  spanId = null,
  loadedSource = "empty",
  loading = false,
  requestSequence = 0,
  pendingId = null;
let uncertainId = null;
let tracePane = "output", traceQuery = "", traceAssessment = false, traceLayout = "tree", traceRuns = false;
let traceMode = "flow", traceFlowId = "context", traceFlowFull = false;
// 案例反馈的草稿只存在本机 sessionStorage；编号在同一次提交的失败重试里保持不变。
let feedbacks = [],
  feedbackDraft = null,
  feedbackBusy = false,
  feedbackSequence = 0,
  feedbackStatus = null;
let feedbackContext = 0;
// 方案对比是独立视图，切换记录时必须先退出，避免旧响应写进新页面。
let compareMode = false,
  compareSequence = 0;
const reviews = {};
const esc = (x) =>
  String(x ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const statusHTML = (s) =>
  `<span class="status ${esc(s)}">${esc(STATUS[s] || "状态未记录")}</span>`;
const date = (s) => {
  if (!s || !Number.isFinite(Date.parse(s))) return "时间未记录";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(s));
};
export const FEEDBACK_CATEGORIES = [
  ["format", "版式与结构"],
  ["quality", "改稿质量"],
  ["grounding", "事实与引用"],
  ["questioning", "逐问补充"],
  ["system", "系统异常"],
  ["other", "其他"],
];
export const FEEDBACK_VERDICTS = [
  ["improve", "仍需改进"],
  ["fail", "不可交付"],
  ["pass", "可以交付"],
];
/**
 * 反馈对象只能来自这条运行记录里真实存在的修改。后端按同一份 ID 名单校验，
 * 缺 id 的条目一律不给选——不自行编号，也不把段落序号当 ID。
 */
export function changeOptions(run) {
  const result = run?.original?.result ?? run?.result ?? {};
  const changes = result?.rawResponse?.changes ?? result?.output?.changes;
  if (!Array.isArray(changes)) return [];
  return changes.flatMap((change, index) => {
    if (!change || typeof change !== "object") return [];
    const id = typeof change.id === "string" ? change.id.trim() : "";
    if (!id) return [];
    const section =
      typeof change.section === "string" && change.section.trim()
        ? change.section.trim()
        : `第 ${index + 1} 条修改`;
    return [{ id, section }];
  });
}
/** 提交体固定这七个字段；用户、账号、简历正文都不从中经过，多余字段会被服务端拒绝。 */
export function feedbackPayload(draft) {
  const note = String(draft?.note ?? "").trim();
  if (!note) throw Error("请先写下具体问题，空白反馈不会提交。");
  if (!draft?.id || !draft?.runId) throw Error("缺少反馈编号或运行编号，未提交。");
  const whole = draft.scope !== "change";
  if (!whole && !String(draft.changeId ?? "").trim())
    throw Error("这条运行没有可选的具体修改，请改选整份简历。");
  return {
    id: draft.id,
    runId: draft.runId,
    changeId: whole ? null : String(draft.changeId).trim(),
    scope: whole ? "whole_document" : "change",
    category: draft.category,
    verdict: draft.verdict,
    note,
    expected: String(draft.expected ?? "").trim(),
  };
}
const COST_STATUS = {
  estimate_only_no_invoice: "仅估价，未开票",
  invoiced: "已按实际账单",
  not_billed: "未计费",
};
/** 缺失一律「未记录」；0 是真实值，不能被当成缺失，估价也不冒充实扣。 */
export function metricCell(metrics, key, kind = "number") {
  const value = metrics?.[key];
  if (value === null || value === undefined || value === "") return "未记录";
  if (kind === "ms") return formatMs(value);
  if (kind === "usd") return `$${Number(value).toFixed(4)}`;
  if (kind === "costStatus")
    return COST_STATUS[String(value)] || String(value);
  if (kind === "flag") return value === true ? "已验证" : value === false ? "未验证" : "未记录";
  if (kind === "text") return String(value);
  return Number.isFinite(Number(value)) ? String(Number(value)) : String(value);
}
export const METRIC_COLUMNS = [
  ["wallMs", "耗时", "ms"],
  ["calls", "调用", "number"],
  ["inputTokens", "输入 token", "number"],
  ["outputTokens", "输出 token", "number"],
  ["cacheHitTokens", "缓存命中", "number"],
  ["estimatedCostUsd", "估价", "usd"],
  ["actualCost", "实扣", "usd"],
  ["costStatus", "计费口径", "costStatus"],
];
let toastTimer;
function toast(message, error = false) {
  clearTimeout(toastTimer);
  $("toast").hidden = false;
  $("toast").className = `toast${error ? " error" : ""}`;
  $("toast").textContent = message;
  toastTimer = setTimeout(() => {
    $("toast").hidden = true;
  }, 4500);
}
function notice(message, error = false) {
  $("notice").hidden = !message;
  $("notice").className = `notice${error ? " error" : ""}`;
  $("notice").textContent = message;
}
function missing(
  title = "尚未采集",
  description = "这份 Trace 没有保存这一项。未根据其他字段推测或补造。",
) {
  return `<div class="missing"><strong>${esc(title)}</strong>${esc(description)}</div>`;
}
function payload(value) {
  if (value == null) return missing();
  if (typeof value === "string") {
    try {
      return `<pre class="payload">${esc(JSON.stringify(JSON.parse(value), null, 2))}</pre>`;
    } catch {
      return `<div class="prose">${esc(value)}</div>`;
    }
  }
  return `<pre class="payload">${esc(text(value))}</pre>`;
}
function io(s) {
  if (s.input == null && s.output == null)
    return missing(
      "阶段摘要，没有内容快照",
      "这条打点只保存了状态与时间，不是完整的输入输出记录。请查看有 I/O 的模型调用；历史未存内容无法恢复。",
    );
  return `<div class="io-columns"><div class="io-block"><h3>输入 Input</h3>${payload(s.input)}</div><div class="io-block"><h3>输出 Output</h3>${payload(s.output)}</div></div>`;
}
function uniqueKnowledge(entries) {
  const seen = new Set();
  return (entries || []).filter((entry) => {
    if (!entry?.id) return false;
    const key = `${entry.id}:${entry.included}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function knowledgeCards(entries) {
  return entries
    .map(
      (entry) =>
        `<div class="knowledge-entry"><header><strong>${esc(entry.title || entry.id)}</strong><span class="muted">${entry.included ? "已纳入" : "未纳入"}</span></header><p>${esc(entry.id)}${typeof entry.similarity === "number" ? ` · 匹配 ${entry.similarity}` : ""}</p>${entry.reason ? `<p>${esc(entry.reason)}</p>` : ""}${entry.excerpt ? `<div class="prose">${esc(entry.excerpt)}</div>` : ""}</div>`,
    )
    .join("");
}
function knowledgeHTML(entries, scopeLabel = "知识库使用") {
  const items = uniqueKnowledge(entries);
  const used = items.filter((entry) => entry.included).length;
  return `<details class="knowledge"><summary>${esc(scopeLabel)} <span class="muted">· ${items.length ? `${used} 条实际纳入` : "未记录"}${items.some((entry) => !entry.included) ? ` / ${items.length} 条候选` : ""}</span></summary>${items.length ? knowledgeCards(items) : missing("未记录知识条目", "这不等于本次没有使用知识；需要以实际采集记录为准。")}</details>`;
}
function current() {
  return runs.find((r) => r.id === selected);
}
function reconcilePending() {
  const r = runs.find((r) => r.id === uncertainId);
  if (r && r.status !== "running") {
    uncertainId = null;
    try {
      sessionStorage.removeItem("yizhi-eval-pending");
    } catch {}
  }
  $("start-run").textContent = uncertainId
    ? "核对并重试原编号"
    : "开始真实实测";
}
function openNewRun() {
  if (!pendingId && !uncertainId) {
    $("cost-ack").checked = false;
    $("new-status").textContent = "";
  }
  $("new-dialog").showModal();
}
function loadReviews(id) {
  try {
    reviews[id] = JSON.parse(
      localStorage.getItem(`yizhi-eval-review:${id}`) || "null",
    ) || { verdict: "pending", note: "" };
  } catch {
    reviews[id] = { verdict: "pending", note: "" };
  }
  return reviews[id];
}
function renderList() {
  const term = $("search").value.trim().toLowerCase(),
    filter = $("filter").value;
  const filtered = runs.filter(
    (r) =>
      (!term || `${r.label} ${r.id}`.toLowerCase().includes(term)) &&
      (filter === "all" ||
        (filter === "failed" &&
          ["failed", "blocked", "quota_denied"].includes(r.status)) ||
        r.status === filter),
  );
  $("list-caption").textContent =
    loadedSource === "demo"
      ? `${filtered.length} 条演示 · 全部虚构`
      : `${filtered.length} 条${loadedSource === "production" ? "正式记录" : "导入记录"}`;
  $("runs").innerHTML = filtered.length
    ? filtered
        .map(
          (r) =>
            `<button class="run-item" data-run="${esc(r.id)}" aria-current="${r.id === selected}"><strong>${esc(r.label)}</strong><div class="row-meta">${statusHTML(r.status)}<span>${r.provenance === "synthetic" ? "演示" : date(r.startedAt).split(" ")[0]}</span></div></button>`,
        )
        .join("")
    : '<p class="empty-list">没有匹配的记录。可清空搜索或切换状态。</p>';
  $("runs")
    .querySelectorAll("[data-run]")
    .forEach((b) => b.addEventListener("click", () => select(b.dataset.run)));
}
async function select(id) {
  if (compareMode) closeCompare();
  const seq = ++requestSequence;
  selected = id;
  spanId = null;
  tracePane = "output";
  traceQuery = "";
  traceAssessment = false;
  traceLayout = "tree";
  traceMode = "flow";
  traceFlowId = "context";
  traceFlowFull = false;
  resetFeedback(id);
  const r = current();
  renderList();
  renderDetail();
  if (r?.detailAvailable) {
    loading = true;
    notice("正在读取本次运行的详细证据…");
    try {
      const data = await api(`?id=${encodeURIComponent(id)}`);
      if (seq !== requestSequence || selected !== id) return;
      const full = parseImport(JSON.stringify(data))[0];
      // 回来的必须是刚点的那条；编号不一致就停手，不能让上一条的面板留在页面上冒充。
      if (!full || full.id !== id)
        throw Error("服务器返回的运行编号与所选记录不一致，已停止载入本页。");
      runs = runs.map((x) => (x.id === id ? full : x));
      renderList();
      notice(
        full.format === "resume_trace_v1"
          ? "历史阶段摘要 · 当时未保存输入输出，不能完整回放。已授权账号今后的工作区改稿会直接采集。"
          : full.captureWarning ||
              "正式管理员记录 · 只读查看，不会自动调用模型",
      );
    } catch (e) {
      if (seq !== requestSequence || selected !== id) return;
      notice(e.message, true);
      $("detail").hidden = true;
      $("empty").hidden = false;
      $("empty-action").textContent = "返回运行列表";
      return;
    } finally {
      if (seq === requestSequence) loading = false;
    }
  }
  if (seq !== requestSequence || selected !== id) return;
  if (current()) {
    renderDetail();
    $("empty").hidden = true;
    $("detail").hidden = false;
    void loadFeedback(id);
    try {
      sessionStorage.setItem("yizhi-eval-selected", id);
    } catch {}
  }
}
function coverageHTML(r) {
  const c = coverage(r);
  return `<div class="coverage" aria-label="证据完整度">${Object.entries({
    输入: c.input,
    阶段: c.trace,
    "Agent I/O": c.agents,
    结果: c.output,
    "LLM 自评": c.evaluation,
  })
    .map(
      ([k, yes]) =>
        `<span><svg viewBox="0 0 16 16" aria-hidden="true">${yes ? '<path d="m3 8 3 3 7-7"/>' : '<path d="M3 8h10"/>'}</svg>${esc(k)}${yes ? "" : "未采集"}</span>`,
    )
    .join("")}</div>`;
}
function renderDetail() {
  const r = current();
  if (!r) return;
  $("run-title").textContent = r.label;
  $("run-origin").textContent =
    r.provenance === "synthetic"
      ? "演示运行 · 虚构样本，未调用模型"
      : loadedSource === "production"
        ? r.source === "isolated_experiment"
          ? "真实模型 · 虚构隔离样本"
          : r.source === "workspace"
          ? "工作区真实请求 · 直接采集"
          : executionLabel(r)
        : "本地导入 · 仅当前标签页";
  $("run-status").className = `status ${r.status}`;
  $("run-status").textContent = STATUS[r.status] || "状态未记录";
  $("run-id").textContent = r.id;
  $("run-time").textContent = date(r.startedAt);
  $("run-duration").textContent = `总耗时 ${formatMs(r.durationMs ?? r.metrics?.wallMs)}`;
  document.querySelectorAll("[data-tab]").forEach((b) => {
    b.setAttribute("aria-selected", b.dataset.tab === tab);
    b.tabIndex = b.dataset.tab === tab ? 0 : -1;
  });
  $("panel").setAttribute("aria-labelledby", `tab-${tab}`);
  renderPanel();
  renderAssessment();
  renderFeedback();
  const review = reviews[r.id] || loadReviews(r.id);
  $("verdict").value = review.verdict;
  $("review-note").value = review.note;
  $("review-status").textContent = review.savedAt
    ? `已保存在本机 · ${date(review.savedAt)}`
    : "只保存结论和备注，不保存运行正文";
}
function renderPanel() {
  const r = current();
  if (!r) return;
  $("detail").classList.toggle("trace-mode", tab === "trace");
  $("detail").classList.toggle("trace-assessment-open", traceAssessment);
  document.querySelector(".shell").classList.toggle("trace-runs-open", traceRuns);
  let h = tab === "trace" ? "" : coverageHTML(r);
  if (tab === "input") {
    h +=
      '<p class="section-intro">核对本次实际送入的材料，和用户原始事实保持一致。</p>';
    if (r.input == null)
      h += missing(
        "旧版未保存输入正文",
        "历史 Trace 仅保留运维元数据。未读取用户旧作答来填补这块空白。",
      );
    else if (typeof r.input === "object") {
      for (const [key, value] of Object.entries(r.input)) {
        const label =
          {
            resume: "简历原文",
            jobDescription: "目标 JD",
            instruction: "本次要求",
            answers: "逐问补充",
          }[key] || key;
        h += `<section class="input-section"><h2>${esc(label)}</h2>${value === "" && key === "jobDescription" ? '<p class="muted">未提供 JD · 按无 JD 改稿处理</p>' : payload(value)}</section>`;
      }
    } else h += payload(r.input);
  }
  if (tab === "trace") {
    spanId = preferredSpan(r.spans, spanId || r.spans.find(spanHasIssue)?.id)?.id ?? null;
    const state = { spanId, pane: tracePane, query: traceQuery, assessment: traceAssessment,
      layout: traceLayout, runs: traceRuns, nodeId: traceFlowId, full: traceFlowFull };
    h += traceMode === "flow" ? renderFlow(r, state)
      : '<button class="text-button" data-trace-mode="flow">返回执行动线</button>' + renderTrace(r, state);
  }
  if (tab === "agents") {
    const agents = r.spans.filter((s) => s.agent);
    h +=
      '<p class="section-intro">每次模型调用独立展示。重试保留为单独一次交接，不合并成一次成功。</p>';
    h += agents.length
      ? agents
          .map(
            (s) =>
              `<section class="agent-entry"><div class="span-title"><h2>${esc(s.agent)}</h2>${statusHTML(s.status)}</div><p class="code-label">${esc(s.id)} · ${esc(formatStepMs(s.durationMs))}${s.model ? ` · ${esc(s.model)}` : ""}${s.parentId ? ` · parent ${esc(s.parentId)}` : ""}</p>${io(s)}${s.knowledge?.length ? knowledgeHTML(s.knowledge, "该 Agent 实际上下文知识") : `<p class="muted">这次模型调用没有单独记下知识文档。检索结果在 Trace 页顶部。</p>`}</section>`,
          )
          .join("")
      : missing(
          "尚未记录 Agent 级输入输出",
          "这条历史记录当时没有保存模型 I/O。已授权账号的新工作区改稿会直接记录可见消息与响应，不收集隐藏推理。",
        );
  }
  if (tab === "result") {
    h += `<p class="section-intro">执行状态：${esc(STATUS[r.status] || "未记录")}。内容是否可交付，请结合自评依据与人工判断。</p>`;
    if(r.result?.delivery?.schemaVersion===2){
      const d=r.result.delivery;
      const labels={delivered:'完整交付',partial_delivered:'部分交付',unchanged:'未产生新改动',needs_detail:'待补信息',blocked:'被阻止',failed:'失败',quota_denied:'额度不足',running:'处理中',unconfirmed:'未确认',unknown:'未知'};
      const persistence={confirmed:'服务端已确认保存',not_persisted:'未确认保存',returned_only:'仅返回结果，未保存',unknown:'保存状态未知'};
      h+=`<section class="input-section"><h2>最终交付</h2><p class="prose">${esc(labels[d.outcome]||'未知')} · ${esc(persistence[d.persistence]||'未知')} · 本代新修改 ${d.deliveredCount==null?'未记录':esc(String(d.deliveredCount))} 处</p><p class="safety-note">代次 ${esc(d.generationId||'未记录')} · Trace ${esc(d.traceId||'未记录')}${d.reasonCode?` · 原因 ${esc(d.reasonCode)}`:''}。模型执行状态与最终交付分开；这条回执不代表 PDF 已验收。</p></section>`;
    }
    if (r.result?.error)
      h += `<p class="notice-inline">${esc(r.result.error)}</p>`;
    h +=
      r.result?.output != null
        ? `<h2>本次结果</h2><p class="safety-note">文本输出；不代表原简历版式或 PDF 验收通过。</p><article class="document">${esc(text(r.result.output))}</article>`
        : missing(
            "未保存可展示的结果正文",
            r.status === "blocked"
              ? "本轮被拦截。请看失败阶段，不把失败解释成用户缺材料。"
              : "历史元数据不包含结果正文。",
          );
    if (r.result?.nextAction)
      h += `<section class="input-section"><h2>下一步</h2><p class="prose">${esc(r.result.nextAction)}</p></section>`;
    if (r.result?.rawResponse)
      h += `<details class="raw"><summary>原始响应与逐条修改</summary>${payload(r.result.rawResponse)}</details>`;
  }
  if (tab === "eval") {
    const e = r.evaluation;
    h += "<h2>LLM 评估依据</h2>";
    h += e
      ? `<p class="source-note">${esc(e.model || "模型未记录")} · ${esc(e.rubricVersion || "量表版本未记录")}</p><div class="prose">${esc(e.reason || "原因未记录")}</div>${e.criteria?.length ? `<div class="criteria">${e.criteria.map((c) => `<div class="eval-line"><strong>${esc(c.name || "未命名维度")}</strong><span>${esc(c.score ?? "—")} / ${esc(c.maxScore ?? "—")}</span><p>${esc(c.reason || "原因未记录")}</p></div>`).join("")}</div>` : ""}`
      : missing("没有 LLM 自评记录");
    h += "<h2>程序规则检查</h2>";
    if (r.ruleQuality) {
      h += `<p class="safety-note">规则加总 ${esc(r.ruleQuality.score ?? "—")} / 100。此分不是 LLM 自评，也不代表整稿质量通过。</p>`;
      for (const [key, label] of Object.entries({
        grounding: "事实与引用规则",
        independentReview: "独立候选复核",
        shortBullets: "短句长度规则",
        ats: "文本解析规则",
      })) {
        const value = r.ruleQuality[key];
        h += `<div class="eval-line"><span>${label}</span><span>${value === true ? "通过" : value === false ? "未通过" : "未记录"}</span></div>`;
      }
    } else h += missing("规则检查分未记录");
    if (r.limitations?.length)
      h += `<h3>证据边界</h3><ul>${r.limitations.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`;
    h += `<details class="raw"><summary>查看完整记录字段</summary>${payload(exportBundle([r]))}</details>`;
  }
  $("panel").innerHTML = h;
  $("panel")
    .querySelectorAll("[data-span]")
    .forEach((b) =>
      b.addEventListener("click", () => {
        spanId = b.dataset.span;
        renderPanel();
      }),
    );
  if (tab === "trace") bindTrace(r);
}

function bindTrace(run) {
  const panel = $("panel");
  panel.querySelectorAll("[data-trace-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      traceMode = button.dataset.traceMode;
      renderPanel();
    });
  });
  panel.querySelectorAll("[data-flow-node]").forEach((button) => {
    button.addEventListener("click", () => {
      traceFlowId = button.dataset.flowNode;
      traceFlowFull = false;
      tracePane = ["context", "input"].includes(traceFlowId) ? "input" : "output";
      renderPanel();
      panel.querySelector('[data-flow-node][aria-pressed="true"]')?.focus();
    });
  });
  panel.querySelector("[data-flow-full]")?.addEventListener("click", () => {
    traceFlowFull = !traceFlowFull;
    if (traceFlowFull) tracePane = ["context", "input"].includes(traceFlowId) ? "input" : "output";
    renderPanel();
  });
  panel.querySelector("[data-trace-runs]")?.addEventListener("click", () => {
    traceRuns = !traceRuns;
    renderPanel();
    if (traceRuns) $("search").focus();
  });
  panel.querySelectorAll("[data-trace-pane]").forEach((button) => {
    const choose = (pane) => {
      tracePane = pane;
      renderPanel();
      panel.querySelector(`[data-trace-pane="${pane}"]`)?.focus();
    };
    button.addEventListener("click", () => choose(button.dataset.tracePane));
    button.addEventListener("keydown", (event) => {
      const panes = ["output", "input", "meta", "raw"];
      let index = panes.indexOf(tracePane);
      if (event.key === "ArrowRight") index = (index + 1) % panes.length;
      else if (event.key === "ArrowLeft") index = (index + panes.length - 1) % panes.length;
      else if (event.key === "Home") index = 0;
      else if (event.key === "End") index = panes.length - 1;
      else return;
      event.preventDefault();
      choose(panes[index]);
    });
  });
  panel.querySelector("[data-trace-issue]")?.addEventListener("click", () => {
    const issues = run.spans.filter(spanHasIssue);
    const index = issues.findIndex((span) => span.id === spanId);
    spanId = issues[(index + 1) % issues.length]?.id ?? spanId;
    tracePane = "output";
    traceQuery = "";
    renderPanel();
    panel.querySelector('[data-span][aria-pressed="true"]')?.focus();
  });
  panel.querySelector("[data-trace-assessment]")?.addEventListener("click", () => {
    traceAssessment = !traceAssessment;
    renderPanel();
    if (traceAssessment) $("verdict").focus();
  });
  panel.querySelectorAll("[data-trace-layout]").forEach((button) => {
    button.addEventListener("click", () => {
      traceLayout = button.dataset.traceLayout;
      renderPanel();
      panel.querySelector(`[data-trace-layout="${traceLayout}"]`)?.focus();
    });
  });
  panel.querySelector("#trace-search")?.addEventListener("input", (event) => {
    const { selectionStart } = event.target;
    traceQuery = event.target.value.slice(0, 200);
    renderPanel();
    const search = panel.querySelector("#trace-search");
    search?.focus();
    try { search?.setSelectionRange(selectionStart, selectionStart); } catch {}
  });
  panel.querySelector(".trace-nodes")?.addEventListener("keydown", (event) => {
    const nodes = [...panel.querySelectorAll("[data-span]")];
    const active = event.target.closest("[data-span]");
    if (!active) return;
    let index = nodes.indexOf(active);
    if (event.key === "ArrowDown") index = Math.min(index + 1, nodes.length - 1);
    else if (event.key === "ArrowUp") index = Math.max(0, index - 1);
    else if (event.key === "Home") index = 0;
    else if (event.key === "End") index = nodes.length - 1;
    else return;
    event.preventDefault();
    nodes[index]?.focus();
  });
}
function renderAssessment() {
  const r = current(),
    e = r.evaluation;
  let h = "<h2>LLM 自评</h2>";
  if (e) {
    const label =
      e.source === "llm_self_eval"
        ? "模型对本次产物的自评"
        : e.source === "independent_llm"
          ? "独立 LLM 评审"
          : "评估来源未声明";
    h += `<div class="score-line"><strong>${esc(e.score ?? "—")}</strong><span>/ ${esc(e.maxScore)}</span></div><p class="source-note">${label} · 非人工结论</p>${e.groundingVeto ? '<p class="notice-inline">模型标记事实风险 · 请对照原文核实</p>' : ""}<h3>${esc(PROBLEMS[e.problemType] || "尚未分类")}</h3><p class="reason">${esc(e.reason || "未记录具体原因")}</p><h3>还缺什么信息</h3>${e.missingInformation.length ? `<ul>${e.missingInformation.map((x) => `<li>${esc(text(x))}</li>`).join("")}</ul>` : '<p class="muted">评估未列出需要用户补充的信息。</p>'}`;
  } else {
    const inProgress = ["running", "pending"].includes(r.evaluationStatus);
    const heading = inProgress
      ? "自评进行中"
      : r.evaluationStatus === "not_requested"
        ? "本轮未请求自评"
        : "尚未采集";
    h += `<div class="evaluation-missing"><strong>${heading}</strong><p>${inProgress ? "正在等待本轮实际模型响应，不提前填入分数。" : r.evaluationError ? esc(r.evaluationError) : "这条记录没有 LLM 自评分数和原因。程序规则分单独保留，不代填。"}</p></div>`;
  }
  if (r.ruleQuality)
    h += `<p class="safety-note">另有程序规则分 ${esc(r.ruleQuality.score ?? "—")} / 100，可在“评估依据”查看。</p>`;
  $("assessment").innerHTML = h;
}
const labelOf = (pairs) => Object.fromEntries(pairs);
const FB_LABELS = {
  category: labelOf(FEEDBACK_CATEGORIES),
  verdict: labelOf(FEEDBACK_VERDICTS),
};
const FEEDBACK_KEY = "yizhi-eval-feedback-draft";
const feedbackKey = (id) => `${FEEDBACK_KEY}:${id}`;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** A bounded recent list must not discard a deep-linked experiment on reload.
 * This is metadata only; select() must still fetch the actual run from the API. */
export function restoreSelection(items, preferred) {
  if (!preferred || items.some((r) => r.id === preferred)) return items;
  if (!UUID.test(preferred)) return items;
  return [{id:preferred,label:"上次查看的运行",status:"unknown",provenance:"production",
    spans:[],knowledge:[],result:{},evaluation:null,detailAvailable:true},...items];
}
export const WHOLE_TARGET = "whole";
/** 反馈对象编码：整稿不带修改 ID，具体修改只带这条运行记录里真实存在的 ID。 */
export function parseTarget(value) {
  const raw = String(value ?? "");
  if (!raw.startsWith("change:")) return { scope: "whole_document", changeId: null };
  const id = raw.slice("change:".length).trim();
  return id ? { scope: "change", changeId: id } : { scope: "whole_document", changeId: null };
}
let feedbackLoadError = null;
function feedbackBlock(reason) {
  return { cloud: false, reason };
}
function feedbackAccess() {
  const r = current();
  if (!r) return feedbackBlock("请先选择一条运行。");
  if (r.provenance === "synthetic")
    return feedbackBlock("演示运行是虚构样本，不写入正式反馈；人工判断仍可保存到本机。");
  if (loadedSource !== "production")
    return feedbackBlock("本地导入的记录只在当前标签页解析，不能提交到后台；请从益职同域的管理员入口读取正式运行。");
  if (!UUID.test(r.id))
    return feedbackBlock("这条记录的编号不是正式运行 ID，后台不接受，请刷新后重试。");
  return { cloud: true, reason: "" };
}
function resetFeedback(id) {
  ++feedbackContext;
  ++feedbackSequence;
  feedbacks = [];
  feedbackBusy = false;
  feedbackLoadError = null;
  feedbackStatus = null;
  feedbackDraft = null;
  try {
    const raw = sessionStorage.getItem(feedbackKey(id));
    const saved = raw ? JSON.parse(raw) : null;
    // 草稿按运行隔离；切回原记录仍可继续，不把内容带给另一个运行。
    if (saved && saved.runId === id) feedbackDraft = saved;
  } catch {}
}
function persistFeedbackDraft() {
  try {
    sessionStorage.setItem(feedbackKey(feedbackDraft.runId), JSON.stringify(feedbackDraft));
  } catch {}
}
function captureDraft() {
  if (!current() || !feedbackAccess().cloud || feedbackBusy || feedbackDraft?.pending) return;
  feedbackDraft = {
    id: feedbackDraft?.id || crypto.randomUUID(),
    runId: current().id,
    target: $("fb-target").value,
    category: $("fb-category").value,
    verdict: $("fb-verdict").value,
    note: $("fb-note").value,
    expected: $("fb-expected").value,
  };
  persistFeedbackDraft();
  // 一旦又改了内容，上一条确认信息就不该继续挂在状态行上冒充本次结果。
  feedbackStatus = null;
}
function feedbackListHTML(items) {
  if (!items.length)
    return `<p class="empty-list">这条正式运行还没有后台反馈记录。列表只反映服务器返回的内容。</p>`;
  return items
    .map(
      (f) =>
        `<article class="feedback-item"><header><strong>${esc(FB_LABELS.category[f.category] || "类别未记录")}</strong><span class="verdict ${esc(f.verdict)}">${esc(FB_LABELS.verdict[f.verdict] || "结论未记录")}</span><span class="muted">${esc(date(f.createdAt))}</span></header><p class="feedback-target">${esc(f.scope === "change" ? `具体修改 ${f.changeId || "未记录"}` : "整份简历")} · 编号 ${esc(f.id)}</p><p class="prose">${esc(f.note)}</p>${f.expected ? `<p class="muted">期望：${esc(f.expected)}</p>` : ""}</article>`,
    )
    .join("");
}
function renderFeedback() {
  const r = current();
  if (!r) return;
  const access = feedbackAccess();
  const target = $("fb-target"),
    category = $("fb-category"),
    verdict = $("fb-verdict");
  if (!category.options.length) {
    category.innerHTML = FEEDBACK_CATEGORIES.map(
      ([value, label]) => `<option value="${esc(value)}">${esc(label)}</option>`,
    ).join("");
    verdict.innerHTML = FEEDBACK_VERDICTS.map(
      ([value, label]) => `<option value="${esc(value)}">${esc(label)}</option>`,
    ).join("");
  }
  const changes = changeOptions(r);
  const options = [
    [
      WHOLE_TARGET,
      changes.length ? "整份简历（不针对某一条修改）" : "整份简历（本次没有可反馈的具体修改）",
    ],
    ...changes.map((c) => [`change:${c.id}`, `${c.section} · ${c.id.slice(0, 8)}`]),
  ];
  target.innerHTML = options
    .map(
      ([value, label]) =>
        `<option value="${esc(value)}">${esc(label)}</option>`,
    )
    .join("");
  const kept =
    feedbackDraft?.runId === r.id &&
    options.some(([value]) => value === feedbackDraft.target)
      ? feedbackDraft.target
      : WHOLE_TARGET;
  target.value = kept;
  if (feedbackDraft?.runId === r.id) {
    category.value = feedbackDraft.category || category.value;
    verdict.value = feedbackDraft.verdict || verdict.value;
    $("fb-note").value = feedbackDraft.note || "";
    $("fb-expected").value = feedbackDraft.expected || "";
  } else {
    category.value = FEEDBACK_CATEGORIES[0][0];
    verdict.value = FEEDBACK_VERDICTS[0][0];
    $("fb-note").value = "";
    $("fb-expected").value = "";
  }
  const whole = parseTarget(target.value);
  const locked = feedbackBusy || !!feedbackDraft?.pending;
  target.disabled = !access.cloud || changes.length === 0 || locked;
  for (const id of ["fb-category", "fb-verdict", "fb-note", "fb-expected"])
    $(id).disabled = !access.cloud || locked;
  $("fb-save").disabled = !access.cloud || feedbackBusy;
  $("fb-save").textContent = feedbackBusy ? "正在保存…" : feedbackDraft?.pending ? "确认上次提交" : "保存到后台";
  $("fb-target-id").textContent = whole.changeId
    ? `运行 ${r.id} · 修改 ${whole.changeId}`
    : `运行 ${r.id} · 整份简历`;
  $("fb-intro").textContent = access.cloud
    ? "指出这一条改稿的具体问题，保存到管理员后台供下一轮改进。"
    : access.reason;
  $("fb-status").textContent =
    feedbackLoadError ||
    feedbackStatus ||
    (feedbackDraft?.pending ? "上次提交结果尚未确认，原内容与编号已保留。请先确认上次提交，再填写新反馈。" : "") ||
    "未提交的反馈只留在当前标签页；只有服务器确认后才会显示已保存。";
  $("fb-list").innerHTML = access.cloud
    ? feedbackListHTML(feedbacks)
    : `<p class="empty-list">未连接正式运行，不显示反馈列表。</p>`;
}
async function loadFeedback(id) {
  const seq = ++feedbackSequence;
  if (!feedbackAccess().cloud) {
    renderFeedback();
    return;
  }
  try {
    const data = await adminApi(`/api/admin/eval-feedback?runId=${encodeURIComponent(id)}`);
    if (seq !== feedbackSequence || selected !== id) return;
    feedbacks = data.cases || [];
    feedbackLoadError = null;
  } catch (e) {
    if (seq !== feedbackSequence || selected !== id) return;
    feedbacks = [];
    feedbackLoadError = `${e.message} 列表留空，不会用演示数据顶替。`;
  }
  renderFeedback();
}
async function saveFeedback() {
  const r = current();
  if (!r || feedbackBusy || !feedbackAccess().cloud) return;
  captureDraft();
  const context = feedbackContext;
  const stillHere = () => feedbackContext === context && selected === r.id;
  const whole = parseTarget(feedbackDraft.target);
  let body;
  try {
    body = feedbackDraft.pending || feedbackPayload({
      id: feedbackDraft.id,
      runId: r.id,
      scope: whole.scope,
      changeId: whole.changeId,
      category: feedbackDraft.category,
      verdict: feedbackDraft.verdict,
      note: feedbackDraft.note,
      expected: feedbackDraft.expected,
    });
  } catch (e) {
    feedbackBusy = false;
    feedbackStatus = e.message;
    renderFeedback();
    toast(e.message, true);
    return;
  }
  feedbackBusy = true;
  ++feedbackSequence; // 不让提交前的列表响应抹掉刚保存的记录。
  feedbackDraft.pending = body;
  persistFeedbackDraft();
  feedbackStatus = "正在提交，只有服务器确认后才会显示已保存。";
  renderFeedback();
  try {
    const data = await adminApi("/api/admin/eval-feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (data.feedback?.id !== body.id || data.feedback?.runId !== body.runId ||
        data.feedback?.changeId !== body.changeId || data.feedback?.scope !== body.scope)
      throw Error("后台返回的反馈编号不一致，尚未确认保存，请重试核对。");
    try {
      const stored = JSON.parse(sessionStorage.getItem(feedbackKey(r.id)) || "null");
      if (stored?.id === body.id) sessionStorage.removeItem(feedbackKey(r.id));
    } catch {}
    if (!stillHere()) return;
    feedbacks = [data.feedback, ...feedbacks.filter((x) => x.id !== data.feedback.id)];
    feedbackLoadError = null;
    feedbackStatus = data.replayed
      ? "这条反馈此前已保存，服务器没有重复写入。"
      : `后台已保存 · ${date(data.feedback.createdAt)}`;
    feedbackDraft = null;
    $("fb-note").value = "";
    $("fb-expected").value = "";
    toast("案例反馈已保存到后台");
  } catch (e) {
    if (!stillHere()) return;
    if ([400, 401, 403, 404, 409].includes(e.status)) {
      delete feedbackDraft.pending;
      feedbackDraft.id = crypto.randomUUID();
      persistFeedbackDraft();
    }
    // 失败保留输入，编号不变；重试命中服务端幂等，不产生第二条反馈。
    feedbackStatus = feedbackDraft.pending
      ? `${e.message} 原内容和编号已保留，请点“确认上次提交”，不会重复写入。`
      : `${e.message} 内容已保留，可以调整后重新提交。`;
    toast(e.message, true);
  } finally {
    if (!stillHere()) return;
    feedbackBusy = false;
    renderFeedback();
  }
}
async function adminApi(path, options) {
  const response = await fetch(path, {
    ...options,
    credentials: "same-origin",
    cache: "no-store",
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw Error("服务器没有返回有效 JSON，请重试。");
  }
  const fail = (message) => { const error = Error(message); error.status = response.status; throw error; };
  if (response.status === 401) fail("登录已失效，请返回益职登录后再试。");
  if (response.status === 403) fail("当前账号没有管理员权限，内容未保存到云端。");
  if (response.status === 503) throw Error(data.error || "后台暂时不可用，内容已保留，可以重试。");
  if (!response.ok || data.ok !== true)
    fail(data.error || `后台未确认（${response.status}）。`);
  return data;
}
const STRATEGY = {
  independent: "独立复核",
  self_review: "作者自查",
  format_only: "仅格式",
};
const FORMAT_POLICY = {
  preserve: "保留原稿版式",
  repair: "修复版式",
  standard: "标准版式",
};
const SPLIT = { development: "开发集", holdout: "留出集" };
function compareNote(runs) {
  const n = runs.length;
  const counts = runs.reduce(
    (acc, r) => ((acc[r.status] = (acc[r.status] || 0) + 1), acc),
    {},
  );
  return `N=${n} 次运行（${Object.entries(counts)
    .map(([k, v]) => `${STATUS[k] || "状态未记录"} ${v}`)
    .join(" · ")}）。这是小样本描述，失败与超时都算在内，只用于比较趋势，不构成统计结论，也不按耗时或规则分选冠军。`;
}
function runRowHTML(run) {
  const e = run.experiment || {},
    m = run.metrics || {};
  const score = run.evaluation?.score ?? run.evaluation?.result ?? null;
  return `<tr><th scope="row"><span class="compare-run"><strong>${esc(run.label || run.id)}</strong>${statusHTML(run.status)}</span><span class="compare-flags">${esc(STRATEGY[e.strategy] || e.strategy || "策略未记录")} · ${esc(FORMAT_POLICY[e.formatPolicy] || e.formatPolicy || "格式口径未记录")} · 样本 ${esc(e.fixtureId || "未记录")} · ${esc(SPLIT[e.split] || e.split || "分档未记录")} · 重复 ${esc(metricCell(e, "repeat"))}${e.phase ? ` · ${esc(e.phase)}` : ""}</span></th>${METRIC_COLUMNS.map(
    ([key, label, kind]) =>
      `<td data-label="${esc(label)}">${esc(metricCell(m, key, kind))}</td>`,
  ).join("")}<td data-label="LLM 自评">${score == null ? "未记录" : `${esc(String(score))}${run.evaluation?.rubricVersion ? ` · ${esc(run.evaluation.rubricVersion)}` : ""}`}</td><td data-label="整稿一致">${esc(metricCell(m, "formatVerified", "flag"))}</td><td data-label="PDF 导出">${esc(metricCell(m, "pdfVerified", "flag"))}</td><td data-label="落库验证">${esc(metricCell(m, "persistenceVerified", "flag"))}</td><td data-label="证据"><button class="text-button" type="button" data-evidence="${esc(run.id)}">查看输入输出</button>${run.resumeTraceId ? `<span class="muted">Trace ${esc(String(run.resumeTraceId).slice(0, 8))}</span>` : "<span class=\"muted\">Trace 未记录</span>"}</td></tr>`;
}
export function externalReviewHTML(runs) {
  const reviewed = runs.filter((r) => r.externalReview);
  if (!reviewed.length) return '<p class="safety-note">外部盲评尚未记录；不由规则分或 LLM 自评分代替。</p>';
  return `<section class="external-reviews"><h2>外部盲评</h2><p class="safety-note">用户交付的匿名候选审阅，与 LLM 自评分开记录。逐条保留证据、未知与顺序分歧；小样本不设总分冠军。原稿已清楚时，正确保留不因“改得少”判失败。</p>${reviewed.map((r) => {
    const review = r.externalReview;
    return `<details class="knowledge"><summary>${esc(r.label || r.id)} · ${review.groundingVeto === true ? "事实硬风险" : "未标出事实硬风险"}${review.orderSwapConsistent === false ? " · 换序评分有分歧" : ""}</summary><p class="prose">${esc(review.evidence)}</p><dl>${(review.dimensions || []).map((d) => `<dt>${esc(d.name)} · ${esc(d.score)} / ${esc(d.maxScore)}</dt><dd>${esc(d.reason)}</dd>`).join("")}</dl>${(review.unknown || []).map((note) => `<p class="muted">未知 / 限制：${esc(note)}</p>`).join("")}<p class="feedback-target">运行 ${esc(r.id)} · 匿名候选 ${esc(review.caseKey)}:${esc(review.tag)}</p></details>`;
  }).join("")}</section>`;
}
function renderBatch(caption) {
  $("batch-detail").innerHTML = caption;
}
function closeCompare() {
  compareMode = false;
  document.body.classList.remove("compare-on");
  $("compare").hidden = true;
  if (current()) {
    $("detail").hidden = false;
    $("empty").hidden = true;
  } else {
    $("detail").hidden = true;
    $("empty").hidden = false;
  }
}
async function loadBatch(id) {
  const seq = ++compareSequence;
  $("compare-caption").textContent = "正在读取批次结果…";
  renderBatch(missing("正在读取", "只读取已完成的实验批次，不会触发模型调用。"));
  try {
    const data = await adminApi(`/api/admin/eval-experiments?id=${encodeURIComponent(id)}`);
    if (seq !== compareSequence || !compareMode) return;
    const runs = data.runs || [];
    const head = `<p class="safety-note">${esc(runs.length ? compareNote(runs) : "这个批次没有运行记录；可能是批次启动即失败，不补造结果。")}</p>`;
    const table = runs.length
      ? `<div class="compare-scroll"><table class="compare-table"><caption class="sr-caption">离线评测批次的运行结果与模型调用开销</caption><thead><tr><th scope="col">运行 / 样本</th>${METRIC_COLUMNS.map(
          ([key, label]) => `<th scope="col">${esc(label)}</th>`,
        ).join("")}<th scope="col">LLM 自评</th><th scope="col">整稿一致</th><th scope="col">PDF 导出</th><th scope="col">落库验证</th><th scope="col">证据</th></tr></thead><tbody>${runs.map(runRowHTML).join("")}</tbody></table></div>`
      : "";
    renderBatch(
      `${head}<p class="safety-note">流程版本：${esc(data.batch?.config?.workflow || "未记录")}。成本列为离线评测的模型调用开销：估价按计价表推算，实扣与计费口径单独成列，未记录就写未记录。用户在工作区触发的真实运行计费不在此表。</p>${table}${table ? `<p class="footnote">「整稿一致 / PDF 导出 / 落库验证」取自该次运行实际采集的标记；未实际导出的 PDF 记为未验证，不代表版式或导出通过。</p>` : ""}${externalReviewHTML(runs)}`,
    );
    $("batch-detail")
      .querySelectorAll("[data-evidence]")
      .forEach((b) => {
        b.addEventListener("click", () => void openRunEvidence(b.dataset.evidence));
      });
    $("compare-caption").textContent = `${data.batch?.label || id} · ${STATUS[data.batch?.status] || data.batch?.status || "状态未记录"}`;
  } catch (e) {
    if (seq !== compareSequence || !compareMode) return;
    renderBatch(`<p class="notice-inline">${esc(e.message)}</p>`);
    $("compare-caption").textContent = "批次读取失败";
  }
}
async function openCompare() {
  compareMode = true;
  document.body.classList.add("compare-on");
  $("detail").hidden = true;
  $("empty").hidden = true;
  $("compare").hidden = false;
  const picker = $("batch-select");
  if (!live) {
    // 预览地址没有同域后台，明确说明而不是拿演示数据冒充批次。
    picker.innerHTML = '<option value="">未连接正式数据</option>';
    picker.disabled = true;
    $("compare-caption").textContent = "界面预览 · 未连接正式数据";
    renderBatch(
      missing(
        "方案对比需要同域后台",
        "这里是界面预览，没有正式实验批次可读。正式入口是益职同域的管理员页面；预览里不展示演示批次。",
      ),
    );
    return;
  }
  const seq = ++compareSequence;
  picker.innerHTML = '<option value="">正在读取…</option>';
  picker.disabled = true;
  renderBatch(
    missing("正在读取批次", "只读取已完成的实验批次，不会触发模型调用。"),
  );
  try {
    const data = await adminApi("/api/admin/eval-experiments");
    if (seq !== compareSequence || !compareMode) return;
    const batches = data.batches || [];
    if (!batches.length) {
      picker.innerHTML = '<option value="">暂无实验批次</option>';
      renderBatch(
        missing(
          "还没有实验批次",
          "后台没有已记录的方案实验。这里不补造对比数据。",
        ),
      );
      $("compare-caption").textContent = "暂无批次";
      return;
    }
    picker.innerHTML = batches
      .map(
        (b) =>
          `<option value="${esc(b.id)}">${esc(b.label || b.id)} · ${esc(STATUS[b.status] || b.status || "状态未记录")} · ${esc(date(b.createdAt))}</option>`,
      )
      .join("");
    picker.disabled = false;
    await loadBatch(batches[0].id);
  } catch (e) {
    if (seq !== compareSequence || !compareMode) return;
    picker.innerHTML = '<option value="">批次读取失败</option>';
    renderBatch(`<p class="notice-inline">${esc(e.message)}</p>`);
    $("compare-caption").textContent = "批次读取失败";
  }
}
async function openRunEvidence(id) {
  const seq = ++compareSequence;
  try {
    const data = await api(`?id=${encodeURIComponent(id)}`);
    if (seq !== compareSequence || !compareMode) return;
    const full = parseImport(JSON.stringify(data))[0];
    if (!full || full.id !== id) {
      toast("这条实验运行没有返回对应的完整证据，未载入本页。", true);
      return;
    }
    runs = [full, ...runs.filter((x) => x.id !== full.id)];
    loadedSource = "production";
    closeCompare();
    await select(full.id);
    notice("实验运行的完整证据 · 只读查看，不会重新调用模型");
  } catch (e) {
    if (seq !== compareSequence || !compareMode) return;
    toast(e.message, true);
  }
}
function showData(data, source) {
  const normalized = parseImport(JSON.stringify(data));
  runs = normalized;
  loadedSource = source;
  selected = null;
  spanId = null;
  renderList();
  if (runs.length) select(runs[0].id);
}
function demo() {
  if (loadedSource === "production")
    notice("已切换演示 · 以下均为虚构样本，不计入正式运行");
  else notice("演示模式 · 全部为虚构样本，没有真实模型调用");
  showData(samples, "demo");
  $("connection").textContent = "演示数据";
  $("connection").classList.remove("live");
}
async function api(query = "", options) {
  const response = await fetch(`/api/admin/eval-runs${query}`, {
    ...options,
    credentials: "same-origin",
    cache: "no-store",
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw Error("服务器没有返回有效 JSON，请重试。");
  }
  if (!response.ok) {
    if (response.status === 401)
      throw Error("登录已失效，请返回益职登录后再读取。");
    throw Error(data.error || `读取失败（${response.status}）`);
  }
  return data;
}
async function refresh() {
  if (!live) {
    toast("正式数据请到益职管理员入口查看；这里可导入本地 JSON。");
    return;
  }
  if (loading) return;
  loading = true;
  $("refresh").disabled = true;
  try {
    const data = await api();
    runs = [
      ...(data.captured || []).map((r) => ({
        id: r.id,
        label: r.label,
        status: r.status,
        startedAt: r.created_at,
        durationMs: null,
        provenance: "production",
        spans: [],
        knowledge: [],
        result: {},
        evaluation: null,
        detailAvailable: true,
      })),
      ...parseLegacyRows(data.traces || []),
    ].sort(
      (a, b) =>
        Number(b.format !== "resume_trace_v1") -
          Number(a.format !== "resume_trace_v1") ||
        (Date.parse(b.startedAt) || 0) - (Date.parse(a.startedAt) || 0),
    );
    loadedSource = "production";
    const requestedRun = new URLSearchParams(location.search).get("run");
    if (requestedRun && !UUID.test(requestedRun)) {
      notice("运行编号无效，未改用其他记录代替", true);
      $("detail").hidden = true;
      $("empty").hidden = false;
      $("empty-action").textContent = "返回列表";
      loading = false;
      return;
    }
    $("connection").textContent = "管理员数据已连接";
    $("connection").classList.add("live");
    notice("正式管理员记录 · 只读查看，不会自动调用模型");
    renderList();
    let last = new URLSearchParams(location.search).get("run");
    if (!last) {
      try {
        last = sessionStorage.getItem("yizhi-eval-selected");
      } catch {}
    }
    // A bounded list is not an existence check. select() reads this exact ID,
    // including a real historical run not present in the latest 20 items.
    const preferred = requestedRun || selected || last;
    runs = restoreSelection(runs, preferred);
    const id = runs.find((r) => r.id === preferred)?.id || runs[0]?.id;
    renderList();
    loading = false;
    if (id) await select(id);
    else {
      $("detail").hidden = true;
      $("empty").hidden = false;
      $("empty-action").textContent = "新建第一次实测";
    }
  } catch (e) {
    notice(e.message, true);
    toast(e.message, true);
  } finally {
    loading = false;
    $("refresh").disabled = false;
  }
}
function parseLegacyRows(rows) {
  return rows.length ? parseImport(JSON.stringify({ traces: rows })) : [];
}
function download(name, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    }),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function importRaw(raw) {
  const next = parseImport(raw);
  runs = next;
  loadedSource = "imported";
  selected = null;
  renderList();
  select(runs[0].id);
  notice("本地导入 · 正文仅存在当前标签页，未发送到服务器");
  $("connection").textContent = "本地导入";
  $("connection").classList.remove("live");
  $("import-dialog").close();
  $("json-input").value = "";
  $("import-error").textContent = "";
  toast(`已导入 ${runs.length} 条运行`);
}
async function importFile(file) {
  if (!file) return;
  if (file.size > MAX_BYTES) {
    toast("文件超过5MB，请拆分后导入。", true);
    return;
  }
  try {
    importRaw(await file.text());
  } catch (e) {
    $("import-error").textContent = e.message;
    toast(e.message, true);
  }
}
export function boot() {
  const query = new URLSearchParams(location.search);
  live = query.get("live") === "1";
  // Internal acceptance link: exercises the ordinary authenticated business API,
  // not a second rewrite implementation. Never runs automatically on load.
  workspaceEntry = live && query.get("workspace-entry") === "1";
  if (live) {
    try {
      uncertainId = sessionStorage.getItem("yizhi-eval-pending");
    } catch {}
  }
  $("import").onclick = () => $("import-dialog").showModal();
  $("choose-file").onclick = () => $("file").click();
  $("paste-import").onclick = () => {
    try {
      importRaw($("json-input").value);
    } catch (e) {
      $("import-error").textContent = e.message;
    }
  };
  $("file").onchange = (e) => {
    importFile(e.target.files[0]);
    e.target.value = "";
  };
  $("demo").onclick = demo;
  $("empty-demo").onclick = demo;
  $("refresh").onclick = async () => {
    await refresh();
    reconcilePending();
  };
  $("empty-action").onclick = () =>
    live && runs.length === 0 && loadedSource === "production"
      ? openNewRun()
      : live
        ? refresh()
        : $("import-dialog").showModal();
  $("search").oninput = renderList;
  $("filter").onchange = renderList;
  document.querySelectorAll("[data-tab]").forEach((b, index, buttons) => {
    b.addEventListener("click", () => {
      tab = b.dataset.tab;
      renderDetail();
    });
    b.addEventListener("keydown", (e) => {
      if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
        e.preventDefault();
        const next =
          e.key === "Home"
            ? 0
            : e.key === "End"
              ? buttons.length - 1
              : (index + (e.key === "ArrowRight" ? 1 : -1) + buttons.length) %
                buttons.length;
        buttons[next].click();
        buttons[next].focus();
      }
    });
  });
  $("help").onclick = () => $("help-dialog").showModal();
  document
    .querySelectorAll(".close-dialog")
    .forEach((b) => (b.onclick = () => b.closest("dialog").close()));
  $("new-run").onclick = () => {
    if (!live) {
      toast("真实实测请打开益职正式站的管理员入口。", true);
      return;
    }
    openNewRun();
  };
  $("template").onclick = () =>
    download("yizhi-eval-template.json", {
      schemaVersion: VERSION,
      runs: [
        {
          id: "replace-with-your-run-id",
          label: "本次运行名称",
          provenance: "imported",
          status: "unknown",
          input: null,
          spans: [],
          knowledge: [],
          result: { status: "unknown", output: null },
          evaluation: null,
          limitations: [
            "这是待填写模板，没有运行或自评证据。请仅填实际采集字段，缺失项保持 null。",
          ],
        },
      ],
    });
  $("copy-id").onclick = async () => {
    try {
      await navigator.clipboard.writeText(selected);
      toast("运行 ID 已复制");
    } catch {
      toast("复制未成功，可直接选中运行 ID 复制。", true);
    }
  };
  $("save-review").onclick = () => {
    const r = current();
    if (!r) return;
    const value = {
      verdict: $("verdict").value,
      note: $("review-note").value,
      savedAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem(`yizhi-eval-review:${r.id}`, JSON.stringify(value));
      reviews[r.id] = value;
      $("review-status").textContent = "已保存在本机 · 刷新后仍保留";
      toast("人工判断已保存到本机");
    } catch {
      toast("浏览器未允许保存；备注仍在输入框，可导出备份。", true);
    }
  };
  $("review-note").addEventListener("input", () => {
    if (selected) {
      reviews[selected] = {
        verdict: $("verdict").value,
        note: $("review-note").value,
      };
      $("review-status").textContent = "未保存到本机 · 切换环节仍保留";
    }
  });
  $("verdict").addEventListener("change", () => {
    if (selected) {
      reviews[selected] = {
        verdict: $("verdict").value,
        note: $("review-note").value,
      };
      $("review-status").textContent = "未保存到本机";
    }
  });
  $("experiments").onclick = () => {
    if (compareMode) closeCompare();
    else void openCompare();
  };
  $("compare-close").onclick = () => closeCompare();
  $("batch-select").onchange = (e) => {
    if (e.target.value) void loadBatch(e.target.value);
  };
  for (const id of ["fb-target", "fb-category", "fb-verdict"])
    $(id).addEventListener("change", () => {
      captureDraft();
      renderFeedback();
    });
  for (const id of ["fb-note", "fb-expected"])
    $(id).addEventListener("input", () => {
      captureDraft();
      if (feedbackDraft)
        $("fb-status").textContent = "未提交，内容只留在当前标签页";
    });
  $("fb-save").onclick = () => void saveFeedback();
  $("fb-copy").onclick = async () => {
    try {
      await navigator.clipboard.writeText($("fb-target-id").textContent);
      toast("运行与修改编号已复制");
    } catch {
      toast("复制未成功，可直接选中编号复制。", true);
    }
  };
  $("export").onclick = () => {
    const r = current();
    if (!r) return;
    const review = { verdict: $("verdict").value, note: $("review-note").value };
    download(
      `eval-${r.id.replace(/[^a-z0-9_-]/gi, "-").slice(0, 70)}.json`,
      exportBundle([r], { [r.id]: review }),
    );
    toast("导出包含本次输入与输出，请妥善保管。");
  };
  $("new-form").onsubmit = async (e) => {
    e.preventDefault();
    if (pendingId || !$("cost-ack").checked) return;
    // A network failure must not force a new billable run. The same UUID is
    // atomically claimed on the server; a replay reads the existing record.
    pendingId = uncertainId || crypto.randomUUID();
    const id = pendingId;
    $("start-run").disabled = true;
    $("new-status").textContent =
      "正在提交真实实测，确认后记录阶段与模型交接。不会改动旧岗位或作答。";
    try {
      sessionStorage.setItem("yizhi-eval-pending", id);
    } catch {}
    const poll = setInterval(async () => {
      try {
        const data = await api(`?id=${id}`);
        const r = parseImport(JSON.stringify(data))[0];
        if (!runs.some((x) => x.id === id)) {
          runs.unshift(r);
          selected = id;
          loadedSource = "production";
          $("detail").hidden = false;
          $("empty").hidden = true;
          $("new-dialog").close();
          renderList();
        }
        if (selected === id) {
          runs = runs.map((x) => (x.id === id ? r : x));
          renderDetail();
        }
      } catch {}
    }, 6000);
    try {
      const submission = {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requestId: id,
          resumeText: $("resume-input").value,
          jobDescription: $("jd-input").value,
          selfEvaluate: !workspaceEntry && $("self-eval").checked,
          label: $("case-name").value,
          acknowledgeCost: true,
          ...(workspaceEntry
            ? {
                evalCaptureId: id,
                evalLabel: $("case-name").value,
                mode: $("jd-input").value.trim()
                  ? "target_resume"
                  : "general_resume",
              }
            : {}),
        }),
      };
      let data;
      if (workspaceEntry) {
        const response = await fetch("/api/coach/resume-draft", {
          ...submission,
          credentials: "same-origin",
        });
        data = await response.json();
        // An actual business failure is also inspectable evidence, not a reason
        // to invent success or resubmit a second model request.
        if (!response.headers.get("x-yizhi-eval-id") && response.status !== 202)
          throw Error(data.error || `业务请求失败（${response.status}）`);
        data = { runs: true };
      } else data = await api("", submission);
      if (data.runs) {
        uncertainId = null;
        try {
          sessionStorage.removeItem("yizhi-eval-pending");
        } catch {}
        $("new-dialog").close();
        await refresh();
        await select(id);
        toast("实测结果已保存；可查看 Agent 实际输入输出。");
      } else {
        $("new-status").textContent =
          "已有这个编号的运行。请刷新记录读取，不要重复提交。";
        await refresh();
        reconcilePending();
      }
    } catch (error) {
      uncertainId = id;
      $("new-status").textContent =
        `${error.message} 编号：${id}。材料仍保留。可刷新核对，或点“核对并重试原编号”；不会重复调用已存在的运行。`;
      await refresh();
      reconcilePending();
    } finally {
      clearInterval(poll);
      pendingId = null;
      $("start-run").disabled = false;
    }
  };
  if (workspaceEntry) {
    $("self-eval").checked = false;
    $("self-eval").disabled = true;
    $("self-eval").closest("label").hidden = true;
    $("new-form").querySelector("p").textContent =
      "业务入口验收：直接调用正式改稿接口，只使用本次样本，不关联旧岗位，不额外调用自评模型。";
  }
  if (live) refresh().then(reconcilePending);
  else {
    notice("界面预览 · 未连接正式数据。正式评测请进入益职同域的管理员入口");
    $("empty-action").textContent = "导入一次运行";
    $("new-run").hidden = true;
    $("refresh").hidden = true;
  }

}
if (typeof document !== "undefined") boot();
