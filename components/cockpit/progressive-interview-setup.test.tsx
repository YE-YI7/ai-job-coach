import React, { useState } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { readFileSync } from "node:fs";
import ProgressiveInterviewSetup from "./ProgressiveInterviewSetup";

function Harness({ start, initialRound = "一面" }: { start: () => void; initialRound?: string }) {
  const [round, setRound] = useState(initialRound);
  const [type, setType] = useState("业务面");
  const [count, setCount] = useState(3);
  return <ProgressiveInterviewSetup roundLabel={round} roundType={type} questionCount={count}
    roundTypes={["业务面", "项目深挖", "HR面"]} onRoundType={setType} onQuestionCount={setCount}
    renderRoundPicker={confirm => <div role="group" aria-label="测试轮次">
      {["一面", "二面", "六面"].map(value => <button type="button" key={value}
        onClick={() => { setRound(value); confirm(); }}>{value}</button>)}
    </div>} startControl={<button onClick={start}>原开始按钮</button>} />;
}
const button = (view: ReactTestRenderer, text: string) => view.root.findAllByType("button")
  .find(item => item.children.filter(child => typeof child === "string" || typeof child === "number").join("") === text)!;

test("先轮次再视角/题数，确认不启动，原开始回调仍须显式点击", () => {
  const start = jest.fn();
  let view!: ReactTestRenderer;
  act(() => { view = create(<Harness start={start} />); });
  expect(view.root.findAllByProps({ "aria-label": "选择题数" })).toHaveLength(0);
  expect(button(view, "原开始按钮")).toBeUndefined();
  act(() => button(view, "二面").props.onClick());
  expect(view.root.findByProps({ "aria-label": "选择模拟面试类型" })).toBeTruthy();
  act(() => button(view, "项目深挖").props.onClick());
  act(() => button(view, "5 题").props.onClick());
  act(() => button(view, "确认这组设置").props.onClick());
  expect(start).not.toHaveBeenCalled();
  expect(JSON.stringify(view.toJSON())).toContain("二面");
  expect(JSON.stringify(view.toJSON())).toContain("项目深挖");
  expect(button(view, "原开始按钮")).toBeDefined();
  act(() => button(view, "原开始按钮").props.onClick());
  expect(start).toHaveBeenCalledTimes(1);
  act(() => view.unmount());
});

test("回改轮次不清空视角和题数，原自填归一化回调可直接推进", () => {
  let view!: ReactTestRenderer;
  act(() => { view = create(<Harness start={jest.fn()} />); });
  act(() => button(view, "二面").props.onClick());
  act(() => button(view, "项目深挖").props.onClick());
  act(() => button(view, "8 题").props.onClick());
  act(() => button(view, "确认这组设置").props.onClick());
  act(() => button(view, "再调整一下").props.onClick());
  expect(button(view, "8 题").props["aria-pressed"]).toBe(true);
  act(() => button(view, "改轮次").props.onClick());
  act(() => button(view, "六面").props.onClick());
  expect(button(view, "项目深挖").props["aria-pressed"]).toBe(true);
  expect(button(view, "8 题").props["aria-pressed"]).toBe(true);
  expect(JSON.stringify(view.toJSON())).toContain("已选六面");
  act(() => view.unmount());
});

test("当前设置捷径不虚构上次配置、不自动开模型或请求权限", () => {
  const start = jest.fn();
  let view!: ReactTestRenderer;
  act(() => { view = create(<Harness start={start} initialRound="四面" />); });
  const shortcut = view.root.findAllByType("button").find(item => item.props.className?.includes("shortcut"))!;
  act(() => shortcut.props.onClick());
  expect(JSON.stringify(view.toJSON())).toContain("四面");
  expect(JSON.stringify(view.toJSON())).not.toContain("上次");
  expect(start).not.toHaveBeenCalled();
  act(() => view.unmount());
});

test("获准上线后默认启用，开发对照仍可关闭，原父层拥有全部选择", () => {
  const source = readFileSync("components/cockpit/CockpitApp.tsx", "utf8");
  expect(source).toContain('progressiveInterviewSetup = true');
  expect(source).toContain('const showProgressiveSetup = progressiveInterviewSetup;');
  expect(source).toContain('onChange={value => { setRoundOrdinalLabel(value); onConfirmed(); }}');
  const route = readFileSync("app/cockpit/preview/page.tsx", "utf8");
  expect(route).toContain('if (process.env.NODE_ENV !== "development") notFound();');
  const component = readFileSync("components/cockpit/ProgressiveInterviewSetup.tsx", "utf8");
  expect(component).not.toContain("fetch(");
  expect(component).not.toContain("localStorage");
});
