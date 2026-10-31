import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { executionLabel, spanRole, memoryEvidence, flowModel, renderFlow } from "../public/eval-lab/trace-flow.mjs";

const toolResults = [
  { name: "memory.catalog", args: {}, result: { ok: true, data: { categories: [{ category: "项目事实", count: 2 }] } } },
  { name: "memory.find", args: { query: "具体贡献" }, result: { ok: true, data: { totalMatches: 2, matches: [
    { id: "m1", title: "指令漏传", selectionEvidence: { sourceId: "owned-one", excerpts: [{ quote: "原文片段一" }] } },
    { id: "m2", title: "协议误拦", selectionEvidence: { sourceId: "owned-two", excerpts: [{ quote: "原文片段二" }] } },
  ] } } },
];
const prep = { id: "prep", name: "记忆选材接续", agent: "记忆选材接续", status: "completed",
  input: { messages: [{ role: "user", content: JSON.stringify({ version: "context-memory/v0.1", toolResults }) }] },
  output: { type: "ready", selected: [{ id: "m1" }] } };
const editor = { id: "edit", name: "改稿 Agent", agent: "改稿 Agent", status: "completed", model: "same-model",
  input: { messages: [{ role: "user", content: JSON.stringify({ source: "原稿", facts: "[owned-one] 具体判断与实际改动。" }) }] },
  output: { editorialPlan: { mainline: "原记录里的显式主线" }, changes: [{ after: "这是编辑器给出的候选稿", sourceIds: ["resume-line-1"] }] } };
const gate = { id: "gate", name: "独立质检 Agent", agent: "独立质检 Agent", status: "completed",
  input: { messages: [{ role: "user", content: JSON.stringify({ appliedCandidate: "这是编辑器给出的候选稿" }) }] },
  output: { status: "failed", document: { status: "failed" }, summary: "正文重复" } };
const run = { id: "root", provenance: "production", executionScope: "isolated_eval_no_domain",
  input: { source: "原稿", checkpointTrace: "old-root" }, spans: [prep, { ...prep, id: "prep-2" }, editor, gate],
  result: { output: "这是编辑器给出的候选稿", rawResponse: { notDelivered: true, humanReview: { accepted: false, quality: { stage: "具体贡献未进入首稿" } } } },
  evaluation: null, evaluationStatus: "not_requested" };

test("正式库里的隔离实验不得标成线上请求；缺执行环境也不能猜", () => {
  assert.match(executionLabel(run), /隔离实验/);
  assert.match(executionLabel({ provenance: "production" }), /未记录/);
  assert.match(executionLabel({ source: "workspace" }), /线上用户/);
});

test("原编辑、产品质检和额外Judge各有角色，不按失败默认把Judge当最终输出", () => {
  assert.equal(spanRole(editor), "editor");
  assert.equal(spanRole(gate), "gate");
  assert.equal(spanRole({ name: "LLM 整稿自评", agent: "LLM 自评" }), "judge");
  assert.equal(flowModel(run).draft, "这是编辑器给出的候选稿");
  assert.equal(flowModel(run).judgeSpans.length, 0);
});
test("返修后展示最后一次实际编辑的候选和输入，不把首稿当最终稿", () => {
  const r = structuredClone(run);
  r.spans.push({...editor, id: 'repair', output: {changes: [{after: '最后返修稿', sourceIds: ['owned-one']}]}}, gate);
  assert.equal(flowModel(r).draft, '最后返修稿');
  assert.equal(memoryEvidence(r).editor.id, 'repair');
});

test("产品质检的额外Memory不能算成编辑已读取，两个输入单独计数", () => {
  const r = structuredClone(run);
  r.spans[3].input.messages[0].content = JSON.stringify({ appliedCandidate: "候选",
    facts: "[owned-one] 具体判断与实际改动。\n[owned-two] 只给质检的另一块。" });
  const model = flowModel(r);
  assert.equal(model.memory.blocks.length, 1);
  assert.equal(model.gateMemoryCount, 2);
  const html = renderFlow(r, { nodeId: "memory" });
  assert.match(html, /只给质检的另一块/);
  assert.match(html, /以下全文来自产品质检输入，不代表编辑器读过/);
});

test("反复出现在消息里的工具返回只计一次；选择与实际装入区分", () => {
  const m = memoryEvidence(run);
  assert.equal(m.catalogueCount, 2);
  assert.equal(m.queries.length, 1);
  assert.equal(m.sources.length, 2);
  assert.equal(m.blocks.length, 1);
  assert.equal(m.sources.find(s => s.id === "m1").inEditor, true);
  assert.equal(m.sources.find(s => s.id === "m2").inEditor, false);
});

test("facts里的简历原文行不算Memory，只有与检索来源对应的分块才计数", () => {
  const r = structuredClone(run);
  r.spans[2].input.messages[0].content = JSON.stringify({ source: "原稿",
    facts: "[resume-line-1] 不能冒充记忆的原稿。\n[owned-one] 具体判断与实际改动。" });
  const memory = memoryEvidence(r);
  assert.equal(memory.blocks.length, 1);
  assert.equal(memory.otherFactCount, 1);
  assert.equal(memory.sources.length, 2);
  assert.equal(memory.characters, "具体判断与实际改动。".length);
});

test("工具请求成功不能冒充装入成功；装入不能冒充正文已采用", () => {
  const r = structuredClone(run);
  r.spans[0].output.selected.push({ id: "m2" });
  const source = memoryEvidence(r).sources.find(s => s.id === "m2");
  assert.equal(source.selected, true);
  assert.equal(source.inEditor, false);
  const html = renderFlow(r, { nodeId: "memory" });
  assert.match(html, /已请求读取 · 未证明进入编辑/);
  assert.match(html, /不能仅由此判未使用/);
});

test("执行动线有输入、资料、装入、编辑、候选、产品闸与交付，评测独立列", () => {
  const model = flowModel(run);
  assert.deepEqual(model.nodes.map(n => n.id), ["input", "memory", "retrieval", "selection", "context", "editor", "candidate", "gate", "delivery"]);
  assert.ok(model.nodes.find(n => n.id === "retrieval").reused);
  const html = renderFlow(run);
  assert.match(html, /从输入到交付的执行动线/);
  assert.match(html, /aria-label="单独评测区"/);
  assert.match(html, /本轮未请求/);
  assert.match(html, /未交付 · 未写回用户原稿/);
});

test("其他真实阶段按原记录次序插入，不全挪到质检后冒充真实顺序", () => {
  const r = structuredClone(run);
  r.spans.splice(0, 0, { id: "early", name: "上下文编译", status: "recorded" });
  const ids = flowModel(r).nodes.map(node => node.id);
  assert.ok(ids.indexOf("span:early") < ids.indexOf("selection"));
});

test("有记录的模型选材理由照原文显示，不一概标成未记录", () => {
  const r = structuredClone(run);
  r.spans[0].output.selected[0].reason = "需要查清具体指令是在哪一层丢失的";
  const html = renderFlow(r, { nodeId: "selection" });
  assert.match(html, /需要查清具体指令是在哪一层丢失的/);
});

test("缺失Judge记录不宣称未运行，不用产品质检代填评分", () => {
  const html = renderFlow({ ...run, evaluationStatus: undefined });
  assert.match(html, /未采集评测结果/);
  assert.doesNotMatch(html, /本轮未运行/);
});

test("没有记录的查询理由不补造；第六块只有预览时不伪造完整正文", () => {
  const html = renderFlow(run, { nodeId: "retrieval" });
  assert.match(html, /为什么选择这个查询：未单独记录/);
  const memory = renderFlow(run, { nodeId: "memory" });
  assert.match(memory, /没有完整正文快照/);
  assert.match(memory, /原文片段二/);
});

test("原始输入输出完整可开，默认只显示要点，不铺满质检JSON", () => {
  const snapshot = JSON.stringify(run);
  const html = renderFlow(run, { nodeId: "candidate" });
  assert.match(html, /这是编辑器给出的候选稿/);
  assert.doesNotMatch(html, /trace-evidence-tabs/);
  const opened = renderFlow(run, { nodeId: "candidate", full: true });
  assert.match(opened, /trace-evidence-tabs/);
  assert.equal(JSON.stringify(run), snapshot);
});

test("空目录记录为0；没有目录是未知，不混为一谈", () => {
  const empty = structuredClone(run);
  empty.spans = [{ ...prep, input: { messages: [{ role: "tool", content: JSON.stringify({ toolResults: [
    { name: "memory.catalog", result: { ok: true, data: { categories: [] } } },
  ] }) }] } }];
  assert.equal(memoryEvidence(empty).catalogueCount, 0);
  assert.equal(memoryEvidence({ spans: [] }).catalogueCount, null);
});

test("纯展示不新增模型、存储或数据请求，危险HTML不执行", () => {
  const code = readFileSync(new URL("../public/eval-lab/trace-flow.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(code, /\bfetch\s*\(|callLLM|sessionStorage|localStorage/);
  const html = renderFlow({ ...run, input: { source: "<img onerror=x>" } }, { nodeId: "input", full: true });
  assert.doesNotMatch(html, /<img /);
  assert.match(html, /&lt;img/);
});
