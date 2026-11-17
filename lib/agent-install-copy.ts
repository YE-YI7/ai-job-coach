import { trackProductEvent } from "./product-events";

export type AgentInstallSurface = "agent_guide" | "demo";

const metadata = (surface: AgentInstallSurface) => ({
  surface,
  entry: "personal_agent",
  prompt_version: "install-v1",
});

/** A successful clipboard write is intent, not proof of installation or use. */
export async function copyAgentInstallPrompt(
  prompt: string,
  writeText: (text: string) => Promise<void>,
  surface: AgentInstallSurface = "agent_guide",
): Promise<boolean> {
  trackProductEvent("agent_install_prompt_copy_clicked", metadata(surface));
  try {
    await writeText(prompt);
  } catch {
    trackProductEvent("agent_install_prompt_copy_failed", metadata(surface));
    return false;
  }
  trackProductEvent("agent_install_prompt_copied", metadata(surface));
  return true;
}

/** The native copy event does not prove that the whole prompt was copied. */
export function recordAgentPromptManualCopy(surface: AgentInstallSurface = "agent_guide") {
  trackProductEvent("agent_install_prompt_manual_copy", metadata(surface));
}
