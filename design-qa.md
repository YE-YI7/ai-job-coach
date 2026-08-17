# Design QA — 导师作战桌

- Source visual truth: `/Users/yi/.codex/generated_images/019ff5a3-9056-7d43-8699-0111f7f80204/exec-b4e29d21-e725-4f9e-a701-77cf15ee4bbc.png`
- Implementation screenshot: `/Users/yi/Documents/Codex/2026-07-13/github-plugin-github-openai-curated-remote/me/ai-job-coach/.artifacts/today-coach-implementation-final.png`
- Side-by-side comparison: `/Users/yi/Documents/Codex/2026-07-13/github-plugin-github-openai-curated-remote/me/ai-job-coach/.artifacts/today-coach-comparison-final.png`
- Source pixels: 1487 × 1058
- Implementation pixels: 1274 × 864
- Browser CSS viewport: 1280 × 720; device pixel ratio: 2
- Density normalization: both captures scaled proportionally into equal 744 × 529 comparison frames with white padding; no cropping or stretching
- State: authenticated demo workspace, 今日首页, 字节跳动 AI 产品经理 selected

## Findings

- No actionable P0/P1/P2 differences remain.
- Typography: the implementation preserves the source's serif editorial hero and sans-serif interface hierarchy. Weight, wrapping, line height, and optical contrast remain legible at the available laptop viewport.
- Spacing and layout: top capture bar, left navigation, single mentor action, evidence row, cost rail, and stage strip retain the source proportions and reading order. The compact 1280 × 720 viewport scrolls the supporting “导师已替你完成” row below the fold; this is an acceptable P3 responsive difference because the primary action and stage context remain fully visible.
- Colors and tokens: warm paper, ink, action orange, guidance blue, verified green, and fine warm-gray dividers match the source direction. Shadows remain restrained.
- Image quality and assets: the supplied production `logo.png` is used directly. Opportunity markers use the chosen Phosphor UI icon family rather than fake company marks or CSS drawings.
- Copy and content: proactive mentor language, provenance, confidence, time estimate, paid-credit action, free consistency check, correction, reminder, and job-stage context match the selected concept.

## Comparison History

### Iteration 1

- [P1] Demo state loaded old browser opportunities, making the selected recommendation and rail disagree.
  - Fix: demo mode now ignores live/local persisted opportunities and always renders a clean deterministic dataset.
- [P2] Three active opportunities did not remain scannable in the shorter laptop viewport.
  - Fix: reduced opportunity-row height and padding while preserving role, status, and deadline.
- Post-fix evidence: `today-coach-comparison-final.png` shows a clean three-opportunity rail, aligned active job, matching hero recommendation, and visible stage strip.

## Focused Region Evidence

No separate crop was required: after normalization, the full comparison keeps the primary action, provenance chips, quota treatment, and stage controls readable. Core interactions were verified in the browser rather than judged from the screenshot alone.

## Interaction and Runtime Checks

- “开始补强 · 预计 2 额度” opens the selected job's resume workspace.
- “返回今日” restores the mentor-led homepage.
- Upload/material capture opens the existing opportunity intake and Cancel returns to Today.
- “查看额度规则” explains free tracking versus paid model-heavy actions.
- Fresh browser run reported no console errors.
- Targeted ESLint and TypeScript checks passed. The repository-wide lint command remains red because of pre-existing unrelated legacy violations.

## Follow-up Polish

- [P3] At 1280 × 720, the completed passive-work row requires one scroll; consider a condensed laptop-only variant after product feedback.
- User-authorized copy refinement: the AI-sounding hero preamble was replaced with `今日 ToDo` plus a dynamic unfinished-task count. Verified capture: `.artifacts/today-todo-copy-update.png`.

final result: passed
