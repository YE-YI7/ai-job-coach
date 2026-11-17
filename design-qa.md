# Progressive interview setup — local preview QA

Date: 2026-11-17

Previous homepage QA retained verbatim in `docs/operations/2026-10-14-design-qa-preserved.md`; this root report describes only the current local trial.

final result: passed

Scope: local presentation experiment, not user visual acceptance or release approval. Source is the deployed Qoder center at 4f0c2ea, with the user's explicit annotation to reveal interview settings progressively. No new visual direction, generated art, backend behavior or deployment.

## Compared evidence

- Artifact root: `/Users/yi/Documents/Codex/yizhi-interview-detail-preview-20261117`.
- Source: `progressive-current-expanded.jpg` and `progressive-current-summary.jpg`.
- Candidate: `progressive-01-round.jpg`, `progressive-02-focus.jpg`, `progressive-03-ready.jpg`.
- Combined source/candidate inspected: `progressive-comparison.jpg` and its HTML. Desktop 1280×720; the comparison includes whole workspace context and control crops.
- Chrome 390×844: `progressive-mobile-round.jpg`, `progressive-mobile-focus.jpg`, `progressive-mobile-ready.jpg`. DOM measured width and scrollWidth both 390. New controls remained within the 338px center content. Mobile focus screenshot visually checked.

## Design checks

- Typography: existing display treatment retained; new configuration text inherits Outfit / Chinese system fallback, without a new type system. Heading and summary hierarchy checked in the combined comparison.
- Spacing: only the setup block changes intentionally. Round selection → comparable perspectives/count → ready summary. Margins tightened after initial review; center content and side rails retained. No framing cards or replacement divider stack.
- Tokens: existing warm background and rust selection color retained. Browser computed new text #70614e / selected #9b3d22 / heading #30281e against #fffdf8. These sampled enabled text colors exceed 4.5:1. Not a whole-app accessibility certification; disabled/input-placeholder states excluded.
- Assets/icons: existing logo, microphone start button and Lucide arrows reused; no generated assets, CSS art, fake illustrations or extra brand decorations.
- Copy: no claim that interview ordinal changes generated difficulty. It currently marks round/history; no backend fix implied. Shortcut says current settings, not last session's settings. Confirmation does not claim the interview has started.
- Accessibility: semantic buttons/groups, aria-pressed selections, status announcement, visible keyboard focus and phase heading focus with preventScroll. New buttons minimum44px. Reduced-motion CSS disables entrance/arrow motion; code reviewed, not claimed as separately browser-emulated this pass.
- Motion: 220ms fade/5px entrance, 160ms hover arrow. Intended to communicate a changed stage rather than decorate the page.

## Interaction / regression

- Browser walked round → project deep-dive /5 → confirmation; ready → edit retained selections; edit → round retained selections; current-setting shortcut reached ready without starting.
- Original demo start displayed 二面, 项目深挖, question1/5 and existing question UI. No microphone permission requested or paid generation used.
- Custom original RoundPicker accepted6 and advanced with 六面. Existing current/candidate toolbar switch retained parent choices.
- Native clicks kept center scrollTop0. Locator auto-scroll during an earlier automation run caused a misleading jump; retested with native input. Scoped overflow-anchor precaution remains.
- Dev+demo+explicit flag only; production preview404 guard retained. Normal defaults unchanged. Original question-generation and review business blocks byte-compared to HEAD and unchanged.
- Full Jest:410 suites/3729 tests passed;9 suites/31 tests pre-existing skipped. Targeted:3 suites/14 tests passed. TypeScript and local lint passed; diff whitespace check passed.
- Initial test text-lookup helper mismatch was corrected; initial TypeScript check raced Next generated files and passed on rerun. Development CSS HMR removeChild error seen while editing, clean reload/flows then worked; no claim of fixing Next HMR. Expected local quota/telemetry failures are not production-outage evidence.

No production model, storage, billing, schema or live business data changed. No push/deploy. User visual acceptance pending.

## Subsequent approval / release check

User explicitly approved the preview and requested release. Current release candidate defaults progressiveInterviewSetup to true; the internal development comparison may still disable it. Same presentation component and original callbacks. Re-ran full Jest410/3729, TypeScript and local ESLint successfully after this gate change;9/31 existing skips. No voice implementation changes. Production verification and actual deployment outcome are tracked in `docs/operations/2026-11-17-progressive-interview-setup-release.md`; prior local-only paragraphs remain historical evidence.

Released b33da91 as production dpl_4z6eVnahAfFPsWvDp1Rb93ztavWe, apex/www both verified. Authenticated Chrome walked setup→ready→edit without starting a paid round; selections and existing mentor draft retained, rails measured unchanged. Authenticated development preview404 confirmed. New deployment short-window error/5xx queries empty; not long-term monitoring. Voice separately diagnosed as embedded browser network error; regular Chrome local listening starts/stops, complete transcription and live voice not certified.
