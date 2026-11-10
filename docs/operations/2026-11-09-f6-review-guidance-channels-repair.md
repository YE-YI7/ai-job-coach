# F6 review/guidance channels and truthful execution receipts

2026-11-09 (America/Los_Angeles). Local v9 candidate, **not deployed**. No new
model request, supplier fee, database mutation, wallet/credits or old-answer write.

## Reproduced case and changed components

Eval `efa7d5f9-0177-43ea-a84c-5be1bb674081` / Trace
`5d39b9e7-c82f-4f3e-b887-d40677c7c5a7` delivered a concrete question with its first
draft. The raw HR response mixed original-source quotations with candidate text.
The final author response defended the draft, claimed rendering without calling
the tool, and replaced the existing question through the v8 plain-text capture.

1. **Review input:** source-only documents and the sole review target are now
   separate messages; the candidate is last, with its exact-content hash. Review
   instructions distinguish candidate quotes, original-source limitations,
   per-project scope, offline/gray-release evidence and causal attribution. They
   no longer encourage reprinting the JD and every review phase. No response
   parser, extra HR call or semantic rejection gate was added.
2. **Response delivery:** ordinary post-HR text is an internal review response,
   never an implicit user-guidance update. Explicit `changes.md` remains the
   existing author-chosen user channel. The earlier question survives an
   unchanged draft; real body edits retain existing stale-guidance protection.
   Internal commentary persists as `f6Deliverables.internalReviewResponse` and
   in Trace without overwriting `notes.md`, the draft or the user question.
3. **Execution state:** every continuation can see separate saved-body, current/
   stale/unrendered PDF and current/stale user-message state. The initial author
   request remains byte-identical. No automatic render, required new tool order,
   additional attempt, word cap or end-of-task semantic parser was introduced.
4. **Knowledge Trace:** the common compiler's prepared legacy methods are no
   longer falsely labeled as delivered to F6. Prepared IDs are separate from
   included IDs; the presenter says they were prepared but not sent. F6's own
   optional cases/spec remain available unchanged. No bulk knowledge injection.

The production HR-return instruction also distinguishes omitting an unnecessary
negative sentence from resolving an evidence gap; preserving facts can coexist
with useful user coaching. This does **not** change the frozen F6 base system,
case bodies, B05, owned materials, model selection, five-tool catalogue or caps.
Existing established runtime retained; no framework migration.

## Evidence and verification

Private local evidence:
`/Users/yi/Documents/Codex/yizhi-f6-channel-repair-20261109-QPPzg4/`.

- Current real Trace replay consumes 5 recorded author outputs + 1 recorded HR
  output, zero upstream requests. Initial author input is exactly equal; first
  draft and concrete question survive; old bad HR/commentary remains intact as
  internal evidence. Final input correctly says PDF `not_rendered`, revision -1.
- Original capture SHA-256 remains
  `8edbf50651cfc34ce5684f8876410a394742ed4ff4e6f630c685c435bb228075`.
- Regressions cover explicit user-guidance replacement, read-not-finish,
  rejected document repair, stale advice, internal-response JSON roundtrip and
  task-RPC persistence, PDF current/stale state, and prepared-vs-delivered Trace
  rendering. The real endpoint test now asserts source/candidate separation
  and no phantom included methods.
- Earlier v8 missing-question Trace also replays successfully (3 recorded author
  outputs + 1 HR); all 8 delivery tests pass with that private fixture enabled.
  Evidence: `earlier-trace-replay.json` and `earlier-replay-tests.json`.
- Initial full run had 3 assertions pinning the previous two-message HR input
  and falsely included methods; preserved in `full-tests.json`. The updated
  assertions test the intended transport semantics, not weaker quality rules.
- Final full suite: **365 suites / 3397 tests passed**, 7 suites / 14 tests
  skipped; report `full-tests-final.json`.
- TypeScript, targeted ESLint, diff whitespace and changed-line length checks
  passed. Production build passed; BUILD_ID `FAIWt_Mcaz5mKzMYrg6IG`.
- No production component/style file changed. The changed TSX file is a test,
  so no UI-design scan was applicable.

## What this does not prove

Recorded output replay proves deterministic delivery, input/state contracts and
preservation, **not** that a fresh HR model stops misquoting or a fresh author
becomes concise and insightful. Old bad text is deliberately not regenerated,
filtered or relabeled as correct. No new live save/refresh/PDF or natural-user
continuation test occurred. No wording guarantee or screening guarantee is made.

This repair does not remove the existing automatic HR transition when a draft
is saved; that is a broader orchestration decision, not silently changed here.
It exposes truthful state rather than forcing a render or adding paid turns.
Fresh controlled behavior validation remains separate and needs an unsealed
approved budget; the preceding CNY0.50 ledger remains closed at six calls.

Formal health was read-only checked and still reports v8. No push/promotion
was performed. Discussion, causal evidence and next scope are also recorded in
ME `开发文档/2026-11-09-F6-HR核源与导师消息分离修复.md`.
