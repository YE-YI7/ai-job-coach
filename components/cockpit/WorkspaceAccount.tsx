"use client";

import { useEffect, useRef } from "react";
import { ChevronDown, LogOut } from "lucide-react";
import { TokenPayWidget } from "@/components/tokenpay/TokenPayWidget";
import WatchaPayWidget from "@/components/payments/WatchaPayWidget";
import styles from "./WorkspaceAccount.module.css";

export default function WorkspaceAccount({ label, live, disabled, onLogout }: {
  label: string;
  live: boolean;
  disabled?: boolean;
  onLogout: () => void;
}) {
  const disclosure = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      const current = disclosure.current;
      if (current?.open && event.target instanceof Node && !current.contains(event.target)) current.open = false;
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      const current = disclosure.current;
      if (event.key !== "Escape" || !current?.open) return;
      current.open = false;
      current.querySelector("summary")?.focus();
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return <details ref={disclosure} className={styles.account}>
    <summary aria-label="打开账户与额度"><span className={styles.avatar} aria-hidden="true">{label.slice(0, 1)}</span><span className={styles.name}>{label}</span><ChevronDown size={14} aria-hidden="true" /></summary>
    <div className={styles.menu}>
      <div className={styles.identity}><strong>{label}</strong><span>{live ? "个人工作区" : "示例工作区"}</span></div>
      <div className={styles.billing} aria-label="余额与支付"><TokenPayWidget compact />{live && <WatchaPayWidget />}</div>
      <button type="button" disabled={disabled} onClick={onLogout}><LogOut size={16} aria-hidden="true" />退出登录</button>
    </div>
  </details>;
}
