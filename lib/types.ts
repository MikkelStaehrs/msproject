/**
 * Types mirroring the database schema. Maintained by hand: the schema is
 * small, and a handful of entities is not worth an ORM.
 */

export type NodeType = 'development' | 'project' | 'subproject' | 'task'

/**
 * What YOU decide about a node. «blocked» is deliberately absent: it is not a
 * decision but a fact about open blockers, derived in v_node_state. See
 * EffectiveStatus below.
 */
export type NodeStatus =
  | 'idea'
  | 'planned'
  | 'active'
  | 'paused'
  | 'done'
  | 'cancelled'

/** What a node reads as on screen: the stored status, or blocked on top of it. */
export type EffectiveStatus = NodeStatus | 'blocked'

export type NodeCategory = 'capex' | 'production' | 'it' | 'other'

export type WaitingOnType =
  | 'internal_it'
  | 'management'
  | 'vendor'
  | 'external'
  | 'other'

export type EntryKind = 'work' | 'note' | 'meeting' | 'risk'

export interface Node {
  id: string
  parent_id: string | null
  type: NodeType
  title: string
  description: string | null
  category: NodeCategory | null
  status: NodeStatus
  owner: string | null
  start_date: string | null
  due_date: string | null
  completed_at: string | null
  is_milestone: boolean
  sort_order: number
  /**
   * What you thought the work would take, in calendar days, before doing it.
   * A range, because that is how the guess is actually held. Nothing reads
   * these yet: they are kept so the gap between guess and outcome can be
   * measured in half a year, which is not something that can be started later.
   */
  estimate_low_days: number | null
  estimate_high_days: number | null
  reporting: Record<string, unknown>
  /**
   * Which stand-up produced this, where a stand-up did. A stamp rather than a
   * minutes table: «what did we agree last Thursday» is then a query, and its
   * progress is this row's own state rather than a second account of it.
   */
  standup_id: string | null
  created_at: string
  updated_at: string
}

export interface Blocker {
  id: string
  node_id: string
  title: string
  waiting_on: string
  waiting_on_type: WaitingOnType
  opened_at: string
  expected_by: string | null
  resolved_at: string | null
  resolution: string | null
  created_at: string
}

export const DECISION_TOPICS = [
  'hardware',
  'software',
  'network',
  'data',
  'vendor',
  'method',
  'scope',
  'other',
] as const
export type DecisionTopic = (typeof DECISION_TOPICS)[number]

export const DECISION_TOPIC_LABEL: Record<DecisionTopic, string> = {
  hardware: 'Hardware',
  software: 'Software',
  network: 'Network',
  data: 'Data',
  vendor: 'Vendor',
  method: 'Method',
  scope: 'Scope',
  other: 'Not filed',
}

/**
 * What each topic is for. Twenty decisions in one flat list is a list nobody
 * reads; the same twenty under these headings is a specification.
 */
export const DECISION_TOPIC_HINT: Record<DecisionTopic, string> = {
  hardware: 'sensors, cabinets, machines, the physical layer',
  software: 'what runs, and what it is written in',
  network: 'addressing, segmentation, what IT has to allow',
  data: 'the model, where it lands, how long it is kept',
  vendor: 'who supplies it, who builds it',
  method: 'how the work is done, what becomes the standard',
  scope: 'what is in, and what is deliberately left out',
  other: 'captured in a hurry and not yet filed',
}

export interface Decision {
  id: string
  node_id: string
  decided_on: string
  decision: string
  rationale: string | null
  alternatives: string | null
  /** What area the choice was about. `other` means not filed yet. */
  topic: DecisionTopic
  /**
   * Which stand-up produced this, where a stand-up did. A stamp rather than a
   * minutes table: «what did we agree last Thursday» is then a query, and its
   * progress is this row's own state rather than a second account of it.
   */
  standup_id: string | null
  created_at: string
}

export interface Entry {
  id: string
  node_id: string
  entry_date: string
  kind: EntryKind
  body: string
  /**
   * Which stand-up produced this, where a stand-up did. A stamp rather than a
   * minutes table: «what did we agree last Thursday» is then a query, and its
   * progress is this row's own state rather than a second account of it.
   */
  standup_id: string | null
  created_at: string
}

export interface NodeDependency {
  id: string
  node_id: string
  depends_on_id: string
  note: string | null
  created_at: string
}

export interface Document {
  id: string
  node_id: string
  name: string
  path: string
  mime_type: string | null
  size_bytes: number | null
  folder: string | null
  created_at: string
}

/**
 * A company strategy that work serves, above the project it lives in. COGS
 * saving is the first; there will be others, which is why this is a row and
 * not a column.
 */
export interface Strategy {
  id: string
  name: string
  description: string | null
  /** What it is measured against per year, in euro. Null carries no number. */
  target_annual: number | null
  owner: string | null
  started_on: string | null
  /** Null while it runs. */
  ended_on: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

/** A node marked as serving a strategy. */
export interface NodeStrategy {
  id: string
  node_id: string
  strategy_id: string
  /** Null means the node's own expected annual benefit counts in full. */
  annual_eur: number | null
  note: string | null
  created_at: string
}

/**
 * The same marking, with whether it is the topmost one for its strategy in its
 * branch. Only those are added up.
 */
export interface StrategyNode {
  id: string
  strategy_id: string
  node_id: string
  annual_eur: number | null
  note: string | null
  is_top: boolean
  /**
   * What the node itself expects to be worth a year, in euro. Null where nobody
   * has said. Carried on the view rather than read off the node, because the
   * view runs as owner and a strategy total has to be the same number for
   * everyone.
   */
  benefit_eur: number | null
  node_status: NodeStatus
  node_blocked: boolean
}

/**
 * Who is on a project.
 *
 * Membership sits on the root and is inherited by everything under it, which is
 * the same cut every roll-up in this application already uses. A subproject
 * cannot be joined on its own: a half-visible tree is worse than no access.
 */
export interface ProjectMember {
  id: string
  project_id: string
  user_id: string
  added_at: string
}

/**
 * A long lived credential that may create a spark and nothing else. Stored
 * hashed, so no code here can read one back; shown to its owner once.
 */
export interface SparkToken {
  id: string
  user_id: string
  name: string
  created_at: string
  last_used_at: string | null
}

/**
 * The figures the whole portfolio is measured against. One row.
 *
 * The volume is frozen and named on purpose: units sold fell 23% between FY25
 * and FY26, which moved indirect cost per unit by about four and a half times
 * the entire annual target. Against a moving denominator a project looks better
 * in a bad year having changed nothing.
 */
export interface Yardstick {
  id: boolean
  fiscal_year: string
  /** PROCESSED units: the divisor the unit cost is computed with. */
  cost_basis_units: number
  /** Which population that counts, e.g. «In-house · Sugar». */
  cost_basis_scope: string | null
  /**
   * What the strategy covers. Wider than cost_basis_scope means the
   * denominator is too small: target understated, every share overstated.
   */
  target_scope: string | null
  unit_cost_dkk: number | null
  hour_rate_dkk: number
  eur_rate: number
  cogs_target_eur_per_unit: number
  note: string | null
  updated_at: string
}

/** Units through one process stage in one year. */
export interface StageVolume {
  id: string
  fiscal_year: string
  stage: string
  units: number
  /**
   * Which population these count. Unfiltered off the process dashboard, so
   * wider than the cost basis, which is one slice of it. Multiplying by one and
   * dividing by the other overstates the share of the target, and neither
   * number can tell you that on its own.
   */
  scope: string | null
}

/**
 * The public half of a user. `auth.users` itself stays unexposed, holding
 * password hashes and recovery tokens; this is what the interface needs to
 * name somebody.
 */
export interface Profile {
  id: string
  email: string
  /** What colleagues see on a role. Null until they say, never derived. */
  full_name: string | null
  /**
   * When they last chose their own password. Null means the one they hold was
   * typed by whoever created the account, which is what the first-run gate is
   * about: until it is replaced, two people can sign in as one.
   */
  password_set_at: string | null
  created_at: string
}

/**
 * What was claimed for a piece of work on the day it stopped being an idea.
 *
 * Copied from the spark rather than read back through `became_node_id`, and
 * that is not a duplicate. Sparks are private to their author, so a promise
 * read through one would be visible to a single person and silently absent for
 * the rest of the team. And the spark stays editable: it holds what the idea
 * says now, this holds what somebody decided on.
 */
export interface NodeOrigin {
  node_id: string
  spark_id: string | null
  body: string
  note: string | null
  saving_kind: SavingKind | null
  saving_value: number | null
  saving_stage: string | null
  cost_score: number | null
  benefit_score: number | null
  complexity_score: number | null
  /** The yardstick the figure was weighed against. A saving needs its year. */
  fiscal_year: string | null
  /** What the claim rested on at promotion. Frozen with the rest of this row. */
  worth_basis: WorthBasis | null
  worth_note: string | null
  promised_at: string
  promised_by: string | null
}

/**
 * One stand-up, held.
 *
 * The only thing a stand-up stores. The agenda, who was needed and what moved
 * are all derived; this row exists solely so "since last time" has a last time
 * that survives a skipped week.
 */
export interface Standup {
  id: string
  held_on: string
  held_by: string | null
  note: string | null
  created_at: string
}

export const SPARK_SOURCES = ['app', 'quick', 'claude'] as const
export type SparkSource = (typeof SPARK_SOURCES)[number]

export const SPARK_SOURCE_LABEL: Record<SparkSource, string> = {
  app: 'Typed here',
  quick: 'Ctrl+K',
  claude: 'Said to Claude',
}

export const SAVING_KINDS = ['hours', 'per_unit', 'annual'] as const
export type SavingKind = (typeof SAVING_KINDS)[number]

export const SAVING_KIND_LABEL: Record<SavingKind, string> = {
  hours: 'Man-hours a year',
  per_unit: 'Kroner per unit at a stage',
  annual: 'Kroner a year',
}

/**
 * Three ways in, because a saving arrives in whatever unit the person who
 * spotted it thinks in. Forcing it into kroner at the point of capture is how
 * a number gets invented on the spot.
 */
export const SAVING_KIND_HINT: Record<SavingKind, string> = {
  hours: 'times the hourly rate',
  per_unit: 'times what that stage actually runs',
  annual: 'already there',
}

/**
 * What a credential handed to the Claude app may do.
 *
 * `capture` is what a token has always meant: create a spark, read its owner's
 * own inbox, add a paragraph to a thought already in it. `analyse` is that plus
 * reading the structure of the projects its owner is a member of and the COGS
 * reference, so an idea can be argued with before it becomes work.
 *
 * Two things about this are deliberate. Existing tokens stay `capture`, because
 * a capability granted by a migration rather than by a person is one nobody
 * knows they handed out. And neither scope writes anything but a spark: the
 * model may argue, it may never be the source of a stored number.
 */
export const TOKEN_SCOPES = ['capture', 'analyse'] as const
export type TokenScope = (typeof TOKEN_SCOPES)[number]

export const TOKEN_SCOPE_LABEL: Record<TokenScope, string> = {
  capture: 'Capture only',
  analyse: 'Capture and read',
}

/** What choosing it hands over, said where the choice is made. */
export const TOKEN_SCOPE_HINT: Record<TokenScope, string> = {
  capture: 'may add to your inbox, and read nothing',
  analyse: 'may also read the structure of your projects and the COGS reference',
}

/**
 * What a claim rests on, answered when a thought becomes work.
 *
 * Three answers, and only silence is refused. A required AMOUNT would be worse
 * than an empty field: not everything has a saving, and forcing one produces a
 * fiction that outlives whoever typed it. `sold_units` is the house example of
 * a reasonable inference written down as a fact and believed by everyone after.
 *
 * Null is not a fourth answer. It means the question has not been put, which is
 * what every spark captured before this existed looks like.
 */
export const WORTH_BASES = ['saving', 'enabling', 'unknown'] as const
export type WorthBasis = (typeof WORTH_BASES)[number]

export const WORTH_BASIS_LABEL: Record<WorthBasis, string> = {
  saving: 'It saves something',
  enabling: 'No direct saving',
  unknown: 'Not worked out yet',
}

/** Said inside the option, because the picker is server rendered. */
export const WORTH_BASIS_HINT: Record<WorthBasis, string> = {
  saving: 'hours, kroner per unit, or kroner a year',
  enabling: 'it lets other work happen, or removes a risk. Say which',
  unknown: 'and that is a real answer, not a blank',
}

export const SPARK_STATES = ['new', 'kept', 'dropped'] as const
export type SparkState = (typeof SPARK_STATES)[number]

export const SPARK_STATE_LABEL: Record<SparkState, string> = {
  new: 'Not looked at',
  kept: 'Became work',
  dropped: 'Decided against',
}

/**
 * A thought, before it is work.
 *
 * One required field, on purpose. Deliberately not a node with status 'idea':
 * that would put every passing thought in the tree and in the progress counts,
 * and the tree would stop being a picture of the actual work.
 */
export interface Spark {
  id: string
  /** Whose thought it was. Sparks are private to their author. */
  user_id: string
  body: string
  source: SparkSource
  state: SparkState
  /** What it became, where it became anything. */
  became_node_id: string | null
  /**
   * What made the thought make sense at the time. Context, never a plan: the
   * body is what was said, this is what was around it.
   */
  note: string | null
  /** How the saving was described. All three end at kroner a year. */
  saving_kind: SavingKind | null
  /** Hours a year, kroner per unit at `saving_stage`, or kroner a year. */
  saving_value: number | null
  /** Which stage the units pass through. Only meaningful for `per_unit`. */
  saving_stage: string | null
  /**
   * The company's own one to five scale. Only a person sets these; the
   * priority and the quadrant follow from them and are never stored.
   */
  cost_score: number | null
  benefit_score: number | null
  complexity_score: number | null
  /** Why it was dropped. The reason dropped sparks are kept, not deleted. */
  verdict: string | null
  /** What the claim rests on. Null means the question has not been put. */
  worth_basis: WorthBasis | null
  /** Why it is worth doing with no direct saving. Only for 'enabling'. */
  worth_note: string | null
  /** The log line it became, where it was an observation rather than new work. */
  became_entry_id: string | null
  captured_at: string
  created_at: string
  updated_at: string
}

export interface Report {
  id: string
  node_id: string
  period_start: string
  period_end: string
  fields: Record<string, unknown>
  /** The figures behind the fields, written once. See ReportSnapshot. */
  context: Record<string, unknown>
  body_markdown: string | null
  submitted: boolean
  generated_at: string
}

// --- Views. Never writable. -----------------------------------------------

export interface NodeProgress {
  node_id: string
  leaf_total: number
  leaf_done: number
  progress_pct: number
}

export interface ActiveBlocker extends Blocker {
  days_blocked: number
  overdue: boolean
}

export interface BlockerDays extends Blocker {
  days_blocked: number
  is_active: boolean
}

/**
 * Blocked-ness, computed. `is_blocked` counts the node's OWN open blockers,
 * not the subtree's: a project is not blocked because one task out of twelve
 * is.
 */
export interface NodeState {
  node_id: string
  status: NodeStatus
  is_blocked: boolean
  open_blockers: number
  worst_wait: number
  status_effective: EffectiveStatus
}

/**
 * Whether a node can be started: no unfinished predecessor on it or on any of
 * its ancestors. Sequence, not blockers. A node can be ready and blocked, or
 * blocked and not ready, and both readings are useful.
 */
export const COST_STATES = ['estimate', 'quoted', 'ordered', 'invoiced'] as const
export type CostState = (typeof COST_STATES)[number]

/**
 * What each state promises. Certainty is the whole reason there are four:
 * an estimate is a belief and an invoice is money gone.
 */
export const COST_STATE_LABEL: Record<CostState, string> = {
  estimate: 'Estimate',
  quoted: 'Quoted',
  ordered: 'Ordered',
  invoiced: 'Invoiced',
}

export const COST_STATE_HINT: Record<CostState, string> = {
  estimate: 'a number you believe, no paper behind it',
  quoted: 'a supplier has put a price on it',
  ordered: 'placed, the money is spoken for',
  invoiced: 'billed, the money is gone',
}

export const COST_RECURRENCES = ['once', 'monthly', 'quarterly', 'yearly'] as const
export type CostRecurrence = (typeof COST_RECURRENCES)[number]

export const COST_RECURRENCE_LABEL: Record<CostRecurrence, string> = {
  once: 'One off',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
}

export const COST_RECURRENCE_HINT: Record<CostRecurrence, string> = {
  once: 'the investment, what the grant covers',
  monthly: 'a rate, counted as twelve a year',
  quarterly: 'a rate, counted as four a year',
  yearly: 'a rate, once a year',
}

export const COST_BUDGETS = ['capex', 'opex'] as const
export type CostBudget = (typeof COST_BUDGETS)[number]

export const COST_BUDGET_LABEL: Record<CostBudget, string> = {
  capex: 'CAPEX',
  opex: 'OPEX',
}

/**
 * Independent of how often the money falls due. A consultant day is one-off
 * opex; a licence paid up front can be capex.
 */
export const COST_BUDGET_HINT: Record<CostBudget, string> = {
  capex: 'creates an asset, capitalised',
  opex: 'keeps things running, expensed',
}

/** What a supplier quoted in. Everything reported is euro regardless. */
export const COST_CURRENCIES = ['DKK', 'EUR'] as const
export type CostCurrency = (typeof COST_CURRENCIES)[number]

export const COST_KINDS = [
  'hardware',
  'software',
  'licence',
  'service',
  'labour',
  'other',
] as const
export type CostKind = (typeof COST_KINDS)[number]

export const COST_KIND_LABEL: Record<CostKind, string> = {
  hardware: 'Hardware',
  software: 'Software',
  licence: 'Licence',
  service: 'Service',
  labour: 'Labour',
  other: 'Other',
}

/**
 * A cost line is also a part. The kind is what lets one entry answer both
 * «what does this cost» and «what does it consist of», so neither has to be
 * typed twice.
 */
export const COST_KIND_HINT: Record<CostKind, string> = {
  hardware: 'a thing you can drop on your foot',
  software: 'a program, bought outright',
  licence: 'the right to keep using something',
  service: 'installation, integration, consulting, bought outside',
  labour: 'hours, internal or hired',
  other: 'freight, contingency, anything that is not a part',
}

export interface Cost {
  id: string
  node_id: string
  description: string
  /** The price of ONE, in `currency`. The line is worth amount x quantity. */
  amount: number
  /** How many. */
  quantity: number
  /** What sort of thing this is, so the line doubles as a part. */
  kind: CostKind
  state: CostState
  recurrence: CostRecurrence
  budget: CostBudget
  /** What the supplier quoted in. The amount is stored exactly as written. */
  currency: CostCurrency
  /** Units of `currency` per euro, as it stood when the line was written. */
  eur_rate: number
  vendor: string | null
  reference: string | null
  dated: string
  note: string | null
  /** The quote, order confirmation or invoice this line rests on. */
  document_id: string | null
  created_at: string
  updated_at: string
}

/**
 * Cost rolled up per node, in two halves that are never added together: one is
 * an amount and the other is a rate.
 */
export interface NodeCost {
  node_id: string
  /** The investment, in whole amounts. What the grant covers. */
  once_estimated: number
  once_quoted: number
  once_ordered: number
  once_invoiced: number
  /** Ordered plus invoiced: what you can no longer change your mind about. */
  once_committed: number
  once_priced: number
  /** How much of the investment has a document attached. Evidence, not state. */
  once_with_paper: number
  /** What it costs to keep, per year. */
  annual_committed: number
  annual_priced: number
  /** The same money cut the other way: capitalised against expensed. */
  capex_once_priced: number
  capex_once_committed: number
  capex_annual_priced: number
  opex_once_priced: number
  opex_once_committed: number
  opex_annual_priced: number
  opex_annual_committed: number
  once_items: number
  annual_items: number
  items: number
}

export interface NodeReady {
  node_id: string
  /** Every unfinished predecessor on this node or an ancestor. */
  waiting_on_count: number
  /**
   * The subset that has passed its own due date. Ordinary sequence is
   * waiting_on_count above zero with this at zero, and it is not a problem:
   * work that comes after other work is a plan. Only lateness earns a colour.
   */
  overdue_count: number
  is_ready: boolean
}

export interface NextDate {
  node_id: string
  next_node_id: string
  title: string
  due_date: string
  is_milestone: boolean
  status: NodeStatus
  days_until: number
}

// --- UI labels -------------------------------------------------------------

export const STATUS_LABEL: Record<NodeStatus, string> = {
  idea: 'Idea',
  planned: 'Planned',
  active: 'Active',
  paused: 'On hold',
  done: 'Completed',
  cancelled: 'Cancelled',
}

/** The same list plus the derived value, for anything that only displays. */
export const EFFECTIVE_STATUS_LABEL: Record<EffectiveStatus, string> = {
  ...STATUS_LABEL,
  blocked: 'Blocked',
}

export const CATEGORY_LABEL: Record<NodeCategory, string> = {
  capex: 'CAPEX',
  production: 'Production',
  it: 'IT',
  other: 'Other',
}

/**
 * Listed top down, biggest first. The enum happens to be alphabetical, and a
 * picker in alphabetical order asks you to know the answer before you read it.
 */
export const TYPE_LABEL: Record<NodeType, string> = {
  project: 'Project',
  subproject: 'Subproject',
  development: 'Development',
  task: 'Task',
}

/**
 * What choosing it actually means, for the picker.
 *
 * Only task and not-task changes any calculation, so the words below are what
 * keeps the tree readable. Kept beside the labels rather than in the form, so
 * the guide and the picker cannot end up saying different things.
 */
export const TYPE_HINT: Record<NodeType, string> = {
  project: 'top level, numbered',
  subproject: 'divides into parts',
  development: 'a thing being built',
  task: 'the work, and the only type that counts',
}

export const WAITING_ON_TYPE_LABEL: Record<WaitingOnType, string> = {
  internal_it: 'Internal IT',
  management: 'Management',
  vendor: 'Vendor',
  external: 'External',
  other: 'Other',
}
