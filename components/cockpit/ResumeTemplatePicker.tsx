"use client";

import { useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import { Check, ChevronDown, PanelsTopLeft, X } from "lucide-react";
import { printTemplates, type PrintTemplate } from "@/lib/resume-print";
import styles from "./ResumeTemplatePicker.module.css";

const templates = Object.keys(printTemplates) as PrintTemplate[];

export default function ResumeTemplatePicker({
  value,
  onChange,
  disabled,
  inline = false,
}: {
  value: PrintTemplate;
  onChange: (value: PrintTemplate) => void;
  disabled?: boolean;
  inline?: boolean;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null),
    panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const dismiss = (event: Event) => {
      if (
        event.type === "scroll" &&
        event.target instanceof Node &&
        panel.current?.contains(event.target)
      )
        return;
      panel.current?.hidePopover();
    };
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", dismiss, true);
    return () => {
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("scroll", dismiss, true);
    };
  }, []);
  const close = () => {
    panel.current?.hidePopover();
    trigger.current?.focus();
  };
  const choose = (next: PrintTemplate) => {
    onChange(next);
    if (!inline) close();
  };
  const toggle = () => {
    const element = panel.current,
      button = trigger.current;
    if (!element || !button) return;
    if (element.matches(":popover-open")) {
      close();
      return;
    }
    const rect = button.getBoundingClientRect();
    (element.showPopover as (options: { source: HTMLElement }) => void).call(
      element,
      { source: button },
    );
    const { width, height } = element.getBoundingClientRect();
    element.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))}px`;
    element.style.top = `${Math.max(12, Math.min(rect.bottom + 8, window.innerHeight - height - 12))}px`;
    element
      .querySelector<HTMLButtonElement>('[aria-checked="true"]')
      ?.focus({ preventScroll: true });
  };
  const gallery = (
    <>
      <div className={styles.heading}>
        <strong>简历版式</strong>
        <span>选中即预览，PDF 同步使用</span>
        {!inline && <button
          type="button"
          className={styles.close}
          aria-label="关闭版式选择"
          onClick={close}
        ><X size={18} aria-hidden="true" /></button>}
      </div>
      <div
        className={styles.grid}
        role="radiogroup"
        aria-label="简历版式"
        onKeyDown={(event) => {
          const directions: Record<string, number> = {
            ArrowRight: 1,
            ArrowDown: 1,
            ArrowLeft: -1,
            ArrowUp: -1,
          };
          if (!(event.key in directions)) return;
          event.preventDefault();
          const next =
            templates[
              (templates.indexOf(value) +
                directions[event.key] +
                templates.length) %
                templates.length
            ];
          onChange(next);
          event.currentTarget
            .querySelector<HTMLButtonElement>(`[data-template="${next}"]`)
            ?.focus();
        }}
      >
        {templates.map((key) => (
          <button
            type="button"
            key={key}
            role="radio"
            aria-checked={value === key}
            tabIndex={value === key ? 0 : -1}
            aria-label={printTemplates[key].label}
            data-template={key}
            className={styles.tile}
            onClick={() => choose(key)}
            disabled={disabled}
          >
            <Image
              className={styles.paper}
              src={`/resume-templates/v1/${key}.webp`}
              alt=""
              width={420}
              height={594}
              unoptimized
              sizes="(max-width: 480px) 145px, 170px"
            />
            <span className={styles.label}>
              {printTemplates[key].label}
              {value === key && <Check size={14} aria-hidden="true" />}
            </span>
            <span className={styles.description}>
              {printTemplates[key].description}
            </span>
          </button>
        ))}
      </div>
      <p className={styles.note}>
        只换文字稿和 PDF 的排版，原文件与内容保持不变。
      </p>
    </>
  );
  if (inline) return <div className={styles.inline}>{gallery}</div>;
  return (
    <>
      <button
        ref={trigger}
        className={styles.trigger}
        type="button"
        disabled={disabled}
        onClick={toggle}
        aria-haspopup="dialog"
        aria-controls={id}
        aria-expanded={open}
      >
        <PanelsTopLeft size={15} aria-hidden="true" />
        <span>版式 · {printTemplates[value].label}</span>
        <ChevronDown size={13} aria-hidden="true" />
      </button>
      <div
        ref={panel}
        id={id}
        popover="auto"
        role="dialog"
        aria-label="选择简历版式"
        className={styles.panel}
        onToggle={(event) =>
          setOpen((event as unknown as ToggleEvent).newState === "open")
        }
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            close();
          }
        }}
      >
        {gallery}
      </div>
    </>
  );
}
