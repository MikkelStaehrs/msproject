-- Enough about a thought that it can be argued with.
--
-- The read tools went live and the first real use showed the gap immediately:
-- Claude could see the SENTENCE and not the CLAIM. `list_sparks` returned the
-- body, the note and a date, so it could react to what was said and had no way
-- to know that a benefit had been scored 4, or that this idea had already been
-- turned down in March and why. You cannot challenge a judgement you cannot
-- see, and you cannot stop a loop you do not know happened.
--
-- Three changes, and none of them writes anything.
--
-- 1. `list_sparks` carries the assessment. Six small numbers and how the saving
--    was described. Cheap to add to a list, and it is what makes the difference
--    between «that sounds worth doing» and «you have this at benefit 4 and the
--    saving rests on a stage volume that counts a different population».
--
-- 2. `read_spark` returns ONE thought whole, including the full note. The note
--    is truncated to 120 characters in the list on purpose: the first real one
--    through this path held two price tables, and six of those in a single
--    reply is a wall. Scan the index, open the one that matters, which is how a
--    person triages anyway.
--
-- 3. `list_dropped_sparks` is the deliberate widening, and it is a change to a
--    limit MASTER states: «only sparks still in the inbox are visible».
--
-- WHY THAT LIMIT MOVES. `verdict` exists, in MASTER's own words, to stop «the
-- same idea arriving again in three months and going round the loop a second
-- time». That job cannot be done blind. An assistant that cannot see what was
-- rejected will cheerfully assess the same idea again, and it will sound just
-- as reasonable the second time, which is precisely the failure the column was
-- added to prevent.
--
-- The limit was written for the WRITE tool and still holds there: `append_spark_note`
-- refuses anything that is not in the inbox, so a triaged thought cannot be
-- edited through this endpoint. Reading a verdict takes nothing away.
--
-- What this does NOT open: sparks that became work. Those point at a node
-- through `became_node_id`, and the work itself is already answerable through
-- `list_work`, which is the honest place to ask «does this exist». Adding the
-- pointer here would be a second route to the same answer.
--
-- And still: the owner comes from the token, never from an argument. These are
-- one person's own private thoughts, which is what a spark is.

begin;

-- ---------------------------------------------------------------------------
-- The inbox, with what has been claimed about each thought.
-- ---------------------------------------------------------------------------
-- DROPPED first, not replaced. `create or replace` cannot change a return type,
-- and adding columns to a `returns table` is exactly that: it fails with
-- «cannot change return type of existing function» and takes the whole
-- migration down with it. The grant does not survive a drop either, so it is
-- given again below.
drop function if exists list_sparks(text);

create function list_sparks(token text)
returns table (
  id               uuid,
  body             text,
  note             text,
  captured_on      date,
  saving_kind      saving_kind,
  saving_value     numeric(14,4),
  saving_stage     text,
  cost_score       smallint,
  benefit_score    smallint,
  complexity_score smallint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  who uuid;
begin
  who := token_owner(token, 'capture');

  return query
    select s.id, s.body, s.note, s.captured_at::date,
           s.saving_kind, s.saving_value, s.saving_stage,
           s.cost_score, s.benefit_score, s.complexity_score
    from spark s
    where s.user_id = who
      and s.state = 'new'
    order by s.captured_at desc
    limit 50;
end;
$$;

comment on function list_sparks(text) is
  'The token holder own inbox, with the assessment on each thought. Never '
  'anyone else. The note is returned whole here and shortened by the caller.';

-- ---------------------------------------------------------------------------
-- What was decided against, and why.
--
-- `updated_at` is when it was settled: dropping is the last thing that happens
-- to one of these, and the trigger maintains it. Close enough to «when», and it
-- needs no column that somebody has to remember to set.
-- ---------------------------------------------------------------------------
create or replace function list_dropped_sparks(token text)
returns table (
  id          uuid,
  body        text,
  verdict     text,
  captured_on date,
  dropped_on  date
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  who uuid;
begin
  who := token_owner(token, 'analyse');

  return query
    select s.id, s.body, s.verdict, s.captured_at::date, s.updated_at::date
    from spark s
    where s.user_id = who
      and s.state = 'dropped'
    order by s.updated_at desc
    limit 50;
end;
$$;

comment on function list_dropped_sparks(text) is
  'Thoughts the owner decided against, with the reason. Exists so the same idea '
  'is not assessed a second time as though it were new.';

-- ---------------------------------------------------------------------------
-- One thought, whole.
--
-- Any state, because the reason to open a dropped one is to read the verdict in
-- full, and the reason to open an inbox one is the note the list had to cut.
-- jsonb rather than a wide row: this is one object, and the caller wants all of
-- it.
-- ---------------------------------------------------------------------------
create or replace function read_spark(token text, spark_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  who uuid;
  -- NOT named `found`. plpgsql has a built-in FOUND, and shadowing it with a
  -- jsonb of your own compiles, works, and misleads the next person to read it.
  doc jsonb;
begin
  who := token_owner(token, 'analyse');

  select to_jsonb(s) - 'user_id' into doc
  from spark s
  where s.id = spark_id and s.user_id = who;

  -- Somebody else's thought and a thought that does not exist read the same,
  -- for the same reason the token errors do.
  if doc is null then
    raise exception 'No such thought.';
  end if;

  return doc;
end;
$$;

comment on function read_spark(text, uuid) is
  'One of the owner own thoughts, whole, in any state. user_id is stripped: the '
  'caller already knows whose it is and it is not theirs to pass on.';

grant execute on function list_sparks(text)        to anon, authenticated;
grant execute on function list_dropped_sparks(text) to anon, authenticated;
grant execute on function read_spark(text, uuid)     to anon, authenticated;

insert into schema_migration (version, applied_at, note)
values ('20260911000002_spark_analysis', now(),
        'Enough about a thought that it can be argued with, and the verdicts that stop a loop')
on conflict (version) do nothing;

commit;
