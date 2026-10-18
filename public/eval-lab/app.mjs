import {
  parseImport,
  coverage,
  formatMs,
  exportBundle,
  text,
  STATUS,
  PROBLEMS,
  VERSION,
  MAX_BYTES,
} from "./core.mjs";
import { samples } from "./samples.mjs";
const $ = (id) => document.getElementById(id);
const live = new URLSearchParams(location.search).get("live") === "1";
let runs = [],
  selected = null,
  tab = "trace",
  spanId = null,
  loadedSource = "empty",
  loading = false,
  requestSequence = 0,
  pendingId = null;
let uncertainId = null;
if (live) {
  try {
    uncertainId = sessionStorage.getItem("yizhi-eval-pending");
  } catch {}
}
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
  return `<div class="io-columns"><div class="io-block"><h3>输入 Input</h3>${payload(s.input)}</div><div class="io-block"><h3>输出 Output</h3>${payload(s.output)}</div></div>`;
}
function knowledgeHTML(entries, scopeLabel = "知识库使用") {
  const seen = new Set();
  const k = entries.filter((k) => {
    const key = `${k.id}:${k.included}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return `<details class="knowledge"><summary>${esc(scopeLabel)} <span class="muted">· ${k.length ? `${k.filter((k) => k.included).length} 条实际纳入` : "未记录"}${k.some((k) => !k.included) ? ` / ${k.length} 条候选` : ""}</span></summary>${k.length ? k.map((k) => `<div class="knowledge-entry"><header><strong>${esc(k.title || k.id)}</strong><span class="muted">${k.included ? "已使用" : "未纳入"}</span></header><p>${esc(k.id)}${typeof k.similarity === "number" ? ` · 匹配 ${k.similarity}` : ""}</p>${k.reason ? `<p>${esc(k.reason)}</p>` : ""}${k.excerpt ? `<div class="prose">${esc(k.excerpt)}</div>` : "<p>正文未随 Trace 保存</p>"}</div>`).join("") : missing("未记录知识条目", "这不等于本次没有使用知识；需要以实际采集记录为准。")}</details>`;
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
  selected = id;
  spanId = null;
  const r = current();
  renderList();
  if (r?.detailAvailable) {
    const seq = ++requestSequence;
    loading = true;
    notice("正在读取本次运行的详细证据…");
    try {
      const data = await api(`?id=${encodeURIComponent(id)}`);
      if (seq !== requestSequence) return;
      const full = parseImport(JSON.stringify(data))[0];
      runs = runs.map((x) => (x.id === id ? full : x));
      notice("正式管理员记录 · 只读查看，不会自动调用模型");
    } catch (e) {
      notice(e.message, true);
    } finally {
      loading = false;
    }
  }
  if (current()) {
    renderDetail();
    $("empty").hidden = true;
    $("detail").hidden = false;
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
        ? "益职正式站 · 管理员观察"
        : "本地导入 · 仅当前标签页";
  $("run-status").className = `status ${r.status}`;
  $("run-status").textContent = STATUS[r.status] || "状态未记录";
  $("run-id").textContent = r.id;
  $("run-time").textContent = date(r.startedAt);
  $("run-duration").textContent = `总耗时 ${formatMs(r.durationMs)}`;
  document.querySelectorAll("[data-tab]").forEach((b) => {
    b.setAttribute("aria-selected", b.dataset.tab === tab);
    b.tabIndex = b.dataset.tab === tab ? 0 : -1;
  });
  $("panel").setAttribute("aria-labelledby", `tab-${tab}`);
  renderPanel();
  renderAssessment();
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
  let h = coverageHTML(r);
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
    h +=
      '<p class="section-intro">点击一个阶段，核对它实际拿到了什么、交出了什么。</p>';
    if (!r.spans.length) h += missing("没有阶段记录");
    else {
      const s =
        r.spans.find((x) => x.id === spanId) ||
        r.spans.find((x) => ["failed", "blocked"].includes(x.status)) ||
        r.spans[0];
      spanId = s.id;
      h += `<div class="trace-grid"><div class="stage-list" aria-label="阶段时间线">${r.spans.map((s) => `<button class="stage-button" data-span="${esc(s.id)}" aria-pressed="${s.id === spanId}">${esc(s.name)}<span>${esc(formatMs(s.durationMs))} · ${esc(STATUS[s.status] || "未记录")}</span></button>`).join("")}</div><div class="span-detail"><div class="span-title"><h2>${esc(s.name)}</h2>${statusHTML(s.status)}</div>${s.code ? `<p class="code-label">${esc(s.code)}</p>` : ""}${s.model ? `<p class="code-label">${esc(s.model)}</p>` : ""}${io(s)}${knowledgeHTML(s.knowledge?.length ? s.knowledge : r.knowledge, s.knowledge?.length ? "本阶段知识" : "本次运行知识（未映射到阶段）")}</div></div>`;
    }
  }
  if (tab === "agents") {
    const agents = r.spans.filter((s) => s.agent);
    h +=
      '<p class="section-intro">每次模型调用独立展示。重试保留为单独一次交接，不合并成一次成功。</p>';
    h += agents.length
      ? agents
          .map(
            (s) =>
              `<section class="agent-entry"><div class="span-title"><h2>${esc(s.agent)}</h2>${statusHTML(s.status)}</div><p class="code-label">${esc(s.id)} · ${esc(formatMs(s.durationMs))}${s.model ? ` · ${esc(s.model)}` : ""}${s.parentId ? ` · parent ${esc(s.parentId)}` : ""}</p>${io(s)}${knowledgeHTML(s.knowledge || [], "该 Agent 实际上下文知识")}</section>`,
          )
          .join("")
      : missing(
          "尚未记录 Agent 级输入输出",
          "旧阶段打点不会被当成 Agent 的完整输入输出。新建管理员实测会记录可见消息与响应，不收集隐藏推理。",
        );
  }
  if (tab === "result") {
    h += `<p class="section-intro">执行状态：${esc(STATUS[r.status] || "未记录")}。内容是否可交付，请结合自评依据与人工判断。</p>`;
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
      (a, b) => (Date.parse(b.startedAt) || 0) - (Date.parse(a.startedAt) || 0),
    );
    loadedSource = "production";
    $("connection").textContent = "正式站 · 管理员";
    $("connection").classList.add("live");
    notice("正式管理员记录 · 只读查看，不会自动调用模型");
    renderList();
    let last;
    try {
      last = sessionStorage.getItem("yizhi-eval-selected");
    } catch {}
    const id = runs.find((r) => r.id === (selected || last))?.id || runs[0]?.id;
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
    const data = await api("", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        requestId: id,
        resumeText: $("resume-input").value,
        jobDescription: $("jd-input").value,
        selfEvaluate: $("self-eval").checked,
        label: $("case-name").value,
        acknowledgeCost: true,
      }),
    });
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
if (live) refresh().then(reconcilePending);
else {
  notice("界面预览 · 未连接正式数据。正式评测请进入益职同域的管理员入口");
  $("empty-action").textContent = "导入一次运行";
  $("new-run").hidden = true;
  $("refresh").hidden = true;
}
