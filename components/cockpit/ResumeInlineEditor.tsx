"use client";

import { useLayoutEffect, useRef } from "react";
import { Check, Trash2, X } from "lucide-react";

/** This form lives in the review iframe, never in the exported document. */
export default function ResumeInlineEditor({ value, headingOnly, confirmingDelete, disabled, error, onChange, onDelete, onCancel, onSubmit }: {
  value: string; headingOnly: boolean; confirmingDelete: boolean; disabled: boolean; error: string;
  onChange: (value: string) => void; onDelete: () => void; onCancel: () => void; onSubmit: () => void;
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  const continueEditing = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if (confirmingDelete) continueEditing.current?.focus();
    else input.current?.focus();
  }, [confirmingDelete]);
  useLayoutEffect(() => {
    const element = input.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  }, [value, confirmingDelete]);
  return <div className="resume-live-editor" role="group" aria-label={confirmingDelete ? "确认删除简历区块" : headingOnly ? "编辑简历标题" : "编辑简历段落"} onKeyDown={event => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onCancel(); }
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); onSubmit(); }
  }}>
    <style>{`
      section[data-inline-editing=true] > :not(.resume-live-editor){display:none!important}
      .resume-live-editor{margin:-8px -10px;padding:12px;border:0;border-radius:9px;background:#fff;box-shadow:inset 0 1px 0 #fff,0 1px 2px rgb(27 34 27 / .12),0 8px 24px -6px rgb(27 34 27 / .16);font:13px/1.6 "PingFang SC","Microsoft YaHei",sans-serif;color:#272b27}
      .resume-live-editor textarea{display:block;box-sizing:border-box;width:100%;min-height:34px;max-height:55vh;resize:vertical;margin:0;padding:4px 2px;border:0;border-radius:3px;background:transparent;font:inherit;font-size:14px;line-height:1.8;color:inherit;caret-color:#944429;outline:none}
      .resume-live-editor textarea:focus-visible{background:#fdfefb;box-shadow:none}
      .resume-live-editor{animation:inline-editor-arrive 180ms cubic-bezier(.16,1,.3,1)}
      @keyframes inline-editor-arrive{from{opacity:.6;transform:translateY(3px)}to{opacity:1;transform:translateY(0)}}
      .resume-live-editor p{font:12px/1.6 "PingFang SC",sans-serif;margin:10px 2px;color:#62675f}
      .resume-live-editor p[role=alert]{color:#944429}
      .resume-live-editor footer{display:flex;gap:6px;align-items:center;justify-content:flex-end;margin-top:10px}
      .resume-live-editor button{display:inline-flex;align-items:center;justify-content:center;gap:5px;min-height:34px;padding:6px 10px;border:0;border-radius:6px;background:transparent;color:inherit;font:12px/1.4 "PingFang SC",sans-serif;cursor:pointer;transition:background-color 160ms ease,box-shadow 160ms ease,transform 160ms cubic-bezier(.22,1,.36,1)}
      .resume-live-editor button:first-child{margin-right:auto;color:#73766f}
      .resume-live-editor button:hover:not(:disabled){background:#f0f1ed}
      .resume-live-editor button[data-save]{background:linear-gradient(180deg,#3a4239,#272e27);color:white;box-shadow:inset 0 1px 0 rgb(255 255 255 / .14),inset 0 -1px 0 rgb(0 0 0 / .18),0 1px 2px rgb(27 34 27 / .16)}
      .resume-live-editor button[data-save]:hover:not(:disabled){background:#41483f}
      .resume-live-editor button:active:not(:disabled){transform:translateY(1px)}
      .resume-live-editor button[data-save]:active:not(:disabled){background:#272e27;box-shadow:inset 0 1px 2px rgb(0 0 0 / .2)}
      .resume-live-editor button:focus-visible{outline:2px solid #aa4f2e;outline-offset:3px}
      .resume-live-editor button:disabled{opacity:.45;cursor:default}
      .resume-live-editor svg{width:14px;height:14px;stroke-width:1.6;flex:none}
      @media(max-width:700px){.resume-live-editor{margin:0;padding:10px}.resume-live-editor textarea{font-size:16px}.resume-live-editor button{min-height:44px;padding-inline:8px}}
      @media(prefers-reduced-motion:reduce){.resume-live-editor{animation:none}.resume-live-editor button{transition:none}.resume-live-editor button:active:not(:disabled){transform:none}}
    `}</style>
    {confirmingDelete ? <><strong role="alert">删除这块内容？</strong><p>原文件不变，删除后可以撤销。</p></> : <textarea ref={input} autoFocus aria-label={headingOnly ? "简历区块标题" : "简历段落正文"} value={value} maxLength={6000} rows={headingOnly ? 1 : 3} disabled={disabled} onChange={event => onChange(event.target.value)} />}
    {error && <p role="alert">{error}</p>}
    <footer>
      {!confirmingDelete && <button type="button" aria-label="删除此块" title="删除此块" disabled={disabled} onClick={onDelete}><Trash2 /></button>}
      <button ref={continueEditing} type="button" onClick={onCancel}><X />{confirmingDelete ? "继续编辑" : "取消"}</button>
      <button type="button" data-save disabled={disabled} onClick={onSubmit}><Check />{confirmingDelete ? "确认删除" : headingOnly ? "保存标题" : "保存这段文字"}</button>
    </footer>
  </div>;
}
