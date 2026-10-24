import { readFileSync } from "node:fs";
import { FIRST_LIGHT_HTML } from "../../app/first-light/content";
import { ENTRY_KINDS } from "../../lib/entry-doors";
const read = (path: string) => readFileSync(path, "utf8");

test("landing login returns to the cockpit, and FAQ schema uses the rendered copy", () => {
  const home = read("app/HomeLanding.tsx");
  expect(home).toContain("<FirstLightHome");
  expect(FIRST_LIGHT_HTML).not.toContain('href="/register"');
  for (const kind of ENTRY_KINDS) {
    expect(FIRST_LIGHT_HTML).toContain(`href="/cockpit?entry=${kind}"`);
  }
  expect(read("app/page.tsx")).toContain("HOME_FAQS.map");
});

test("choosing a material door only opens the existing intake; models stay behind submit", () => {
  const entry = read("components/cockpit/EntryWorkspace.tsx");
  const choose = entry.slice(
    entry.indexOf("function choose"),
    entry.indexOf("return <main"),
  );
  expect(choose).toContain("onMaterial(material)");
  expect(choose).not.toMatch(/fetch\(|setRequest\(|startRequest/);
  expect(entry).toContain("if (!text.trim() || !enabled) return");
  expect(entry).toContain("startRequest={request}");
  expect(entry).toContain("onStartConsumed={() => setRequest(null)}");
  expect(entry).toContain('restoredStarted === "1"');
  expect(entry).toContain("(selected || canReturn) && <button");
  expect(read("components/cockpit/CockpitApp.tsx")).toContain(
    "withoutEntryParam(window.location.href)",
  );
});

test("guide dismissal cancels its delayed open and typing keeps focus", () => {
  const visit = read("components/cockpit/use-first-visit.ts");
  const dismiss = visit.slice(visit.indexOf("const dismiss"));
  expect(dismiss).toContain("window.clearTimeout(timer.current)");
  expect(visit).toContain("document.activeElement?.matches");
  expect(read("components/cockpit/WorkspaceGuide.tsx")).toContain(
    'document.addEventListener("focusin", editing)',
  );
  expect(read("components/cockpit/CoachTour.tsx")).toContain(
    "focusStillInGuide && previous instanceof HTMLElement",
  );
});

test("old interactive demo and print renderer remain reachable without replacing chat or PDF", () => {
  expect(read("app/demo/page.tsx")).toContain("<HomeClient");
  expect(FIRST_LIGHT_HTML).toContain('href="/demo"');
  const track = read("app/first-light/FirstLightHome.tsx");
  expect(track).toContain('"landing_task_clicked"');
  expect(track).toContain("parseEntryKind");
  expect(track).not.toMatch(/resumeText|jdText|prompt|inputText/);
  const css = read("app/first-light/first-light.css");
  expect(css).toMatch(/prefers-reduced-motion:\s*reduce/);
  expect(css).toMatch(/white-space:\s*nowrap/);
  expect(read("app/first-light/interactions.js")).toContain(
    "window.cancelAnimationFrame",
  );
});
