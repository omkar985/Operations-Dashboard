-- Operations Dashboard — Google Sheets synchronisation tracking and snapshots.
--
-- Source of truth: the Google spreadsheet owns operational records.
-- data_snapshots holds a normalised, read-only copy so pages never call Google directly.

create table if not exists public.data_sync_runs (
  id            uuid primary key default gen_random_uuid(),
  trigger       text not null check (trigger in ('cron', 'manual', 'lazy')),
  status        text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  rows_read     integer,
  rows_valid    integer,
  rows_skipped  integer,
  error_code    text,
  error_message text,
  triggered_by  uuid references public.users (id) on delete set null,
  snapshot_id   uuid
);
create index if not exists data_sync_runs_started_idx on public.data_sync_runs (started_at desc);
-- Guarantees that two synchronisations can never overlap (works across serverless instances).
create unique index if not exists data_sync_runs_single_running_key
  on public.data_sync_runs ((true)) where status = 'running';

create table if not exists public.data_snapshots (
  id           uuid primary key default gen_random_uuid(),
  run_id       uuid not null references public.data_sync_runs (id) on delete cascade,
  synced_at    timestamptz not null default now(),
  row_count    integer not null,
  mapping_hash text not null,
  -- Compact normalised records: see src/types/operations.ts (OpsRecord).
  records      jsonb not null,
  warnings     jsonb not null default '[]'::jsonb
);
create index if not exists data_snapshots_synced_idx on public.data_snapshots (synced_at desc);

alter table public.data_sync_runs enable row level security;
alter table public.data_snapshots enable row level security;
revoke all on public.data_sync_runs from anon, authenticated;
revoke all on public.data_snapshots from anon, authenticated;
