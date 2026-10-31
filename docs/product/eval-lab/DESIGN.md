---
name: YiZhi Eval Lab
description: A quiet evidence workspace within YiZhi's light-neutral and ink-green interface.
colors:
  primary: "#416553"
  primary-soft: "#e5ece6"
  background: "#fafaf9"
  surface: "#fff"
  rail: "#f2f3f1"
  ink: "#252927"
  muted: "#626a65"
  line: "#dfe3df"
  danger: "#a63e36"
  good: "#226644"
  warning: "#875a20"
typography:
  headline:
    fontFamily: 'Outfit, -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: "29px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0"
  title:
    fontFamily: 'Outfit, -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: "17px"
    fontWeight: 600
  body:
    fontFamily: 'Outfit, -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: "15px"
    lineHeight: 1.7
  label:
    fontFamily: 'Outfit, -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: "13px"
  payload:
    fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace"
    fontSize: "12px"
    lineHeight: 1.85
  score:
    fontFamily: 'Outfit, -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: "42px"
    fontWeight: 500
    lineHeight: 1.1
rounded:
  field: "5px"
  control: "7px"
  dialog: "12px"
spacing:
  compact: "8px"
  control-inline: "16px"
  evidence-gap: "25px"
  section: "30px"
  workspace-gap: "42px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
  button-secondary:
    backgroundColor: "#e9ede8"
    textColor: "#314a39"
    rounded: "{rounded.control}"
    padding: "8px 16px"
  run-selected:
    backgroundColor: "#e1e8df"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "13px 12px"
  payload:
    backgroundColor: "#f0f3ee"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "15px"
    typography: "{typography.payload}"
---

# Design System: YiZhi Eval Lab

## Overview

**Creative North Star: "Quiet evidence workspace"**

This surface extends the existing YiZhi workspace rather than introducing a separate visual identity. Light neutral planes, restrained ink-green actions and a calm side rail keep attention on the selected run and its evidence. It is an internal inspection tool, but avoids the dense KPI-card wall the user rejected.

The built surface uses whitespace for grouping and small status dots with readable labels. Its visual confidence comes from hierarchy and honest object states, not decorative boxes. This document records the implemented HTML/CSS/ES-module artifact; production deployment and real-model acceptance are separate evidence, not implied by this design record.

**Key Characteristics:**

- Tonal side rail, open central evidence and a quieter assessment column.
- One selected run remains in context while evidence tabs or stages change.
- Execution state, model assessment and human verdict have distinct places.
- Missing evidence is stated in text rather than painted as a successful state.

## Colors

The palette is an existing light-neutral YiZhi world with a muted green action voice and restrained semantic status colors.

### Primary

- **Ink Green** (`primary`): primary actions, selected-tab underline, focus outlines and active-stage dots.
- **Soft Green** (`primary-soft`): low-contrast hover support for the new-run action; selection uses neighboring pale-green tones.

### Neutral

- **Warm White** (`background`) and **Paper White** (`surface`): workspace and topbar/document surfaces.
- **Quiet Rail** (`rail`): a continuous side-navigation plane, not individual bordered cards.
- **Charcoal Ink** (`ink`): titles, reading content and active labels.
- **Leaf Grey** (`muted`): metadata, explanatory text and inactive navigation.
- **Soft Rule** (`line`): tab baseline, disclosure rows, input boundaries and separation before human judgment.

### Semantic states

`good`, `warning` and `danger` accompany explicit text and a small dot. They do not replace the status label or imply that a completed execution is a good résumé.

**The Separate Verdicts Rule.** A green completed-run state must not visually subsume the LLM's quality assessment or the human's delivery verdict.

## Typography

**Display and Body Font:** Outfit for Latin letters and numbers; the native sans-serif fallback stack supplies Chinese text. The bundled Outfit font is reused from the product asset, not newly generated artwork.

**Label/Mono Font:** Native monospace for IDs, codes and structured model payloads.

**Character:** Matter-of-fact technical reading. No serif editorial display, uppercase kicker hierarchy or ornamental tracking is introduced. Larger numerals are reserved for an actual LLM score and never backfilled from a rule total.

### Hierarchy

- **Headline:** run title; reduced to (24px) on narrow screens.
- **Title:** section headings; local subsections use (16px), compact assessment labels (14px).
- **Body:** the default text is (15px); explanatory evidence uses (14px) with (1.9) line height and a maximum (75ch) where applicable.
- **Label:** most metadata uses (12–13px), controls (14px); IDs use monospace.
- **Payload:** preserved whitespace and wrap-anywhere behavior keep long fields inspectable without forcing page overflow.
- **Score:** tabular numerals, with the denominator and provenance in smaller muted text.

**The Evidence Type Rule.** Human-readable content stays proportional; machine structure and identifiers use monospace. Do not turn the whole workspace into a console.

## Layout

The desktop shell has a (76px) topbar and a continuous (248px) run rail. The central area is bounded at (1600px), padded (40px 42px), and divides evidence from a (284px) assessment column with a (42px) gap. Trace stages use a local (168px) navigation strip; input/output can sit side by side.

At (1180px), the rail and assessment narrow, Trace stages become a horizontal strip, and I/O stacks. At (900px), evidence and assessment stack while self-assessment and human judgment can remain side by side. At (620px), the topbar becomes (66px), the run rail becomes a horizontal list, assessment becomes one column, and controls retain their readable sizes rather than scaling down a desktop canvas. A wider (1700px) breakpoint adds breathing room.

**The Nearby Evidence Rule.** Selecting a Trace stage replaces evidence in its adjacent detail area. It does not navigate away from the selected run.

## Elevation & Depth

The workspace is flat by default. Continuous tonal planes distinguish navigation, payloads and the document output. Borders are reserved for real separators and field boundaries; there is no generic shadowed-card grid.

### Shadow Vocabulary

- **Modal separation** (`0 15px 60px #172a1933`): native dialogs only, with a translucent green-black backdrop and (3px) backdrop blur.
- **Transient notice:** a solid dark-green toast above the workspace, not a new persistent panel.

The selected-stage detail arrives through a restrained (180ms) opacity/blur transition. Buttons change background and text color over (160ms). Reduced-motion preference disables animation and transitions; there is no ambient loop or moving layout.

## Shapes

Gently curved controls use the small control radius. Fields, payload surfaces and stage choices use the tighter field radius. Only dialogs use the larger radius. Status dots are true circles and remain small; they are not badges or decorative icons.

The document output is a plain reading plane. Its rectangular paper-like surface does not claim to reproduce a résumé's original format or prove PDF acceptance.

## Components

### Buttons

Primary buttons are confident but compact: green fill, white text, (40px) minimum height and (8px 16px) padding. Secondary controls use pale-green fill. Quiet actions are unboxed text with an underline on hover. Icon buttons use inline stroked SVG, a (34px) square target and subtle tonal hover.

All interactive controls expose a (2px) green focus outline with (4px) offset. Disabled buttons reduce opacity and use a waiting cursor.

### Navigation

Run items are full-width text-led choices with name, explicit state and date. The active item gains a pale-green field rather than a border or shadow. Tabs use a single baseline and a (2px) active underline. The selected Trace stage uses a pale fill and filled dot; its inactive neighbors remain unboxed.

### Evidence surfaces

Readable prose is open on the workspace. Structured JSON/model messages sit on a subtly tinted payload plane with bounded internal scrolling. Knowledge lists disclose on demand and label whether entries are stage-specific, Agent-context-specific or only known at run scope.

### Inputs and dialogs

Search remains an unboxed field in the rail. Sample inputs and JSON import use white, softly rounded fields with a light boundary. Native dialogs constrain height to (85dvh), scroll when necessary and use explicit close buttons. The real-model form keeps the sample, optional JD, self-evaluation option and cost acknowledgment together.

### Assessment and human judgment

An actual LLM score, reason and information gaps lead the assessment area. Pending, not requested and not captured are separate textual states. Human judgment follows with a local-save action whose label and status explain its scope. No rule score is styled as an LLM self-score.

## Do's and Don'ts

### Do:

- **Do** keep the selected run visible while switching nearby evidence.
- **Do** use tonal planes and whitespace before adding a border or container.
- **Do** retain explicit status text alongside semantic color.
- **Do** distinguish imported, synthetic and production provenance in the run metadata.
- **Do** state missing fields and scope limits beside the evidence they qualify.
- **Do** keep motion limited to evidence arrival and immediate control feedback, with reduced-motion support.

### Don't:

- **Don't** turn execution completion, rule totals or a model score into a single quality badge.
- **Don't** fill absent historical input/output or self-evaluation fields with examples.
- **Don't** introduce a KPI-card wall, decorative icon grid or horizontal rules around every group.
- **Don't** label a text preview as proof of original-layout or PDF acceptance.
- **Don't** imply that a local human judgment is saved to the server.

Not canonized: no approved image comp or QUALITY BAR card was used; no raster artwork was shipped. Live deployment, production-model behavior and any unverified browser behavior remain outside this design-system record.

## 2026-10-30 · Trace inspector candidate

The user rejected the fragmented, table-like Trace surface. This candidate replaces its information architecture, not the Lab's palette. The selected run opens a focused inspector: a compact call tree or recorded timeline on the left, one node's evidence on the right. The run rail and the assessment/feedback forms are still available through explicit disclosure, rather than continuously shrinking the evidence.

Node evidence has Output, Input, Call Information and Raw Record tabs. Output renders the preserved draft and the model's explicit editorial plan; it does not reconstruct hidden reasoning. Input renders message roles and individual supplied fields; system instructions, knowledge and contracts disclose progressively. Full-text search scans preserved input/output locally and highlights literal matches. Unknown fields remain accessible in the raw node record; missing historical snapshots stay missing.

Model execution and output verdict are distinct. A completed reviewer call whose recorded result is `failed` is an inspectable issue, not a successful résumé. A timeline requires every displayed node's real `startedAt` and positive duration; otherwise it is disabled. Timeline gaps are unobserved intervals, not attributed to model generation. Parentage comes only from recorded `parentId`.

Reference: [Langfuse's official redesigned Trace view](https://langfuse.com/changelog/2025-03-19-new-trace-view), specifically hierarchy/timeline navigation, selected-observation I/O and search. This is not an integration, paid subscription or trace upload to Langfuse.

Acceptance scope: actual C04b saved Trace replayed through the candidate static files, desktop 1450×726 and mobile 390×844. No new model call, production write or deployment. Local preview and code completion are not a user aesthetic approval or a live-release claim. See `docs/operations/2026-10-30-trace-inspector-ui.md` for evidence and limits.

## 2026-10-30 · C02 user correction supersedes C01 readability acceptance

The user found C01 still verbose and could not distinguish editor output from reviewer output. The default is now a connected evidence-flow diagram, with one selected node's short points and disclosed full I/O. The old call inspector remains a secondary raw-evidence view, not the initial reading surface. This correction concerns Trace inspection, not a blanket ban on tables.

Execution scope is separate from database provenance. The current C04b record is an isolated experiment, not a live user request. Memory inventory, reused retrieval, selection, actual editor context, editor draft, product quality gate and delivery are distinct nodes. A data-source connection is not a fabricated new tool call or hidden chain of thought.

The product quality gate remains on the execution flow because it affects delivery. Additional Eval Judge, self-evaluation and retained human verdict have an independent column. Missing extra evaluation is not substituted by product-review JSON. Default candidate output is the actual editor draft.

Memory counts must come from the actual recipient's recorded input: inventory six, editor five/775 characters, reviewer six. Twelve original résumé facts are not Memory; three public writing references were supplied inputs rather than a newly performed retrieval. A readable full body in reviewer input must never imply the editor also received it. Retrieved, requested, injected, explicitly cited and substantively adopted are separate states.

Desktop uses connected navigation, adjacent evidence and a quiet evaluation column; medium widths place evaluation below; narrow widths keep a scrollable path and stacked details. Default content is concise; complete payloads remain one disclosure away. See `docs/operations/2026-10-30-trace-flow-c02.md`. Local replay and tests are not production or user aesthetic acceptance.
