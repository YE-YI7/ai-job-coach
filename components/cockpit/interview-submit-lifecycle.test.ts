import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import React from "react";
import renderer, { act } from "react-test-renderer";
import * as logic from "./interview-assessment-logic";
import { historyFromRecord } from "@/lib/interview/history";
import type { Opportunity } from "@/lib/opportunities/types";

// Execute the actual scoped component, not a second implementation of its handlers.
const source = fs.readFileSync(path.join(__dirname, "CockpitApp.tsx"), "utf8");
const ast = ts.createSourceFile("CockpitApp.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const node = ast.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === "InterviewTab")!;
const compiled = ts.transpileModule(node.getText(ast), { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React,
} }).outputText;
const Native = (props: Record<string, unknown>) => React.createElement("stub", props);
const globals = { React, useState: React.useState, useEffect: React.useEffect, useRef: React.useRef,
  styles: new Proxy({}, { get: (_target, name) => String(name) }), useQuotaLabel: () => "测试",
  toSessionView: logic.restoreRoundtableSession, toSessionRecord: (value: unknown) => value,
  normalizeInterviewAssessment: logic.normalizeInterviewAssessment, normalizeRoundSummary: logic.normalizeRoundSummary,
  historyFromRecord, needsMoreInputHints: logic.needsMoreInputHints, resolveNextStep: logic.resolveNextStep,
  resolveRoundCompletionPhase: () => "self_reflection", ROUND_REFLECTION_QUESTIONS: ["你怎么看"],
  mockRoundOptions: ["业务面"], requestsTeaching: () => false, apiResponseError: (_response: unknown, body: { error?: string }) => Error(body.error || "失败"),
  InterviewResult: Native, InterviewHistory: Native, RoundPicker: Native, RoundSummary: Native,
  VoiceControls: Native, ExistingJobPicker: Native, ContextMaterialAction: Native, EmptySection: Native,
  ArrowRight: Native, MessageSquareText: Native, Sparkles: Native, CircleAlert: Native, ChevronDown: Native,
  ShieldCheck: Native, RotateCcw: Native, ChevronRight: Native,
  scoreBandShort: () => "单次", scoreBandLine: () => "未实测", scoreDerivationLine: () => "",
};
const Component = new Function(...Object.keys(globals), `${compiled}; return InterviewTab;`)(...Object.values(globals)) as React.ComponentType<Record<string, unknown>>;
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
const response = (body: unknown, status = 200) => ({ ok: status === 200, status, json: async () => body });
const session = { id: "session", round: "一面", status: "running", currentIndex: 0,
  createdAt: "2026-10-28T00:00:00Z", turns: [{ questionId: "q1", question: "请说说你的贡献" }] };
const opportunity = { id: "job", company: "虚构公司", role: "产品", jdText: "虚构JD", interviewFocus: [], mockInterviews: [session] } as unknown as Opportunity;
const props = { opportunity, relatedJobs: [], dataMode: "live", onSelectJob: jest.fn(), onSupplement: jest.fn(),
  onAnalyze: jest.fn(), onTeach: jest.fn(), onSyncRoundtable: jest.fn() };
const findButton = (tree: renderer.ReactTestRenderer, name: string) => tree.root.findAllByType("button").find(button =>
  button.children.some(child => typeof child === "string" && child.includes(name)))!;
let tree: renderer.ReactTestRenderer;
let fetcher: jest.Mock;
beforeEach(() => {
  global.window = { location: { href: "http://localhost/cockpit?tab=interview", search: "?tab=interview" },
    history: { state: null, replaceState: jest.fn() } } as unknown as Window & typeof globalThis;
  fetcher = jest.fn(); global.fetch = fetcher;
});
afterEach(async () => { if (tree) await act(async () => tree.unmount()); });
function harness(failSave = false) {
  const save = deferred<ReturnType<typeof response>>(), model = deferred<ReturnType<typeof response>>();
  let ended = false;
  fetcher.mockImplementation((url: string, init?: RequestInit) => {
    if (url.includes("/draft?") && !init?.method) return Promise.resolve(response({ ok: true, answer: null }));
    if (url.includes("/draft") && init?.method === "POST") return save.promise;
    if (url.includes("/answer")) return model.promise;
    if (url.includes("/history") && init?.method === "POST") { ended = true; return Promise.resolve(response({ ok: true, saved: true })); }
    return Promise.resolve(response({ ok: true, sessions: [{ ...session, ...(ended ? {
      status: "completed", endedAt: "2026-10-28T00:00:02Z", turns: [{ ...session.turns[0], answer: "我的虚构贡献",
        skipped: false, attempts: [{ id: "actual-saved-draft", answer: "我的虚构贡献", state: "pending", createdAt: session.createdAt }] }],
    } : {}) }] }));
  });
  return { save, model, failSave };
}
test("send then immediate End waits for durable answer, not model; late feedback cannot reopen session", async () => {
  const { save, model } = harness();
  await act(async () => { tree = renderer.create(React.createElement(Component, props)); });
  await act(async () => tree.root.findAllByType("textarea")[0].props.onChange({ target: { value: "我的虚构贡献" } }));
  await act(async () => { findButton(tree, "提交回答").props.onClick(); findButton(tree, "结束并看记录").props.onClick(); });
  expect(fetcher.mock.calls.filter(([url, init]) => url.includes("/history") && init?.method === "POST")).toHaveLength(0);
  await act(async () => { save.resolve(response({ ok: true, saved: true })); });
  expect(fetcher.mock.calls.filter(([url, init]) => url.includes("/history") && init?.method === "POST")).toHaveLength(1);
  const result = tree.root.findAllByType(Native).find(item => item.props.session)?.props.session;
  expect(result.status).toBe("completed"); expect(result.turns[0].answer).toBe("我的虚构贡献");
  await act(async () => model.resolve(response({ assessment: { status: "assessed", score: 70, summary: "证据", evidence: ["贡献"], dimensions: [] } })));
  const final = tree.root.findAllByType(Native).find(item => item.props.session)?.props.session;
  expect(final.status).toBe("completed"); expect(findButton(tree, "提交回答")).toBeUndefined();
});
test("failed draft does not call assessment or end and original composer remains", async () => {
  const { save } = harness(true);
  await act(async () => { tree = renderer.create(React.createElement(Component, props)); });
  await act(async () => tree.root.findAllByType("textarea")[0].props.onChange({ target: { value: "原话不要丢" } }));
  await act(async () => { findButton(tree, "提交回答").props.onClick(); findButton(tree, "结束并看记录").props.onClick(); });
  await act(async () => save.resolve(response({ ok: false, error: "保存失败" }, 503)));
  expect(fetcher.mock.calls.some(([url]) => url.includes("/answer"))).toBe(false);
  expect(fetcher.mock.calls.some(([url, init]) => url.includes("/history") && init?.method === "POST")).toBe(false);
  expect(tree.root.findAllByType("textarea")[0].props.value).toBe("原话不要丢");
});
