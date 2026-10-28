# Mock interview result and history contract

This change integrates the reviewed local result/history layout into the existing cockpit. It does not replace real-interview review, model selection, the mentor chat, billing, or résumé editing.

## Data and ownership

- `/api/interview/history` authenticates using the existing server session. Caller-supplied owner identifiers are ignored.
- Session reads are owner-filtered before any question/answer read. Text search joins child tables to the owned parent. Related job names are separately owner-filtered.
- Question and answer tables remain the source of truth. Existing answer rows are never edited or deleted by history reads.
- Displayed-question snapshots and setup/end events append idempotently to existing `coach_sources`. No schema migration or new RLS permission is required.
- The response is `private, no-store`, varies by Cookie, and contains no credentials or model prompts.
- Search covers recorded questions, answers, and feedback suggestions; it supports saved round labels, job scope and stable 10-row pagination. Bounded overflow fails explicitly rather than pretending a partial search is complete.

## Honest result semantics

- A submitted answer saved before model feedback counts as an answer, not a successful assessment.
- Actual linked questions reached by the user count as follow-ups. Suggested questions inside assessment text are labelled separately.
- Explicitly skipped, reached-but-unanswered and missing-activity records are distinct. A generated but never displayed question is not evidence of completion.
- The longest excerpt is one actual answer, not a concatenation, and is not labelled the best answer.
- Elapsed time requires a persisted end event and includes pauses. Missing legacy timing is not invented.
- Model text uses the existing Markdown renderer. Evidence and rewrite details remain expandable.

## Save lifecycle

- Send captures the submitted text and starts a durable free draft write before model assessment.
- End waits for that accepted write, not for model completion. A failed write retains the composer and cannot claim successful completion.
- Late assessment cannot reopen an ended session or overwrite another job's UI. Current-session navigation is kept in the URL; history filters/page/expanded record survive refresh.
- A pending assessment resumes the reached question; it cannot silently advance to a generated next question.
- An already reached question is not regenerated and overwritten by a later next-question request.
- Single-answer assessment reserves 3000 output tokens for its evidence/dimensions/rewrite JSON; linked-question output retains its existing budget. Incomplete provider output is still rejected, never repaired into success by deleting fields. These two explicit actions disable hidden SDK/outer retries; a durable answer remains available for a user-directed retry.
- Hosted Step reasoning additionally receives a bounded 4096-token reasoning allowance and a strict output schema, with a 55-second model deadline inside the 60-second route. This is provider-aware: connected gateways do not receive that extra token allowance or Step schema. Content evidence and question-lineage checks still run after parsing. Verify the deployed provider through telemetry; local development environment values are not proof of production routing. See the [official reasoning](https://platform.stepfun.com/docs/zh/guides/developer/reasoning) and [structured-output](https://platform.stepfun.com/docs/zh/guides/developer/json-mode) guides.

## Release gates

Use isolated fictional accounts to verify answer persistence, real follow-up behavior, search/pagination, browser refresh, model picker and mentor input, and cross-account denial. Keep original answer/résumé/quota hashes and verify them before cleanup. A controlled function test is not a real-model test; browser rendering is not proof of cloud persistence.

Stage a production build without domain assignment, validate that exact build, then promote only after all required gates pass. Keep the previous stable deployment. Model calls require a bounded authorized budget and are not part of deterministic CI.

The prerequisite date-sensitive recruitment test fixes its fixture clock only. It does not relax the production freshness or billing rule. This branch disables automatic Vercel Git deployment so CI cannot publish a candidate before acceptance.

The warm-paper result layout follows the reviewed prototype. Its local numeric hierarchy, dark green answered marker and search highlight are intentional scoped choices; unrelated historical design-token advisories are not broadened into a restyle.
