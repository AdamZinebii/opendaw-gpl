-- Updated auth_on_login RPC to support multiple concurrent sessions
-- This allows users to be logged in on multiple browser windows/tabs simultaneously
--
-- To apply: Go to Supabase Dashboard -> SQL Editor -> paste and run this

CREATE OR REPLACE FUNCTION auth_on_login()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  v_user_id uuid := coalesce((claims->>'sub')::uuid, auth.uid());
  v_email text := coalesce(claims->>'email', '');
  v_full_name text := coalesce(claims->'user_metadata'->>'full_name', claims->'user_metadata'->>'name', split_part(v_email, '@', 1));
  v_session_token_hash text := 'session_' || v_user_id::text || '_' || extract(epoch from now())::text;
BEGIN
  if v_user_id is null then
    raise exception 'auth_on_login: no auth uid(); ensure call is authenticated';
  end if;

  -- Upsert user
  insert into public.users (id, email, display_name, first_authenticated_at, last_authenticated_at)
  values (v_user_id, v_email, v_full_name, now(), now())
  on conflict (id) do update set
    email = excluded.email,
    display_name = excluded.display_name,
    last_authenticated_at = now();

  -- REMOVED: Deactivate existing sessions (this was breaking multi-window support)
  -- Instead, we now support multiple concurrent active sessions per user

  -- Update last_activity_at for existing active sessions
  update public.user_sessions
  set last_activity_at = now()
  where user_id = v_user_id
    and is_active = true
    and expires_at > now();  -- Only update non-expired sessions

  -- Insert new session
  insert into public.user_sessions (user_id, session_token_hash, last_activity_at, is_active, expires_at)
  values (v_user_id, v_session_token_hash, now(), true, now() + interval '24 hours')
  ON CONFLICT DO NOTHING;

END;
$$;
