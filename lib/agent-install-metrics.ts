import type { AnalyticsEvent } from "./admin-analytics";

/** Receives already date-filtered, QA-excluded events from the analytics store. */
export function summarizeAgentInstall(events: AnalyticsEvent[]) {
  const copies = events.filter(e => e.event_name.startsWith("agent_install_prompt_"));
  const selected = (name: string) => copies.filter(e => e.event_name === name);
  const unique = (rows: AnalyticsEvent[]) => new Set(rows.map(e =>
    e.user_id || e.event_identity || (e.anon_id ? `anon:${e.anon_id}` : null),
  ).filter(Boolean)).size;
  const clicked = selected("agent_install_prompt_copy_clicked");
  const completed = selected("agent_install_prompt_copied");
  return {
    clicked: clicked.length,
    clickedVisitors: unique(clicked),
    copied: completed.length,
    copiedVisitors: unique(completed),
    failed: selected("agent_install_prompt_copy_failed").length,
    manualCopyActions: selected("agent_install_prompt_manual_copy").length,
    installedUsers: null,
    activeUsers: null,
  };
}

export type AgentInstallSummary = ReturnType<typeof summarizeAgentInstall>;
