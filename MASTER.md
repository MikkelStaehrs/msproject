# MASTER.md, Task Studio

A shared workspace for the projects a small team is running, and for the weekly
status each of them has to type into the company project system (SharePoint and
Power Apps).

It started as one person's tool and is no longer one. That changed what has to
be true rather than what it is for: you see the projects you are on and nothing
else, roles name people who may never sign in, and a captured thought stays
private to whoever had it.

## Design thesis

> Nobody fills in a status report. You work, and the report writes itself.

Anything that can be **derived** must be derived. Progress is computed from the
nodes underneath. The next date is the next unfinished node with a date. The
week's status text is assembled from the work log. If the same thing has to be
written in two places, the design is wrong.

The consequence for all UI: **fast entry beats a pretty overview**. If logging a
line takes more than five seconds, the tool is not used past week three. That
holds harder with several people than with one: a habit only you have is one you
can be argued into, and a habit a team has to share has to cost nothing.

## Stack

- Next.js 15, App Router, TypeScript, Server Components by default
- Supabase (Postgres), `@supabase/supabase-js` and `@supabase/ssr`, no ORM on top
- Tailwind CSS v4. No component library, no state library
- Supabase Auth. Visibility is by project membership, inherited down the tree, enforced in RLS

**Migrations are applied by hand** through the Supabase SQL editor, because the
project has only an anon key and a personal access token, not a database
password. `schema_migration` records what has reached the database; every
migration ends by inserting its own version as its last statement. The table
records, it does not run anything: that half is still you, pasting the file.

**Portability requirement:** the data model must be movable to MSSQL later without a
rewrite. So no Postgres specifics beyond `jsonb` and recursive CTEs. No extensions,
no array columns, no enums in business critical fields that change often.

---

## Design language

Editorial typesetting: paper and hairline rules rather than cards and shadows. No
rounded corners, no shadows, no icons beyond what is necessary. Tokens live in
`app/globals.css`, the shared pieces in `components/ui.tsx`.

| Token | Value | Used for |
|---|---|---|
| `paper` | `#F8F8F6` | The page ground |
| `sheet` | `#FFFFFF` | Forms and report fields |
| `ink` | `#1A1F1B` | Text, the heavy rule under the header |
| `muted` | `#6B6B65` | Labels and secondary text |
| `rule` | `#DCDCD7` | Column dividers and rows |
| `rule-strong` | `#B4B4AD` | Section breaks |
| `green` | `#1E4A34` | Actions, progress, status «active» |
| `oxblood` | `#8A3520` | Overdue time and blockers only |
| `empty` | `#E6E6E1` | Unfilled progress |

Bodoni Moda for display and for numbers meant to be read. Archivo for everything
else. Both through `next/font/google`, so there is no network call at runtime.

**The mark and the word are one signal.** A status is a 7 px square plus a word,
never colour alone, and the two must always say the same thing. So the word is
the **effective** state: a node with an open blocker reads «Blocked» with its
day count, in oxblood, whatever is stored underneath. The status list sits on
top of that word, transparent, and still edits the decision; open it and you see
which status is really stored. An earlier version showed the stored status
beside the derived mark, and a blocked node said «Blocked» in colour and
«Active» in words at the same time.

**Progress is drawn as cells, not as a bar.** One cell per task in the subtree.
Above 24 tasks it falls back to a single bar, because thinner cells would be
narrower than a rule.

Tooltips are pure CSS: the label gets a dotted underline and carries the
explanation itself. No question marks, no icons, no tab stop.

---

## Data model

Nine tables. `node`, `blocker`, `decision`, `entry` and `report` were the original
five; `template`, `node_dependency`, `document` and `cost` were added deliberately
and are justified below. Resist the temptation to add more. The schema lives in
`supabase/migrations/`.

### `node`, the recursive hierarchy

One table covers development, project, subproject and task. `parent_id` points at
the table itself, so depth is unbounded and a CAPEX project can be the parent of
three IT subprojects without the model knowing the difference.

```sql
create type node_type   as enum ('development','project','subproject','task');
create type node_status as enum ('idea','planned','active','paused','done','cancelled');
create type node_category as enum ('capex','production','it','other');

create table node (
  id            uuid primary key default gen_random_uuid(),
  parent_id     uuid references node(id) on delete cascade,
  type          node_type   not null,
  title         text        not null,
  description   text,
  category      node_category,
  status        node_status not null default 'planned',
  owner         text,                    -- external owner or stakeholder, not the user
  start_date    date,
  due_date      date,
  completed_at  timestamptz,
  is_milestone  boolean not null default false,
  sort_order    int not null default 0,
  estimate_low_days  int,                    -- the guess, before the work
  estimate_high_days int,
  reporting     jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
```

**The estimate is captured, not yet used.** A range in calendar days, because
that is how a guess is actually held: three to five, not four. Days rather than
hours on purpose, since hours would need a second habit and the one thing this
app cannot afford is another discipline that lapses in a busy week. Elapsed days
are already derivable from the first log entry and `completed_at`, so only the
guess has to be recorded. Nothing reads these fields today. In half a year they
answer «you run 2.3 times over your own estimate on integration work», which is
a claim you can only make if you started keeping them before you needed them.

`reporting` holds the fields the company system requires that **cannot** be
derived: project number, account string, portfolio and so on. See the reporting
layer below.

`updated_at` is maintained by the trigger `node_set_updated_at`.

**The type decides container or work.** `project` exists only at top level and is
the unit reported to the company. `development` and `subproject` are containers:
they carry a summary in the tree, can be opened, can hold their own roles, and do
**not** count as work. `task` is the work, and only tasks count towards progress.

**The picker says what it means.** `TYPE_LABEL` is ordered top down rather than
alphabetically, and `TYPE_HINT` carries one line per type, used by both the form
and the guide. Four bare words in alphabetical order ask you to know the answer
before you read the question, and a type explained in two places eventually gets
explained two different ways.

**Development and subproject are identical to the machine.** Only task and
not-task changes any calculation. The distinction is a convention, kept because
it makes a tree readable to someone who was not in the room, and stated so it
does not live in one person's head:

- **Subproject divides.** It exists because the project is too big for one list.
  What hangs under it is usually more containers.
- **Development builds.** It exists because a specific thing has to be made, and
  it breaks into the tasks that make it. What hangs under it is tasks.

The consequence that earns the distinction: a development is where the same
tasks keep repeating, which is exactly where a template pays for itself. And a
development that stays empty is a to-do, which is why the frame counts parts not
broken down.

**`blocked` is not a status.** It left the enum on 2 September 2026. A status
you can forget to set is not a measurement: the mark said blocked only if you
remembered the dropdown, and kept saying so after the blocker was resolved. A
node is blocked exactly when it carries an open blocker, computed in
`v_node_state` and never stored. What is left in `node_status` is only what you
decide. Note that `paused` is the one that means on hold, and it is a decision,
not a wait, which is why `blocked` could not simply fold into it.

**`is_milestone` is a reading aid, not a mechanism.** It draws a diamond instead of
a square, gathers the node into the milestone list on Identity and in the Brief,
and breaks a tie in `v_next_date` when two nodes share a due date. Nothing else.

### `blocker`, a first class entity rather than a status

The most important design choice in the model. A blocker is not a flag on the
project. It has a lifetime of its own, and that lifetime is data worth measuring.

```sql
create table blocker (
  id              uuid primary key default gen_random_uuid(),
  node_id         uuid not null references node(id) on delete cascade,
  title           text not null,
  waiting_on      text not null,          -- "IT", "Vendor", "Management", "Maintenance"
  waiting_on_type waiting_on_type not null default 'other',
  opened_at       date not null default current_date,
  expected_by     date,
  resolved_at     date,
  resolution      text,
  created_at      timestamptz not null default now()
);
```

**The recipient is settled, not stored in a table.** `waiting_on` stays free
text, so opening a blocker never waits for anyone to create a record first. But
the spelling is settled on write: a name that matches one already in use apart
from case or spacing takes the existing spelling. Free text was splitting
«Project Board» from «project board» into two recipients, and the chart on
/blockers is the whole reason the blocker is an entity at all. A split number
argues for less than the truth. The recipients are offered in both places. The blocker
form carries a datalist; quick entry shows them the moment a line starts with
«!», filtered by whatever follows the last @, and clicking one rewrites that
part of the line rather than opening a mode of its own, so Enter still saves and
Tab still changes the target. The preview also says when a name has never been
used before, which is the moment a typo is still free to fix.

**The type belongs to the recipient, not the blocker.** `waiting_on_type` is
stored per row, but the chart on /blockers groups by the type the **recipient**
is known by: whichever non-«other» type has been chosen most often for them,
falling back to the keyword guess. The guess only ever recognised IT, management
and vendors, so every governance body landed in «other» and that chart showed a
single bar. Correcting the type on one blocker now moves all of that recipient's
days, the closed ones included.

**The expected reply is measured, not declared.** `expected_by` defaults to the
**median** of the waits that recipient has already closed. The median, so one
investment application that sat for half a year does not move the expectation
for the next ordinary question. With no closed case there is no date, because
Off Track has to mean something and a date nobody earned would fire the light on
a schedule no one chose. Before this, a blocker opened with `Ctrl+K` carried no
date at all, so the Progress rule could never take it past At Risk however long
it sat.

`days_blocked = coalesce(resolved_at, current_date) - opened_at`. Computed in a
view, never stored. Closing a blocker freezes the count; reopening continues it
from the original `opened_at`, so a mistaken click cannot erase waiting time.

Opening a blocker is what makes a node read as blocked, on the mark in the tree,
on the map and in the brief. Nothing is written to `node`: `v_node_state` works
it out, so the two can never drift apart.

A resolved blocker stays on the case, muted, with its resolution text. Deleting it
would remove the days from the graph, and then nobody can be shown what the wait
actually cost.

### `decision`, the decision log

```sql
create table decision (
  id           uuid primary key default gen_random_uuid(),
  node_id      uuid not null references node(id) on delete cascade,
  decided_on   date not null default current_date,
  decision     text not null,
  rationale    text,
  alternatives text,                    -- what was rejected, and why
  topic        decision_topic not null default 'other',  -- see Basis
  created_at   timestamptz not null default now()
);
```

`alternatives` is not a footnote. It is the half you are missing when someone asks
in six months why the more expensive option was chosen.

### `entry`, the work log and the raw material of the weekly report

```sql
create table entry (
  id          uuid primary key default gen_random_uuid(),
  node_id     uuid not null references node(id) on delete cascade,
  entry_date  date not null default current_date,
  kind        entry_kind not null default 'work',
  body        text not null,
  created_at  timestamptz not null default now()
);
```

An entry belongs to the node the work happened on, not to the project. The weekly
report gathers everything in the project's branch, so a line four levels down still
reaches Friday. But opening a part shows only its own entries, and that is what
makes "what is going on in the different parts" answerable.

### `report`, a saved weekly report

```sql
create table report (
  id            uuid primary key default gen_random_uuid(),
  node_id       uuid not null references node(id) on delete cascade,
  period_start  date not null,
  period_end    date not null,
  fields        jsonb not null default '{}'::jsonb,  -- field by field, ready to copy
  context       jsonb not null default '{}'::jsonb,  -- the figures behind them
  body_markdown text,
  submitted     boolean not null default false,
  generated_at  timestamptz not null default now(),
  unique (node_id, period_start)
);
```

`context` also carries the money as it stood that week: priced, committed, how
much had paper behind it, and the running cost. Left out of the first version,
which was the same mistake as leaving out progress. `v_node_cost` answers for
today, and «you said 612 000 in week 34 and it is 810 000 now» cannot be
reconstructed once the lines have moved.

`context` is the half that cannot be recomputed. `fields` says what was
reported; `context` says what the project looked like while it was reported:
progress, which node was next and when it was due, who was being waited on and
for how long. `v_next_date` and `v_node_progress` answer for today, and the tree
they read has moved on, so a project that quietly slips looks identical week to
week in the archive unless this is written down at the time. Shape and rules in
`ReportSnapshot`.

Reports are stored so the user can see what he reported in week 12 and what has
moved since. It is also what makes "since last time" possible to bound precisely.
The archive lives on the project page.

### `template`, a skeleton for a project tree

```sql
create table template (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  category    node_category,
  body        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
```

`body` holds a whole tree as jsonb, not as rows. A template is never queried
against; it is read whole and deployed whole. Had it lived in `node` behind a flag,
every view would have had to filter templates out for the rest of time.

Due dates are stored as **`offset_days` from the project start**, not as dates, so
the tree can be laid down anywhere in the calendar. Blockers become `risks` with
`expected_days` on the same principle, and `body.folders` carries the document
skeleton.

Templates are **derived from something that exists**, and captured from any
container, not only a top level project. `deriveTemplate` always took a plain
root id; it was the form that insisted on a project, which meant the four tasks
written under every development container could not be captured at all.

**Deployed either as a new project or under an existing node.** With a parent
the tree simply hangs underneath and none of the project furniture applies: no
number is burned, no account string, no folders. Without one it makes a project
as before. The nodes land after whatever is already there, so adding to a tree
never reorders it.

There is no form for writing a tree from scratch, because that would be a worse
version of the project page.

### `cost`, priced line items

```sql
create type cost_state as enum ('estimate','quoted','ordered','invoiced');

create table cost (
  id          uuid primary key default gen_random_uuid(),
  node_id     uuid not null references node(id) on delete cascade,
  description text not null,
  amount      numeric(14,2) not null check (amount >= 0),   -- the price of ONE
  quantity    numeric(12,3) not null default 1 check (quantity > 0),
  kind        cost_kind not null default 'other',   -- also a part. See Basis
  state       cost_state not null default 'estimate',
  vendor      text,
  reference   text,                       -- quote number, PO, invoice number
  dated       date not null default current_date,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
```

**A line can carry its own paper.** `document_id` points at the quote, order
confirmation or invoice the figure rests on. `reference` holds the number you
would type into a finance system; this holds the document itself, because the
one question anybody asks about a cost line is where the figure comes from. The
form takes either a file to put away now, landed in «03 Quotes and pricing», or
one already in the project: a quote that has to be uploaded on another page
first and picked here second is a quote that does not get attached. On delete
set null, never cascade, because losing the paper must not lose the money. A
line past «estimate» with nothing attached is marked «no paper».

`reporting.economics.cost` is what was **planned**, typed once and ageing from
that day. This is what the project is **actually adding up to**, collected the
way a project is actually priced: a sensor, a cabinet, an electrician, each on
the part of the tree it belongs to.

The interesting figure is neither. It is `planned - priced`: how much of the
budget has not been priced yet, and therefore how much is still capable of
surprising you. The single figure could never answer that.

**CAPEX or OPEX is a second, independent cut.** Recurrence asks how often the
money falls due; capitalisation asks whether it creates an asset you will use
for years. They do not line up: a consultant day is one-off OPEX, installation
labour is one-off CAPEX, a licence paid up front can be either. So every line
carries both, and `v_node_cost` reports four buckets.

The default is the ordinary case rather than a blank, `capex` for a one-off and
`opex` for anything recurring: getting it wrong is one click, and a field nobody
fills in is worse than a field that starts on the common answer.

Payback now takes only `opex_annual_priced` off the yearly benefit. A
capitalised recurring line is not eating the saving.

**A one-off and a running cost are not the same kind of number.** Buying a
sensor for 4 200 and paying 800 a month for a licence are both costs, and adding
them produces a figure that means nothing: an amount plus a rate. So a line says
how often it falls due, `once`, `monthly`, `quarterly` or `yearly`, and
`v_node_cost` keeps the two apart for good. Recurring lines are normalised to a
year. Nothing anywhere adds them together, the group totals on the cost page
included.

Three things follow, and each was wrong before:

- **The grant is compared against committed one-off money only.** An investment
  board approves a purchase, not next year's operating budget, and charging a
  licence to the grant would invent a breach.
- **Payback takes the running cost off the saving.** `investment / (benefit -
  annual running)`. The old `paybackYears` was `cost / benefit`, which quietly
  assumed the thing costs nothing to keep; where the running cost eats the
  benefit there is no payback at all, and null now says so. The old function is
  deleted rather than left to be reached for.
- **«Priced» splits in two.** What it costs to build and what it costs to keep
  go to different places in a business case.

**Four states, because certainty is what makes a number mean something
different.** An estimate is a belief, a quote is a supplier's promise, an order
is money spoken for, an invoice is money gone. `committed` is ordered plus
invoiced: the part you can no longer change your mind about. Only committed
money is compared against the grant, because reporting a quote you have not
accepted as a breach would be crying wolf.

**Written in the currency of the quote, reported in euro. Always.** A line
carries `currency` and `eur_rate`, and `v_node_cost` is the one place the
conversion happens. Everything rolled up, compared or reported is euro, and
`economics` no longer offers a choice. A form that takes whatever number is in
front of you and never says which currency it is will end up holding two
figures that describe the same saving and disagree by a factor of seven. The
figure that goes upwards has to be one currency.

**The rate lives on the line, not on the project.** A rate on the project would
be one number that silently rewrites every past total the day it moves, so a
report from week 34 would stop matching what it said in week 34. Captured per
line, the conversion is a fact from the day the price landed. The project
carries a default so the field fills itself in; changing it never touches a line
already written. A euro line carries a rate of 1 rather than being special
cased, so the sum in the view stays one expression.

**Amounts are whole currency units**, not thousands. A 4 200 kroner sensor
written as `4.2` is how a line item stops being worth entering, and the line
items are now where the real number comes from. `CURRENCIES` changed from
`tDKK`/`tEUR` to `DKK`/`EUR` the same day, while both projects still had empty
economics and the change was free.

### `node_dependency`, an edge between sibling projects

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

The tree says that something sits **under** something else. It cannot say that the
data platform must be finished **before** the scanner can deliver data. Direction
reads: `node_id` waits on `depends_on_id`.

Only one link in each direction is displayed, so a chain that closes on itself does
no harm; it would simply show both ways. Hence only the two guards that can do
damage: no node waits on itself, and the same edge cannot be recorded twice.

Offered on **any** node, from the Sequence section in the project frame. A task
in one subproject can wait on a task in another, which is the case it was built
for and the case the old project only UI could not express.

### `document`, files attached to a node

```sql
create table document (
  id         uuid primary key default gen_random_uuid(),
  node_id    uuid not null references node(id) on delete cascade,
  name       text not null,
  path       text not null unique,
  mime_type  text,
  size_bytes bigint,
  folder     text,
  created_at timestamptz not null default now()
);
```

The files themselves live in Supabase Storage in the bucket `documents`, which is
**private**. There is no public address: `/api/document/[id]` checks the session and
issues a signed URL that expires after 60 seconds. Limit 25 MB per file.

`folder` is a label, not an entity. The numbering is part of the name
(`03 Quotes and pricing`), so folders sort themselves. A template's `body.folders`
carries the skeleton, and on deployment it is written to the project's
`reporting.folders`, so the panel knows the folders before the first file exists.

Storage files do **not** follow `on delete cascade`. `deleteNode` clears them
explicitly through `purgeDocumentsForSubtree` before the node is removed.

⚠️ **Note the risk.** The company system has a Files tab of its own. If quotes and
investment applications also live here, there are two places to look, and the
documents sit outside the company systems on an account that belongs to the user.
Built on an explicit decision, with that objection recorded.

---

## Views

All computation lives here, not in TypeScript.

| View | Contents |
|---|---|
| `v_node_leaf` | Every node with `is_leaf`, a node without children, plus its type |
| `v_node_descendant` | Closure: `root_id`, `node_id`, `depth`. Includes the node itself at `depth = 0` |
| `v_node_progress` | `leaf_total`, `leaf_done`, `progress_pct`. Counts **only tasks without children**. A container is not work, so an empty subproject does not count. Cancelled ones count neither way |
| `v_active_blocker` | Unresolved blockers with `days_blocked` and `overdue` |
| `v_blocker_days` | Every blocker with `days_blocked` and `is_active`. The basis for `/blockers` |
| `v_next_date` | The first unfinished descendant with a `due_date`, plus `days_until`. It ignores `is_milestone`, which is why the field is called "next date" and not "next milestone" |
| `v_node_ready` | Sequence: `waiting_on_count`, every unfinished predecessor on the node **and on every ancestor**, so the rule inherits downwards without being recorded twice; `overdue_count`, the subset past its own due date; `is_ready`. Cancelled counts as settled, and a predecessor with no date can never be late |
| `v_node_cost` | Cost rolled up per node, cut two independent ways. `once_*` against `annual_*` separates an amount from a rate, with `once_with_paper` counting how much has a document behind it. `capex_*` against `opex_*` separates what is capitalised from what is expensed. Neither cut answers the other question. The same shape as progress: every node answers for its subtree |
| `v_node_state` | Blocked-ness, derived: `is_blocked`, `open_blockers`, `worst_wait` and `status_effective`. It counts the node's **own** open blockers, not the subtree's, because a project is not blocked when one task out of twelve is. Everything that draws a status mark reads this |

Every view runs with `security_invoker = on`, so RLS from the tables carries through.

---

## The reporting layer

The company system has **two** documents, not one, and they have to be treated
differently.

**1. PID, Project Initiation Document.** Filled in once at the start, eleven
fields. Mapped as of 1 September 2026; the shapes below are what this tool has
to be able to produce, not a copy of anyone's template:

| Field | Character | Where it belongs with us |
|---|---|---|
| *(added here)* | **Goal**, what the project must achieve, and how you can tell whether it worked | `reporting.pid.goal` |
| A summary of current situation | Narrative | `reporting.pid` |
| Problem or opportunity | Narrative, overlaps the above | `reporting.pid` |
| Corrective action | Narrative, really "the chosen solution" | `reporting.pid` |
| InScope | Narrative | `reporting.pid` |
| OutOfScope | Narrative | `reporting.pid` |
| Risks | A standing risk, not a blocker that has happened | `reporting.pid` |
| Alternatives | What was rejected, with reasons | `decision.alternatives` |
| Milestones | Dated nodes | `node.is_milestone` |
| Dependencies | Who we depend on | `node.owner`, materialises as `blocker.waiting_on` |
| Benefit Quantification | One amount | `reporting.economics.benefit` |
| Cost Summary | One amount | `reporting.economics.cost` |

The written half of the PID is entered on `/p/[id]/identitet` and lives in
`node.reporting.pid`. Roles live in `reporting.people`, amounts in
`reporting.economics` with an **explicit unit**, because a unit left implicit is
the one field that quietly turns a saving into a different saving. The field lists live in `lib/identity.ts` and nowhere else.

**Approval** (`reporting.approval`) is the gate that separates an idea from a funded
project: state, date, granted amount and who decided. Without it you cannot tell
whether `economics.cost` is an estimate or a grant, and the difference between the
two is derived and shown, because an estimate running past its grant should be
caught in time.

**Location** (`reporting.location`) is hall, line or plant. It decides who is
affected and which shutdown window is needed. Available on any node, because a
hardware part often sits somewhere other than the rest of the project.

**Account string** (`reporting.account`) is the coding in the finance system. The
field feeds no calculation; it is a lookup, so the coding can be found without
ringing finance. The assumption as of 2 September 2026 is that it relates to the
CAPEX and OPEX split, which is not confirmed. It belongs in the economics section
once that is built, not under identification.

Payback is derived from the two amounts. The company form never asks for it, but it
is the number a management team works out in its head anyway.

**2. Status Update.** The weekly submission, and what `/friday` has to hit. Four
fields, no more and no less. Known as of 1 September 2026:

| Field | Type | With us |
|---|---|---|
| Status | 5 choices | Derived from `node.status` |
| Stage | 4 choices | `reporting.stage`, the only field that needs a human |
| Progress | 3 choices | Derived from `v_next_date` and `v_active_blocker` |
| Status comment | Free text, required | Derived from `entry` since the previous report's `period_end` |

**Status mapping.** Their five cover our six.

| `node.status` | Status Update |
|---|---|
| `idea`, `planned` | Not started |
| `active` | Active |
| `done` | Completed |
| `paused` | On hold |
| `cancelled` | Cancelled |

Blocked-ness never reaches this field. It was already collapsing to Active
before it was derived, and it belongs in Progress, which is the field that asks
whether anything is in the way.

**The Progress rule.** The order is binding, first match wins:

1. **Off Track**, the next date is overdue, or an open blocker has passed its `expected_by`
2. **At Risk**, at least one open blocker exists, or the next date falls within 7 days
3. **On Track**, otherwise

**Stage** is a stored choice for now. Once templates exist and a project tree has
named phases, it could be derived from which phase the next unfinished node sits in.
Not before.

**The recipient list** in Status Update knows four roles: creator, project manager,
project owner, process owner. We send no mail, no integrations in v1, but the roles
sit in `reporting.people` so they are at hand when the report is written.

The mapping is one configuration object, so the list can be replaced without
touching the UI:

```ts
export const REPORTING_FIELDS = [
  { key: 'status',   label: 'Status',         source: 'derived:status' },
  { key: 'stage',    label: 'Stage',          source: 'reporting.stage' },
  { key: 'progress', label: 'Progress',       source: 'derived:progress_signal' },
  { key: 'comment',  label: 'Status comment', source: 'derived:entries_since_last' },
] as const
```

`source` is either `derived:<computation>` or a key in `node.reporting`. Anything
`derived` must never be editable directly in the UI.

Note that `progress_pct` is **not** a field in Status Update. The percentage lives
only in our own UI. The company system asks for a traffic light, not a number.

---

## Quick entry

Global. `Ctrl+K` or `Cmd+K` anywhere in the app, plus the «New entry» button in the
context band and a `log` link on every row in the tree. One field, Enter saves, Esc
closes.

| You type | What happens |
|---|---|
| `Chased IT again` | Log entry on the target, with the chosen kind |
| `+ Write test protocol` | New task under the target, status `planned` |
| `! Waiting for VLAN @ IT` | Blocker on the target, `waiting_on = IT` |
| `? Chose 130 kV // heavier seed needs it` | Decision on the target, the rationale after `//` is optional |

The prefix counts only at the start of the line, so `Load cells 4+2 mounted` is an
ordinary log entry. In blockers the **last** `@` is read, so an email address in the
title survives.

`Ctrl+1..4` switches the kind of a **log entry**: Work, Note, Meeting, Risk. They are not the four things quick entry can write, and the row says so: it is labelled «Log entry» and goes quiet, shortcuts included, the moment a prefix makes something else. `Tab` opens the target picker,
where the whole path is searched: `data serv` finds
*Data platform › Server access and VLAN*.

**The target is guessed**, so the common case costs no choices. In order: the part
you have opened with `?focus=`, the project page you are on, the node you last wrote
on (`localStorage`), then the first project.

The parser in `lib/quick-add.ts` is a pure function used by **both** the overlay's
preview and the server action. The client sends raw text and the server parses it
itself, so the overlay can never promise one thing and write another.

---

## Pages

| Route | Purpose |
|---|---|
| `/login` | Sign in, and ask for a reset. Everything else sits behind it |
| `/` | Overview: loose ends, running projects, open blockers with day counts, next steps |
| `/projects` | The whole portfolio, closed ones included, grouped by the state each project is actually in. Carries a **Committed** column: ordered and invoiced money, with the yearly running cost beneath it, because that is what a portfolio is actually on the hook for. Blocked first, then active, on hold, planned, idea, completed, cancelled. Empty groups do not appear, and the status is in the group heading rather than repeated on every row |
| `/p/[id]` | Project page, the tree. Sub pages share a frame |
| `/p/[id]/identitet` | All master data: identification, framing, people, economics, PID basis |
| `/p/[id]/cost` | The money, one line at a time. **Follows `?focus=`** like the tree, and the sub navigation carries the focus into it, so pressing Cost while standing on a part keeps you in that part rather than dropping you on the project. The «On» picker is then the part and below, and a new line defaults to it; the first version defaulted everything to the project and showed only the project's total, which is the shape that pushes every cost to the top. «Where it sits» breaks the roll-up down per direct part. Approved and planned are shown only at project level, because a part has no grant of its own and comparing its lines against the project's budget would invent an overrun nobody claimed |
| `/p/[id]/dokumenter` | Files in numbered folders |
| `/p/[id]/rapporter` | Archive of saved weekly reports |
| `/p/[id]/brief` | The brief: the identity laid out to be read by someone who was not in the room. Carries the money in full, priced against planned, how much has a document behind it, the yearly running cost and the payback after it, because «paid back in 3.5 years» without saying what it costs is half an answer. Read only, and an actual A4 page: 794 px wide at 96 dpi with the same 14 mm margin the printer gets, so the screen and the paper are the same shape |
| `/p/[id]/meeting` | The working surface for a meeting. You bring up a project or a part and walk its pieces one at a time: the list stays on the left, the piece under discussion fills the right, with its description, status, dates, estimate, blockers, decisions, log and cost lines. The tree is the wrong shape for this, being built to show a hundred rows at once, which is what nobody can read together. Status changes inline, blockers and decisions open without leaving the screen, and `Ctrl+K` writes on whatever is selected: a meeting is when those surface, and a record is worth nothing if capturing it costs you the room. Navigation is the tree, not a flat list: a breadcrumb climbs, «Go into it» descends, and a piece can be edited or added in place with the same form the tree uses. Two things were wrong first time round: it was a presentation rather than a workspace, and the subject picker was every container in the project dumped in a row, unordered and saying nothing about what holds what |
| `/p/[id]/map` | The project map: the tree drawn as a diagram, landscape and printable. Hierarchy as elbows in grey, sequence as dashed oxblood arrows leaving the boxes sideways, so «under» and «before» cannot be confused. `?depth=` stops the drawing at a level and marks each cut branch with how much it holds, because five levels of tasks on one sheet is a wall rather than an explanation; cutting is not hiding. `?zoom=` scales the finished drawing rather than laying it out again, so the connectors keep meeting the box centres, and «Fit» means fits on one printed sheet. A dependency pointing outside the project has no box to reach, so the box carries «waits N» instead |
| `/friday` | Weekly report: the four fields per running project, each with a copy button, plus the basis and the previous report |
| `/blockers` | Every blocker, waiting days per `waiting_on`, a lifetime chart and key figures |
| `/templates` | Template library: derive from a project, deploy on a new start date |
| `/spark` | Where a thought lands before it is work. One field to capture, three lists to triage: inbox, became work, decided against. Promoting one creates the node and closes the spark in a single step, because creating it on one page and remembering to tick the spark off on another is a thing nobody does |
| `/strategy` | What the work is for, across the projects. The only page that cuts the tree sideways. Each strategy shows what the marked work promises a year, how much of that is delivered, what has been invested to get it, and what is still to find. `/strategy/<id>` lists the parts behind the figure, because a number without them is one somebody has to take on trust |
| `/guide` | How to use the tool. Twenty four sections under five headings: getting around, what a node says, what it rests on, working in it, showing it to someone. It reads the labels and hints out of `lib/types.ts`, so a picker and the guide cannot come to disagree. It lives in the app rather than beside this file because a guide you have to leave the app to open is a guide you never open. MASTER says why the app is built this way; the guide says what to do |

**The project frame.** `(shell)/layout.tsx` holds **only** the context band. The
title block, the sub navigation and the right column live in
`components/project-frame.tsx`, which the **pages** render. A layout in Next cannot
read search params and therefore cannot know which part of the tree is open.

The right column is the pulse: work log, blockers, decisions. It stands on every sub
page, because that is what has to be visible without looking for it. Anything
heavier to read or edit gets its own sub page. `map` and `brief` sit outside the
frame, because they have to print clean.

**Every row can be opened.** `open` sits in the actions on each row and focuses
that node, whatever its type. It used to live in the summary line, which only
containers render, so a plain task could not be focused at all and its work log,
blockers, decisions and Sequence were unreachable except by typing the URL.

**A dependency is not a problem. Being late is.** Work that comes after other
work is a plan, and a tool that colours it red teaches you to ignore the colour.
So the relation is one thing and its state is derived, three ways:

| | When | How it reads |
|---|---|---|
| Ready | No unfinished predecessor | Nothing |
| Waiting | Predecessors open, none late | `waits on 2`, muted; a grey dashed arrow on the map |
| Held up | A predecessor is past its own due date | `held up by 1`, oxblood; the arrow turns oxblood |

**And sequence is still not a blocker.** A blocker names a party outside your
control and measures the wait so it can be argued with. Both ends of a
dependency are your own work: if your own predecessor is late, that is your
project's problem, not IT's. Feeding it into /blockers would inflate the one
number that page exists to produce. A node can be held up and blocked, or either
alone, and all of those say something different.

The frame carries the Sequence section in both directions, what must finish
first and what this holds up, marking any predecessor that is late.

**Not broken down is not the same as not done.** A container with no task
anywhere underneath it holds no work, contributes nothing to the percentage, and
is otherwise invisible: «nothing has been broken down» and «nothing has been
done» both read as 0 %, and only one of them is something you can act on today.
The frame counts them under the progress row, `3 parts not broken down`. Derived
from `v_node_progress.leaf_total`, so no new view was needed.

**A part reads as a block.** A direct child of what is on screen opens with
32 px of air, then a heavier rule, then a title one step up in weight.
Everything below it is a hairline row. The air sits **above** the rule, so the
break belongs to the part it opens rather than to the block it closes. Without
this two subprojects and their children ran together into one flat list, with a
24 px indent as the only cue.

**One row per node, once.** The tree page used to carry a «Parts» summary block
above the tree, repeating the direct children with their figures. The tree rows
already carry the same summary, so a project with one part listed it twice, side
by side, with the same numbers. The block is gone; the row is the only place a
node appears.

**Order.** `sort_order` drives both the display and the WBS codes. ▲▼ on each row
moves a node one place among its siblings. The whole sibling set is renumbered in
tens on every move, which also repairs duplicates and gaps left by earlier inserts.
Only the rows whose number actually changed are written.

**Branches fold.** A container carries a triangle, and its open state travels in
the query as `?open=` with eight hex characters per node, short enough to keep
the address readable and unique enough that a clash inside one project is not a
real risk. It lives in the URL rather than on the client so the tree stays
server rendered, and so a link to a half open tree opens the same way for the
next person. With no parameter the direct parts are open and everything below is
closed, which is the reading you want on arrival. «Expand all» and «Collapse
all» sit beside «New node».

**A closed branch summarises, an open one does not.** The summary line, node
count, next date, days blocked, last entry, exists to say what is inside without
opening it. Once the children are on screen they say the same thing better, and
showing both put the identical figures on the page twice.

**The code is a column.** Every row carries its path relative to the project,
`.01`, `.01.02`, `.02.01`, in a fixed column of its own, so the segments step
right exactly as the tree does and the depth can be read straight down the page.
The project number is not repeated on each row: it is in the context band and
above the tree already. It used to live in the summary line, which only
containers render, so a task showed no code at all.

**The frame carries the path.** Above the title sits the whole chain from the
project down to what you are looking at, every ancestor a link that focuses it.
It named only the project before, so a node two levels down read «Part of
Digitalization of the Production Lines» when its real parent was «Production
Line: Cleaning». That was wrong, and it also left no way back up one step: the
only thing named was the only thing you could click, and it took you all the way
out.

**Focus.** `?focus=<nodeId>` on the tree page shows one branch, and the frame then
describes that part: its progress, timeline, roles, work log, blockers and
decisions. `?scope=project` switches the frame back to the project's figures without
leaving the part. The WBS codes (`PR-26-0001.01.03`) are derived from `sort_order`
and are a path, not an identifier.

**Project numbers** are assigned by the system: two letters for the category, two
digits for the year, a four digit serial. Frozen once given, because an identifier
that moves is not an identifier. Assigned on creation, or the first time a project
gets a category.

### `/friday`, the whole reason the product exists

One button. Per running project the four fields Status Update asks for are
generated:

- **Status**, from `node.status` through the mapping above
- **Stage**, the stored choice in `reporting.stage`, the only field the user touches
- **Progress**, the traffic light, by the Progress rule above
- **Status comment**, `entry` lines since the previous report's `period_end`,
  assembled into continuous text, with active blockers and their day counts phrased in

Each field is shown **separately with its own copy button**, in the same order as
the fields in the company Power App. Progress percentage and next date are shown as
**context** beside them, so the text can be checked. They are not typed anywhere.

Nothing is submitted anywhere from here yet: the text is copied out and pasted
in by hand. The point was never to automate the submission, it was to stop
having to phrase the thing from scratch every Friday, and that half is done.
Pushing it into UBS Projects is a decided direction rather than a refusal now;
see "One project identity, and it is not ours".

**One sentence per recipient, worst wait first.** The first real report read
«Waiting on Project Board: ..., 1 days. Waiting on Project Board: ..., 0 days.»
Two sentences naming the same party read as two problems when it is one
relationship with two things in it. The day count quoted is the longest of them,
because that is the wait you would say out loud.

Three bugs surfaced the first time this ran against real data that 188 unit
tests had not: «1 days» instead of «1 day», the same recipient twice, and
`lowerFirst` turning «VLAN» into «vLAN». Tidy test fixtures never had a count of
one, a repeated party, or an acronym.

The text is **assembled, not rewritten**. There is no language model in the app. The
quality of Friday's text is the quality of the log entries.

Once generated, the report is stored in `report` and marked `submitted` with one
click.

### Loose ends, the defence against yourself

The whole tool rests on one habit, and the habit is what lapses in a busy week.
So rather than remembering to log, you are shown what already happened and asked
for a line about it: something finished, a blocker opened, an answer that came
back, live work nobody has mentioned in a fortnight.

**Nothing is stored.** A loose end is a state change with no entry within two
days of it, computed in `lib/loose-ends.ts`. Write the line and it stops being
one. There is no queue to drain, no dismissal to manage and nothing to keep in
sync, for the same reason blocked and readiness are derived rather than kept.

Two days, not the same day, because you finish something on Thursday and write
about it on Friday and that is still writing about it. Silence is only reported
on **tasks** that are active and dated: the first run against real data asked for
a line on «Spectral Analysis» and «Production Line: Cleaning», and you log on the
work, not on the box. It also yields to anything more specific:
«you opened a blocker here» and «nothing has ever been logged here» are the same
fact twice.

**Its limitation is the honest half.** It only sees what happened inside the
app. A week where you never opened it leaves no trace, and the answer to that is
a real signal source, a calendar or a repository, which needs its own
authentication and is a separate piece of work.

### `/blockers`, the unintended benefit

A chart of cumulative waiting days grouped by `waiting_on`. It turns a frustration
into a measurement, and the measurement is directly usable in conversations with IT
and management. Prioritise it. It matters more than it looks.

---

## Build stages

Build **one stage at a time**. Stop after each and wait for acceptance before the
next. No anticipating later stages.

1. **Foundation** ✅ Next.js project, Supabase client, Tailwind, migration with all
   tables and views, seed with three realistic projects and a few blockers
2. **Node CRUD** ✅ tree view, create, edit and move nodes, drag free (a parent
   picker to move between parents, ▲▼ for order among siblings), status changes.
   Progress is shown but cannot be edited
3. **Quick entry** ✅ global quick add with a keyboard shortcut: log a line, create a
   task, open a blocker. This is the feature that decides whether the tool survives
4. **Blockers and decisions** ✅ CRUD, day counts, `/blockers` with the chart
5. **The weekly report** ✅ `/friday` with generation, field by field copying and
   saved reports
6. **Templates** ✅ a `template` table, deploy a template as a new project tree
   (phases, standard tasks, known risks)

Built after the six stages, on request: project identity, the brief, the project
map, documents, project numbers, node dependencies, focus and reordering.

---

## Round trips, not queries

A call to Supabase costs about 100 ms, of which 17 ms is network and the rest is
the server. What matters is therefore not how many queries a page runs but how
many of them **wait for each other**.

Every page used to ask `v_node_descendant` which nodes were underneath, and only
then issue the queries that filter by the answer. That is one wait turned into
two, and a project page did it three times: once for the tree, once for the
frame, once more with an edit form open. Six sequential trips, about 600 ms of
doing nothing.

The portfolio is a few dozen rows. It is cheaper to fetch it whole and walk it
in `lib/subtree.ts`, so pages now run **one** Promise.all each. The tables that
grow without bound keep a limit; `entry` is fetched at 200 and cut in memory.

**The trap when doing this:** dropping a `.in()` filter without adding the
equivalent filter in TypeScript does not fail, it quietly shows another
project rows. Every unfiltered read has to be cut against `subtreeSet` at the
point it is bound.

## One definition, one place

The rule that has caught the most bugs in this project, stated plainly: a word
that means one thing must be computed in one place. It has been broken six
times so far, and each break was invisible until the two copies disagreed.

- **Median.** `/blockers` had its own, unrounded; `expected_by` used
  `medianWait`. The key figure and the date it drove could differ by half a day.
- **Dates.** `addDays` existed in `template.ts` and again as `addDaysIso` in
  `template-actions.ts`; `daysBetween` in `report.ts` and again in
  `template.ts`; the day in milliseconds three times; today spelled out by hand
  in nineteen places. All of it now lives in `lib/date.ts`.
- **Blocked.** A column you set by hand beside a fact about open blockers. Now
  derived, and the two cannot drift.
- **The subtree walk.** `lib/subtree.ts` was written to replace the
  `v_node_descendant` round trip, and the cost page had already grown its own
  copy under the name `pathDescendants`. Deleted; there is one walker.
- **A line in euro.** `v_node_cost` converts in SQL, and three separate pages
  were each dividing `amount` by `eur_rate` on their own. When quantity arrived
  that would have been three places to remember. `lineEur` and `lineAmount` in
  `lib/cost.ts` are now the only TypeScript spelling of it, and they exist
  alongside the view rather than instead of it: change the rule in both, and
  nowhere else.
- **A written description.** Four pages each rendered `node.description` inside
  a single `<p>`. HTML collapses whitespace, so the paragraphs somebody typed
  arrived as one slab, on every one of them, identically wrong. `lib/prose.ts`
  and the `Prose` / `ProseOpening` components in `components/ui.tsx` are now
  the only spelling. The separator turned out not to be two newlines: every real
  description in the database separates paragraphs with a line holding a single
  space, which is what a textarea leaves behind. A paragraph break is a line
  with nothing but whitespace on it.

**A query that fails must say so.** Reading with `data ?? []` turns a missing
view into an empty list and renders a page that looks fine and shows nothing.
That is exactly how `v_node_ready` went unnoticed: its migration had rolled
back, the tree drew no sequence marks, and nothing said why. Pages check
`firstError` before using their results. A schema behind the code is an error,
not an empty state.

**Migrations must survive being run twice, or half.** They are applied by hand,
so `create table if not exists`, `create or replace view`, `drop ... if exists`
and `on conflict do nothing` on the self-recording insert. The first failure of
this kind was self-inflicted: `20260903000003` ended by recording itself in a
table that `20260903000002` creates, `20260903000002` had not been run, and the
transaction wrapper correctly rolled the whole thing back.

`lib/*.ts` is loaded two ways: by Next, which resolves the `@/` alias, and by
plain `node` in the tests, which does not. A relative specifier carrying its
extension, `'./date.ts'`, is the one form both accept, which is why
`allowImportingTsExtensions` is on.

## Before it is work

Every other table demands that you know something. A node needs a type and a
parent, a cost line needs an amount, a decision needs what you turned down.
That is right for work and wrong for an idea: the good ones arrive in a car
park or in bed, and a form that asks which project this is under before it will
accept the sentence is a form nobody opens at eleven at night.

So `spark` has **one** required field, and triage is a separate act done at a
desk with the tree in front of you.

**It is deliberately not a node with status `idea`.** That would put every
passing thought in the tree, in `/projects`, in the progress counts and in the
portfolio, and the tree would stop being a picture of the actual work. The
triage step is the point: most sparks should die, and a table you delete from
without guilt is a table you keep writing to.

Dropped sparks are kept, with a `verdict`. That line is what stops the same
idea arriving again in three months and going round the loop a second time.

`became_node_id` is `on delete set null`, not cascade. Deleting the node a
spark became must not erase the record that the thought was had and acted on.

`source` exists to tell you which capture route you actually use, and which one
was a nice idea nobody touched.

## What the work is for

The tree answers where a piece of work sits. `strategy` answers what it is for,
and the two do not line up: "COGS saving" is fed by parts of several unrelated
projects at once, so it can never be read off any one of them.

A row rather than a column. A boolean `cogs_saving` would need a second boolean
beside it the day somebody announces a sustainability programme, and a third
the day after.

The marking sits on **any node**, not only on a project, because a broad
digitalisation project can have exactly one subproject that lowers cost of
goods. That creates the only hard part: a marked subproject inside a marked
project must not be counted twice. `v_strategy_node` derives which marking is
the topmost in its branch, and only those are added up. Derived, because a
"counts towards the total" checkbox goes wrong the first time somebody marks a
parent.

The nested marking is kept and shown. It says where the saving actually comes
from, and only the page that adds things up needs to care.

**A blank is never counted as zero.** The expected annual benefit is typed on
the project under Identity, so a marked project has a figure and a marked
subproject does not. Where neither the marking nor the node carries one, the
contribution is unknown, reported as unknown, and the shortfall against the
target refuses to appear at all. A sum missing three of its terms, presented as
a gap, reads as precise and is not, and the first person who notices stops
believing the page.

`node_strategy.annual_eur` is null in the common case, meaning "take the node's
own benefit, whole". A figure there is for the project that serves two
strategies, or serves one only in part.

The money is rolled up in TypeScript, not in SQL, because the benefit lives in
`node.reporting` as jsonb and `lib/identity.ts` is the one place that parses
that. No view reads reporting, and this was not the moment to start.

## What the work rests on

Two questions that look alike and are not, and the whole of `/p/<id>/grundlag`
is the consequence of keeping them apart.

**What did we choose, and what did we turn down** is a moment. It happened, it
is fixed, and a year later it is the only thing that answers "why didn't you
just use a Raspberry Pi". That is `decision`, which has carried `rationale` and
`alternatives` since the first migration and held **zero rows** through the
first two days of real use. Not laziness: nothing ever asked. Everything else
in this application shows you what happened and invites a line about it, and
the reasoning behind a build had no such surface. Hence `topic`, which turns a
flat list into something that reads as a specification, and the `undecided`
loose end, which is the one whose answer is a decision rather than a log line.

**What does it consist of** is a state; it moves until the cabinet is built.
That deliberately has no table. A sensor you are going to buy is already a
`cost` row with a vendor, a quote number and the quotation attached. A separate
parts list would mean entering the IOT2050 once as a specification and once as a
price, and a thing written twice is a thing that disagrees with itself by
Christmas. So `cost` gained `kind` and `quantity` and nothing else changed:
Basis and Cost read the same rows, one as a specification, one as a total.

`amount` became the price of ONE when `quantity` arrived. Every existing line
carries a quantity of one, so nothing that had ever been reported was restated.

`other` is the default for both `decision.topic` and `cost.kind`, because quick
entry writes without asking and a default of `method` would file hardware
choices under method in silence. A wrong heading is worse than an empty one:
`other` reads as "not filed", the page counts them, and filing one is a click.

## One project identity, and it is not ours

`project_no` used to be invented here: a category prefix, a year and a counter,
producing PR-26-0001. It looked official and was not. UBS Projects, the company
Power Apps system, is where a project is actually registered and numbered, so
this was a second series for the same projects, and the day somebody compared
the two systems it would have been this one explaining itself. "One definition,
one place" at the level above the code.

So the number is typed in from there, `assign-project-no.ts` and `project-no.ts`
are gone, and nothing in this application invents an identity any more.

**An absent number is the signal, not a blank.** It means the work exists here
and has not been registered in the company system, which is a thing a project
manager gets asked about. `/projects` says "not registered" in oxblood rather
than showing nothing, and a project applied from a template starts that way
because it has not been registered yet.

**Integration, when it comes, goes through Power Automate.** Not the Dataverse
Web API: that needs an app registration in Entra ID and a service principal,
which is a project with IT before it is a feature. A flow with an HTTP trigger
gives a URL to post the weekly status to, and the flow writes into the Power
App. The signature in that URL would be the first real secret this deployment
holds; until now it has carried only the anon key, which is public by design.

## The Claude app, and why it holds no keys

An idea said to Claude on a phone becomes a spark. `/api/mcp` is a Streamable
HTTP MCP server with **one tool, and it only writes**.

The obvious way to build it would have been to put the service role key on the
deployment. That key bypasses every policy in the schema, so an endpoint whose
whole job is "add one sentence to an inbox" would have been able to read every
project, every price and every document, and delete them. The blast radius
would have had nothing to do with the job.

So the endpoint holds no privileges. It calls `capture_spark` with the **anon**
key, which is public and opens nothing on its own, and that function is the
only elevated path into this database reachable without a session. It can
create a spark. No argument changes that.

The credential is a capture token, stored as a SHA-256 hash in `spark_token`
and shown to its owner once. Nothing here can read one back, which is the point:
a table that can be turned into a working credential eventually leaks one. The
token is also the only wall in front of the function, since there is no rate
limiting, which is why it is 32 bytes from the system generator rather than
something memorable.

What a stolen token buys: read one person's own inbox, add a thought to it, add
a paragraph to a thought already in it. Nothing about the tree, the prices, the
documents or anyone else, and nothing already written can be lost, because the
note tool appends and cannot replace. That asymmetry is the design.

The reach grew once, deliberately, when a ten minute conversation about mini
rack equipment had nowhere to go except a second unconnected spark. Three
limits keep it that size and all three live in the functions rather than in the
endpoint, because the endpoint is the part that could be rewritten: the owner
comes from the token and never from an argument; only sparks still in the inbox
are visible; and the note is appended, never replaced.

**Writing onto a project was asked for and refused.** It would turn this from
an inbox into a general write channel into project data, which is the point at
which a token going astray stops being an annoyance.

**A spark has two halves and they stay apart.** The first one captured this way
read "OT Test Center med mini rack": correct, in his own words, and close to
useless in three weeks, because a bare fragment loses what made it worth
saying. So `body` is what was said, untouched, and `note` is what was around
it. Keeping them in one field would have blurred the two and the sentence is
what would have been lost. The note holds context, never a plan: the tool
description says so, and capture stops being capture the moment it starts
proposing.

**A table is recognised, never stored.** Some substance really is a list of
things with values against them: equipment with prices, options with lead
times. Written as pipe rows, `lib/prose.ts` draws it as a table everywhere
written text appears. Nothing becomes a structure the database has to know
about, so the raw lines stay editable, greppable and printable, and a person
can type one by hand. A single line or a single column stays text, because that
is a list; and every line must carry a pipe before a paragraph counts, so a
sentence mentioning an A|B splitter is not turned into a table.

`/api/mcp` is open in middleware and closed one layer down. Sending a JSON-RPC
call to a login redirect would be the wrong answer to the wrong question.

## Two limits that only exist in production

**A server action's request body is capped at 4.5 MB on Vercel.** Documents
promised 25 MB and delivered it locally, which is the worst shape a limit can
have: a scanned drawing worked on the machine it was built on and would have
failed the first time a colleague tried it. The Documents panel now asks for a
signed URL, the browser PUTs straight to Supabase Storage, and only the path
and the name come back to be written as a row. Size and MIME type are read back
from storage rather than believed: a row claiming 2 KB over a 60 MB object would
make the page lie about what the project holds.

The one file field on the cost form still travels with the form, and says so.
A quotation is almost always well under the cap; the panel is there for what is
not.

**A strategy total must not depend on who is looking.** Membership made every
read viewer-scoped, which is right for work and wrong for a figure reported
upwards: "COGS saving promises 340 000 a year" has to be the same sentence
whoever opens the page, and a number that quietly shrinks for the colleague who
is not on one of the contributing projects is worse than no number, because both
people will believe theirs.

So `v_strategy_node` runs as owner and carries what each marking is worth. Two
things about it are deliberate: it is the one place in this schema where SQL
reads the `reporting` jsonb, because the page reading the node itself is exactly
what cannot work here; and it exposes no converted money, so the euro rule stays
in the two places it lives rather than gaining a third. `invested` is left
viewer-scoped for that reason and is labelled as such on the page.

## Backed by an audit, not by belief

`npm run audit` holds the running database up against the code that talks to
it. `npm test` proves the pure functions are right; this proves the other half.
It only reads, and it is the answer to "is everything as it should be" from now
on rather than a one-off.

The schema is applied by hand through the Supabase SQL editor, so the migration
files are a record of intent, not proof of state. A migration that half
applied, a view recreated without `security_invoker`, a column renamed on one
side only: every one of those looks fine in the repository. PostgREST publishes
what actually exists as an OpenAPI document at `/rest/v1/`, and that is the
only honest source. Held against every `.from(...).select(...)` in the code and
against the interfaces in `lib/types.ts`, it answers in seconds whether the two
have drifted.

Five things it checks: every select the code makes names columns that exist and
actually answers; nothing at all is readable with the anonymous key, storage
included; no row points at something that is gone and there is no cycle in
either the tree or the sequence; every derived view agrees with an independent
recomputation from the raw tables; and every closed set is a real enum matching
`lib/types.ts`.

The first run, on 4 September 2026, found one gap. `entry.kind` and `blocker.waiting_on_type` were `text` with
the permitted values written in a trailing comment, while every other closed
set in the schema is an enum. A comment stops nothing, and both are written by
actions that cast whatever arrived. `20260904000002` makes them enums.

## Rules

- Server Components by default. `'use client'` only where there is interactivity
- No computed value is stored in a column. Progress, day counts and "since last" are views
- No editing of derived fields in the UI
- Keyboard first: quick entry must be reachable and completable without a mouse
- No notifications, no integrations, no sharing, no mobile app. Not in v1
- **English UI text.** Changed 2 September 2026: everything the user sees is in
  English, because the company systems, reports and PIDs are. Table and column names
  were English already
- **No em dashes.** Use a comma, a colon or a full stop
- Keep `MASTER.md` current when the model changes

---

## Deliberately not built

- **No language model in the app.** The status text is assembled from log entries,
  never rewritten. The tool changes the collection and the phrasing, not the substance
- **No mail.** The Status Update form notifies four roles; we do not. No integrations
  in v1
