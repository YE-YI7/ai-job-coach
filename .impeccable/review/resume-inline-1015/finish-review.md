disposition: fix

Inputs not supplied: QUALITY BAR card and a decision critique-reference comp. No approved comp is required for this user-pinned, code-led extension. This review does not certify real-model output, answer persistence, or production acceptance.

## persistence

Pass for design persistence: PRODUCT.md and DESIGN.md exist; the surface contract records the narrow extension, reused paper renderer, semantic revision colors, retained navigation, and deliberate A4 mobile geometry. The inherited design documentation matches the visible studio and paper world. FORM explicitly records the user-pinned local extension, so a concept seed is not applicable. No new shipping raster is specified or used.

## fidelity

Required evidence is valid: desktop.png and decision.png are 1440 × 960; mobile.png is 390 × 844. All show the intended résumé surface from its top, settled, without blank or failed-render regions.

| Element | Status | Evidence |
| --- | --- | --- |
| TYPE | match | The screenshots retain compact sans-serif studio controls and the selected classic serif résumé; ResumePaper still renders the actual print template rather than a second approximation. |
| MATERIAL | match | A flat, readable white document and restrained studio surfaces; no imitation physical material or decorative raster substitutes. |
| GROUND | match | The visible neutral gray studio field and near-white task surface preserve OWN-WORLD; paper remains white. |
| First viewport and retained shell | match | Desktop retains the left navigation, mentor rail, compact revise/export actions, quiet mark toggle/More, and one paper. No global-shell replacement appears. |
| Semantic revision ink | match | The screenshots show localized red struck source and yellow replacement, not colored section containers; lib/resume-print.ts also provides green additions. |
| Local decision bubble | contradicted | decision.png shows the correct small local bubble, but keyboard activation in ResumePaper.tsx:61–69 leaves focus inside the iframe. ResumeInlineReview.tsx:33–35 only listens for Escape on the parent window, which cannot receive keyboard events from the iframe. There is no explicit keyboard focus handoff or return. |
| Mobile paper geometry | adaptation | mobile.png deliberately scales the unchanged A4 page; visible 100% controls provide the readable horizontal-scroll mode. This is explicitly required by the surface contract and DESIGN.md, not accidental responsive clipping. |
| Anchored question and saved-answer continuation | match, source only | ResumeAgentConversation renders one labeled question, a source excerpt, saved answers, retry/skip, and local draft preservation. No question/running/error capture was supplied, and real-model behavior remains unverified. |
| Mark-off, More, and unresolved export | match, source only | CockpitApp keeps mark visibility separate from acceptance, hides templates/original access in More, and passes unresolved count to ResumeExport's explicit consent/cancel dialog. Parent-reported behavior is not independently re-certified here. |

## ceiling

Reached for the user-pinned Operate extension's visual scope: one real paper, localized ink, local decisions, restrained controls, and preserved shell. No new world, animation program, or decorative assets are warranted. The missing QUALITY BAR card prevents an independent card-relative ceiling comparison.

## material_fixes

1. Fix the decision bubble's cross-document keyboard path (ResumePaper.tsx:61–69; ResumeInlineReview.tsx:33–43): on explicit keyboard activation, move focus to its decisions; provide a direct keyboard route among accept/reject/edit; bridge iframe Escape and return focus to the originating mark on dismissal. Hover must not steal focus. Verify in Chrome with Tab → mark → Enter/Space → decision → Escape, including a long résumé, without traversing the remainder of the iframe or changing adoption state merely by opening/closing.

## keep

Keep the approved navigation and mentor shell, the single reused A4 paper, localized green/yellow/red revision ink, clean-view/non-adoption distinction, unresolved-export consent, hidden templates, and preserved original interview answers; do not expand this fix into historical detector advisories or a global redesign.

---

disposition: recapture

## recapture

- `.impeccable/review/resume-inline-1015/decision.png`: the replacement 1440 × 960 capture shows the focused revision mark but no decision bubble. Replace it with a settled capture showing the open local bubble and its accept/reject/edit controls, preferably with keyboard focus visibly on the first decision. The desktop/mobile replacement captures are valid. The one-finding verdict is not scored on this invalid required capture; reported Chrome focus/Escape checks are not independently re-certified.

---

## verdict

1. **Resolved — decision bubble keyboard path.** The corrected `decision.png` is valid at 1440 × 960 and visibly shows the open local bubble with focus on its first accept control. Independent source inspection confirms interaction metadata, focus handoff for focus/keyboard activation rather than hover, adjacent native decision buttons, a guarded origin-focus restoration callback, and a direct iframe Escape dismissal bridge. The parent reports isolated Chrome checks for focus handoff, Escape closure with origin return, and iframe Escape closure; those runtime results were not independently replayed by this reviewer. The unchanged desktop/mobile captures remain valid. No fix-induced visual regression is visible in the supplied recaptures.

## remaining

Clear for the single scored keyboard finding. This ship verdict covers that fix only; it does not certify real-model behavior, answer persistence, or production acceptance, and does not broaden the original surface review.

disposition: ship
