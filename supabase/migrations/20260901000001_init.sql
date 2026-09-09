-- Task Studio — fundament
-- Fem entiteter: node, blocker, decision, entry, report.
-- Alt beregnet (fremdrift, dagtal, næste milepæl) ligger i views, aldrig i kolonner.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type node_type     as enum ('program','project','subproject','task');
create type node_status   as enum ('idea','planned','active','blocked','paused','done','cancelled');
create type node_category as enum ('capex','production','it','other');

-- ---------------------------------------------------------------------------
-- Tabeller
-- ---------------------------------------------------------------------------

-- Rekursivt hierarki: program -> projekt -> delprojekt -> opgave.
-- Dybden er ubegrænset; modellen kender ikke forskel på niveauerne.
create table node (
  id            uuid primary key default gen_random_uuid(),
  parent_id     uuid references node(id) on delete cascade,
  type          node_type   not null,
  title         text        not null,
  description   text,
  category      node_category,
  status        node_status not null default 'planned',
  owner         text,                    -- ekstern ejer/interessent, ikke brugeren selv
  start_date    date,
  due_date      date,
  completed_at  timestamptz,
  is_milestone  boolean not null default false,
  sort_order    int not null default 0,
  reporting     jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index node_parent_id_idx on node(parent_id);
create index node_status_idx    on node(status);
create index node_due_date_idx  on node(due_date);

-- Blokering er en førsteklasses entitet med sin egen levetid, ikke et flag.
create table blocker (
  id              uuid primary key default gen_random_uuid(),
  node_id         uuid not null references node(id) on delete cascade,
  title           text not null,
  waiting_on      text not null,                   -- "IT", "Leverandør", "Ledelsen", "Vedligehold"
  waiting_on_type text not null default 'other',   -- internal_it|management|vendor|external|other
  opened_at       date not null default current_date,
  expected_by     date,
  resolved_at     date,
  resolution      text,
  created_at      timestamptz not null default now()
);
create index blocker_node_id_idx     on blocker(node_id);
create index blocker_resolved_at_idx on blocker(resolved_at);

-- Beslutningslog.
create table decision (
  id           uuid primary key default gen_random_uuid(),
  node_id      uuid not null references node(id) on delete cascade,
  decided_on   date not null default current_date,
  decision     text not null,
  rationale    text,
  alternatives text,                    -- hvad blev fravalgt og hvorfor
  created_at   timestamptz not null default now()
);
create index decision_node_id_idx on decision(node_id, decided_on desc);

-- Arbejdslog. Råstoffet til ugerapporten.
create table entry (
  id          uuid primary key default gen_random_uuid(),
  node_id     uuid not null references node(id) on delete cascade,
  entry_date  date not null default current_date,
  kind        text not null default 'work',   -- work|note|meeting|risk
  body        text not null,
  created_at  timestamptz not null default now()
);
create index entry_node_date_idx on entry(node_id, entry_date desc);

-- Gemt ugerapport. Gør "siden sidst" muligt at afgrænse præcist.
create table report (
  id            uuid primary key default gen_random_uuid(),
  node_id       uuid not null references node(id) on delete cascade,
  period_start  date not null,
  period_end    date not null,
  fields        jsonb not null default '{}'::jsonb,  -- felt for felt, klar til kopiering
  body_markdown text,
  submitted     boolean not null default false,
  generated_at  timestamptz not null default now(),
  unique (node_id, period_start)
);
create index report_node_period_idx on report(node_id, period_end desc);

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------
create function set_updated_at() returns trigger
language plpgsql
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

create trigger node_set_updated_at
  before update on node
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Views. Beregningen ligger ét sted, og det sted er databasen.
-- ---------------------------------------------------------------------------

-- Et blad er en node uden børn. Fremdrift tælles på blade.
create view v_node_leaf as
select
  n.id,
  n.status,
  not exists (select 1 from node c where c.parent_id = n.id) as is_leaf
from node n;

-- Lukning: hver node med sig selv og alle efterkommere.
create view v_node_descendant as
with recursive descendant as (
  select n.id as root_id, n.id as node_id, 0 as depth
  from node n
  union all
  select d.root_id, c.id, d.depth + 1
  from descendant d
  join node c on c.parent_id = d.node_id
)
select root_id, node_id, depth from descendant;

-- Fremdrift ruller op nedefra. Blade tæller done/ikke-done,
-- foraeldre er gennemsnittet vaegtet efter antal blade.
-- Aflyste blade taeller hverken med eller imod.
create view v_node_progress as
select
  d.root_id as node_id,
  count(case when l.is_leaf and l.status <> 'cancelled' then 1 end) as leaf_total,
  count(case when l.is_leaf and l.status = 'done'      then 1 end) as leaf_done,
  case
    when count(case when l.is_leaf and l.status <> 'cancelled' then 1 end) = 0 then 0
    else cast(round(
      100.0 * count(case when l.is_leaf and l.status = 'done' then 1 end)
            / count(case when l.is_leaf and l.status <> 'cancelled' then 1 end)
    ) as int)
  end as progress_pct
from v_node_descendant d
join v_node_leaf l on l.id = d.node_id
group by d.root_id;

-- Aktive blokeringer med dagtal.
create view v_active_blocker as
select
  b.*,
  current_date - b.opened_at as days_blocked,
  case when b.expected_by is not null and b.expected_by < current_date
       then true else false end as overdue
from blocker b
where b.resolved_at is null;

-- Alle blokeringer med dagtal, ogsaa loeste. Grundlag for grafen paa /blockers.
create view v_blocker_days as
select
  b.*,
  coalesce(b.resolved_at, current_date) - b.opened_at as days_blocked,
  (b.resolved_at is null) as is_active
from blocker b;

-- Naeste milepael pr. node: foerste uafsluttede efterkommer med due_date.
create view v_next_milestone as
with candidate as (
  select
    d.root_id,
    n.id, n.title, n.due_date, n.is_milestone, n.status,
    row_number() over (
      partition by d.root_id
      order by n.due_date asc, n.is_milestone desc, n.title asc
    ) as rn
  from v_node_descendant d
  join node n on n.id = d.node_id
  where d.depth > 0
    and n.due_date is not null
    and n.completed_at is null
    and n.status not in ('done','cancelled')
)
select
  root_id as node_id,
  id      as milestone_id,
  title,
  due_date,
  is_milestone,
  status,
  due_date - current_date as days_until
from candidate
where rn = 1;

-- ---------------------------------------------------------------------------
-- RLS. Enkeltbruger: én konto, alt indhold tilhoerer den konto.
-- ---------------------------------------------------------------------------
alter table node     enable row level security;
alter table blocker  enable row level security;
alter table decision enable row level security;
alter table entry    enable row level security;
alter table report   enable row level security;

create policy node_owner on node
  for all to authenticated
  using (auth.uid() is not null) with check (auth.uid() is not null);

create policy blocker_owner on blocker
  for all to authenticated
  using (auth.uid() is not null) with check (auth.uid() is not null);

create policy decision_owner on decision
  for all to authenticated
  using (auth.uid() is not null) with check (auth.uid() is not null);

create policy entry_owner on entry
  for all to authenticated
  using (auth.uid() is not null) with check (auth.uid() is not null);

create policy report_owner on report
  for all to authenticated
  using (auth.uid() is not null) with check (auth.uid() is not null);

-- Views arver ikke RLS fra tabellerne uden security_invoker.
alter view v_node_leaf       set (security_invoker = on);
alter view v_node_descendant set (security_invoker = on);
alter view v_node_progress   set (security_invoker = on);
alter view v_active_blocker  set (security_invoker = on);
alter view v_blocker_days    set (security_invoker = on);
alter view v_next_milestone  set (security_invoker = on);
