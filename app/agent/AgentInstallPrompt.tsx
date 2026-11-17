"use client";

import { useState } from "react";
import { Copy } from "lucide-react";
import { AGENT_INSTALL_PROMPT } from "@/lib/agent-install-prompt";
import { copyAgentInstallPrompt, recordAgentPromptManualCopy } from "@/lib/agent-install-copy";
import styles from "./AgentGuide.module.css";

export default function AgentInstallPrompt() {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");
  const copy = async () => {
    const copied = await copyAgentInstallPrompt(AGENT_INSTALL_PROMPT, text => navigator.clipboard.writeText(text));
    setState(copied ? "copied" : "error");
  };
  return <div className={styles.installPrompt}>
    <label htmlFor="personal-agent-install-prompt">把这句话发给你的 Agent，它会按下方说明安装</label>
    <textarea
      id="personal-agent-install-prompt" readOnly value={AGENT_INSTALL_PROMPT} rows={4}
      onCopy={() => recordAgentPromptManualCopy()}
    />
    <button type="button" onClick={() => void copy()}>
      <Copy size={16} aria-hidden="true" />{state === "copied" ? "已复制安装指令" : "复制安装指令"}
    </button>
    <p role={state === "error" ? "alert" : "status"}>
      {state === "error"
        ? "复制受限，请在上方指令中全选并复制。"
        : "只统计网页复制操作；不会回传你的本地简历或聊天。"}
    </p>
  </div>;
}
