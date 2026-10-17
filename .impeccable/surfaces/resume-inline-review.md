---
version: 1
slug: "resume-inline-review"
primary_target: "components/cockpit/ResumeInlineReview.tsx"
related_targets: ["components/cockpit/ResumeInlineReview.module.css", "components/cockpit/ResumeAgentConversation.tsx", "components/cockpit/ResumeAgentConversation.module.css", "components/cockpit/ResumeExport.tsx", "components/resume/ResumePaper.tsx", "lib/resume-print.ts"]
---

Mode: Operate. Preserve the approved left navigation and existing original-file, manual editing, reorder, checking, and export capabilities. 2026-10-15 correction: the user did not endorse single-paper/three-color as an aesthetic preference. These are implementation options judged by ease of editing, understanding, saving and export, not a pinned visual world.

## Direction contract

THESIS: one readable résumé is the editing surface. Do not surround it with repeated cards, three competing views, always-visible templates or per-section instructions.
OWN-WORLD: inherit the current studio neutral ground, ink, compact copper actions, existing paper typography and A4 geometry. Green additions, red struck deletions, yellow expression changes are semantic ink, not container backgrounds.
STORY: start a revision; when facts are missing, answer one mentor question; saved answers survive failures and refresh; continue into grounded suggestions; accept or reject in place; export the selected clean result.
FIRST VIEWPORT: retain left navigation and mentor rail. Center contains the compact revise/export row and editable document. Guided questions belong in the mentor rail, not a second conversation above the document. “显示修改” and “更多” sit quietly above the paper; the latter holds original-file and template access. Accepted text remains editable; decisions and edits can be undone. Mobile reading reflows text; A4 export remains separate. No long drag hint: one subtle grip motion on first use, with reduced-motion and keyboard alternatives.
FORM: precise user-pinned local extension; concept seed not applicable. The existing paper renderer is reused, not visually approximated in a second editor.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

Acceptance: real model questions and revision, answer-first persistence, failed retry and concurrency, refresh, accept/reject/mark-off behavior, unresolved export consent/cancel, actual Chrome PDF file and page inspection, desktop/mobile. Existing interview answers remain byte-identical. No new shipping raster assets.

2026-10-17 UI extension: public Qisimiaoxiang examples inform contextual menus and editing tools. A compact ResumeToolbar groups title, pending count, revise/export and quiet utilities; original, replace and templates live in a native top-layer popover. Mobile paragraph tap reveals only that paragraph's edit control, with keyboard focus support. Decisions use short visible labels and measured viewport placement. Resume paper, print geometry, save queue and Agent calls retain their contracts. New UI evidence uses labeled synthetic material; it does not renew the earlier live-model or cloud-persistence acceptance, or constitute user approval of this design. Reference thumbnails were public; opening case details requested login and was not pursued.

2026-10-17 detail pass: tune control height, icon weight, marks state, readable helper type, hover/pressed/loading/focus states and tooltip boundaries. Menu uses measured geometry and keyboard entry/return. A click on plain paper dismisses the decision popup without restoring focus; Escape still restores focus. Mobile editor helper spacing and one-row actions are explicit; export consent has a short heading/action but unchanged adoption semantics. Original paper geometry, generated content, billing and old answers remain outside this pass.
