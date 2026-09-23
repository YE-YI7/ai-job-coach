"use client";
import { useCallback, useSyncExternalStore } from "react";
import type { PrintTemplate } from "./resume-print";

// 版式偏好是全局一份：简历台的整页渲染和 PDF 导出必须用同一个模板，
// 否则「选模板直接渲染上去」和实际导出的文件会对不上。
const KEY = "resume-print-template";
const listeners = new Set<() => void>();
let cached: { raw: string | null; value: PrintTemplate } = { raw: null, value: "classic" };

function parse(raw: string | null): PrintTemplate {
  return raw === "modern" || raw === "warm" ? raw : "classic";
}

function read(): PrintTemplate {
  if (typeof window === "undefined") return "classic";
  let raw: string | null = null;
  try { raw = window.localStorage.getItem(KEY); } catch { raw = null; }
  if (cached.raw !== raw) cached = { raw, value: parse(raw) };
  return cached.value;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => { if (event.key === KEY) listener(); };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(listener); window.removeEventListener("storage", onStorage); };
}

export function useResumeTemplate(): [PrintTemplate, (template: PrintTemplate) => void] {
  const value = useSyncExternalStore(subscribe, read, () => "classic" as PrintTemplate);
  const set = useCallback((next: PrintTemplate) => {
    try { window.localStorage.setItem(KEY, next); } catch { /* 隐私模式下退化为单次会话内生效 */ }
    for (const listener of listeners) listener();
  }, []);
  return [value, set];
}
