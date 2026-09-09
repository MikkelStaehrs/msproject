-- What made the thought make sense at the time.
--
-- The first spark captured through Claude read "OT Test Center med mini rack".
-- Correct, in his own words, and close to useless in three weeks: a bare
-- fragment loses the thing that made it worth saying.
--
-- So a spark gets a second field, and the two are kept apart on purpose:
--
--   body  what you said. Untouched, and what becomes the description if the
--         spark turns into work, because how you first put it is usually
--         clearer than the name you settle on.
--   note  what was around it. Why it came up, what was being discussed, the
--         specifics that were mentioned in passing.
--
-- Keeping them in one field would have blurred the two, and the first thing
-- lost would have been the sentence itself. Capture is still capture: the note
-- holds context, never a plan, never a proposed breakdown, never a guess at
-- which project it belongs to. Those are decisions, and they are made at a desk
-- with the tree in front of you.

begin;

alter table spark
  add column note text;

comment on column spark.note is
  'What made the thought make sense at the time. Context, never a plan: the '
  'body is what was said, this is what was around it.';

-- ---------------------------------------------------------------------------
-- The capture function takes it too.
--
-- The two argument version is dropped rather than left beside a three argument
-- one: overloads that differ only by a defaulted trailing parameter are
-- ambiguous to call, and an endpoint that silently reaches the older one would
-- drop every note without saying so.
-- ---------------------------------------------------------------------------
drop function if exists capture_spark(text, text);

create or replace function capture_spark(token text, body text, note text default null)
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

  insert into spark (user_id, body, note, source)
  values (
    owner,
    left(trim(body), 4000),
    nullif(left(trim(coalesce(note, '')), 8000), ''),
    'claude'
  )
  returning id into fresh;

  return fresh;
end;
$$;

comment on function capture_spark(text, text, text) is
  'Create a spark on behalf of whoever owns the token. The only elevated path '
  'into this database that is reachable without a session, and it can do '
  'exactly one thing.';

revoke all on function capture_spark(text, text, text) from public;
grant execute on function capture_spark(text, text, text) to anon, authenticated;

insert into schema_migration (version, applied_at, note)
values ('20260909000005_spark_note', now(),
        'A spark keeps what was said and what was around it, apart')
on conflict (version) do nothing;

commit;
