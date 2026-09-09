-- Letting the Claude app write a spark, without handing it the keys.
--
-- The obvious way to do this would be to put the service role key on the
-- deployment and insert as nobody. That key bypasses every policy in the
-- schema: an endpoint whose entire job is "add one sentence to an inbox" would
-- be able to read every project, every price and every document, and delete
-- them. The blast radius has nothing to do with the job.
--
-- So the endpoint gets no privileges at all. It calls this function with the
-- anon key, which is already public and already useless on its own, and the
-- function is the only thing here with elevated rights. It can create a spark.
-- That is the whole of what it can do, and no argument to it changes that.
--
-- The token identifies a person. It is stored as a SHA-256 hash, so the row
-- cannot be read back into a working credential, and it is shown to its owner
-- exactly once when it is made.
--
-- What an attacker gets with a stolen token: the ability to put text in one
-- person's private inbox. Not the tree, not the money, not the files. That
-- asymmetry is the point of the design.

begin;

create table spark_token (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  -- Which thing holds it, so revoking the right one does not need guesswork.
  name         text not null,
  -- SHA-256, hex. Never the token itself: a table that can be read back into a
  -- working credential is a table that leaks one.
  token_hash   text not null unique,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);

create index spark_token_user_idx on spark_token(user_id);

comment on table spark_token is
  'Long lived credentials that may create a spark and nothing else. Stored '
  'hashed; shown to their owner once, when made.';

alter table spark_token enable row level security;

-- You manage your own, and only see your own.
create policy spark_token_mine on spark_token
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- The one thing the endpoint may do.
-- ---------------------------------------------------------------------------
create or replace function capture_spark(token text, body text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  hashed text;
  owner  uuid;
  fresh  uuid;
begin
  if body is null or length(trim(body)) = 0 then
    raise exception 'A spark needs something in it.';
  end if;

  hashed := encode(sha256(convert_to(coalesce(token, ''), 'utf8')), 'hex');

  select user_id into owner from spark_token where token_hash = hashed;

  if owner is null then
    -- Deliberately the same message whatever was wrong with it. A reply that
    -- distinguished "no such token" from "expired" would be a way of probing.
    raise exception 'That token is not valid here.';
  end if;

  update spark_token set last_used_at = now() where token_hash = hashed;

  insert into spark (user_id, body, source)
  values (owner, left(trim(body), 4000), 'claude')
  returning id into fresh;

  return fresh;
end;
$$;

comment on function capture_spark(text, text) is
  'Create a spark on behalf of whoever owns the token. The only elevated path '
  'into this database that is reachable without a session, and it can do '
  'exactly one thing.';

-- Callable without a session, on purpose: the token is the credential, not the
-- Supabase key. Nothing happens without a valid one.
grant execute on function capture_spark(text, text) to anon, authenticated;

insert into schema_migration (version, applied_at, note)
values ('20260909000004_capture_token', now(),
        'A token that may create a spark and nothing else')
on conflict (version) do nothing;

commit;
