import React from "react";
import { create, act, type ReactTestRenderer } from "react-test-renderer";
import InterviewQuestionText, { questionReadingSegments } from "./InterviewQuestionText";

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
  expect(view.root.findAllByType("span").map(item => item.children.join("")).join("")).toBe(long);
  act(() => view.update(<InterviewQuestionText question="你会如何判断？" />));
  expect(view.root.findByType("h3").props["data-question-length"]).toBe("short");
  expect(view.root.findAllByType("span")).toHaveLength(1);
  act(() => view.unmount());
});
