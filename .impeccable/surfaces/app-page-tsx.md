---
version: 1
slug: "app-page-tsx"
primary_target: "app/page.tsx"
related_targets: ["app/HomeClient.tsx","app/Home.module.css","components/resume/ResumePaper.tsx","components/resume/ResumePaper.module.css","lib/resume-print.ts"]
---

Mode: Persuade for `/`. `/agent` keeps its independent execution manual unchanged.

## 2026-10-14 selected surface: 成品主舞台

Approval: user explicitly selected the second displayed image: `/Users/yi/.codex/generated_images/019ff5a3-9056-7d43-8699-0111f7f80204/exec-43431c3b-8bef-4cfc-bf91-8ac04cd40a32.png` (977 × 1610). Seed 14328570, dealt candidates 3/5/6; selected display position 2, candidate 5, 成品主舞台. This replaces the previous homepage runtime chooser, not the Agent guide or the cockpit's other workflows. Git retains the superseded contract; it is not a current homepage requirement.

THESIS: Show a complete, readable résumé and one concrete mentor-assisted revision before asking the visitor to register.
OWN-WORLD: Near-white page, ink typography, restrained orange actions, quiet light-gray product stage, official YiZhi logo. No invented illustration, success rates, customers, or ornamental icon wall.
STORY: Understand the service → compare the fictional original with a concrete suggestion → optionally adopt one sentence or preview PDF → see the interview explain-and-reanswer mechanism → enter the workspace. Existing free tools and local Agent installation remain reachable in FAQ and footer.
FIRST VIEWPORT: Centered “你的 AI 求职导师” above a dark primary action and a text link; the product stage pairs one full paper résumé with one explanation. Original, suggestion, and PDF remain separate controls. Show the mechanism before lower-page interview practice and FAQ; do not restore the old two-runtime hero.
FORM: Surface seed 14328570, selected option 2 / 成品主舞台. The approved image is the visual target. A4 must be complete rather than cropped to the concept's paper window; all demonstration data must be clearly fictional. No false cloud-save status for a local demo.
Signature interaction: adopting the single suggestion changes exactly that sentence in the shared document renderer, while switching to original restores the unchanged source. PDF uses the same document body and type geometry. Mobile stacks paper above the suggestion. Transitions are restrained and honor reduced motion.
User constraints: never re-typeset the uploaded original, never mutate old interview answers, never force a JD for general résumé revision, preserve old capabilities, verify actual browser and written PDF rather than only tests.
Implementation: `ResumePaper` renders the fixed 210mm paper via the same `resumePrintHtml` as exports; container resizing scales the paper instead of reflowing its paragraphs. Product final has fit-width and 100% reading controls.

## Implemented composition

- Desktop: shared content width is at most 1280px with 56px side gutters. Header is 80px tall; hero padding is 56px 24px 44px. The title uses the actual `clamp(48px, 6.14vw, 80px)`, weight 400, line-height 1.25; at 977px it resolves to approximately 60px. At 761–1100px the hero padding is 40px 24px 28px and the same 56px side gutters remain.
- Product stage: quiet gray-green surface, 12px corners and one subtle shadow. A toolbar sits above paper and mentor. Desktop columns are 1.16fr / .84fr, gap 32px, with 36px left and 24px right inset; at 1100px and below the gap and horizontal insets are 24px. The paper remains a complete sheet with its intended whitespace, not a cropped preview window.
- Mobile at 760px and below: 18px page gutters, 78px header, hidden middle navigation, 38px / 1.3 title. The stage stacks paper before the mentor, uses 14px horizontal insets and wraps its toolbar. Reading controls remain outside the document, offer 100% reading, and can scroll the fixed paper horizontally.
- Story continuation: interview explanation and re-answer demonstration, then one workspace action, then a hairline-separated FAQ and footer. Free résumé/JD and Offer tools, Agent instructions, privacy and GitHub remain reachable; they are not removed to simplify the new hero.

## Document and interaction boundary

- The fictional landing sample is text, not a user-uploaded file. “查看原件” returns its unchanged source; real uploaded originals must display the original file without this renderer re-typesetting them.
- New text final and PDF share `resumePrintHtml`: A4 width 210mm, minimum height 297mm, 12mm inset, 10.5pt / 1.48 body, 22pt name, 12pt role and paired right-aligned dates. A narrow rail scales the sheet rather than changing its line breaks. Long content remains complete and paginates.
- Adopting or withdrawing the landing suggestion changes exactly one sentence. The demonstration can highlight and locate that sentence; formal final/PDF output does not inherit the demonstration highlight. Fit-page and 100% reading are real controls, not decoration.
- Landing interactions do not read an account, invoke a model, spend credits, store a résumé, or report a cloud save. The interview trial is current-page practice, not a persisted interview session; old interview answers remain untouched.
- The hosted web version remains independently usable. Agent version uses the user's existing Agent model and local sandbox; 益职 does not separately charge its model fee, but the host retains its own billing. Versions do not sync by default. `/agent` is read by the Agent, which installs, connects and verifies the local visual cockpit; the human stays the job seeker.

## Documentation evidence and limits

Checked against current `app/Home.module.css`, `components/resume/ResumePaper.module.css`, `lib/resume-print.ts`, the shared component call path, and the opened local full-page captures `/tmp/yizhi-home-desktop-final.png` (1440 × 3100) and `/tmp/yizhi-home-mobile-final.png` (390 × 3700). These captures establish the local rendered composition, not production deployment or the full authenticated workflow.

Review, browser/PDF evidence and the honest comp-process gap are recorded in `docs/product/2026-10-14-option2-release-review.md`. Documentation does not retroactively assert a pre-implementation comp gate, numeric fidelity score, quality-bar approval or production acceptance. The user approved the displayed direction and requested no new design workshop before release.
