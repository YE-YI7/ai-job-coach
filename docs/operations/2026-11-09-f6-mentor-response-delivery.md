# F6 mentor response delivery repair

2026-11-09. Candidate only; no deployment, new model call, supplier spend, or real-user data mutation.

## Reproduced defect

The natural-user trial `205a3dc9-0a5b-4320-a205-abee6c72e803`, Trace
`76e4e371-3ff2-4c32-8610-34849592ba73`, independently produced a useful
follow-up in `changes.md` after receiving the HR commentary. The writer required
a same-turn `resume-new.md` write whenever HR was present, so it did not finish.
It then treated an ordinary mentor reply as a résumé, rejected it for lacking
identity/contact, and induced another document submission. Removing only 客服
from the title incremented the document revision and invalidated the guidance.
The user never saw the question; the simulation correctly sent no reply.

## Changed contract, not writing quality criteria

- A successful post-HR `changes.md` or `notes.md` response may retain the verified
  document and finish. A read, search, render, or portrait write alone is not a
  completed HR response.
- In mentor-enabled production mode, ordinary text **after HR** is conversation.
  Revised documents use the existing named `resume-new.md` write; this explicit
  channel is explained in the HR return receipt. There is no keyword classifier,
  extra model, JSON grading protocol, or identity-based guess about message type.
- The mentor return instruction no longer also demands an unchanged full draft.
  The older experiment's instruction remains byte-identical. Initial direct-text
  draft delivery, frozen fixture/repro paths and their initial inputs are unchanged.
- A rejected document attempt cannot be masked by a separate guidance write.
  If the author ends with conversation instead of repairing that attempt, retain
  the verified body, deliver the conversation, and mark repair incomplete.
- A retained response updates HR's receipt to `author_retained_not_rechecked`;
  this does not run HR again or assert quality passed.
- Existing identity/document checks and stale-guidance protections remain. No
  automatic rebinding of historical advice after a real document change.

Runtime candidate: `f6-origin-runtime-v8-mentor-response-delivery`, identifiable
in the runtime receipt with the new response-channel policy hash. Original F6
system provenance, first actual author input, five tools, 12 author / 4 public /
1 HR caps, model selection, B05 and Memory are not changed by this repair.

## Verification

- New regression coverage: guidance-only, notes-only, read-before-response,
  ordinary conversation, invalid draft plus guidance, incomplete repair, and
  the existing user-facing outcome component with a JSON readback roundtrip.
- The initial failing tests reproduced the redundant calls and chat-as-document
  path before the code change.
- Private original-output replay passes: consumes the first 3 recorded author
  responses and 1 recorded HR response, then finishes. The initial author input
  is exactly equal to the original captured input. The first 1368-character draft
  is unchanged at revision 1; the 288-character question is current and present in
  the actual outcome component's rendered markup. The last 2 recorded author
  responses are not consumed. No network/model request occurred.
- Private replay plus targeted tests: 20/20 passed across 3 suites.
- Full Jest: 364 passed suites, 3393 passed tests, 7 skipped suites / 14 skipped
  tests (including the optional private replay when its path is not supplied).
- `npx tsc --noEmit`, targeted ESLint, `git diff --check`: passed.
- `npm run build`: passed; BUILD_ID `R1LKs2EDuMhdSvNr0Yr6i`.
- No production UI file was changed. The `.tsx` addition is a regression test;
  it does not change styling/layout, so no UI design scan was run.

## Evidence and limits

Private evidence remains outside Git:
`/Users/yi/Documents/Codex/yizhi-f6-production-audit-20261108/mentor-natural-user-20261109/`.

- Original capture: `trace-capture.json`; all 12 original source hashes unchanged.
- Repaired replay: `repair-replay-20261109.json`.
- Full suite report: `repair-full-tests.json`.

These are **recorded-output replays**, not fresh model behavior or quality trials.
They do not establish that a future model run will select the same channels.
The old candidate's missing education section and report-like writing remain
content-quality failures; this patch does not rewrite the model's draft or
claim they are fixed. No real cloud-save, browser-login or PDF acceptance was
rerun. No real résumé, old interview answers, wallet, credits or supplier budget
was touched. No production alias promotion or push in this task.
