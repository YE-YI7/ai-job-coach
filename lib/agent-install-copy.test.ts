import { copyAgentInstallPrompt, recordAgentPromptManualCopy } from "./agent-install-copy";
import { trackProductEvent } from "./product-events";

jest.mock("./product-events", () => ({ trackProductEvent: jest.fn() }));
const tracked = trackProductEvent as jest.Mock;
beforeEach(() => jest.clearAllMocks());

test("records success only after the real clipboard write resolves", async () => {
  let resolve!: () => void;
  const write = jest.fn(() => new Promise<void>(done => { resolve = done; }));
  const result = copyAgentInstallPrompt("private fixture instruction", write);
  expect(write).toHaveBeenCalledWith("private fixture instruction");
  expect(tracked.mock.calls.map(c => c[0])).toEqual(["agent_install_prompt_copy_clicked"]);
  resolve();
  await expect(result).resolves.toBe(true);
  expect(tracked.mock.calls.map(c => c[0])).toEqual([
    "agent_install_prompt_copy_clicked", "agent_install_prompt_copied",
  ]);
  expect(JSON.stringify(tracked.mock.calls)).not.toContain("private fixture instruction");
  expect(tracked.mock.calls[1][1]).toEqual({
    surface: "agent_guide", entry: "personal_agent", prompt_version: "install-v1",
  });
});

test.each(["rejected", "missing API"])("does not claim success on %s", async kind => {
  const write = () => {
    if (kind === "missing API") throw new TypeError("private environment details");
    return Promise.reject(new Error("private browser details"));
  };
  await expect(copyAgentInstallPrompt("private prompt", write)).resolves.toBe(false);
  expect(tracked.mock.calls.map(c => c[0])).toEqual([
    "agent_install_prompt_copy_clicked", "agent_install_prompt_copy_failed",
  ]);
  expect(JSON.stringify(tracked.mock.calls)).not.toMatch(/private/);
});

test("manual copy stays separate from successful whole-prompt copies", () => {
  recordAgentPromptManualCopy();
  expect(tracked).toHaveBeenCalledTimes(1);
  expect(tracked.mock.calls[0][0]).toBe("agent_install_prompt_manual_copy");
});

test("the historical demo and the formal guide are distinguishable", async () => {
  await copyAgentInstallPrompt("fixture", async () => {}, "demo");
  expect(tracked.mock.calls[1][1].surface).toBe("demo");
  recordAgentPromptManualCopy("demo");
  expect(tracked.mock.calls.at(-1)?.[1].surface).toBe("demo");
});
