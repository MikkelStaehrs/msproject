# The node, task and spark model, handed to another project

You are being asked to build this hierarchy in a codebase that does not have it.
This file is the whole brief. It assumes you cannot read the original repo, so
everything you need is here: the shape, the reasons, the order to build it in,
and the mistakes that were already paid for once.

Read it all before the first migration. The schema below is short enough that
the temptation is to paste it and start. Half of what makes it work is the
reasons, and a reason you skip is a decision somebody silently reverses in week
three.

---

## 0. Three questions to settle before you write anything

The answers change the build, and none of them can be derived from the codebase
you are porting into. Ask the human, and write the answers into this file before
you go further.

1. **What is the unit that gets reported upwards?** Here it is the project, the
   root of a tree. It is also the unit access hangs on, the unit money rolls up
   to, and the unit a weekly report is written for. If your project has a
   different reporting unit, everything in section 4 moves with it.
2. **Who shares what?** This model has two visibilities that do not match: work
   is shared through membership on the root, and the idea inbox is private to
   its author. That asymmetry is the reason section 5 copies rather than points.
   If everything in your project is shared, that section gets simpler, and you
   should simplify it rather than carry machinery you do not need.
3. **Is there a real measure of worth?** Here, ideas are scored against a company
   strategy: one euro of cost out of every unit sold. That is local and almost
   certainly wrong for you. The mechanism is portable, the yardstick is not. Do
   not port a number.

---

## 1. The invariants

These five hold the model up. Everything else is detail you may reshape.

**One table for the whole tree.** `parent_id` points at the same table, so depth
is unbounded. A `type` column says what a node is, and only one distinction in
it changes any calculation: work, or container.

**No computed value is stored in a column.** Progress, blocked-ness, day counts,
work breakdown codes and "days since last" are all derived. A column you can
forget to update is not a measurement, it is a claim. This is the invariant most
often broken by accident, because storing the number is always easier on the day.

**One definition, one place.** A word that means one thing is computed in one
place. This was broken six times in the original, and every break was invisible
until the two copies disagreed: two medians half a day apart, `addDays` written
twice under two names, a `blocked` column beside a fact about open blockers, one
subtree walker that had quietly grown into two. Give each such word a single home
the first time you need it.

**A query that fails must say so.** Reading with `data ?? []` turns a missing
view into an empty list and renders a page that looks fine and shows nothing.
That is exactly how a rolled back migration went unnoticed here: the tree simply
drew no sequence marks and nothing said why. Pages check for an error before
using results, and anything that WRITES must throw rather than proceed on an
empty read. A caller that renders can catch the throw. A caller that writes must
not be able to ignore it.

**Migrations survive being run twice, or half.** `create table if not exists`,
`create or replace view`, `drop ... if exists`, and every migration records its
own version in a `schema_migration` table as its last statement. Never assume a
migration was applied: ask that table. A missing table that exists in a migration
file is almost always an unapplied migration rather than a bug in the code.

---

## 2. The tree

```sql
create type node_type   as enum ('development','project','subproject','task');
create type node_status as enum ('idea','planned','active','paused','done','cancelled');

create table node (
  id            uuid primary key default gen_random_uuid(),
  parent_id     uuid references node(id) on delete cascade,
  type          node_type   not null,
  title         text        not null,
  description   text,
  status        node_status not null default 'planned',
  owner         text,
  start_date    date,
  due_date      date,
  completed_at  timestamptz,
  is_milestone  boolean not null default false,
  sort_order    int not null default 0,
  reporting     jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
```

**`project` is a root.** No parent. It is the unit reported, the unit access
hangs on, and the unit everything rolls up to.

**`task` is the work.** Only tasks count towards progress. `development` and
`subproject` are containers: they can be opened, carry their own roles and their
own log, and count as nothing.

**Development and subproject are identical to the machine.** The distinction is
a convention, kept because it makes a tree readable to somebody who was not in
the room. Subproject *divides*, because the project is too big for one list.
Development *builds*, because a specific thing has to be made and it breaks into
the tasks that make it. State this in your own docs, or it gets invented
differently by the next person. It costs no code.

**`blocked` is not a status.** It was removed from the enum here on purpose. A
status you can forget to set is not a measurement: the mark said blocked only if
somebody remembered the dropdown, and kept saying so after the blocker was
resolved. A node is blocked exactly when it carries an open blocker, computed in
a view and never stored. What is left in the status enum is only what a person
DECIDES. Note that `paused` means on hold and is a decision, not a wait, which is
why `blocked` could not simply fold into it.

**`completed_at` is not a cached derivation.** It is the timestamp for when
status became done, and the "what is next" view leans on it.

**`reporting` is jsonb on purpose.** It holds the fields some external system
demands that cannot be derived: a project number, an account string, a
portfolio. Those change when somebody else's form changes, and a migration per
field is a tax you pay forever. Anything the application itself reasons about
gets a real column.

**The type picker should say what it means.** Order it top down rather than
alphabetically, and carry one line of explanation per type, used by both the form
and whatever guide you write. Four bare words in alphabetical order ask the user
to know the answer before reading the question, and a type explained in two
places eventually gets explained two different ways.

### Everything else hangs on a node, never on the project

The work log, blockers, decisions, priced lines and documents all carry `node_id`
with `on delete cascade`. A log line belongs to the node the work happened on,
four levels down if that is where it happened. Roll-ups gather the whole branch,
so it still reaches the weekly report, but opening one part shows only its own
lines. That single choice is what makes "what is going on in the different parts"
answerable without a second column.

The one relationship that is not the tree:

```sql
create table node_dependency (
  id            uuid primary key default gen_random_uuid(),
  node_id       uuid not null references node(id) on delete cascade,
  depends_on_id uuid not null references node(id) on delete cascade,
  note          text,
  created_at    timestamptz not null default now(),
  unique (node_id, depends_on_id),
  check (node_id <> depends_on_id)
);
```

The tree says something sits UNDER something. It cannot say the data platform
must be finished BEFORE the scanner can deliver data. Direction reads: `node_id`
waits on `depends_on_id`. Offer it on any node, not only on projects, because a
task in one subproject waiting on a task in another is the case it exists for and
the case a project-only version cannot express. Only two guards, because only two
can do damage: nothing waits on itself, and the same edge cannot be recorded
twice. A cycle is harmless as long as you display one link per direction.

### The blocker, and why it is an entity

The most important design choice in the model, and the one most likely to be
argued back down into a boolean. Do not let it be.

```sql
create table blocker (
  id           uuid primary key default gen_random_uuid(),
  node_id      uuid not null references node(id) on delete cascade,
  title        text not null,
  waiting_on   text not null,
  opened_at    date not null default current_date,
  expected_by  date,
  resolved_at  date,
  resolution   text,
  created_at   timestamptz not null default now()
);
```

A blocker has a lifetime of its own, and that lifetime is the data worth having.
`days_blocked = coalesce(resolved_at, current_date) - opened_at`, in a view,
never stored. Closing one freezes the count, reopening continues it from the
original `opened_at`, so a mistaken click cannot erase waiting time. Resolved
blockers stay on the case, muted, with their resolution text. Deleting them would
remove the days from the chart, and then nobody can be shown what the wait cost.

`waiting_on` stays free text, so opening a blocker never waits for somebody to
create a record first. But settle the spelling on write: a name that matches one
already in use apart from case or spacing takes the existing spelling. Free text
split "Project Board" from "project board" into two recipients here, and a split
number argues for less than the truth.

If you later default `expected_by`, use the MEDIAN of the waits that recipient
has already closed, so one application that sat for half a year does not move the
expectation for the next ordinary question. With no closed case, leave it empty:
a date nobody earned fires a warning light on a schedule nobody chose.

---

## 3. The computation layer

All of it lives in views. None of it lives in application code, and none of it
lives in a column.

| View | What it answers |
|---|---|
| `v_node_leaf` | Every node with `is_leaf` and its type |
| `v_node_descendant` | The closure: `root_id`, `node_id`, `depth`, the node itself at depth 0 |
| `v_node_progress` | `leaf_total`, `leaf_done`, `progress_pct`, counting only childless tasks |
| `v_node_state` | `is_blocked`, `open_blockers`, `worst_wait`, `status_effective` |
| `v_next_date` | The first unfinished descendant with a due date, plus `days_until` |
| `v_node_cost` | Money rolled up per node |

The closure is the foundation:

```sql
create view v_node_descendant as
with recursive descendant as (
  select n.id as root_id, n.id as node_id, 0 as depth from node n
  union all
  select d.root_id, c.id, d.depth + 1
  from descendant d join node c on c.parent_id = d.node_id
)
select root_id, node_id, depth from descendant;
```

Progress counts leaves, and only leaves that are tasks. Cancelled ones count
neither way, so killing a task neither flatters the percentage nor punishes it.
An empty container contributes nothing, which is what lets an empty development
read honestly as a to-do rather than as zero percent done.

```sql
create view v_node_progress as
select
  d.root_id as node_id,
  count(*) filter (where l.is_leaf and l.type = 'task' and l.status <> 'cancelled') as leaf_total,
  count(*) filter (where l.is_leaf and l.type = 'task' and l.status = 'done')       as leaf_done,
  case
    when count(*) filter (where l.is_leaf and l.type = 'task' and l.status <> 'cancelled') = 0 then 0
    else cast(round(
      100.0 * count(*) filter (where l.is_leaf and l.type = 'task' and l.status = 'done')
            / count(*) filter (where l.is_leaf and l.type = 'task' and l.status <> 'cancelled')
    ) as int)
  end as progress_pct
from v_node_descendant d
join v_node_leaf l on l.id = d.node_id
group by d.root_id;
```

Blocked-ness counts the node's OWN open blockers, not the subtree's. A project is
not blocked because one task out of twelve is, and a view that says otherwise
turns every large project permanently red.

Every view runs with `security_invoker = on`, so row level security from the
tables carries through. Without it, a view is a hole straight past your access
model, and it will not announce itself.

### Ordering, and the code that is a path rather than an id

`sort_order` in tens. A move renumbers the whole sibling set rather than swapping
two values, which repairs the gaps and duplicates earlier inserts left behind,
and it writes only the rows whose number actually changed.

The work breakdown code, `PR-26-0001.01.03`, is derived from position among
siblings, two digits per level. Reorder, and the code changes. That is the trade:
it always matches what is on screen, and it is therefore a PATH, not an
identifier. The identifier is the project number plus the node itself. If
anything external ever has to cite a node, it cites the id, never the code.

One warning that cost time here. If you later need a second ordering that crosses
parents, for instance a ranked agenda across every project, it cannot reuse
`sort_order`. Siblings are a per-parent set, and that column drives the breakdown
codes: ranking a task first this week must not renumber it in the work breakdown.
Give the second ordering its own column, and let unranked rows stay null and sort
last, which is honest, because nobody has said what order they go in.

### The trap in reading the closure

`v_node_descendant` is the right answer inside SQL, where a view joins against it
and the database does the work in one pass. It is the wrong answer as a separate
round trip from the application. Every page here used to ask which nodes were
underneath, and only THEN issue the queries that filter by the answer, which
turns one wait into two. A project page did it three times, about six tenths of a
second of doing nothing.

The portfolio is a few dozen rows. Fetch it whole, walk it in memory, and run one
batch of parallel queries per page. Tables that grow without bound keep a limit
and get cut in memory.

**The trap when doing this:** dropping a database-side `in (...)` filter without
adding the equivalent filter in application code does not fail. It quietly shows
another project's rows. Every unfiltered read has to be cut against the subtree
set at the point it is bound.

---

## 4. Access

Membership sits on the root and is inherited by the whole subtree. It is the same
cut every roll-up already uses, so there is no second idea of what belongs
together. Two things need care, and both are the difference between working and
not working at all.

**Recursion.** A policy on `node` that reads a table whose own policy reads
`node` calls itself forever. So the membership lookup runs in a `security
definer` function, which is exempt from row level security, and every policy
calls that function rather than querying anything directly. `stable`, so the
planner may call it once per statement rather than once per row, and a fixed
`search_path`, the standard precaution for a definer function: it must not be
steerable by the caller.

```sql
create or replace function can_see_node(nid uuid)
returns boolean language sql security definer stable
set search_path = public, pg_temp as $$
  with recursive up as (
    select id, parent_id from node where id = nid
    union all
    select n.id, n.parent_id from node n join up on n.id = up.parent_id
  )
  select exists (
    select 1 from up
    join project_member m on m.project_id = up.id and m.user_id = auth.uid()
    where up.parent_id is null
  );
$$;
```

Then one policy shape, repeated: `using (can_see_node(node_id))` on every child
table, and on `node` itself `using (can_see_node(id))` with `with check
(parent_id is null or can_see_node(parent_id))`. A brand new root has no members
yet, which is why the check allows it. Anything with a parent must land somewhere
you can already see.

**Locking yourself out.** The moment those policies land, a project with no
members is invisible to everybody including its author. So a trigger enrols the
creator, and the migration backfills every existing user into every existing
project, preserving exactly what was true the moment before it ran.

Two consequences you will hit within the hour:

- `insert().select()` returns the new row THROUGH the select policy, and a new
  root is invisible until the membership trigger has fired. Choose the id in
  application code rather than reading it back. That removes the question instead
  of betting a broken "New project" button on trigger ordering.
- Membership must point at a root. Enforce it with a trigger, because a half
  visible tree is worse than no access: the user sees a subproject with no way to
  understand what it belongs to.

---

## 5. The idea inbox

Every other table demands that you know something. A node needs a type and a
parent, a priced line needs an amount, a decision needs what you turned down.
That is right for work and wrong for an idea. The good ones arrive in a car park
or in bed, and a form that asks which project this is under before it will accept
the sentence is a form nobody opens at eleven at night.

```sql
create type spark_source as enum ('app','quick','assistant');
create type spark_state  as enum ('new','kept','dropped');

create table spark (
  id             uuid primary key default gen_random_uuid(),
  body           text not null check (length(trim(body)) > 0),
  source         spark_source not null default 'app',
  state          spark_state  not null default 'new',
  became_node_id uuid references node(id) on delete set null,
  verdict        text,
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  captured_at    timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
```

**One required field.** Triage is a separate act, done at a desk with the tree in
front of you.

**It is deliberately NOT a node with status `idea`.** That would put every
passing thought in the tree, in the progress counts and in the portfolio, and the
tree would stop being a picture of the actual work. The triage step is the point:
most ideas should die, and a table you delete from without guilt is a table you
keep writing to.

**Three exits, not two.** Kept, dropped, and logged. The third was missing at
first, and its absence was doing real damage: some thoughts are an observation
about work that is ALREADY running, which is not a task. With only two exits it
had to be forced into being one or thrown away, and the second is worse, because
the thought was true. So the third exit writes it as a line in the work log on
the node it concerns. That also turned out to be the only route this application
had from "I thought of something" into the table the whole weekly report is
assembled from.

**Dropped ones are kept, with a `verdict`.** That line is what stops the same
idea arriving again in three months and going round the loop a second time.

**`became_node_id` is `on delete set null`, not cascade.** Deleting the node an
idea became must not erase the record that the thought was had and acted on.

**`source` exists to tell you which capture route is actually used**, and which
one was a nice idea nobody touched. It is cheap, and it has settled arguments.

### Promotion is one act, and it copies rather than points

Creating the node on one page and remembering to tick the idea off on another is
a thing nobody does. So promotion writes, in one action: the node, the membership
if it is a root, a frozen copy of what was claimed, and the closure of the idea.

The frozen copy is the part that looks redundant and is not. Following
`became_node_id` backwards does not work, and the reason is the whole design:
ideas are private to their author. Read the promise through the idea, and the
project shows its origin to exactly one person and shows NOTHING to everybody
else, with nothing on screen to suggest anything is missing.

So `node_origin` copies it at the moment of promotion, and the copy is a
different fact rather than a duplicate. The idea holds what it says now and stays
editable. The origin holds what was claimed on the day it became work, which is
what somebody decided on. The same relationship a priced line has with the
exchange rate that applied when the price landed.

Stamp the yardstick alongside it, whatever yours turns out to be. A figure cannot
be read back honestly without knowing what it was weighed against, and silently
recomputing last year's claim against this year's basis invents a promise nobody
made. Nothing computed goes in that table either: store the raw claim and compute
the rest, so an old promise can be read in this year's money.

One validation belongs here rather than in the form. Check the combinations that
cannot be stored, not the ones that merely look odd: a non-root type with no
parent is refused, and a root type WITH a parent is resolved by dropping the
parent rather than refused. And be careful what you write in the comment above
it. An earlier version of that comment here claimed the form only offered types
that could sit under the chosen parent. It never did, and saying so was worse
than the gap, because the next reader takes the constraint for granted and stops
looking.

### If you port the assessment at all

Two numbers and three scores, and everything else computed. A twelve field
template gets filled in once, badly, because it asks for answers nobody has yet.
Two numbers get filled in every week.

It sits on the IDEA rather than on a node, and that is the point: creating a
project in order to assess something you are about to kill would put every
passing thought in the tree, which is the thing the inbox exists to prevent.

An empty assessment is not zero. It is "not worked out yet", and the two are
different. Say so on screen rather than showing a blank.

If you gate promotion on that assessment, make the gate answerable. Work that
claims to serve a strategy and carries no figure is not serving it, it is hoping
to, and a total that adds up hopes is one nobody can report upwards. But the way
out must be to promote it unmarked and mark it the day the figure exists, never
to argue the figure down into a placeholder.

---

## 6. Build it in this order

Each stage is verifiable on its own. Do not start the next one until the previous
one is green, because a bug in stage two is unfindable through stage five.

1. **`node` plus the closure view.** Create, edit, delete, reorder. Verify: a
   three level tree renders, cascade delete takes the subtree, reordering moves
   the derived codes with it.
2. **Progress and next date.** Verify against a tree you counted by hand,
   including a cancelled leaf and an empty container.
3. **Blockers, and blocked-ness derived from them.** Verify: opening one turns
   the mark on the node and not on its parent, and resolving it turns the mark
   off with no other write.
4. **Access.** Do this BEFORE there is a second user, not after. Verify by
   signing in as somebody who is a member of nothing and confirming they see
   nothing, then by adding them to one root and confirming they see that whole
   tree and no other.
5. **The log, decisions, dependencies, money.** All the same shape: `node_id`,
   cascade, roll up through the closure.
6. **The idea inbox and promotion.** Last, because promotion depends on
   everything above it existing.

---

## 7. How to know it still works

Build an audit that reads the LIVE schema and checks it against the code. It is
the single highest value thing in the original repo and the easiest to skip.

It checks four things, and each of them caught something real:

- Every select the application makes still answers. A renamed column fails here
  rather than on somebody's screen.
- Nothing is readable without a session. Run every read anonymously and require
  it to come back empty.
- Every view agrees with a recomputation from the raw tables. This is what keeps
  "no computed value is stored" honest as the schema moves.
- Every closed set in the database is a real enum, matching the types in the
  application.

It only reads, so it is safe against production, and it belongs beside the build,
the type check and the unit tests as one of the things that must pass before work
is called done.

**Its blind spot, which cost time here:** an audit that reads select lists sees
only the columns the code NAMES. `select('*')` names none, and the fields are
then picked off the result in application code, where the audit cannot see them.
Either ban the wildcard or teach the audit to read the destructuring.

---

## 8. What not to carry across

- **The yardstick and the scoring scale.** One euro per unit sold, a one to five
  cost and benefit scale, a fiscal year volume. All local. Port the mechanism and
  ask the human for the measure.
- **The external reporting fields.** Account strings, portfolios and project
  numbers belong to one company's system. The jsonb column that holds them is the
  portable part.
- **The four type names.** If your work does not divide into development,
  project, subproject and task, use your own words. Keep only the distinction
  that matters, work or container, because that is the one any calculation reads.
- **Anything you cannot say the reason for.** If you find yourself porting a
  field because it was there, drop it. The original's own rule is nine tables,
  and resist the temptation to add more.

---

## 9. One constraint worth knowing about

The original keeps itself movable to SQL Server: nothing database specific beyond
jsonb and recursive common table expressions, no extensions, no array columns. If
that matters to you, the translations are: recursive CTEs are unchanged, jsonb
becomes `nvarchar(max)` with `JSON_VALUE`, and row level security becomes a
security policy over an inline table valued function, which is close to a direct
translation of `can_see_node`. What you lose is `auth.uid()`, so you need a
session context carrying the current user instead.

---

## 10. Before you start, say this back

Tell the human what you understood, in this shape, and get it corrected before
the first migration:

- what the reporting unit is, and what the root of a tree means in their world
- which things are shared and which are private
- whether there is a real measure of worth, or whether the assessment should be
  left out entirely for now
- which of these tables they actually need in the first month

A model ported whole into a project that needed half of it is harder to work in
than one built up in the order above, and the parts nobody asked for are the
parts nobody maintains.
