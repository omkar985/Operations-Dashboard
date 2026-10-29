-- Operations Dashboard — core schema
-- Authoritative browser-auth model: custom JWT (jose) in an HTTP-only cookie.
-- Supabase is used purely as a PostgreSQL database that is reached ONLY from the
-- server with the service-role key. Every table has RLS enabled and NO policies,
-- and anon/authenticated privileges are revoked, so the public anon key can read nothing.
--
-- All timestamps are timestamptz (stored in UTC).

-- ---------------------------------------------------------------- enums
do $$ begin
  create type public.user_role as enum ('ADMIN', 'USER');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.invitation_status as enum ('pending', 'accepted', 'revoked');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- helpers
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------- users
create table if not exists public.users (
  id                  uuid primary key default gen_random_uuid(),
  email               text not null,
  name                text not null,
  password_hash       text not null,
  role                public.user_role not null default 'USER',
  is_active           boolean not null default true,
  -- Incremented to revoke every outstanding session for this user immediately.
  session_version     integer not null default 1,
  last_login_at       timestamptz,
  password_changed_at timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint users_email_lowercase check (email = lower(email)),
  constraint users_email_format check (position('@' in email) > 1),
  constraint users_name_length check (char_length(name) between 1 and 120)
);
create unique index if not exists users_email_key on public.users (email);
create index if not exists users_role_active_idx on public.users (role) where is_active;

drop trigger if exists users_set_updated_at on public.users;
create trigger users_set_updated_at before update on public.users
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- invitations
create table if not exists public.invitations (
  id               uuid primary key default gen_random_uuid(),
  email            text not null,
  role             public.user_role not null default 'USER',
  -- SHA-256 of the raw token. The raw token only ever exists in the emailed link.
  token_hash       text not null unique,
  status           public.invitation_status not null default 'pending',
  invited_by       uuid references public.users (id) on delete set null,
  expires_at       timestamptz not null,
  last_sent_at     timestamptz,
  accepted_at      timestamptz,
  accepted_user_id uuid references public.users (id) on delete set null,
  revoked_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint invitations_email_lowercase check (email = lower(email))
);
-- At most one pending invitation per address.
create unique index if not exists invitations_pending_email_key
  on public.invitations (email) where status = 'pending';
create index if not exists invitations_status_created_idx on public.invitations (status, created_at desc);

drop trigger if exists invitations_set_updated_at on public.invitations;
create trigger invitations_set_updated_at before update on public.invitations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- password resets
create table if not exists public.password_resets (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users (id) on delete cascade,
  token_hash   text not null unique,
  expires_at   timestamptz not null,
  used_at      timestamptz,
  requested_ip text,
  created_at   timestamptz not null default now()
);
create index if not exists password_resets_user_idx on public.password_resets (user_id, created_at desc);

-- ---------------------------------------------------------------- notification outbox
create table if not exists public.notification_outbox (
  id                  uuid primary key default gen_random_uuid(),
  type                text not null check (type in ('invitation', 'password_reset', 'admin_notice')),
  recipient           text not null,
  subject             text not null,
  -- Rendered template inputs. Link-bearing keys are removed once the message is accepted by the SMTP provider.
  payload             jsonb not null default '{}'::jsonb,
  status              text not null default 'pending'
                      check (status in ('pending', 'sending', 'sent', 'failed', 'cancelled')),
  attempts            integer not null default 0,
  last_error          text,
  next_attempt_at     timestamptz not null default now(),
  provider_message_id text,
  related_invitation_id uuid references public.invitations (id) on delete set null,
  related_user_id       uuid references public.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  sent_at             timestamptz
);
create index if not exists notification_outbox_due_idx
  on public.notification_outbox (next_attempt_at) where status in ('pending', 'failed');
create index if not exists notification_outbox_created_idx on public.notification_outbox (created_at desc);

drop trigger if exists notification_outbox_set_updated_at on public.notification_outbox;
create trigger notification_outbox_set_updated_at before update on public.notification_outbox
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- audit log
create table if not exists public.audit_logs (
  id          bigint generated always as identity primary key,
  actor_id    uuid references public.users (id) on delete set null,
  actor_email text,
  action      text not null,
  target_type text,
  target_id   text,
  metadata    jsonb not null default '{}'::jsonb,
  ip          text,
  created_at  timestamptz not null default now()
);
create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);
create index if not exists audit_logs_action_idx on public.audit_logs (action, created_at desc);

-- ---------------------------------------------------------------- settings
create table if not exists public.app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_by uuid references public.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- durable rate limiting
-- Serverless instances share no memory, so counters live in Postgres.
create table if not exists public.rate_limits (
  key          text primary key,
  window_start timestamptz not null,
  count        integer not null
);
create index if not exists rate_limits_window_idx on public.rate_limits (window_start);

-- ---------------------------------------------------------------- row level security
alter table public.users               enable row level security;
alter table public.invitations         enable row level security;
alter table public.password_resets     enable row level security;
alter table public.notification_outbox enable row level security;
alter table public.audit_logs          enable row level security;
alter table public.app_settings        enable row level security;
alter table public.rate_limits         enable row level security;

-- No policies are created on purpose: anon / authenticated are denied everything.
-- The service_role key (server only) bypasses RLS.
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
