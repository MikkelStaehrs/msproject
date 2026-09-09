-- Writing onto a thought that is already there.
--
-- `capture_spark` only creates. So a conversation that starts with "save this
-- idea about a mini rack" and goes on for ten minutes about actual equipment
-- and actual prices has nowhere to put the second half: it becomes a second,
-- unconnected spark, and the two have to be married up by hand later.
--
-- This is the first time the connector's reach grows, so it is worth stating
-- plainly what changed. Before: a token could put text in one person's private
-- inbox. Now it can also READ that inbox and add to what is in it. Still
-- nothing about projects, prices, documents or the tree.
--
-- Three limits keep it that size, and all three are here rather than in the
-- endpoint, because the endpoint is the part that could be rewritten:
--
--   * Only the token owner's own sparks. The owner comes from the token, never
--     from an argument, so there is nothing to point somewhere else.
--   * Only sparks still in the inbox. What has already been triaged into work
--     or decided against is none of a capture tool's business.
--   * APPEND, never replace. A model cannot destroy a line you wrote yourself.
--     This is the one that matters most: the reach grew, but nothing existing
--     became losable.

begin;

/**
 * The inbox, for a token holder.
 *
 * Enough to recognise a thought and nothing more: no source, no state, no
 * timestamps beyond the day. A capture tool does not need to know when you
 * last edited something.
 */
create or replace function list_sparks(token text)
returns table (id uuid, body text, note text, captured_on date)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  hashed text;
  owner  uuid;
begin
  hashed := encode(sha256(convert_to(coalesce(token, ''), 'utf8')), 'hex');
  select user_id into owner from spark_token where token_hash = hashed;

  if owner is null then
    raise exception 'That token is not valid here.';
  end if;

  update spark_token set last_used_at = now() where token_hash = hashed;

  return query
    select s.id, s.body, s.note, s.captured_at::date
    from spark s
    where s.user_id = owner
      and s.state = 'new'
    order by s.captured_at desc
    limit 50;
end;
$$;

comment on function list_sparks(text) is
  'The token holder own inbox, and only what is needed to recognise a thought. '
  'Never anyone else, never what has already been triaged.';

/**
 * Add to a note. Never overwrite one.
 *
 * Appending rather than replacing is the whole safety of this function: a model
 * that misreads which spark it is working on adds a paragraph in the wrong
 * place, which is a thing you notice and fix. One that could replace would take
 * a line you wrote with it, and you would not know it had gone.
 */
create or replace function append_spark_note(token text, spark_id uuid, note text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  hashed  text;
  owner   uuid;
  current text;
  addition text;
begin
  addition := trim(coalesce(note, ''));
  if length(addition) = 0 then
    raise exception 'Nothing to add.';
  end if;

  hashed := encode(sha256(convert_to(coalesce(token, ''), 'utf8')), 'hex');
  select user_id into owner from spark_token where token_hash = hashed;

  if owner is null then
    raise exception 'That token is not valid here.';
  end if;

  -- The owner comes from the token. A spark belonging to somebody else, or one
  -- already triaged, is simply not found, and the message says the same either
  -- way: a reply that distinguished them would be a way of probing.
  select s.note into current
  from spark s
  where s.id = spark_id and s.user_id = owner and s.state = 'new';

  if not found then
    raise exception 'No such thought in your inbox.';
  end if;

  update spark_token set last_used_at = now() where token_hash = hashed;

  update spark
  set note = left(
    case
      when current is null or trim(current) = '' then addition
      else current || E'\n\n' || addition
    end,
    16000
  )
  where id = spark_id;

  return spark_id;
end;
$$;

comment on function append_spark_note(text, uuid, text) is
  'Add a paragraph to a spark note. Appends only: nothing already written can '
  'be lost, which is what keeps a write tool safe to hand to a model.';

revoke all on function list_sparks(text) from public;
revoke all on function append_spark_note(text, uuid, text) from public;
grant execute on function list_sparks(text) to anon, authenticated;
grant execute on function append_spark_note(text, uuid, text) to anon, authenticated;

insert into schema_migration (version, applied_at, note)
values ('20260909000006_spark_append', now(),
        'The connector can read its own inbox and add to a note, append only')
on conflict (version) do nothing;

commit;
