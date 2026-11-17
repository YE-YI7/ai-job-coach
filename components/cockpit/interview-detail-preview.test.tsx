import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import InterviewFocusCard from "./InterviewFocusCard";
import ReviewMaterialComposer from "./ReviewMaterialComposer";
import type { InterviewFocus } from "@/lib/opportunities/types";

jest.mock("@phosphor-icons/react", () => ({ Waveform: () => <svg />, SpeakerHigh: () => <svg /> }));
beforeAll(() => Object.defineProperty(globalThis, "window", {
  configurable: true, value: { speechSynthesis: { cancel: jest.fn() } },
}));
afterAll(() => Reflect.deleteProperty(globalThis, "window"));

const questions: InterviewFocus[] = [
  { id: "first", question: "怎么验证效果？", rationale: "原依据，不能换成新建议。", readiness: "practice" },
  { id: "second", question: "怎么确定边界？", rationale: "核对本人实际职责。", readiness: "missing" },
];

test("逐题原文、依据、状态、导航与练习ID保持，末题没有下一题", () => {
  const onNavigate = jest.fn(), onPractice = jest.fn();
  let root!: ReactTestRenderer;
  act(() => { root = create(<InterviewFocusCard questions={questions} index={0}
    onNavigate={onNavigate} onPractice={onPractice} />); });
  const buttons = root.root.findAllByType("button");
  expect(buttons[0].props.disabled).toBe(true);
  act(() => buttons[1].props.onClick());
  expect(onPractice).toHaveBeenCalledWith("first");
  act(() => buttons[2].props.onClick());
  expect(onNavigate).toHaveBeenCalledWith(1);
  expect(JSON.stringify(root.toJSON())).toContain("原依据，不能换成新建议。");
  act(() => root.update(<InterviewFocusCard questions={questions} index={99}
    onNavigate={onNavigate} onPractice={onPractice} />));
  expect(root.root.findAllByType("button")).toHaveLength(2);
  expect(JSON.stringify(root.toJSON())).toContain("待补充");
  act(() => root.root.findAllByType("button")[1].props.onClick());
  expect(onPractice).toHaveBeenLastCalledWith("second");
  act(() => root.unmount());
});

test("复盘保留真实输入、轮次插槽、语音、收费文本与原操作，不内建新提交", () => {
  const notes = "问题：如何评测？回答：先确认测试集；数字待核实。";
  const html = renderToStaticMarkup(<ReviewMaterialComposer notes={notes} onChange={() => {}}
    voiceDisabled={false} roundPicker={<button>自填四面</button>}>
    <button>存下素材，让导师带我复盘</button><button>直接生成整轮报告 · 原费用</button>
  </ReviewMaterialComposer>);
  for (const text of [notes, "自填四面", "语音记录面试", "直接生成整轮报告 · 原费用", "存下素材，让导师带我复盘"]) {
    expect(html).toContain(text);
  }
  expect(html).toContain('for="review-notes"');
  expect(html).toContain('id="review-notes"');
});

test("编辑只传递原文，不触发保存；沿用已有语音禁用条件", () => {
  const change = jest.fn(), submit = jest.fn();
  let root!: ReactTestRenderer;
  act(() => { root = create(<ReviewMaterialComposer notes="" onChange={change}
    voiceDisabled roundPicker={<span>原轮次</span>}><button onClick={submit}>原操作</button></ReviewMaterialComposer>); });
  act(() => root.root.findByType("textarea").props.onChange({ target: { value: "新原文" } }));
  expect(change).toHaveBeenCalledWith("新原文");
  expect(submit).not.toHaveBeenCalled();
  expect(root.root.findAllByType("button").filter(button => button.props["aria-label"] === "语音输入")[0].props.disabled).toBe(true);
  act(() => root.unmount());
});

test("已认可设计默认用于正式工作区，对照夹具仍只限开发，原保存逻辑保留", () => {
  const source = readFileSync("components/cockpit/CockpitApp.tsx", "utf8");
  const route = readFileSync("app/cockpit/preview/page.tsx", "utf8");
  expect(source).toContain('interviewDesign = "qoder"');
  expect(source).toContain('const showInterviewDetail = interviewDesign === "qoder"');
  expect(source).not.toContain('process.env.NODE_ENV === "development" && dataMode === "demo" && interviewDetailPreview');
  expect(source).toContain('showInterviewDetail ? interviewDetail.frame : ""');
  expect(route.indexOf('if (process.env.NODE_ENV !== "development") notFound()')).toBeLessThan(route.indexOf("params.interviewDetail"));
  expect(source).toContain('if (await onGuide(round, notes.trim())) setNotes("")');
  expect(source).toContain('await onAnalyze(round, notes.trim()); setNotes("")');
});
