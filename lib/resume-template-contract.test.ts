import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { printTemplates, resumePrintHtml } from "./resume-print";

test("all six explicit layouts retain content and have preview descriptions", () => {
  expect(Object.keys(printTemplates)).toEqual([
    "classic",
    "modern",
    "warm",
    "compact",
    "editorial",
    "rail",
  ]);
  for (const [key, template] of Object.entries(printTemplates)) {
    expect(template.description).toBeTruthy();
    expect(
      resumePrintHtml(
        "测试姓名\n\n工作经历\n- 保留本人责任。",
        key as keyof typeof printTemplates,
        "测试",
      ),
    ).toContain('<p class="resume-bullet">保留本人责任。</p>');
  }
});
test("visible layout trigger is not buried in More and every primary action shares typography", () => {
  const toolbar = readFileSync("components/cockpit/ResumeToolbar.tsx", "utf8");
  const css = readFileSync(
    "components/cockpit/ResumeToolbar.module.css",
    "utf8",
  );
  expect(
    toolbar.slice(
      toolbar.indexOf("styles.utilityRow"),
      toolbar.indexOf("ref={menu}"),
    ),
  ).toContain("<ResumeTemplatePicker");
  expect(toolbar).not.toContain("<select");
  expect(css).toMatch(
    /\.toolbar \.actions button\{[^}]*font-size:13px;[^}]*font-weight:500;[^}]*line-height:1.5/,
  );
  expect(css).not.toMatch(/\.toolbar button,\.menu button\{font:inherit/);
});
test("new layout preferences use the renderer registry rather than a three-name whitelist", () => {
  const preference = readFileSync("lib/resume-template-preference.ts", "utf8");
  expect(preference).toContain("Object.hasOwn(printTemplates, raw)");
  expect(preference).toContain("resume-print-template");
});
test("pre-generated gallery images come from the current PDF renderer and cannot silently drift", () => {
  const root = "public/resume-templates/v1";
  const manifest = JSON.parse(readFileSync(`${root}/manifest.json`, "utf8"));
  const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
  expect(manifest.rendererSha256).toBe(hash(readFileSync("lib/resume-print.ts")));
  expect(manifest.fictional).toBe(true);
  expect(manifest.templates).toEqual(Object.keys(printTemplates));
  for (const key of manifest.templates) {
    const image = readFileSync(`${root}/${key}.webp`);
    expect(image.length).toBeLessThan(30_000);
    expect(manifest.assets[key].sha256).toBe(hash(image));
  }
  const picker = readFileSync("components/cockpit/ResumeTemplatePicker.tsx", "utf8");
  expect(picker).toContain("/resume-templates/v1/${key}.webp");
  expect(picker).not.toContain("<em");
});
