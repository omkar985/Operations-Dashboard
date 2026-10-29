-- Operations Dashboard — transactional database functions.
-- Each function performs a critical multi-step change atomically.
-- They are callable only with the service-role key (execute revoked from public roles).

-- ---------------------------------------------------------------- rate limiting
create or replace function public.rate_limit_hit(p_key text, p_window_seconds integer, p_max integer)
returns table (allowed boolean, remaining integer, retry_after_seconds integer)
language plpgsql
as $$
declare
  v_row rate_limits%rowtype;
  v_now timestamptz := now();
  v_window interval := make_interval(secs => p_window_seconds);
begin
  insert into rate_limits as r (key, window_start, count)
  values (p_key, v_now, 1)
  on conflict (key) do update set
    window_start = case when r.window_start <= v_now - v_window then v_now else r.window_start end,
    count        = case when r.window_start <= v_now - v_window then 1 else r.count + 1 end
  returning r.key, r.window_start, r.count into v_row;

  allowed := v_row.count <= p_max;
  remaining := greatest(p_max - v_row.count, 0);
  retry_after_seconds := case
    when allowed then 0
    else greatest(ceil(extract(epoch from (v_row.window_start + v_window - v_now)))::integer, 1)
  end;
  return next;
end $$;

create or replace function public.rate_limit_purge(p_older_than_seconds integer default 86400)
returns integer
language plpgsql
as $$
declare v_count integer;
begin
  delete from rate_limits where window_start < now() - make_interval(secs => p_older_than_seconds);
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- ---------------------------------------------------------------- invitations
-- Atomically validates and consumes an invitation (single use) and creates the user.
create or replace function public.accept_invitation(p_token_hash text, p_name text, p_password_hash text)
returns public.users
language plpgsql
as $$
declare
  v_inv  invitations%rowtype;
  v_user users%rowtype;
begin
  select * into v_inv from invitations where token_hash = p_token_hash for update;
  if not found then
    raise exception 'INVITATION_INVALID';
  end if;
  if v_inv.status = 'revoked' then
    raise exception 'INVITATION_REVOKED';
  end if;
  if v_inv.status = 'accepted' then
    raise exception 'INVITATION_USED';
  end if;
  if v_inv.expires_at <= now() then
    raise exception 'INVITATION_EXPIRED';
  end if;
  if exists (select 1 from users where email = v_inv.email) then
    raise exception 'EMAIL_TAKEN';
  end if;

  insert into users (email, name, password_hash, role)
  values (v_inv.email, p_name, p_password_hash, v_inv.role)
  returning * into v_user;

  update invitations
     set status = 'accepted', accepted_at = now(), accepted_user_id = v_user.id
   where id = v_inv.id;

  return v_user;
end $$;

-- ---------------------------------------------------------------- password reset
-- Atomically validates and consumes a reset token, sets the new password and revokes all sessions.
create or replace function public.consume_password_reset(p_token_hash text, p_password_hash text)
returns uuid
language plpgsql
as $$
declare
  v_reset password_resets%rowtype;
  v_user  users%rowtype;
begin
  select * into v_reset from password_resets where token_hash = p_token_hash for update;
  if not found then
    raise exception 'RESET_INVALID';
  end if;
  if v_reset.used_at is not null then
    raise exception 'RESET_USED';
  end if;
  if v_reset.expires_at <= now() then
    raise exception 'RESET_EXPIRED';
  end if;

  select * into v_user from users where id = v_reset.user_id for update;
  if not found or not v_user.is_active then
    raise exception 'RESET_INVALID';
  end if;

  update users
     set password_hash = p_password_hash,
         password_changed_at = now(),
         session_version = session_version + 1
   where id = v_user.id;

  -- Consume this token and invalidate any other outstanding ones.
  update password_resets set used_at = now() where user_id = v_user.id and used_at is null;

  return v_user.id;
end $$;

-- ---------------------------------------------------------------- member administration
-- Role / activation changes with last-administrator protection and immediate session revocation.
create or replace function public.admin_update_user(
  p_actor uuid,
  p_target uuid,
  p_role public.user_role default null,
  p_active boolean default null
)
returns public.users
language plpgsql
as $$
declare
  v_target       users%rowtype;
  v_new_role     user_role;
  v_new_active   boolean;
  v_admin_count  integer;
begin
  -- Serialise concurrent admin changes by locking every active administrator row.
  perform 1 from users where role = 'ADMIN' and is_active for update;

  select * into v_target from users where id = p_target for update;
  if not found then
    raise exception 'USER_NOT_FOUND';
  end if;

  v_new_role   := coalesce(p_role, v_target.role);
  v_new_active := coalesce(p_active, v_target.is_active);

  if v_new_role = v_target.role and v_new_active = v_target.is_active then
    return v_target;
  end if;

  if p_actor = p_target then
    raise exception 'SELF_CHANGE_FORBIDDEN';
  end if;

  if v_target.role = 'ADMIN' and v_target.is_active and (v_new_role <> 'ADMIN' or not v_new_active) then
    select count(*) into v_admin_count from users where role = 'ADMIN' and is_active;
    if v_admin_count <= 1 then
      raise exception 'LAST_ADMIN';
    end if;
  end if;

  update users
     set role = v_new_role,
         is_active = v_new_active,
         session_version = session_version + 1
   where id = p_target
  returning * into v_target;

  return v_target;
end $$;

-- ---------------------------------------------------------------- sync lock
-- Starts a sync run; fails with SYNC_IN_PROGRESS when another run holds the lease.
create or replace function public.begin_sync_run(p_trigger text, p_user uuid default null)
returns public.data_sync_runs
language plpgsql
as $$
declare
  v_run data_sync_runs%rowtype;
begin
  -- A run that has been "running" for over 10 minutes is considered dead.
  update data_sync_runs
     set status = 'failed', finished_at = now(),
         error_code = 'LEASE_EXPIRED', error_message = 'Run exceeded its 10 minute lease'
   where status = 'running' and started_at < now() - interval '10 minutes';

  begin
    insert into data_sync_runs (trigger, triggered_by) values (p_trigger, p_user)
    returning * into v_run;
  exception when unique_violation then
    raise exception 'SYNC_IN_PROGRESS';
  end;
  return v_run;
end $$;

-- ---------------------------------------------------------------- outbox claiming
-- Atomically claims a notification for sending so a message is never delivered twice concurrently.
-- Returns no row when the message is not eligible (already sent / being sent / cancelled).
create or replace function public.claim_outbox_notification(p_id uuid)
returns setof public.notification_outbox
language sql
as $$
  update notification_outbox
     set status = 'sending', attempts = attempts + 1
   where id = p_id
     and (status in ('pending', 'failed')
          or (status = 'sending' and updated_at < now() - interval '10 minutes'))
  returning *;
$$;

-- ---------------------------------------------------------------- privileges
revoke all on function public.rate_limit_hit(text, integer, integer)        from public, anon, authenticated;
revoke all on function public.rate_limit_purge(integer)                      from public, anon, authenticated;
revoke all on function public.accept_invitation(text, text, text)            from public, anon, authenticated;
revoke all on function public.consume_password_reset(text, text)             from public, anon, authenticated;
revoke all on function public.admin_update_user(uuid, uuid, public.user_role, boolean) from public, anon, authenticated;
revoke all on function public.begin_sync_run(text, uuid)                     from public, anon, authenticated;
revoke all on function public.claim_outbox_notification(uuid)                from public, anon, authenticated;
