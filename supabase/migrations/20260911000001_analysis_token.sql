-- Letting Claude READ, so an idea can be argued with before it becomes work.
--
-- A spark is a thought that has not been tested against the COGS strategy yet.
-- The test itself already exists and is arithmetic: lib/cogs.ts turns a saving
-- into a share of the year's target, lib/priority.ts places it in the benefit
-- against complexity matrix. What has never existed is help PRODUCING the two
-- numbers that test takes in, and that is a conversation rather than a
-- calculation: is this already a task somewhere, is the saving real, should the
-- idea be stretched, what does this kind of thing cost.
--
-- THE MODEL MAY ARGUE. IT MAY NEVER BE THE SOURCE OF A STORED NUMBER.
--
-- That is the line, and it is why nothing here writes. Everything this
-- application computes stays computed. The scores are typed by a person into
-- the form on /spark, exactly as before, and there is no path from this
-- endpoint to `benefit_score`. What comes back from a conversation is saved, if
-- it is worth saving, through `append_spark_note`, which already exists and
-- already cannot replace what is there.
--
-- So this migration adds no write path at all. It adds reading, and a scope
-- that says which tokens may do it.
--
-- WHY A SCOPE RATHER THAN JUST ADDING THE FUNCTIONS. Today one token means
-- "may create a spark and nothing else", and that sentence is in MASTER as the
-- whole point of the design. Hang reading off the same credential and every
-- token ever minted silently gains it, including ones handed out while that
-- sentence was true. A capability nobody granted is a capability nobody can
-- revoke knowingly. So existing tokens keep exactly what they have, and reading
-- requires a token deliberately made for it.
--
-- WHAT A STOLEN 'analyse' TOKEN BUYS. The shape of the portfolio the owner can
-- already see - titles, where they sit, type and status - and the company's
-- COGS reference. Not descriptions, not cost lines, not vendors, not documents,
-- not anyone else's projects, and nothing at all that can be changed. That is
-- narrower than a session and wider than a capture token, which is why it is
-- its own scope rather than either of the two that already exist.

begin;

-- ---------------------------------------------------------------------------
-- The scope.
--
-- Created defensively because these files are pasted into the SQL editor by
-- hand and a hand slips: run twice, the type is already there and that is not
-- an error.
-- ---------------------------------------------------------------------------
do $$
begin
  create type token_scope as enum ('capture', 'analyse');
exception
  when duplicate_object then null;
end;
$$;

alter table spark_token
  add column if not exists scope token_scope not null default 'capture';

comment on column spark_token.scope is
  'What this credential may do. capture: create a spark, read its owner''s own '
  'inbox, append to a thought in it. analyse: all of that, plus read the '
  'structure of the projects its owner is a member of and the COGS reference. '
  'Never write to anything but a spark, at either scope.';

-- ---------------------------------------------------------------------------
-- Who is asking, from the token rather than from a session.
--
-- `can_see_node` answers the same question for the application, but it reads
-- `auth.uid()`, which is null here: there is no session behind an MCP call and
-- there never will be. So identity comes from the token and the membership join
-- is done again, in the one place where that is true. Two spellings of one
-- rule, which is a thing this project otherwise refuses, so they are kept
-- beside each other deliberately: same join, same inheritance down the tree,
-- different source of identity.
--
-- `raise` is identical for every kind of failure. A reply that told a missing
-- token apart from a wrong scope would be a way of probing for both.
-- ---------------------------------------------------------------------------
create or replace function token_owner(token text, needs token_scope)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  hashed text;
  owner  uuid;
  held   token_scope;
begin
  hashed := encode(sha256(convert_to(coalesce(token, ''), 'utf8')), 'hex');

  select user_id, scope into owner, held
  from spark_token where token_hash = hashed;

  if owner is null then
    raise exception 'That token is not valid here.';
  end if;

  -- 'analyse' contains 'capture'. One connector holds one token, and a reply
  -- that is worth keeping has to be writable with the same credential that
  -- read the thing it is about.
  if needs = 'analyse' and held <> 'analyse' then
    raise exception 'That token is not valid here.';
  end if;

  update spark_token set last_used_at = now() where token_hash = hashed;

  return owner;
end;
$$;

comment on function token_owner(text, token_scope) is
  'The user behind a token, if it carries at least the scope asked for. The '
  'token equivalent of auth.uid(), and the only place that equivalence is '
  'drawn.';

revoke all on function token_owner(text, token_scope) from public, anon;

-- ---------------------------------------------------------------------------
-- The work this token's owner may see.
--
-- Structure only: what exists, what it is called, where it sits, what type it
-- is and what state it is in. Enough to answer "is this idea already a task
-- somewhere" and "where would it go", which are the two questions that need the
-- tree. Deliberately NOT description: a description is substance, and substance
-- is what the note on the spark is for.
--
-- Descends from the roots the owner is a member of rather than climbing from
-- every node, so membership is applied once at the top and inherited, which is
-- the same cut the application uses. A node whose project the owner is not on
-- is never in the working set to begin with.
-- ---------------------------------------------------------------------------
create or replace function list_work(token text)
returns table (
  id         uuid,
  parent_id  uuid,
  project_id uuid,
  title      text,
  type       node_type,
  status     node_status,
  sort_order int
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  -- NOT named `owner`. `node.owner` is a real column, holding the external
  -- stakeholder, and plpgsql refuses an unqualified name that could be either.
  -- The query below joins `node`, so `owner` would have failed at run time and
  -- only at run time, which in a schema applied by hand means failing in the
  -- SQL editor with the whole migration rolled back.
  who uuid;
begin
  who := token_owner(token, 'analyse');

  return query
  with recursive mine as (
    select n.id, n.parent_id, n.id as project_id, n.title, n.type, n.status,
           n.sort_order
    from node n
    join project_member m on m.project_id = n.id and m.user_id = who
    where n.parent_id is null
    union all
    select c.id, c.parent_id, mine.project_id, c.title, c.type, c.status,
           c.sort_order
    from node c
    join mine on c.parent_id = mine.id
  )
  select mine.id, mine.parent_id, mine.project_id, mine.title, mine.type,
         mine.status, mine.sort_order
  from mine
  order by mine.project_id, mine.sort_order, mine.id;
end;
$$;

comment on function list_work(text) is
  'The tree the token owner is a member of, structure only. No descriptions, '
  'no money, no documents, and nothing from a project they are not on.';

-- ---------------------------------------------------------------------------
-- What a saving is measured against.
--
-- Without this an analysis argues about whether an idea is worth doing with no
-- idea what the year asks for, and the figures it invents to fill the gap are
-- exactly the class of plausible guess that put «sold units» in this schema.
-- One euro per unit is meaningless without the unit.
--
-- jsonb because the three shapes do not share a row and a function per shape
-- would be three round trips for one question.
-- ---------------------------------------------------------------------------
create or replace function read_reference(token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  who uuid;
begin
  -- The reference is the same for everyone, so the token is checked for the
  -- right to ask rather than for whose answer this is.
  who := token_owner(token, 'analyse');

  return jsonb_build_object(
    'yardstick', (
      select to_jsonb(y) from yardstick y limit 1
    ),
    'stages', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.fiscal_year desc, s.stage)
      from stage_volume s
    ), '[]'::jsonb),
    'strategies', coalesce((
      select jsonb_agg(
               jsonb_build_object('id', st.id, 'name', st.name,
                                  'description', st.description)
               order by st.sort_order, st.name)
      from strategy st
    ), '[]'::jsonb)
  );
end;
$$;

comment on function read_reference(text) is
  'The COGS reference a saving is weighed against: the yardstick, the stage '
  'volumes and the strategy headings. Read only, and the same for everyone.';

-- Callable without a session, on purpose: the token is the credential, not the
-- Supabase key. Neither does anything without a valid one carrying 'analyse'.
grant execute on function list_work(text)      to anon, authenticated;
grant execute on function read_reference(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- The three that already existed now ask the same question the same way.
--
-- Each of them inlined the hash, the lookup, the null check and the
-- last_used_at stamp, which was fine while there was one shape of credential
-- and stopped being fine the moment there were two: a scope checked in one
-- place and not the others is a scope that is not checked. Four copies of
-- «who is this» is how the median ended up with two answers earlier in this
-- project.
--
-- Bodies are otherwise unchanged, and each still refuses at the same point and
-- with the same words. They ask for 'capture', which an 'analyse' token also
-- satisfies.
-- ---------------------------------------------------------------------------
create or replace function capture_spark(token text, body text, note text default null)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  owner uuid;
  fresh uuid;
begin
  if body is null or length(trim(body)) = 0 then
    raise exception 'A spark needs something in it.';
  end if;

  owner := token_owner(token, 'capture');

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

create or replace function list_sparks(token text)
returns table (id uuid, body text, note text, captured_on date)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  owner uuid;
begin
  owner := token_owner(token, 'capture');

  return query
    select s.id, s.body, s.note, s.captured_at::date
    from spark s
    where s.user_id = owner
      and s.state = 'new'
    order by s.captured_at desc
    limit 50;
end;
$$;

create or replace function append_spark_note(token text, spark_id uuid, note text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  owner    uuid;
  current  text;
  addition text;
begin
  addition := trim(coalesce(note, ''));
  if length(addition) = 0 then
    raise exception 'Nothing to add.';
  end if;

  owner := token_owner(token, 'capture');

  -- The owner comes from the token. A spark belonging to somebody else, or one
  -- already triaged, is simply not found, and the message says the same either
  -- way: a reply that distinguished them would be a way of probing.
  select s.note into current
  from spark s
  where s.id = spark_id and s.user_id = owner and s.state = 'new';

  if not found then
    raise exception 'No such thought in your inbox.';
  end if;

  update spark
  set note = left(
    case
      when current is null or trim(current) = '' then addition
      else current || E'

' || addition
    end,
    16000
  )
  where id = spark_id;

  return spark_id;
end;
$$;

insert into schema_migration (version, applied_at, note)
values ('20260911000001_analysis_token', now(),
        'A token scope that may read structure and the COGS reference, and write nothing')
on conflict (version) do nothing;

commit;
