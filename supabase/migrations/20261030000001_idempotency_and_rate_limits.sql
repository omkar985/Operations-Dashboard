-- Operations Dashboard — Idempotency and Distributed Rate Limiting Schema
-- Provides database-backed storage and atomic functions for idempotent requests
-- and durable rate-limiting fallback.
--
-- Security model: All tables have RLS enabled and NO policies.
-- Public roles (anon/authenticated) are revoked from all tables, sequences, and functions.
-- All access is through the server service-role key.

-- ---------------------------------------------------------------- idempotency keys
create table if not exists public.idempotency_keys (
  id               uuid primary key default gen_random_uuid(),
  key              text not null,
  scope            text not null,
  user_id          uuid references public.users (id) on delete set null,
  operation        text not null,
  request_hash     text not null,
  status           text not null check (status in ('in_progress', 'completed', 'failed')),
  response_status  integer,
  response_headers jsonb not null default '{}'::jsonb,
  response_body    jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  expires_at       timestamptz not null default (now() + interval '24 hours'),
  constraint idempotency_keys_scope_key unique (scope, key)
);

create index if not exists idempotency_keys_expires_idx on public.idempotency_keys (expires_at);
create index if not exists idempotency_keys_user_idx on public.idempotency_keys (user_id, created_at desc);
create index if not exists idempotency_keys_scope_updated_idx on public.idempotency_keys (scope, updated_at desc);

-- ---------------------------------------------------------------- atomic functions

-- 1. Begin / Claim Idempotent Request
-- Atomically checks existing state or claims a new 'in_progress' lock for the key.
create or replace function public.begin_idempotent_request(
  p_scope text,
  p_key text,
  p_user_id uuid,
  p_operation text,
  p_request_hash text,
  p_lease_seconds integer default 120,
  p_ttl_seconds integer default 86400
)
returns table (
  action text,
  response_status integer,
  response_headers jsonb,
  response_body jsonb
)
language plpgsql
as $$
declare
  v_row idempotency_keys%rowtype;
  v_now timestamptz := now();
  v_lease_cutoff timestamptz := v_now - make_interval(secs => p_lease_seconds);
  v_expires timestamptz := v_now + make_interval(secs => p_ttl_seconds);
begin
  select * into v_row from idempotency_keys where scope = p_scope and key = p_key for update;

  if not found then
    begin
      insert into idempotency_keys (
        key, scope, user_id, operation, request_hash, status, created_at, updated_at, expires_at
      )
      values (
        p_key, p_scope, p_user_id, p_operation, p_request_hash, 'in_progress', v_now, v_now, v_expires
      )
      returning * into v_row;

      action := 'execute';
      response_status := null;
      response_headers := null;
      response_body := null;
      return next;
      return;
    exception when unique_violation then
      select * into v_row from idempotency_keys where scope = p_scope and key = p_key for update;
    end;
  end if;

  -- 1. Request fingerprint verification (reject payload mismatch on same key)
  if v_row.request_hash <> p_request_hash then
    action := 'conflict_mismatch';
    response_status := null;
    response_headers := null;
    response_body := null;
    return next;
    return;
  end if;

  -- 2. Replay completed response
  if v_row.status = 'completed' then
    action := 'replay';
    response_status := v_row.response_status;
    response_headers := v_row.response_headers;
    response_body := v_row.response_body;
    return next;
    return;
  end if;

  -- 3. Concurrent in-progress request handling
  if v_row.status = 'in_progress' then
    if v_row.updated_at > v_lease_cutoff then
      action := 'conflict_in_progress';
      response_status := null;
      response_headers := null;
      response_body := null;
      return next;
      return;
    else
      -- Lease expired (e.g. server instance crash / network failure) — reclaim lock
      update idempotency_keys
         set status = 'in_progress',
             updated_at = v_now,
             user_id = coalesce(p_user_id, v_row.user_id),
             expires_at = v_expires
       where scope = p_scope and key = p_key;

      action := 'execute';
      response_status := null;
      response_headers := null;
      response_body := null;
      return next;
      return;
    end if;
  end if;

  -- 4. Safe retry for previously failed execution
  update idempotency_keys
     set status = 'in_progress',
         updated_at = v_now,
         user_id = coalesce(p_user_id, v_row.user_id),
         expires_at = v_expires
   where scope = p_scope and key = p_key;

  action := 'execute';
  response_status := null;
  response_headers := null;
  response_body := null;
  return next;
  return;
end $$;

-- 2. Finish Idempotent Request
create or replace function public.finish_idempotent_request(
  p_scope text,
  p_key text,
  p_status integer,
  p_headers jsonb,
  p_body jsonb
)
returns boolean
language plpgsql
as $$
begin
  update idempotency_keys
     set status = 'completed',
         response_status = p_status,
         response_headers = coalesce(p_headers, '{}'::jsonb),
         response_body = p_body,
         updated_at = now()
   where scope = p_scope and key = p_key;

  return found;
end $$;

-- 3. Fail Idempotent Request
create or replace function public.fail_idempotent_request(
  p_scope text,
  p_key text,
  p_error text default null
)
returns boolean
language plpgsql
as $$
begin
  update idempotency_keys
     set status = 'failed',
         response_body = case when p_error is not null then jsonb_build_object('error', p_error) else null end,
         updated_at = now()
   where scope = p_scope and key = p_key;

  return found;
end $$;

-- 4. Purge Expired Idempotency Records
create or replace function public.idempotency_purge(p_older_than_seconds integer default 86400)
returns integer
language plpgsql
as $$
declare v_count integer;
begin
  delete from idempotency_keys
   where expires_at < now()
      or updated_at < now() - make_interval(secs => p_older_than_seconds);
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- ---------------------------------------------------------------- row level security & permissions
alter table public.idempotency_keys enable row level security;

revoke all on public.idempotency_keys from public, anon, authenticated;
revoke all on function public.begin_idempotent_request(text, text, uuid, text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.finish_idempotent_request(text, text, integer, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.fail_idempotent_request(text, text, text) from public, anon, authenticated;
revoke all on function public.idempotency_purge(integer) from public, anon, authenticated;
