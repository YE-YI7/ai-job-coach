import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import postcss from "postcss";
import { FIRST_LIGHT_HTML, FIRST_LIGHT_SOURCE_SHA } from "./content";
import { HOME_FAQS } from "./home-facts";

const directory = __dirname;
const css = readFileSync(path.join(directory, "first-light.css"), "utf8");
const interactions = readFileSync(
  path.join(directory, "interactions.js"),
  "utf8",
);

describe("selected Claude to DeepSeek first-light homepage", () => {
  it("never traps vertical page scrolling inside demo panes", () => {
    expect(css).not.toMatch(/overscroll-behavior:\s*(contain|none)/);
    expect(css).not.toContain("touch-action: none");
    expect(css).not.toContain("left: -150px");
    const mentorRule = css.slice(css.indexOf(".mentor {"), css.indexOf(".mentor img {"));
    expect(mentorRule).toContain("position: relative");
    expect(mentorRule).toContain("pointer-events: none");
  });
  it("pins the actual selected v5 source, not the old four-door landing", () => {
    expect(FIRST_LIGHT_SOURCE_SHA).toBe(
      "1ef10ac1819d0f03dcb409cf547a951a38b96316108fc5b527c4ac2d6cc0efcf",
    );
    expect(FIRST_LIGHT_HTML).toContain("陪你，");
    expect(FIRST_LIGHT_HTML).toContain("找到工作。");
    for (const id of [
      "walk",
      "chapters",
      "cvShot",
      "ivShot",
      "rail",
      "contact",
      "light",
    ]) {
      expect(FIRST_LIGHT_HTML).toContain(`id="${id}"`);
    }
    expect(FIRST_LIGHT_HTML).not.toContain("从一个确定开始");
  });

  it("renders readable SSR content without inline event handlers or prototype scripts", () => {
    expect(FIRST_LIGHT_HTML).not.toMatch(
      /<script|\son[a-z]+\s*=|class="assembling"/i,
    );
    expect(FIRST_LIGHT_HTML).not.toMatch(/file:\/\/|\/Users\/|\.\.\//);
    expect(FIRST_LIGHT_HTML).toContain("真实页面 · 示例数据");
    expect(FIRST_LIGHT_HTML).toContain("交互演示 · 不会发送");
    expect(FIRST_LIGHT_HTML).toContain("不调用模型、不保存输入");
    expect(FIRST_LIGHT_HTML).not.toContain("后来找了机构，花了上万块");
  });

  it("keeps real application entries and the existing demo separate from local examples", () => {
    for (const kind of ["resume", "jd", "find_jobs", "one_sentence"]) {
      expect(FIRST_LIGHT_HTML).toContain(`/cockpit?entry=${kind}`);
    }
    for (const route of [
      "/demo",
      "/agent",
      "/tools/resume-jd-gap",
      "/tools/offer-compare",
      "/privacy",
    ]) {
      expect(FIRST_LIGHT_HTML).toContain(`href="${route}"`);
    }
    expect(interactions).not.toMatch(/\b(fetch|XMLHttpRequest|WebSocket)\b/);
    expect(interactions).not.toMatch(/window\.(hear|__t)\s*=/);
    expect(interactions).not.toContain("fontpick");
    expect(interactions).toContain("Re-open the unresolved choice");
  });

  it("shares every displayed FAQ with structured data and preserves the one-block free rule", () => {
    for (const answer of HOME_FAQS) {
      expect(FIRST_LIGHT_HTML).toContain(answer.q);
      expect(FIRST_LIGHT_HTML).toContain(answer.a);
    }
    expect(HOME_FAQS.at(-1)?.a).toContain("同一账号首次");
    expect(HOME_FAQS.at(-1)?.a).toContain("仅一次");
    expect(HOME_FAQS.at(-1)?.a).toContain("不是免费改整份");
  });

  it("scopes every regular CSS rule to this homepage, not chat, resume or print", () => {
    postcss.parse(css).walkRules((rule) => {
      if (rule.parent?.type === "atrule" && /keyframes$/.test(rule.parent.name))
        return;
      for (const selector of rule.selectors) {
        expect(selector.startsWith("[data-first-light-home]")).toBe(true);
      }
    });
  });

  it("cancels timers, animation frames and observers when navigating away", () => {
    expect(interactions).toContain("controller.abort()");
    expect(interactions).toContain("window.cancelAnimationFrame");
    expect(interactions).toContain("observer.disconnect()");
    expect(interactions).not.toContain("document.body");
    expect(interactions).not.toContain("document.documentElement");
  });

  it("ships every public image and font referenced by the markup and CSS", () => {
    const paths = [
      ...FIRST_LIGHT_HTML.matchAll(
        /(?:src|href)="(\/(?:first-light|fonts)\/[^"#?]+)"/g,
      ),
    ].map((m) => m[1]);
    const stylePaths = [
      ...css.matchAll(/url\(["']?(\/(?:first-light|fonts)\/[^\s"')]+)["']?\)/g),
    ].map((m) => m[1]);
    for (const item of new Set([...paths, ...stylePaths])) {
      expect(existsSync(path.join(process.cwd(), "public", item))).toBe(true);
    }
    expect(
      existsSync(
        path.join(process.cwd(), "public/fonts/OFL-SourceHanSerif.txt"),
      ),
    ).toBe(true);
  });
});
