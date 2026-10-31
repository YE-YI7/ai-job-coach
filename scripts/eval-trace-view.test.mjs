import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseImport, exportBundle } from "../public/eval-lab/core.mjs";
import { parseRecorded, highlight, traceRows, traceTiming, matchingSpans, outputVerdict, spanHasIssue, renderTrace } from "../public/eval-lab/trace-view.mjs";

const editor = {
  id: "editor", name: "改稿 Agent", agent: "编辑", model: "same-model", status: "completed", durationMs: 20436,
  input: { messages: [
    { role: "system", content: "事实边界不变" },
    { role: "user", content: JSON.stringify({ source: "原始简历", facts: "[owned-context-diagnosis] 发现指令漏传，区分两种编辑合同。" }) },
  ], options: { temperature: 0.15, maxRetries: 0 } },
  output: "```json\n" + JSON.stringify({ editorialPlan: {
    mainline: "结合实际问题组织主线", decisions: [{ topic: "Harness", retain: "保留事实", change: "合并工具编排" }],
  }, changes: [{ section: "项目经历", after: "**主线编辑**：新的正文。", sourceIds: ["resume-line-1"] }] }) + "\n```",
};
const reviewer = { id: "review", name: "独立质检", agent: "质检", status: "completed", durationMs: 17900,
  output: { status: "failed", summary: "总领与第一条重复", document: { status: "failed" } } };
const run = { id: "run", label: "实际记录", status: "failed", spans: [editor, reviewer], knowledge: [], result: {} };

test("解析已记录JSON和围栏；截断数据原样保留，不补造内容", () => {
  assert.deepEqual(parseRecorded('```json\n{"a":1}\n```'), { a: 1 });
  assert.equal(parseRecorded('{"a":'), '{"a":');
  assert.equal(parseRecorded("plain"), "plain");
});

test("调用树仅依据真实parentId，兄弟顺序保留，不拿相邻调用冒父子", () => {
  const spans = [{ id: "child", parentId: "root" }, { id: "sibling" }, { id: "root" }];
  assert.deepEqual(traceRows(spans).map(({ span, depth }) => [span.id, depth]), [["sibling", 0], ["root", 0], ["child", 1]]);
  assert.deepEqual(traceRows(run.spans).map(({ depth }) => depth), [0, 0]);
});

test("调用成功和输出未通过是独立状态，异常定位包含质检结果", () => {
  assert.equal(outputVerdict(editor), null);
  assert.equal(outputVerdict(reviewer), "failed");
  assert.equal(spanHasIssue(reviewer), true);
  const html = renderTrace(run, { spanId: "review" });
  assert.match(html, /调用已完成/);
  assert.match(html, /输出判定：失败/);
  assert.match(html, /定位异常 · 1/);
});

test("编辑输出可读：主线、取舍、成稿分层，粗体正常显示且原文不丢", () => {
  const html = renderTrace(run, { spanId: "editor" });
  for (const label of ["编辑判断", "具体取舍", "修改后 · 项目经历", "修改依据与引用"]) assert.ok(html.includes(label));
  assert.match(html, /<strong>主线编辑<\/strong>/);
  assert.doesNotMatch(html, /\*\*主线编辑\*\*/);
  assert.match(html, /新的正文/);
  assert.match(html, /resume-line-1/);
});

test("实际输入按消息与资料阅读，system默认折叠；命中搜索时展开", () => {
  const html = renderTrace(run, { spanId: "editor", pane: "input" });
  assert.match(html, /<details class="trace-disclosure"><summary>系统指令/);
  for (const label of ["本轮原稿", "原始简历", "补充事实", "发现指令漏传"]) assert.ok(html.includes(label));
  const searched = renderTrace(run, { spanId: "editor", pane: "input", query: "边界" });
  assert.match(searched, /<details class="trace-disclosure" open><summary>系统指令/);
  assert.match(searched, /<mark>边界<\/mark>/);
});

test("搜索覆盖节点ID和实际输入输出，字面匹配而非正则，零命中有明确空态", () => {
  assert.deepEqual(matchingSpans(run.spans, "指令漏传").map((span) => span.id), ["editor"]);
  assert.deepEqual(matchingSpans(run.spans, "review").map((span) => span.id), ["review"]);
  assert.equal(matchingSpans(run.spans, "[.*]").length, 0);
  const html = renderTrace(run, { query: "不存在的内容" });
  assert.match(html, /0 \/ 2 个节点命中/);
  assert.match(html, /没有匹配的节点/);
  assert.match(html, /当前节点未命中搜索/);
});

test("展示参数和知识折叠但不消失，检索命中时自动展开原文", () => {
  const span = { ...editor, input: { messages: [{ role: "user", content: JSON.stringify({
    source: "原稿", facts: "贡献事实", contract: { instruction: "保持四条" }, knowledge: [{ text: "知识原文" }],
  }) }] } };
  const html = renderTrace({ ...run, spans: [span] }, { pane: "input" });
  assert.match(html, /<details class="trace-disclosure"><summary>编辑合同与输出约束/);
  assert.match(html, /保持四条/);
  const searched = renderTrace({ ...run, spans: [span] }, { pane: "input", query: "保持四条" });
  assert.match(searched, /<details class="trace-disclosure" open><summary>编辑合同与输出约束/);
});

test("保留原始记录与未知字段，不修改导出、历史输入或输出", () => {
  const snapshot = JSON.stringify(run);
  const withExtra = { ...run, spans: [{ ...editor, futureField: "需要完整保留的字段" }] };
  const html = renderTrace(withExtra, { pane: "raw" });
  assert.match(html, /futureField/);
  assert.match(html, /需要完整保留的字段/);
  renderTrace(run, { pane: "input" });
  assert.equal(JSON.stringify(run), snapshot);
  const imported = parseImport(JSON.stringify({ schemaVersion: "yizhi.eval/v1", runs: [run] }));
  assert.deepEqual(parseImport(JSON.stringify(exportBundle(imported)))[0].spans[0].input, editor.input);
});

test("历史空I/O与0毫秒区分；不伪造时间起点、并行或费用", () => {
  const old = { ...run, spans: [{ id: "old", name: "历史打点", status: "recorded", durationMs: 0, input: null, output: null }] };
  const html = renderTrace(old);
  assert.match(html, /没有输出快照/);
  assert.match(html, /未单独计时/);
  assert.match(html, /不推断并行或等待/);
  assert.doesNotMatch(html, /\$|100%完成|质量通过/);
});

test("有真实起点才提供时间线，保存并行和间隔；不使用累计相加伪造起点", () => {
  assert.equal(traceTiming(run.spans), null);
  const spans = [
    { ...editor, startedAt: "2026-10-30T12:00:00.000Z", durationMs: 10000 },
    { ...reviewer, startedAt: "2026-10-30T12:00:05.000Z", durationMs: 10000 },
  ];
  const timing = traceTiming(spans);
  assert.equal(timing.extent, 15000);
  assert.equal(timing.offsets.get("review"), 5000);
  const html = renderTrace({ ...run, spans }, { layout: "timeline" });
  assert.match(html, /记录跨度 15.0 s/);
  assert.match(html, /跨度不等于模型活动耗时/);
  assert.doesNotMatch(html, / style=/);
});

test("输入输出和搜索都是不可信内容：HTML不执行，凭据键递归屏蔽", () => {
  assert.equal(highlight('<img src=x onerror=alert(1)>', 'img'), '&lt;<mark>img</mark> src=x onerror=alert(1)&gt;');
  const unsafe = { ...editor, name: '<script>alert(1)</script>', output: { text: '<img onerror="bad">', secret: "do-not-show" } };
  const html = renderTrace({ ...run, spans: [unsafe] });
  assert.doesNotMatch(html, /<script>|<img |do-not-show/);
  assert.match(html, /已屏蔽凭据/);
});

test("仅切展示；模块没有网络、模型、存储或自动评估写入", () => {
  const source = readFileSync(new URL("../public/eval-lab/trace-view.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\bfetch\s*\(|localStorage|sessionStorage|callLLM|eval\(/);
});
