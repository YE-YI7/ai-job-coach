import { summarizeAgentInstall } from "./agent-install-metrics";
import type { AnalyticsEvent } from "./admin-analytics";

function event(name: string, identity: string | null): AnalyticsEvent {
  return {
    id: `${name}-${identity}`, user_id: null, event_identity: identity,
    event_name: name, created_at: "2026-11-17T04:00:00Z",
  };
}

test("deduplicates visitors, not actions; intent never becomes local installation/use", () => {
  const data = summarizeAgentInstall([
    event("agent_install_prompt_copy_clicked", "anon:a"),
    event("agent_install_prompt_copy_clicked", "anon:a"),
    event("agent_install_prompt_copy_clicked", "anon:b"),
    event("agent_install_prompt_copied", "anon:a"),
    event("agent_install_prompt_copied", "anon:a"),
    event("agent_install_prompt_copy_failed", "anon:b"),
    event("agent_install_prompt_manual_copy", "anon:b"),
    event("agent_resume_saved", "hosted-customer"),
    event("agent_answer_completed", "hosted-customer"),
  ]);
  expect(data).toEqual({
    clicked: 3, clickedVisitors: 2, copied: 2, copiedVisitors: 1,
    failed: 1, manualCopyActions: 1, installedUsers: null, activeUsers: null,
  });
});

test("unknown identity counts as an event but never as an invented person", () => {
  const data = summarizeAgentInstall([
    event("agent_install_prompt_copied", null),
    { ...event("agent_install_prompt_copied", null), anon_id: "browser-a" },
    { ...event("agent_install_prompt_copied", "fallback"), user_id: "user-a" },
    { ...event("agent_install_prompt_copied", "other"), user_id: "user-a" },
  ]);
  expect(data).toMatchObject({ copied: 4, copiedVisitors: 2 });
});

test("empty history keeps unmeasured local use unknown, not zero", () => {
  expect(summarizeAgentInstall([])).toMatchObject({
    copied: 0, copiedVisitors: 0, installedUsers: null, activeUsers: null,
  });
});
