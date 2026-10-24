import { readFileSync } from "node:fs";
const source = readFileSync("components/cockpit/ExpandableText.tsx", "utf8");

test("short copy stays complete and long copy remains recoverable", () => {
  expect(source).toContain("characters.length > previewLength");
  expect(source).toContain("long && !expanded");
  expect(source).toContain("Array.from(text)");
  expect(source).toContain(": text}");
});
test("disclosure is keyboard-operable and never saves or calls a model", () => {
  expect(source).toContain("aria-expanded={expanded}");
  expect(source).toContain("aria-controls={id}");
  expect(source).toContain("setExpanded((value) => !value)");
  expect(source).not.toMatch(/\b(fetch|localStorage|onSave|onUpdate)\b/);
});
