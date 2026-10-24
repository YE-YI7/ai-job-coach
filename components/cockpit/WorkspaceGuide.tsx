"use client";

import { useEffect, useState } from "react";
import { CircleHelp } from "lucide-react";
import CoachTour, { type TourStep } from "./CoachTour";
import { useFirstVisit } from "./use-first-visit";
import styles from "./CockpitApp.module.css";

const STEPS: TourStep[] = [
  {
    target: '[data-tour="opportunities"]', title: "一个岗位，一份独立档案",
    body: "左侧保存岗位和材料。查看另一个岗位不会覆盖当前的简历、面试练习或复盘。",
    mobile: { target: '[data-tour="mobile-opportunities"]', title: "岗位列表在右上角", body: "点列表按钮可以换岗位；每个岗位的材料和准备记录分开保存。" },
  },
  { target: '[data-tour="stages"]', title: "自由查看，不会改变实际进度", body: "点击阶段只是浏览。进展以已保存的材料、版本和记录为准。" },
  {
    target: '[data-tour="mentor"]', title: "卡住时，和导师讨论",
    body: "导师结合当前岗位和材料回复。先讨论不会自动修改简历，确认需要改时再进入改稿。",
    mobile: { target: '[data-tour="mobile-actions"]', title: "导师也在右上角", body: "点对话按钮打开导师。你可以讨论写法、补充事实，也可以明确提出修改要求。" },
  },
  { target: '[data-tour="composer"]', title: "模型选择仍在输入区左下角", body: "打开带 Logo 的菜单选择模型。AI 操作按页面说明使用额度，保存材料和手动编辑不会因此变成 AI 改稿。", mobile: false },
];

export default function WorkspaceGuide({ scope, enabled }: { scope: string; enabled: boolean }) {
  const [first, dismiss] = useFirstVisit(`yi-zhi-tour-workspace-v2:${scope}`, 1200);
  const [replay, setReplay] = useState(false);
  useEffect(() => {
    const editing = (event: FocusEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.matches('input,textarea,[contenteditable="true"]')) dismiss();
    };
    document.addEventListener("focusin", editing);
    return () => document.removeEventListener("focusin", editing);
  }, [dismiss]);
  return <>
    <button type="button" className={styles.iconButton} aria-label="界面指引"
      onClick={() => setReplay(true)}><CircleHelp size={18} /></button>
    {enabled && (first || replay) && <CoachTour steps={STEPS}
      onClose={() => { dismiss(); setReplay(false); }} />}
  </>;
}
