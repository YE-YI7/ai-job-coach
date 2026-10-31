import { STATUS, text, sanitize } from "./core.mjs";
import { parseRecorded, renderSpanInspector } from "./trace-view.mjs";

const arr = (value) => Array.isArray(value) ? value : [];
const obj = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, c => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[c]);
const excerpt = (value, max = 150) => {
  const source = typeof value === "string" ? value : text(value);
  return source.length > max ? source.slice(0, max) + "…" : source;
};
const paragraph = (value) => `<p class="flow-prose">${esc(value)}</p>`;
const raw = (value) => `<pre class="trace-raw">${esc(text(sanitize(value)))}</pre>`;

function editorOutput(span) {
  const output = parseRecorded(span?.output);
  if (output?.type !== 'native_tool_calls') return output;
  const submitted = arr(output.tool_calls).find(call => call?.function?.name === 'submit_edit');
  return submitted ? parseRecorded(submitted.function.arguments) : null;
}

function inputs(span) {
  const input = parseRecorded(span.input);
  return Array.isArray(input?.messages)
    ? input.messages.filter(obj).filter(m => m.role === "user" || m.role === "tool").map(m => parseRecorded(m.content)).filter(obj)
    : obj(input) ? [input] : [];
}

export function executionLabel(run) {
  if (run.provenance === "synthetic") return "演示记录 · 非真实调用";
  if (String(run.executionScope || "").startsWith("isolated")) return "隔离实验回放 · 非线上用户请求";
  if (run.source === "workspace") return "线上用户请求 · 实际采集";
  return "管理员存档 · 执行环境未记录";
}

export function spanRole(span) {
  // Roles describe recorded calls. Storage provenance is not an execution role.
  if (span.role === "eval_judge" || span.agent === "LLM 自评" || /LLM.*自评/.test(span.name || "")) return "judge";
  const data = inputs(span), output = parseRecorded(span.output);
  if (span.role === "product_review" || span.agent === "独立质检 Agent" || data.some(x => x.appliedCandidate != null)) return "gate";
  if (span.role === "editor" || span.agent === "改稿 Agent" || Array.isArray(output?.changes)) return "editor";
  if (span.agent === "记忆选材接续" || data.some(x => typeof x.version === "string" && x.version.startsWith("context-memory/"))
    || /记忆选材/.test(span.name || "")) return "preparation";
  return "other";
}

function factBlocks(value) {
  if (typeof value !== "string") return [];
  const matches = [...value.matchAll(/^\[([^\]\n]+)\]\s*/gm)];
  return matches.map((match, i) => ({ sourceId: match[1],
    text: value.slice(match.index + match[0].length, matches[i + 1]?.index ?? value.length).trim() }));
}

export function memoryEvidence(run) {
  const documents = new Map(), receipts = new Map(), catalogues = [];
  let editor = null, editorInput = null;
  for (const span of arr(run.spans)) {
    if (spanRole(span) === "editor" && (!editor || Array.isArray(editorOutput(span)?.changes))) {
      editor = span;
      editorInput = inputs(span).find(x => x.facts != null) ?? inputs(span)[0] ?? {};
    }
    for (const payload of inputs(span)) {
      for (const receipt of arr(payload.toolResults)) {
        if (!receipt?.name || !receipt.result) continue;
        const key = JSON.stringify([receipt.name, receipt.args, receipt.result]);
        receipts.set(key, receipt);
      }
    }
  }
  for (const receipt of receipts.values()) {
    if (receipt.name === "memory.catalog" && receipt.result.ok) catalogues.push(receipt.result.data);
    if (receipt.name === "memory.find" && receipt.result.ok) {
      for (const match of arr(receipt.result.data?.matches)) if (obj(match) && typeof match.id === "string") documents.set(match.id, match);
    }
  }
  // The new runner retains its actual extractive index. Existence is not retrieval or loading.
  for (const block of arr(run.result?.rawResponse?.storedBlocks)) {
    const evidence = arr(block.evidence)[0];
    if (typeof block.id === "string" && evidence?.sourceId && !documents.has(block.id)) documents.set(block.id, {
      id: block.id, title: block.title, description: block.description,
      storageText: arr(block.evidence).map(e => e.quote).filter(x => typeof x === "string").join("\n"),
      selectionEvidence: {sourceId: evidence.sourceId, excerpts: []},
    });
  }
  const allBlocks = factBlocks(editorInput?.facts);
  const memorySourceIds = new Set([...documents.values()].map(doc => doc.selectionEvidence?.sourceId ?? doc.sourceId ?? doc.id));
  // The same facts field also contains original résumé lines. Those are not Memory.
  const blocks = allBlocks.filter(block => memorySourceIds.has(block.sourceId));
  const lastGate = arr(run.spans).filter(span => spanRole(span) === "gate").at(-1);
  const reviewFacts = lastGate ? inputs(lastGate).find(input => typeof input.facts === "string")?.facts : null;
  const reviewBlocks = new Map(factBlocks(reviewFacts).map(block => [block.sourceId, block.text]));
  const citations = new Set(arr(editorOutput(editor)?.changes).filter(obj).flatMap(change => arr(change.sourceIds)));
  const selectionReasons = arr(run.spans).flatMap(span => arr(parseRecorded(span.output)?.selected)
    .filter(obj).filter(item => typeof item.reason === "string").map(item => ({ id: item.id, reason: item.reason })));
  const requested = new Set(arr(run.spans).flatMap(span => {
    const output = parseRecorded(span.output);
    return [...arr(output?.selected).filter(obj).map(item => item.id), ...arr(output?.tool_calls)
      .filter(call => call?.function?.name === 'context_load').map(call => parseRecorded(call.function.arguments)?.id), ...arr(output?.actions)
      .filter(obj).filter(action => action.name === "context.load").map(action => action.args?.id)].filter(Boolean);
  }));
  const sources = [...documents.values()].map(doc => {
    const sourceId = doc.selectionEvidence?.sourceId ?? doc.sourceId ?? doc.id;
    const block = blocks.find(item => item.sourceId === sourceId);
    return { id: doc.id, sourceId, title: doc.title || doc.id, selected: requested.has(doc.id),
      inEditor: Boolean(block), cited: sourceId != null && citations.has(sourceId),
      text: block?.text ?? null, reviewText: reviewBlocks.get(sourceId) ?? null, storageText: doc.storageText || null,
      excerpts: arr(doc.selectionEvidence?.excerpts).filter(obj).map(item => item.quote),
      recordedDescription: doc.description || null };
  });
  const catalogue = catalogues.at(-1);
  const categories = arr(catalogue?.categories);
  const count = catalogue && Array.isArray(catalogue.categories)
    && categories.every(item => obj(item) && Number.isInteger(item.count) && item.count >= 0)
    ? categories.reduce((sum, item) => sum + item.count, 0) : null;
  const knowledge = editorInput?.knowledge ?? null;
  const knowledgeReferences = typeof knowledge === "string"
    ? [...knowledge.matchAll(/\[参考 ([^\]\n]+)\]\s*([^\n]*)/g)].map(match => ({ id: match[1], title: match[2] }))
    : [];
  return { editor, editorInput, sources, blocks, catalogueCount: count, categories, knowledgeReferences, selectionReasons,
    otherFactCount: allBlocks.length - blocks.length, publicKnowledge: editorInput?.knowledge ?? null,
    characters: blocks.reduce((sum, block) => sum + block.text.length, 0),
    queries: [...receipts.values()].filter(item => item.name === "memory.find"),
    checkpoint: run.input?.checkpointTrace ?? null,
    boundary: arr(run.spans).flatMap(inputs).find(input => input.boundaryVersion)?.boundaryVersion ?? null };
}

export function flowModel(run) {
  const memory = memoryEvidence(run), spans = arr(run.spans);
  const editor = memory.editor;
  const gates = spans.filter(span => spanRole(span) === "gate");
  const preparations = spans.filter(span => spanRole(span) === "preparation");
  const purposes = preparations.map(span => parseRecorded(span.output)?.purpose).filter(value => typeof value === "string" && value);
  const output = editorOutput(editor);
  const draft = arr(output?.changes).filter(obj).map(change => change.after).filter(value => typeof value === "string").join("\n\n");
  const nodes = [{ id: "input", title: "收到输入", value: run.input != null ? "原稿与本轮要求" : "输入未采集",
    detail: run.input, points: [executionLabel(run), "只读原记录，不补造用户输入。"], spans: [] }];
  if (memory.sources.length || memory.catalogueCount !== null) nodes.push({ id: "memory", title: "Memory 库", side: true,
    value: memory.catalogueCount === null ? `${memory.sources.length} 块有记录` : `目录 ${memory.catalogueCount} 块 · 非空`,
    points: ["范围：本轮记录里的资料，不等于完整线上长期库。", "点每条资料可看原文、是否选中、是否进入编辑输入。"], spans: [] });
  if (memory.queries.length) nodes.push({ id: "retrieval", title: "检索资料", reused: Boolean(memory.checkpoint),
    value: `${memory.checkpoint ? "复用 " : "已记录 "}${memory.queries.length} 个查询 · ${memory.sources.length} 块候选`,
    points: [memory.checkpoint ? "检索记录来自前轮检查点，本轮未重新执行。" : "只展示已有查询与返回。",
      "查询词有记录；没有单独记录的选材理由，不替模型补解释。"], spans: [], detail: memory.queries });
  if (preparations.length) nodes.push({ id: "selection", title: "Agent 自主选材",
    value: `${preparations.length} 次模型调用 · 选 ${memory.sources.filter(source => source.selected).length} 块`,
    points: [memory.selectionReasons.length ? `记录里有 ${memory.selectionReasons.length} 条选材理由，见下方原文。`
      : purposes.length ? `模型明示的批次取材目的：${excerpt(purposes.join("；"), 150)}（不是逐块理由）`
        : "选取依据的逐项理由没有单独留存；不是宿主自动把所有资料塞入。",
      "下游是否实际收到，要以编辑输入核对，不能只看读取请求。"], spans: preparations });
  if (editor) nodes.push({ id: "context", title: "装入编辑输入",
    value: memory.blocks.length ? `${memory.blocks.length} 块 Memory · ${memory.characters} 字符` : "看实际输入，不推断 Memory",
    points: ["装入位置：改稿 Agent 的 user 消息 → facts。",
      `${memory.otherFactCount} 段原稿事实另计；公共写法参考 ${memory.knowledgeReferences.length || "数量未解析"} 份在 knowledge 字段。`,
      "装入成功不等于成稿采用；引用与正文需分别核对。"], spans: [editor] });
  if (editor) nodes.push({ id: "editor", title: "编辑 Agent", value: editor.model || "模型未记录",
    points: [output?.editorialPlan?.mainline ? `显式主线：${excerpt(output.editorialPlan.mainline, 105)}` : "没有单独记录编辑主线。",
      "这是模型显式返回的计划，不是隐藏思维链。"], spans: [editor] });
  if (editor) nodes.push({ id: "candidate", title: "候选稿", value: draft ? `${arr(output.changes).length} 处提议 · 编辑器正文` : "没有可读候选正文",
    points: [draft ? excerpt(draft, 160) : "不拿质检JSON代替改稿正文。", "候选稿与最终交付分开；点开可看全文。"],
    detail: draft || null, spans: [editor] });
  const memoryIds = new Set(memory.sources.map(source => source.sourceId));
  const gateFacts = gates.length ? inputs(gates.at(-1)).find(input => typeof input.facts === "string")?.facts : null;
  const gateMemoryCount = typeof gateFacts === "string"
    ? factBlocks(gateFacts).filter(block => memoryIds.has(block.sourceId)).length : null;
  if (gates.length) nodes.push({ id: "gate", title: "产品质检 · 交付闸",
    value: gateMemoryCount == null ? "单独节点，影响能否交付" : `质检输入 ${gateMemoryCount} 块 Memory · 与编辑分开`,
    points: ["它属于产品执行流程，不是额外的 Eval Judge。",
      `原结果：${STATUS[parseRecorded(gates.at(-1).output)?.document?.status] || parseRecorded(gates.at(-1).output)?.status || "未记录"}`],
    spans: gates });
  for (const span of spans.filter(item => spanRole(item) === "other")) {
    const index = spans.indexOf(span);
    const next = nodes.findIndex(node => arr(node.spans).some(item => spans.indexOf(item) > index));
    nodes.splice(next < 0 ? nodes.length : next, 0, { id: `span:${span.id}`,
      title: span.name, value: "其他已记录动作", points: ["仅记录次序，不推断未保存的数据依赖。"], spans: [span] });
  }
  const rawResult = run.result?.rawResponse;
  const notDelivered = rawResult?.notDelivered === true;
  nodes.push({ id: "delivery", title: "最终交付", value: notDelivered ? "未交付 · 未写回用户原稿" : "以保存与交付回执为准",
    points: [notDelivered ? "原记录明确标记 notDelivered。" : "模型返回成功不等于已保存或PDF验收通过。"],
    detail: run.result, spans: [] });
  return { nodes, memory, draft, gateSpans: gates, gateMemoryCount,
    judgeSpans: spans.filter(span => spanRole(span) === "judge"), human: rawResult?.humanReview ?? null };
}

function memoryList(memory, onlyLoaded = false) {
  const sources = memory.sources.filter(source => !onlyLoaded || source.inEditor);
  if (!sources.length) return paragraph("本记录没有可展示的分块正文；不据此断言 Memory 服务为空。");
  return `<div class="flow-sources">${sources.map(source => `<details><summary><strong>${esc(source.title)}</strong>`
    + `<span>${source.inEditor ? "已进入编辑输入" : source.selected ? "已请求读取 · 未证明进入编辑" : "未进入编辑输入"}</span></summary>`
    + (source.text ? paragraph(source.text) : source.reviewText
      ? paragraph("以下全文来自产品质检输入，不代表编辑器读过。") + paragraph(source.reviewText)
      : source.storageText ? paragraph("以下为本轮存储快照，不代表编辑器读过。") + paragraph(source.storageText)
      : paragraph("本Trace只留了以下原文片段，没有完整正文快照。") + source.excerpts.map(paragraph).join(""))
    + (source.text && source.reviewText && source.text !== source.reviewText
      ? paragraph("注意：编辑与最后一次产品质检收到的同ID正文不同。") + raw({ reviewText: source.reviewText }) : "")
    + `<p class="flow-proof">来源 ${esc(source.sourceId || source.id)} · `
    + `${source.cited ? "被显式引用" : "未被显式引用（不能仅由此判未使用）"}</p></details>`).join("")}</div>`;
}

function renderEvaluation(run, model) {
  const e = run.evaluation;
  const title = e?.source === "llm_self_eval" ? "LLM 自评" : "LLM Judge";
  const human = model.human;
  const noResult = run.evaluationStatus === "not_requested" ? "本轮未请求"
    : model.judgeSpans.length ? "有评测调用，未整理评分" : "未采集评测结果";
  return `<aside class="flow-evaluation" aria-label="单独评测区"><h2>评测与人工结论</h2>`
    + (model.gateSpans.length ? `<section><h3>产品内质检</h3>`
      + paragraph(({ passed: "未发现阻断项", failed: "未通过" })[
        parseRecorded(model.gateSpans.at(-1).output)?.document?.status ?? parseRecorded(model.gateSpans.at(-1).output)?.status
      ] || "已记录调用，判定请看原文")
      + paragraph("这是影响交付的 LLM 质检，不是改稿正文。")
      + `<button class="text-button" data-flow-node="gate">看这一步的实际证据</button></section>` : "")
    + `<section><h3>${title} · 额外评测</h3>${paragraph(e ? `${e.score ?? "未评分"} / ${e.maxScore ?? "满分未记录"}` : noResult)}`
    + paragraph(e ? excerpt(e.reason || "原因未记录", 130)
      : run.evaluationStatus === "not_requested" ? "本轮未额外调用评测模型。" : "不拿产品质检代填；未采集不代表未运行。") + `</section>`
    + `<section><h3>已留存人工复核</h3>${paragraph(human?.accepted === false ? "不接受这版" : human?.accepted === true ? "接受" : "未记录")}`
    + paragraph(excerpt(human?.quality?.stage || human?.candidateStatus || "没有可展示的人工结论。", 135))
    + (human ? `<details><summary>完整复核原文</summary>${raw(human)}</details>` : "") + `</section>`
    + `<p class="flow-proof">评测不改写产品输出；产品质检在左侧执行动线上。</p>`
    + `<button class="text-button" data-trace-assessment aria-expanded="false">人工反馈与打标</button></aside>`;
}

export function renderFlow(run, state = {}) {
  const model = flowModel(run);
  const active = model.nodes.find(node => node.id === state.nodeId)
    || model.nodes.find(node => node.id === "context") || model.nodes[0];
  const relevantSpans = active.spans || [];
  const span = relevantSpans.find(item => item.id === state.spanId) || relevantSpans[0];
  const nodes = model.nodes.map(node => `<li class="flow-step${node.side ? " memory-origin" : ""}${node.reused ? " is-reused" : ""}">`
    + `<button type="button" class="flow-node" data-flow-node="${esc(node.id)}" aria-pressed="${node.id === active.id}">`
    + `<strong>${esc(node.title)}</strong><span>${esc(node.value)}</span></button></li>`).join("");
  let evidence = `<h2>${esc(active.title)}</h2><p class="flow-selected-value">${esc(active.value)}</p>`
    + `<ul class="flow-points">${active.points.map(point => `<li>${esc(point)}</li>`).join("")}</ul>`;
  if (active.id === "memory" || active.id === "context") evidence += memoryList(model.memory, active.id === "context");
  if (active.id === "selection") evidence += model.memory.selectionReasons.map(item =>
    `<section class="flow-query"><h3>${esc(model.memory.sources.find(source => source.id === item.id)?.title || item.id)}</h3>`
    + paragraph(item.reason) + `</section>`).join("");
  if (active.id === "context" && model.memory.publicKnowledge) evidence += `<details class="flow-query">`
    + `<summary>另一路：公共写法参考（预置输入）</summary>`
    + paragraph("这些内容实际给了编辑器，但本轮没有重新检索的执行记录，不能补写为Agent主动找到。")
    + `<ul>${model.memory.knowledgeReferences.map(item => `<li>${esc(item.title || item.id)}</li>`).join("")}</ul>`
    + raw(model.memory.publicKnowledge) + `</details>`;
  if (["memory", "context"].includes(active.id)) {
    const selection = model.human?.actualSelection;
    if (Array.isArray(selection?.oldSelectedSourceIds) && Array.isArray(selection?.newSelectedSourceIds)) {
      const added = selection.newSelectedSourceIds.filter(id => !selection.oldSelectedSourceIds.includes(id));
      const titles = added.map(id => model.memory.sources.find(source => source.sourceId === id)?.title || id);
      evidence += `<p class="flow-proof">已留存对照：旧版读入 ${selection.oldSelectedSourceIds.length} 块 → 本轮 ${selection.newSelectedSourceIds.length} 块。`
        + `新增：${esc(titles.join("、") || "无")}。这不代表正文质量已经改善。</p>`;
    }
  }
  if (active.id === "retrieval") evidence += model.memory.queries.map(receipt => `<details class="flow-query"><summary>`
    + `${esc(receipt.args?.query || "查询词未记录")}</summary>${paragraph(`返回 ${receipt.result.data?.totalMatches ?? "未记录"} 个匹配。`)}`
    + paragraph(receipt.purpose || receipt.reason || "为什么选择这个查询：未单独记录。")
    + `<ul>${arr(receipt.result.data?.matches).map(item => `<li>${esc(item.title || item.id)}</li>`).join("")}</ul></details>`).join("");
  const detailLabel = active.id === "candidate" ? "看候选稿全文与编辑计划" : "展开完整输入输出证据";
  evidence += `<button class="text-button flow-show-evidence" data-flow-full aria-expanded="${Boolean(state.full)}">`
    + `${state.full ? "收起完整证据" : detailLabel}</button>`;
  if (state.full) {
    if (relevantSpans.length > 1) evidence += `<div class="flow-call-pick">${relevantSpans.map((item, i) =>
      `<button class="text-button" data-span="${esc(item.id)}">第 ${i + 1} 次 · ${esc(item.name)}</button>`).join("")}</div>`;
    evidence += span ? renderSpanInspector(span, state) : raw(active.detail ?? active.points);
  }
  return `<div class="trace-toolbar"><div><button class="text-button" data-trace-runs aria-controls="eval-run-list"`
    + ` aria-expanded="${Boolean(state.runs)}">运行记录</button><strong>实际执行动线</strong></div>`
    + `<button class="text-button" data-trace-mode="detail">调用明细与原始记录</button></div>`
    + `<div class="flow-reading-note">${esc(executionLabel(run))} · 连线表示记录中的材料传递；不是隐藏思维链或预设工作流。</div>`
    + `<div class="flow-layout"><section class="flow-canvas" aria-label="从输入到交付的执行动线">`
    + `<ol class="flow-path">${nodes}</ol></section><section class="flow-evidence" aria-label="动线节点要点">${evidence}</section>`
    + renderEvaluation(run, model) + `</div>`;
}
