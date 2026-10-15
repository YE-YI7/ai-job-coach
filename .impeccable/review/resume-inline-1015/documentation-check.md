# Résumé inline review — documentation check

Date: 2026-10-15. Mode: Operate. Result: documented ordinary extension of the incumbent studio/paper system, not a new visual world.

The latest `finish-review.md` ends in `disposition: ship` for the single scored decision-bubble keyboard finding. That verdict is preserved at its stated scope. This document does not certify real-model output, saved-answer persistence, concurrency/retry, production acceptance, or a completed PDF export.

## Authority and preservation

- Read the Impeccable skill and `reference/document.md` in full, and ran context once for `ResumeInlineReview.tsx`. This is a bounded comparison, not a regeneration of the existing design system.
- The user-pinned contract in `.impeccable/surfaces/resume-inline-review.md:8`–`19` governs this extension: approved navigation, one actual paper, localized semantic ink, local decisions, clean suggestion view without implicit adoption, hidden templates, unresolved-export consent, and retained original source.
- `PRODUCT.md`, `DESIGN.md`, and `.impeccable/design.json` remain unchanged. No new north star, palette replacement, product claims, global prohibitions, or system-wide component rules are introduced. No clarification/world-choice round is needed for this explicitly pinned extension.
- This documenter wrote only this note; no code, surface brief, review verdict, capture, or shipping asset was edited. No browser session, build, test suite, detector scan, commit, or deployment was run by this documenter.

## Comparison evidence

| Concern | Documentation and finished-surface match |
| --- | --- |
| Product truth | `PRODUCT.md` retains factual confirmation, evidence-first work, keyboard access, visible status, and human decisions. The supplied captures are visibly an example workspace with fictional acceptance material, not real-user or model-output evidence. |
| Incumbent world | `DESIGN.md` records the neutral studio ground, near-white work surface, compact copper actions, independent résumé typography, A4 geometry, and scoped rather than global palette variants. Desktop and decision captures preserve that world and the existing left navigation/mentor rail. |
| One paper | `ResumeInlineReview.tsx:38` reuses `ResumePaper`; `ResumePaper.tsx:31` uses `resumePrintHtml`. `lib/resume-print.ts` remains the common screen/print renderer. The captures show one white, straight-edged classic-serif paper, not an approximate second editor or card stack. The classic choice is an existing template, not typography drift from the documented modern sample. |
| Responsive geometry | `ResumePaper.tsx` keeps a 210 mm width, at least 297 mm height, scales the whole document, and offers 100% horizontal reading. The 390 px capture retains this deliberate fit-page behavior and the 100% control. It does not demonstrate mobile 100% reading or touch interaction. |
| Local decisions | `ResumeInlineReview.tsx:32`–`44` and `ResumePaper.tsx:57`–`72` implement the small accept/reject/edit bubble, focus handoff, guarded origin-focus return, and iframe Escape bridge. `decision.png` visibly shows the three controls and focus on accept. Runtime behavior is covered only by the finish review's explicitly attributed parent report, not independently replayed here. |
| Clean view versus adoption | `CockpitApp.tsx:1576` changes only mark visibility. `lib/opportunities/resume-inline.ts:27`–`44` projects clean suggested text when marks are off without writing acceptance decisions. Accepted/rejected results and unlocatable findings remain separate concerns. This is source evidence; no clean-view capture was supplied. |
| Low-frequency controls and original | `CockpitApp.tsx:1576`–`1577` keeps templates and original-file access under More and renders `OriginalResume` when chosen; `OriginalResume.tsx` reads the stored original rather than running it through the text-paper renderer. The collapsed More control is visible; its open state and original bytes were not independently verified here. |
| Undecided export | `CockpitApp.tsx:1544`–`1545`, `1563` and `ResumeExport.tsx:48`–`49` pass pending count into an explicit native consent/cancel dialog. Its copy distinguishes exporting the proposed version from changing adoption state and preserves rejected decisions. Dialog operation and actual PDF writing/page inspection are outside this check. |
| Question/continuation | `ResumeAgentConversation.tsx` provides one labeled question, source excerpt, saved-answer disclosure, draft retention, retry/skip and waiting/error copy. Its CSS inherits studio tokens and the mobile input scale. These states are source-only evidence; no corresponding capture or real-model run was supplied. |

## Surface-local additions

The existing surface brief already names green additions, yellow expression changes, and red struck deletions. The following exact implementation values are absent from incumbent `DESIGN.md` frontmatter and sidecar metadata and are recorded here as résumé-review-only semantic ink, not promoted to the global palette.

| Ink | Implemented value | Meaning and non-color cue |
| --- | --- | --- |
| Addition | `#d9efcf` | Proposed inserted text; accessible mark label says 新增建议. Green does not certify that a claim is true or user-confirmed. Source-only in these captures. |
| Expression change | `#fff0a8` | Proposed wording replacement; accessible mark label says 表达修改. Visible in all three captures. |
| Deletion | `#f7d9d5` | Proposed removal; source text remains visible with a 1 px strikethrough and 删除建议 label. Visible in all three captures. |

Source: `lib/resume-print.ts:69`; diff/projection semantics: `lib/opportunities/resume-inline.ts`. Ink is restricted to changed text with inherited dark foreground, not colored section containers. Existing global evidence/action colors retain their prior meanings elsewhere.

Other additions use incumbent visual language rather than a new system: a 320 px local bubble constrained to viewport minus 24 px, 12 px corners, a genuine floating shadow, copper 2 px focus outlines on bubble controls, and 36 px decisions enlarged to 44 px below 700 px. Paper marks/grips reuse the existing `studio-mentor` green (`#536a40`) for their 2 px focus outline. The question is 18 px (17 px on mobile), with 15 px inputs raised to 16 px on mobile. The single first-use grip hint is 1.6 seconds, disabled for reduced motion, with Alt + arrow-key reorder. These are surface implementation facts, not new global tokens or a comprehensive accessibility certification.

## Inherited documentation drift — reported, not repaired

- The root design records cover studio navigation, paper/print geometry and reading controls, but do not yet catalog the new inline-review ink, decision bubble, anchored-question states, or undecided-export consent. Their task-local meaning is retained in the existing surface brief and this note; the incumbent records were not silently refreshed or overwritten.
- The existing schema-v2 sidecar has historical tonal ramps with varying lengths and mixed light-to-dark ordering (for example `studio-canvas` has seven entries and `studio-mentor` four), whereas the current document playbook requests eight dark-to-light entries. Many later metadata entries have no ramp. This is inherited, not caused by this extension.
- Existing sidecar narrative uses shortened rule names and omits the literal Do/Don't prefixes from its arrays, so it is not a verbatim transport of every corresponding Markdown bullet under the current playbook. No sidecar narrative or token migration was attempted.

These documentation observations do not reopen the approved visual world or expand the scored finish fix. An explicit future design-document refresh may reconcile them; it is not part of this delivery.

## Captures and assets

Inspected the current files directly: `desktop.png` (1440 × 960), `mobile.png` (390 × 844), and `decision.png` (1440 × 960). Each is settled, starts at the intended résumé surface, and corresponds to the source patterns above. The decision capture contains the corrected open bubble. The QA PNGs are review evidence, not shipping raster assets.

The reviewed résumé implementation adds no raster imports or image assets; its action icons/grip are vector markup and its paper is real selectable HTML. No new shipping-raster provenance record is required for this extension. The existing shell logo is inherited and was not replaced or audited here.

Preserved incumbent SHA-256 values:

```text
PRODUCT.md                 e69dac07eaab7cb8d2d964af1525184c424a452889acf216b239c154e003b556
DESIGN.md                  506bd13d9dbbf8315a648d9b0773c3615c95ce8718d139286f9a2beb73ad3e14
.impeccable/design.json    598f1669b7b146b87e020496326373908bffd3d3de066809713531adcc4beb0a
```

Documentation check complete. Ordinary-extension fidelity is supported by source and supplied captures; production and real-model acceptance remain pending and must be reported separately.
