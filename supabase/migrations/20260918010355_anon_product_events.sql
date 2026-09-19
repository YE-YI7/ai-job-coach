-- Support anonymous (pre-login) product funnel events.
-- 1) user_id becomes nullable so anonymous events can be stored.
alter table public.product_events alter column user_id drop not null;

-- 2) Anon visitor/device id plus a stable, NULL-safe identity column.
--    Postgres treats NULLs as distinct in unique indexes, so the old
--    unique (user_id, client_event_id) cannot dedup anonymous events;
--    event_identity collapses "no user" into 'anon:<anon_id>' instead.
alter table public.product_events add column if not exists anon_id text;
alter table public.product_events
  add column if not exists event_identity text generated always as (
    coalesce(user_id::text, 'anon:' || coalesce(anon_id, ''))
  ) stored;

alter table public.product_events drop constraint if exists product_events_anon_id_format;
alter table public.product_events
  add constraint product_events_anon_id_format
  check (anon_id is null or anon_id ~ '^[a-zA-Z0-9_-]{8,96}$');

alter table public.product_events drop constraint if exists product_events_has_identity;
alter table public.product_events
  add constraint product_events_has_identity
  check (user_id is not null or anon_id is not null);

-- 3) Add identity-based dedup for anonymous events. We deliberately KEEP the
--    original unique (user_id, client_event_id) so logged-in tracking still
--    dedups on the same columns and does NOT depend on this migration's new
--    objects beyond the nullable user_id — an event from a signed-in user writes
--    only classic columns and keeps working even before/without this migration.
--    The identity index only backs anonymous (user_id IS NULL) dedup, since the
--    old constraint cannot dedup NULL user_ids.
create unique index if not exists product_events_identity_client_unique
  on public.product_events (event_identity, client_event_id);

create index if not exists product_events_anon_time_idx
  on public.product_events (anon_id, occurred_at desc);

comment on column public.product_events.anon_id is
  'Anonymous visitor/device id (uuid persisted in localStorage); nullable even after login.';
comment on column public.product_events.event_identity is
  'Generated dedup identity: user_id text when logged in, otherwise ''anon:'' || anon_id.';

-- RLS and grants intentionally unchanged: service_role-only writes, table-level RLS stays enabled,
-- anon/authenticated remain revoked.
