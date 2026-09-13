# Mentor streaming — 2026-09-13

- POST `/api/coach/agent` accepts `Accept: application/x-ndjson`; existing JSON clients remain compatible.
- `status` / `delta` events are provisional. Only `done` with `ok:true` confirms the persisted turn and completed quota wrapper. EOF is not success.
- The frontend hides the structured follow-up trailer, renders UTF-8 chunks incrementally, and labels unfinished drafts. Retry retains the request ID; persisted answers are replayed without another generation.
- History, learning memory and profile reads run concurrently. Claims and artifacts also run concurrently. TokenPay decrypted credentials are deduplicated only within the generation request, never between users or requests.
- Streaming upstream requests abort after 15 seconds without answer text, or 45 seconds total. Automatic mode attempts Flash once for transient failures before visible output. Explicit model selections, authorization/balance failures and partial responses do not silently retry. A failed model is excluded from automatic selection for 60 seconds in the warm process, not a global health registry.
- Tests cover fragmented UTF-8, hidden trailers, premature EOF, upstream interruption, persistence failure, saved completion, bounded fallback and exclusions. 52 suites / 471 cases passed; local production build, TypeScript and changed-source lint passed.
- Verify the deployed endpoint with `node --env-file=.env.ops.local scripts/verify-chat-models.mjs <owner-authorized-opportunity-id> --stream`. Uses one normal tutoring generation, then verifies saved history and idempotent replay; removes only its own temporary session and turns. Provider usage charges still apply.
- Production timing results are not claimed until the live script completes.
