import React from "react";
import { create, act, type ReactTestRenderer, type ReactTestInstance } from "react-test-renderer";
import InterviewQuestionText, { questionReadingSegments, questionEmphasisRanges } from "./InterviewQuestionText";
import InterviewQuestionHeader from "./InterviewQuestionHeader";

const long = "你的两个知识助手项目都强调评测与失败恢复，但其中一个项目仍有真实使用效果待验证。"
  + "请具体讲一个你通过工程手段解决回答失控或成本过高的实例，说明你如何区分模型能力问题、工具故障和上下文缺失。"
  + "你当时如何定义问题、选择约束、设计对照，并验证这些约束真正有效？如果重新设计，你会改变什么？";

test.each([
  "请介绍一个你负责的项目。", long, "没有标点的超长英文https://example.test/".repeat(12),
  `${long}\n“原文、数字 17.5%、引号与换行都不能改。”`,
])("formatting preserves the full original text byte-for-byte", question => {
  expect(questionReadingSegments(question).join("")).toBe(question);
});

test("long sentences become readable paragraphs; short questions stay a single heading", () => {
  expect(questionReadingSegments(long).length).toBeGreaterThan(1);
  let view!: ReactTestRenderer;
  act(() => { view = create(<InterviewQuestionText question={long} />); });
  expect(view.root.findByType("h3").props["data-question-length"]).toBe("long");
  const read = (node: ReactTestInstance | string): string => typeof node === "string"
    ? node : node.children.map(child => read(child)).join("");
  expect(read(view.root.findByType("h3"))).toBe(long);
  act(() => view.update(<InterviewQuestionText question="你会如何判断？" />));
  expect(view.root.findByType("h3").props["data-question-length"]).toBe("short");
  expect(view.root.findAllByType("span")).toHaveLength(1);
  act(() => view.unmount());
});

test("asking cues receive sparse literal emphasis, without changing metrics or filling in answers", () => {
  const ranges = questionEmphasisRanges(long);
  expect(ranges.filter(item => item.tone === "accent").length).toBeLessThanOrEqual(3);
  expect(ranges.some(item => long.slice(item.start, item.end) === "如何定义问题")).toBe(true);
  expect(questionEmphasisRanges("正确率提高17.5%，数字尚待核实。")).toEqual([]);
  expect(questionEmphasisRanges("如果你面对两个方向的冲突，你如何理解这些差异？最后又如何平衡速度和质量？")
    .some(item => item.tone === "accent")).toBe(true);
});

test("interviewer introduction preserves round and exact question position, without claiming audio playback", () => {
  let view!: ReactTestRenderer;
  act(() => { view = create(<InterviewQuestionHeader round="项目深挖" index={1} total={5} />); });
  expect(view.root.findByProps({ "aria-label": "第 2 题，共 5 题" })).toBeTruthy();
  expect(view.root.findByProps({ "data-interviewer-emblem": true }).props["aria-hidden"]).toBe("true");
  expect(JSON.stringify(view.toJSON())).not.toContain("正在朗读");
  act(() => view.unmount());
});
