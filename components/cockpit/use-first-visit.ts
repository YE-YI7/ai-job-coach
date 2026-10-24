"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 首次使用才出现的提示/导览。localStorage 不可用（隐私模式）时照常显示，
 * 关闭后写标记；读不到标记就再来一次，不把用户卡在“永远不再出现”。
 */
export function useFirstVisit(key: string, delay = 0) {
  const [open, setOpen] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    let seen = false;
    try {
      seen = Boolean(window.localStorage.getItem(key));
    } catch {
      seen = false;
    }
    if (seen) return;
    timer.current = window.setTimeout(() => {
      timer.current = null;
      // Do not interrupt somebody who started typing during the delay.
      if (document.activeElement?.matches('input,textarea,[contenteditable="true"]')) return;
      setOpen(true);
    }, delay);
    return () => { if (timer.current !== null) window.clearTimeout(timer.current); };
  }, [key, delay]);

  const dismiss = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    try {
      window.localStorage.setItem(key, "1");
    } catch {
      /* 隐私模式下写不进去；本次关闭即可 */
    }
    setOpen(false);
  }, [key]);

  return [open, dismiss] as const;
}
