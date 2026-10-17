"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, Eye, FileText, MoreHorizontal, Redo2, Sparkles, Undo2, Upload } from "lucide-react";
import { printTemplates, type PrintTemplate } from "@/lib/resume-print";
import styles from "./ResumeToolbar.module.css";

export default function ResumeToolbar({
  busy, canGenerate, needsDetail, hasChanges, pendingCount, fee, canUndo, canRedo,
  onGenerate, onUndo, onRedo, showMarks, onShowMarks, showOriginal, onShowOriginal,
  template, onTemplate, onReplace, exportControl,
}: {
  busy: boolean; canGenerate: boolean; needsDetail: boolean; hasChanges: boolean;
  pendingCount: number; fee: string; canUndo: boolean; canRedo: boolean;
  onGenerate: () => void; onUndo: () => void; onRedo: () => void;
  showMarks: boolean; onShowMarks: (value: boolean) => void;
  showOriginal: boolean; onShowOriginal: () => void;
  template: PrintTemplate; onTemplate: (value: PrintTemplate) => void;
  onReplace?: () => void; exportControl: ReactNode;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const feeId = "resume-toolbar-fee";

  useEffect(() => {
    const element = menu.current;
    if (!element) return;
    const sync = (event: Event) => setOpen((event as ToggleEvent).newState === "open");
    const dismiss = (event: Event) => { if (!(event.target instanceof Node) || !element.contains(event.target)) element.hidePopover(); };
    element.addEventListener("toggle", sync);
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", dismiss, true);
    return () => { element.removeEventListener("toggle", sync); window.removeEventListener("resize", dismiss); window.removeEventListener("scroll", dismiss, true); };
  }, []);

  const close = (restoreFocus = false) => {
    menu.current?.hidePopover();
    if (restoreFocus) trigger.current?.focus();
  };
  const toggle = () => {
    const rect = trigger.current?.getBoundingClientRect();
    const element = menu.current;
    if (!rect || !element) return;
    element.style.left = `${Math.max(12, Math.min(rect.right - 256, window.innerWidth - 268))}px`;
    element.style.top = `${Math.max(12, Math.min(rect.bottom + 8, window.innerHeight - 320))}px`;
    element.togglePopover();
  };

  return <header className={styles.toolbar}>
    <div className={styles.headingRow}>
      <div className={styles.identity}>
        <h2>{showOriginal ? "原简历" : "简历"}</h2>
        <span role="status">{busy ? "正在修改" : pendingCount ? `${pendingCount} 处待确认` : hasChanges ? "修改已处理" : "工作稿"}</span>
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.revise} aria-describedby={feeId} disabled={busy || !canGenerate} onClick={onGenerate}>
          <Sparkles size={15} aria-hidden="true" />{busy ? "正在修改…" : needsDetail ? "继续补充" : hasChanges ? "重新修改" : "开始修改"}
        </button>
        {exportControl}
      </div>
    </div>
    <div className={styles.utilityRow}>
      <div className={styles.history} role="group" aria-label="简历编辑历史">
        <button type="button" aria-label="撤销简历修改" title="撤销" disabled={busy || !canUndo} onClick={onUndo}><Undo2 size={16} aria-hidden="true" /></button>
        <button type="button" aria-label="重做简历修改" title="重做" disabled={busy || !canRedo} onClick={onRedo}><Redo2 size={16} aria-hidden="true" /></button>
      </div>
      <button type="button" className={styles.marks} aria-pressed={showMarks && !showOriginal} onClick={() => onShowMarks(!showMarks || showOriginal)}>
        <Eye size={15} aria-hidden="true" />修改标记{showMarks && !showOriginal && <Check size={12} aria-hidden="true" />}
      </button>
      <small id={feeId} className={styles.fee}>{fee}</small>
      <button ref={trigger} type="button" className={styles.more} aria-label="简历更多选项" aria-expanded={open} aria-controls="resume-options-popover" onClick={toggle}>
        <MoreHorizontal size={19} aria-hidden="true" />
      </button>
    </div>
    <div ref={menu} id="resume-options-popover" popover="auto" className={styles.menu} aria-label="简历选项" onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); close(true); } }}>
      <button type="button" onClick={() => { onShowOriginal(); close(true); }}><FileText size={16} aria-hidden="true" />{showOriginal ? "回到修改稿" : "查看原文件"}</button>
      {onReplace && <button type="button" onClick={() => { onReplace(); close(); }}><Upload size={16} aria-hidden="true" />上传 / 替换简历</button>}
      <label className={styles.template}>
        <span>导出版式</span>
        <span className={styles.selectValue}>{printTemplates[template].label}<ChevronDown size={14} aria-hidden="true" /></span>
        <select aria-label="简历版式" value={template} onChange={event => onTemplate(event.target.value as PrintTemplate)}>
          {(Object.keys(printTemplates) as PrintTemplate[]).map(id => <option key={id} value={id}>{printTemplates[id].label}</option>)}
        </select>
      </label>
      <p>版式只用于文字工作稿与 PDF，上传的原文件保持原样。</p>
    </div>
  </header>;
}
