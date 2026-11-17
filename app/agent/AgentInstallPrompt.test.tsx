import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { readFileSync } from "node:fs";
import AgentInstallPrompt from "./AgentInstallPrompt";
import { AGENT_INSTALL_PROMPT } from "@/lib/agent-install-prompt";
import { copyAgentInstallPrompt, recordAgentPromptManualCopy } from "@/lib/agent-install-copy";

jest.mock("@/lib/agent-install-copy", () => ({
  copyAgentInstallPrompt: jest.fn(), recordAgentPromptManualCopy: jest.fn(),
}));

beforeEach(() => jest.clearAllMocks());

test.each([true, false])("real guide copy button renders clipboard outcome %s", async copied => {
  (copyAgentInstallPrompt as jest.Mock).mockResolvedValue(copied);
  let view!: TestRenderer.ReactTestRenderer;
  act(() => { view = TestRenderer.create(<AgentInstallPrompt />); });
  const textarea = view.root.findByType("textarea");
  expect(textarea.props.value).toBe(AGENT_INSTALL_PROMPT);
  await act(async () => { await view.root.findByType("button").props.onClick(); });
  expect(copyAgentInstallPrompt).toHaveBeenCalledWith(AGENT_INSTALL_PROMPT, expect.any(Function));
  const text = JSON.stringify(view.toJSON());
  expect(text).toContain(copied ? "已复制安装指令" : "复制受限");
  act(() => { textarea.props.onCopy(); });
  expect(recordAgentPromptManualCopy).toHaveBeenCalledTimes(1);
  act(() => view.unmount());
});

test("guide entry is reachable from the actual selected homepage, not just the old demo", () => {
  expect(readFileSync("app/page.tsx", "utf8")).toContain("<HomeLanding");
  expect(readFileSync("app/HomeLanding.tsx", "utf8")).toContain("<FirstLightHome");
  expect(readFileSync("app/first-light/content.ts", "utf8")).toContain('href="/agent"');
  expect(readFileSync("app/agent/page.tsx", "utf8")).toContain("<AgentInstallPrompt");
  expect(readFileSync("app/HomeClient.tsx", "utf8")).toContain('navigator.clipboard.writeText(text), "demo"');
});
