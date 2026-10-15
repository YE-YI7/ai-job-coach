---
version: 1
slug: "resume-inline-review"
primary_target: "components/cockpit/ResumeInlineReview.tsx"
related_targets: ["components/cockpit/ResumeInlineReview.module.css", "components/cockpit/ResumeAgentConversation.tsx", "components/cockpit/ResumeAgentConversation.module.css", "components/cockpit/ResumeExport.tsx", "components/resume/ResumePaper.tsx", "lib/resume-print.ts"]
---

Mode: Operate. Narrow implementation of the user's specified résumé workflow, not a replacement of the product world. Preserve the approved left navigation and existing original-file, manual editing, reorder, checking, and export capabilities. No visual-choice round: the user has explicitly specified the single-paper interaction.

## Direction contract

THESIS: one readable résumé is the editing surface. Do not surround it with repeated cards, three competing views, always-visible templates or per-section instructions.
OWN-WORLD: inherit the current studio neutral ground, ink, compact copper actions, existing paper typography and A4 geometry. Green additions, red struck deletions, yellow expression changes are semantic ink, not container backgrounds.
STORY: start a revision; when facts are missing, answer one mentor question; saved answers survive failures and refresh; continue into grounded suggestions; accept or reject in place; export the selected clean result.
FIRST VIEWPORT: retain left navigation and mentor rail. Center contains the compact revise/export row, a necessary single question only while needed, and one paper. “显示修改” and “更多” sit quietly above the paper; the latter holds original-file and template access. Hover, focus or touch a mark to reveal a small local decision bubble. No long drag hint: one subtle grip motion on first use, with reduced-motion and keyboard alternatives.
FORM: precise user-pinned local extension; concept seed not applicable. The existing paper renderer is reused, not visually approximated in a second editor.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

Acceptance: real model questions and revision, answer-first persistence, failed retry and concurrency, refresh, accept/reject/mark-off behavior, unresolved export consent/cancel, actual Chrome PDF file and page inspection, desktop/mobile. Existing interview answers remain byte-identical. No new shipping raster assets.
