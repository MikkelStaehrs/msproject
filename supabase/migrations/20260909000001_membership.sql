-- Who may see what.
--
-- Until now every policy in this schema said the same thing:
--
--     using (auth.uid() is not null)
--
-- which means "anyone logged in sees everything". That was honest while there
-- was one account. It stops being honest the moment a colleague gets a login.
--
-- Membership sits on the PROJECT, the root of a tree, and is inherited by
-- everything under it. That is the same cut every roll-up in this application
-- already uses, so there is no second idea of what belongs together.
--
-- Two things need care and both are the difference between working and not:
--
-- 1. RECURSION. A policy on `node` that reads a table whose own policy reads
--    `node` calls itself forever. So the membership lookup runs in a
--    `security definer` function, which is exempt from RLS, and the policies
--    call that instead of querying anything directly.
--
-- 2. LOCKING YOURSELF OUT. The moment these policies land, a project with no
--    members is invisible to everyone including its author. So this migration
--    backfills every existing user into every existing project. That preserves
--    exactly what is true today: everybody can already see everything.

begin;

-- ---------------------------------------------------------------------------
-- A readable name for a user.
--
-- `auth.users` is not exposed through PostgREST and should not be: it holds
-- password hashes and recovery tokens. But a member list showing raw UUIDs is
-- not a member list, and adding a colleague has to be possible by typing their
-- email rather than by finding their id in a dashboard.
--
-- So one mirrored row per user, holding only what the interface needs, kept in
-- step by a trigger. Readable by anyone signed in, because you cannot share a
-- project with someone you cannot name.
-- ---------------------------------------------------------------------------
create table profile (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  created_at timestamptz not null default now()
);

create unique index profile_email_idx on profile(lower(email));

comment on table profile is
  'The public half of a user: id and email, nothing more. auth.users itself '
  'stays unexposed.';

create or replace function profile_from_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into profile (id, email) values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

create trigger auth_user_profile
  after insert or update of email on auth.users
  for each row execute function profile_from_user();

insert into profile (id, email)
select id, email from auth.users
on conflict (id) do nothing;

alter table profile enable row level security;

create policy profile_readable on profile
  for select to authenticated
  using (auth.uid() is not null);

-- ---------------------------------------------------------------------------
-- Membership
-- ---------------------------------------------------------------------------
create table project_member (
  id         uuid primary key default gen_random_uuid(),
  -- A root node. Enforced by trigger below: a subproject cannot be joined on
  -- its own, because visibility is inherited and a half-visible tree is worse
  -- than no access.
  project_id uuid not null references node(id) on delete cascade,
  -- Defaults to whoever is asking, so adding yourself needs no id in hand.
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  added_at   timestamptz not null default now(),
  unique (project_id, user_id)
);

create index project_member_user_idx    on project_member(user_id);
create index project_member_project_idx on project_member(project_id);

comment on table project_member is
  'Who is on a project. Membership sits on the root and is inherited by the '
  'whole subtree.';

create or replace function project_member_must_be_root()
returns trigger
language plpgsql
as $$
begin
  if (select parent_id from node where id = new.project_id) is not null then
    raise exception
      'project_member.project_id must be a project (a node with no parent)';
  end if;
  return new;
end;
$$;

create trigger project_member_root_only
  before insert or update on project_member
  for each row execute function project_member_must_be_root();

-- ---------------------------------------------------------------------------
-- The one lookup every policy uses.
--
-- `security definer` so it is not itself subject to RLS. Without that, asking
-- "may I see this node?" would consult `node`, whose policy asks the same
-- question, forever. `stable` so the planner may call it once per statement
-- rather than once per row. The empty search_path is the standard precaution
-- for a definer function: it must not be steerable by the caller's path.
-- ---------------------------------------------------------------------------
create or replace function can_see_node(nid uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  with recursive up as (
    select id, parent_id from node where id = nid
    union all
    select n.id, n.parent_id from node n join up on n.id = up.parent_id
  )
  select exists (
    select 1
    from up
    join project_member m
      on m.project_id = up.id
     and m.user_id = auth.uid()
    where up.parent_id is null
  );
$$;

comment on function can_see_node(uuid) is
  'Whether the current user is a member of the project this node belongs to. '
  'Security definer to break the recursion an RLS policy would otherwise cause.';

revoke all on function can_see_node(uuid) from public, anon;
grant execute on function can_see_node(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Creating a project makes you a member of it.
--
-- Without this you would create a project and it would vanish, which is the
-- kind of thing that looks like data loss and is not.
-- ---------------------------------------------------------------------------
create or replace function project_creator_joins()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.parent_id is null and auth.uid() is not null then
    insert into project_member (project_id, user_id)
    values (new.id, auth.uid())
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger node_creator_joins
  after insert on node
  for each row execute function project_creator_joins();

-- ---------------------------------------------------------------------------
-- Backfill. Everything that is visible today stays visible.
-- ---------------------------------------------------------------------------
insert into project_member (project_id, user_id)
select n.id, u.id
from node n
cross join auth.users u
where n.parent_id is null
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- The policies. Every one of these replaces `auth.uid() is not null`.
-- ---------------------------------------------------------------------------
alter table project_member enable row level security;

-- You see the memberships of projects you are on, which is what lets the app
-- show who else is involved.
create policy project_member_visible on project_member
  for all to authenticated
  using (can_see_node(project_id))
  with check (can_see_node(project_id));

drop policy if exists node_owner on node;
create policy node_visible on node
  for all to authenticated
  using (can_see_node(id))
  -- A brand new root has no members yet; the trigger adds one straight after.
  -- Anything with a parent must land somewhere you can already see.
  with check (parent_id is null or can_see_node(parent_id));

drop policy if exists blocker_owner on blocker;
create policy blocker_visible on blocker
  for all to authenticated
  using (can_see_node(node_id)) with check (can_see_node(node_id));

drop policy if exists decision_owner on decision;
create policy decision_visible on decision
  for all to authenticated
  using (can_see_node(node_id)) with check (can_see_node(node_id));

drop policy if exists entry_owner on entry;
create policy entry_visible on entry
  for all to authenticated
  using (can_see_node(node_id)) with check (can_see_node(node_id));

drop policy if exists cost_owner on cost;
create policy cost_visible on cost
  for all to authenticated
  using (can_see_node(node_id)) with check (can_see_node(node_id));

drop policy if exists document_owner on document;
create policy document_visible on document
  for all to authenticated
  using (can_see_node(node_id)) with check (can_see_node(node_id));

drop policy if exists report_owner on report;
create policy report_visible on report
  for all to authenticated
  using (can_see_node(node_id)) with check (can_see_node(node_id));

drop policy if exists node_dependency_owner on node_dependency;
create policy node_dependency_visible on node_dependency
  for all to authenticated
  using (can_see_node(node_id) and can_see_node(depends_on_id))
  with check (can_see_node(node_id) and can_see_node(depends_on_id));

-- ---------------------------------------------------------------------------
-- Sparks are personal.
--
-- A spark is half a thought at eleven at night. It is not project work and it
-- has no business being readable by a colleague.
-- ---------------------------------------------------------------------------
alter table spark
  add column user_id uuid references auth.users(id) on delete cascade;

-- Everything captured so far belongs to whoever was using the app: there was
-- one account, so this is not a guess.
update spark set user_id = (select id from auth.users order by created_at limit 1)
where user_id is null;

alter table spark
  alter column user_id set default auth.uid(),
  alter column user_id set not null;

create index spark_user_idx on spark(user_id, state, captured_at desc);

comment on column spark.user_id is
  'Whose thought it was. Sparks are private to their author, deliberately.';

drop policy if exists spark_owner on spark;
create policy spark_mine on spark
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Templates and strategies stay shared.
--
-- A template nobody else can use is a note. A strategy is a company heading,
-- and the list of them is not sensitive; what work feeds it is, and that is
-- governed where the work lives.
-- ---------------------------------------------------------------------------
-- (template and strategy keep their existing `auth.uid() is not null` policies.)

-- The markings themselves are readable by any signed-in user, on purpose: the
-- figure a strategy reports has to be the same number whoever opens the page.
-- A total that changes depending on who is looking cannot be reported upwards.
-- The PAGE shows only the parts you may see; the sum is over everything.
drop policy if exists node_strategy_owner on node_strategy;
create policy node_strategy_readable on node_strategy
  for select to authenticated
  using (auth.uid() is not null);

-- Changing a marking still requires access to the work it marks.
create policy node_strategy_write on node_strategy
  for all to authenticated
  using (can_see_node(node_id)) with check (can_see_node(node_id));

-- ---------------------------------------------------------------------------
-- Which marking is the topmost must not depend on who is asking.
--
-- `v_strategy_node` decides that by looking up the tree through
-- v_node_descendant. That view runs as the caller, so with membership in place
-- an ancestor you cannot see disappears from the lookup, its marking stops
-- counting as "above" the child, and the child is suddenly counted as a top
-- marking. The same money would then be added twice, quietly, for that person
-- only.
--
-- So this one view runs as its owner. It is the deliberate exception in a
-- schema where every other view is security_invoker, and it is why the grant is
-- withdrawn from anon by hand: without RLS underneath it, nothing else would
-- keep a signed-out request out.
-- ---------------------------------------------------------------------------
alter view v_strategy_node set (security_invoker = off);

revoke all on v_strategy_node from public, anon;
grant select on v_strategy_node to authenticated;

comment on view v_strategy_node is
  'Every marking, with whether it is the topmost one for its strategy in its '
  'branch. Runs as owner on purpose: the answer must be the same for everyone, '
  'or the same money gets counted twice for whoever cannot see the ancestor.';

insert into schema_migration (version, applied_at, note)
values ('20260909000001_membership', now(),
        'Visibility by project membership, inherited down the tree')
on conflict (version) do nothing;

commit;
