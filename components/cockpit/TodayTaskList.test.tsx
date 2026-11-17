import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { renderToStaticMarkup } from "react-dom/server";
import TodayTaskList from "./TodayTaskList";
import { buildTodayView, type TodayTask } from "@/lib/coach-harness/today-view";
import { demoOpportunities } from "@/lib/opportunities/demo";

const base = buildTodayView({
  opportunities: demoOpportunities, activeId: demoOpportunities[0].id, timeZone: "Asia/Shanghai",
}).tasks[0];
const task: TodayTask = { ...base, id: "task-a", target: "tab", opportunityId: "op-a", sourceActionId: "action-a" };
const next = { ...task, id: "task-b", title: "再检查一个项目", sourceActionId: "action-b" };
const noop = () => {};
const props = { tasks: [task, next], onOpen: noop, onSnooze: noop, onComplete: noop };

test("完整原文与三个命令保留；完成是按钮而非复选框或可反选开关", () => {
  const html = renderToStaticMarkup(<TodayTaskList {...props} />);
  for (const value of [task.title, task.why, "明天再看", "标记做过", "时长按你手上的材料再定"]) {
    expect(html).toContain(value);
  }
  expect(html.match(/<button/g)).toHaveLength(6);
  expect(html).not.toContain('role="checkbox"');
  expect(html).not.toContain("aria-pressed");
  expect(html).not.toContain("已保存");
});

test.each([0, 1, 2])("动作 %s 把同一任务对象交回已有业务回调，没有重复调用", index => {
  const callbacks = [jest.fn(), jest.fn(), jest.fn()];
  let root!: ReactTestRenderer;
  act(() => { root = create(<TodayTaskList {...props}
    onOpen={callbacks[0]} onSnooze={callbacks[1]} onComplete={callbacks[2]} />); });
  act(() => root.root.findAllByType("button")[index].props.onClick());
  expect(callbacks[index]).toHaveBeenCalledTimes(1);
  expect(callbacks[index]).toHaveBeenCalledWith(task);
  expect(callbacks.filter((_, n) => n !== index).every(fn => fn.mock.calls.length === 0)).toBe(true);
  const output = JSON.stringify(root.toJSON());
  expect(output).not.toContain("已保存");
  if (index === 2) expect(output).toContain("不代表能力已确认");
  act(() => root.unmount());
});

test("原任务移除后反馈留在该任务位置，不借助超时、导航或新任务冒充结果", () => {
  let root!: ReactTestRenderer;
  act(() => { root = create(<TodayTaskList {...props} />); });
  act(() => root.root.findAllByType("button")[2].props.onClick());
  act(() => root.update(<TodayTaskList {...props} tasks={[next]} />));
  const output = root.toJSON();
  const html = JSON.stringify(output);
  expect(html.indexOf("任务操作反馈")).toBeLessThan(html.indexOf("再检查一个项目"));
  expect(html).toContain(task.title);
  expect(html).toContain("当前页面已标记做过");
  expect(html).not.toContain("云端已保存");
  act(() => root.update(<TodayTaskList {...props} tasks={[]} />));
  expect(JSON.stringify(root.toJSON())).toContain("任务操作反馈");
  act(() => root.unmount());
});

test("回调失败时不显示完成反馈", () => {
  let root!: ReactTestRenderer;
  act(() => { root = create(<TodayTaskList {...props} onComplete={() => { throw new Error("not updated"); }} />); });
  expect(() => act(() => root.root.findAllByType("button")[2].props.onClick())).toThrow("not updated");
  expect(JSON.stringify(root.toJSON())).not.toContain("当前页面已标记做过");
  act(() => root.unmount());
});

test("没有原动作ID不能完成；安排任务保留专用入口、不新增延后命令", () => {
  const html = renderToStaticMarkup(<TodayTaskList {...props}
    tasks={[{ ...task, sourceActionId: undefined, opportunityId: null, target: "arrangement" }]} />);
  expect(html).toContain("去安排里继续");
  expect(html).not.toContain("明天再看");
  expect(html).not.toContain("标记做过");
  expect(html.match(/<button/g)).toHaveLength(1);
});
