-- Artifact/claim links are dependent records. RESTRICT made deleting a user
-- nondeterministically fail because both artifacts and claims cascade from the
-- user while their link still referenced the claim.
alter table public.coach_artifact_claims
  drop constraint if exists coach_artifact_claims_claim_id_fkey;

alter table public.coach_artifact_claims
  add constraint coach_artifact_claims_claim_id_fkey
  foreign key (claim_id) references public.coach_claims(id) on delete cascade;
