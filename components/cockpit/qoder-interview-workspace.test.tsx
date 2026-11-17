import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import QoderInterviewLobby from "./QoderInterviewLobby";
import QoderReviewComposer from "./QoderReviewComposer";
import QoderAnswerComposer from "./QoderAnswerComposer";
import VoiceControls from "./VoiceControls";

jest.mock("@phosphor-icons/react", () => ({ Waveform: () => <svg />, SpeakerHigh: () => <svg /> }));
beforeAll(() => Object.defineProperty(globalThis, "window", {
  configurable: true, value: { speechSynthesis: { cancel: jest.fn() } },
}));
afterAll(() => Reflect.deleteProperty(globalThis, "window"));

test("大厅只调用原开始/单题/历史回调，真实轮次插槽与题数选择保留", () => {
  const start = jest.fn(), single = jest.fn(), history = jest.fn(), type = jest.fn(), count = jest.fn();
  let view!: ReactTestRenderer;
  act(() => { view = create(<QoderInterviewLobby role="产品经理" roundLabel="四面" roundType="项目深挖"
    questionCount={5} roundTypes={["业务面", "项目深挖"]} quotaLabel="原收费口径"
    starting={false} roundPicker={<span>原轮次控件</span>} onRoundType={type} onQuestionCount={count}
    onStart={start} onSingle={single} onHistory={history} focus={<details><summary>原题库</summary></details>}
    error="原启动错误" example={false} />); });
  const buttons = view.root.findAllByType("button");
  act(() => buttons.forEach(button => button.props.onClick()));
  expect(start).toHaveBeenCalledTimes(1);
  expect(single).toHaveBeenCalledTimes(1);
  expect(history).toHaveBeenCalledTimes(1);
  act(() => view.root.findByProps({ "aria-label": "选择模拟面试类型" }).props.onChange({ target: { value: "业务面" } }));
  act(() => view.root.findByProps({ "aria-label": "选择题数" }).props.onChange({ target: { value: "8" } }));
  expect(type).toHaveBeenCalledWith("业务面");
  expect(count).toHaveBeenCalledWith(8);
  for (const content of ["四面", "原轮次控件", "原收费口径", "原启动错误", "原题库"]) {
    expect(JSON.stringify(view.toJSON())).toContain(content);
  }
  act(() => view.unmount());
});

test("复盘只展开原文，不自动提交；语音和文字共用原受控数据", () => {
  const change = jest.fn(), submit = jest.fn();
  let view!: ReactTestRenderer;
  const render = (notes: string) => <QoderReviewComposer notes={notes} onChange={change} voiceDisabled
    roundPicker={<span>原轮次</span>}><button onClick={submit}>原保存动作 · 原费用</button></QoderReviewComposer>;
  act(() => { view = create(render("")); });
  expect(view.root.findAllByType("textarea")).toHaveLength(0);
  expect(view.root.findByProps({ "data-interview-part": "review-actions" }).props.hidden).toBe(true);
  act(() => view.root.findAllByType("button").find(button => button.children.includes("直接粘贴或打字"))!.props.onClick());
  act(() => view.root.findByType("textarea").props.onChange({ target: { value: "当时的原话" } }));
  expect(change).toHaveBeenCalledWith("当时的原话");
  expect(submit).not.toHaveBeenCalled();
  act(() => view.update(render("当时的原话")));
  expect(view.root.findByType("textarea").props.value).toBe("当时的原话");
  expect(view.root.findByType(VoiceControls).props.value).toBe("当时的原话");
  expect(view.root.findByType(VoiceControls).props.disabled).toBe(true);
  expect(view.root.findByProps({ "data-interview-part": "review-actions" }).props.hidden).toBe(false);
  act(() => view.unmount());
});

test("已有复盘原文直接可见，只声明已接入的本机文字格式", () => {
  let view!: ReactTestRenderer;
  act(() => { view = create(<QoderReviewComposer notes="未提交草稿" onChange={() => {}} voiceDisabled={false}
    roundPicker={<span>原轮次</span>}><button>原操作</button></QoderReviewComposer>); });
  expect(view.root.findByType("textarea").props.value).toBe("未提交草稿");
  expect(view.root.findByType("input").props.accept).toBe(".txt,.md,text/plain,text/markdown");
  expect(JSON.stringify(view.toJSON())).not.toContain("MP3");
  act(() => view.unmount());
});

test("读取文字材料不提交或替换旧草稿，读入期间的新输入也保留", async () => {
  const change = jest.fn(), submit = jest.fn();
  let resolve!: (text: string) => void;
  let view!: ReactTestRenderer;
  const render = (notes: string) => <QoderReviewComposer notes={notes} onChange={change} voiceDisabled={false}
    roundPicker={<span>原轮次</span>}><button onClick={submit}>原保存</button></QoderReviewComposer>;
  act(() => { view = create(render("旧草稿")); });
  const file = { name: "转写稿.md", size: 12, text: () => new Promise<string>(r => { resolve = r; }) };
  act(() => view.root.findByType("input").props.onChange({ target: { files: [file] } }));
  act(() => view.update(render("旧草稿和新输入")));
  await act(async () => { resolve("文件原文"); });
  expect(change).toHaveBeenCalledWith("旧草稿和新输入\n\n文件原文");
  expect(submit).not.toHaveBeenCalled();
  expect(JSON.stringify(view.toJSON())).toContain("确认后再保存");
  act(() => view.unmount());
});

test("读取失败保留原文，不触发保存或改写", async () => {
  const change = jest.fn();
  let view!: ReactTestRenderer;
  act(() => { view = create(<QoderReviewComposer notes="原文" onChange={change} voiceDisabled={false}
    roundPicker={null}><button>原保存</button></QoderReviewComposer>); });
  await act(async () => view.root.findByType("input").props.onChange({ target: {
    files: [{ name: "录音.mp3", size: 12, text: jest.fn() }],
  } }));
  expect(change).not.toHaveBeenCalled();
  expect(view.root.findByType("textarea").props.value).toBe("原文");
  expect(JSON.stringify(view.toJSON())).toContain("目前支持 TXT");
  act(() => view.unmount());
});

test("现场回答只切显示状态，语音转文和打字不自行清空/提交/评价", () => {
  const change = jest.fn();
  let view!: ReactTestRenderer;
  const render = (value: string, blocked = false) => <QoderAnswerComposer value={value} onChange={change}
    question="真实题目" textareaId="original-answer-id" disabled={false} blocked={blocked} />;
  act(() => { view = create(render("")); });
  expect(view.root.findAllByType("textarea")).toHaveLength(0);
  act(() => view.root.findByType(VoiceControls).props.onChange("听写原文"));
  expect(change).toHaveBeenCalledWith("听写原文");
  act(() => view.update(render("听写原文")));
  expect(view.root.findByType("textarea").props.value).toBe("听写原文");
  expect(view.root.findByType("textarea").props.id).toBe("original-answer-id");
  expect(view.root.findByType(VoiceControls).props.readText).toBe("真实题目");
  act(() => view.update(render("", true)));
  expect(view.root.findByType("textarea").props.placeholder).toBe("根据反馈把证据补完整…");
  act(() => view.unmount());
});
