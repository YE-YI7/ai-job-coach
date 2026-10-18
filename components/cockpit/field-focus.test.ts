import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("quiet text-entry focus", () => {
  it("uses a neutral local cue without overriding non-text controls", () => {
    const css = source("app/globals.css");
    expect(css).toContain("--field-focus: #777d78");
    expect(css).toContain("box-shadow: inset 0 -1px var(--field-focus)");
    expect(css).toContain('type="checkbox"');
    expect(css).toContain('type="file"');
    expect(css).toContain(':focus:not([aria-invalid="true"])');
  });

  it("never outlines the entire guided mentor form", () => {
    const css = source("components/cockpit/AgentConversation.module.css");
    expect(css).toContain(".panel[data-resume] form:focus-within{outline:none}");
    expect(css).not.toMatch(/form:focus-within\s*\{[^}]*outline:\s*[1-9]/);
    expect(css).toContain(".panel.panel textarea:focus-visible{outline:none;box-shadow:inset 0 -1px var(--field-focus)}");
  });

  it("focuses the composite phone field once, not both wrapper and input", () => {
    const css = source("components/auth/PhoneAuthForm.module.css");
    expect(css).toContain(".phoneInput:focus-within{border-color:var(--field-focus)");
    expect(css).toContain(".phoneInput input:focus{outline:none;box-shadow:none}");
    expect(css).not.toMatch(/\.phoneInput:focus-within\s*\{[^}]*outline/);
    expect(css).toContain(":is(button,a,input[type=checkbox]):focus-visible{outline:2px");
  });

  it("keeps inline editing focus inside the text, not around the editor", () => {
    const editor = source("components/cockpit/ResumeInlineEditor.tsx");
    expect(editor).not.toContain(".resume-live-editor:has(textarea:focus-visible)");
    expect(editor).toContain(".resume-live-editor textarea:focus-visible{box-shadow:inset 0 -1px #777d78}");
    expect(editor).toContain(".resume-live-editor button:focus-visible{outline:2px");
  });

  it("removes both legacy login halos but leaves the atmosphere intact", () => {
    const login = source("app/login/LoginClient.tsx");
    expect(login).not.toMatch(/box-shadow: 0 0 0 [34]px rgba\(249, 115, 22/);
    expect(login).toContain(".input-field input:focus { outline: none; box-shadow: none; }");
    expect(login).toContain("background: linear-gradient(135deg, #f97316 0%, #ea580c 100%)");
  });
});
