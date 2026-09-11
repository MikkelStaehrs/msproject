/**
 * Project identity: all the master data that frames a project but cannot be
 * derived from the tree.
 *
 * The field lists live here and nowhere else. The page builds its form from
 * them, and the server action reads them back from the same list, so a new
 * field is one line here.
 *
 * Everything lands in `node.reporting` as jsonb, except the fields that
 * already have a column: title, description, dates, category, status, owner.
 */

export type FieldDef = {
  key: string
  label: string
  hint?: string
  /**
   * Holds one person, so the picker can offer a whole name. The rest are comma
   * separated lists, where suggesting a single value would be wrong.
   */
  one?: boolean
}

/**
 * Administrative fields shown in the context band.
 *
 * `project_no` used to be invented here, from a category prefix and a year:
 * PR-26-0001. It looked official and was not. UBS Projects is where a project
 * is actually registered and numbered, so a second series for the same projects
 * was one identity too many, and the day somebody compared the two systems it
 * would have been this one that had to explain itself.
 *
 * So it is typed in from there now. A project with no number is not a gap in
 * the form: it means the work exists here and has not been registered in the
 * company system, and saying that out loud is more useful than filling it in.
 */
export const ADMIN_FIELDS: FieldDef[] = [
  {
    key: 'project_no',
    label: 'Project no.',
    hint: 'The official number from UBS Projects. Empty means this project is not registered there yet, which is a real thing to know rather than a field to fill.',
  },
  {
    key: 'account',
    label: 'Account string',
    hint: 'The coding in the finance system that costs on this project are booked against. Copied from finance; nothing is calculated from it.',
  },
  {
    key: 'portfolio',
    label: 'Portfolio',
    hint: 'The group this project is reported under in the company system, for example Facilities, Operations or Digitalisation.',
  },
]

/** The ones the user may write. The project number is not among them. */
/** All of them now: nothing here is assigned by this application. */
export const EDITABLE_ADMIN_FIELDS: FieldDef[] = ADMIN_FIELDS

/*
 * PRIORITIES is gone. It was Low/Medium/High, typed on the identity page, shown
 * once on the brief, and read by nothing: no sort, no filter, no calculation.
 *
 * `lib/priority.ts` is the priority in this application, derived from the three
 * judgements as 2 x benefit - cost - complexity, and it is what the stand-up
 * ranks by. Keeping a second word for the same idea was the rule this project
 * breaks most often, and the copy that did no work was the one that looked
 * authoritative in print.
 */

/**
 * The roles the company Status Update notifies. We send no mail, but the
 * roles are master data, and worth having at hand when the report is written.
 */
export const PEOPLE_FIELDS: FieldDef[] = [
  { key: 'project_manager', label: 'Project manager', one: true },
  { key: 'project_owner', label: 'Project owner', one: true },
  {
    key: 'product_owner',
    label: 'Product owner',
    one: true,
    hint: 'Who takes over the product when the project closes and carries the responsibility from then on. The handover has an address.',
  },
  {
    key: 'process_owner',
    label: 'Process owner',
    one: true,
    hint: 'Who owns the business process the project changes, while the project runs.',
  },
  { key: 'creator', label: 'Created by', one: true },
  {
    key: 'steering',
    label: 'Steering committee',
    hint: 'Separate names with commas. Used for reference only; no mail is sent from here.',
  },
  { key: 'members', label: 'Project members', hint: 'Separate names with commas.' },
  {
    key: 'stakeholders',
    label: 'Other stakeholders',
    hint: 'Separate names with commas. They also appear under Waiting on at the bottom of this page.',
  },
]

/**
 * The written half of the PID. The rest of it, milestones, dependencies and
 * rejected alternatives, is derived from the tree, the blockers and the
 * decision log, and is therefore not written here.
 */
export const PID_FIELDS: FieldDef[] = [
  {
    key: 'goal',
    label: 'Goal',
    hint: 'What the project must achieve, and how you can tell whether it worked. A goal without the second part is a wish.',
  },
  {
    key: 'situation',
    label: 'Current situation',
    hint: 'How things are done today, and what the current way costs in time, money or quality.',
  },
  {
    key: 'opportunity',
    label: 'Problem or opportunity',
    hint: 'Why this is worth acting on now. Either a problem that hurts, or an opening that is available.',
  },
  {
    key: 'solution',
    label: 'Chosen solution',
    hint: 'The solution you settled on. Not every option considered along the way; those belong in the decision log.',
  },
  {
    key: 'in_scope',
    label: 'In scope',
    hint: 'What the project delivers. Concrete enough that someone else can decide whether a given thing belongs.',
  },
  {
    key: 'out_of_scope',
    label: 'Out of scope',
    hint: 'What the project explicitly does not deliver. This is the field that saves you when someone asks six months later why it was left out.',
  },
  {
    key: 'risks',
    label: 'Standing risks',
    hint: 'What you know could go wrong. If something has already gone wrong and is costing waiting time, it belongs as a blocker, not here.',
  },
]

/**
 * Approval is the gate that separates an idea from a funded project. Without
 * it you cannot tell whether `cost` is an estimate or a granted amount.
 */
export const APPROVAL_STATES = ['Not applied', 'Applied', 'Approved', 'Rejected'] as const
export type ApprovalState = (typeof APPROVAL_STATES)[number]

export type Approval = {
  state: ApprovalState
  decided_on: string | null
  amount: number | null
  by: string | null
}

/**
 * The project reports in euro, full stop.
 *
 * Cost lines keep the currency of the quote; everything that is rolled up,
 * reported or compared is euro. The company PID that started this had 50 tDKK
 * in one field and 8 to 10 tEUR in another, and one currency for the figures
 * that leave the project is the fix.
 */
export const CURRENCIES = ['EUR'] as const
export type Currency = (typeof CURRENCIES)[number]

export type Economics = {
  benefit: number | null
  cost: number | null
  currency: Currency
}

export type Identity = {
  admin: Record<string, string>
  /** Hall, line or plant: where it physically happens. */
  location: string | null
  people: Record<string, string>
  pid: Record<string, string>
  economics: Economics
  approval: Approval
}

function readRecord(value: unknown, fields: FieldDef[]): Record<string, string> {
  const src = (value ?? {}) as Record<string, unknown>
  const out: Record<string, string> = {}
  for (const f of fields) {
    if (typeof src[f.key] === 'string') out[f.key] = src[f.key] as string
  }
  return out
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function readText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

export function readIdentity(reporting: unknown): Identity {
  const r = (reporting ?? {}) as Record<string, unknown>
  const econ = (r.economics ?? {}) as Record<string, unknown>
  const currency = econ.currency

  const appr = (r.approval ?? {}) as Record<string, unknown>

  return {
    admin: readRecord(r, ADMIN_FIELDS),
    location: readText(r.location),
    people: readRecord(r.people, PEOPLE_FIELDS),
    pid: readRecord(r.pid, PID_FIELDS),
    approval: {
      state: (APPROVAL_STATES as readonly string[]).includes(String(appr.state))
        ? (appr.state as ApprovalState)
        : 'Not applied',
      decided_on: readText(appr.decided_on),
      amount: readNumber(appr.amount),
      by: readText(appr.by),
    },
    economics: {
      benefit: readNumber(econ.benefit),
      cost: readNumber(econ.cost),
      // Euro, whatever an older row says. The project reports in one currency.
      currency: 'EUR',
    },
  }
}


/** 1.8 years. Never more digits than the number deserves. */
export function formatYears(years: number): string {
  return `${years.toFixed(1)} years`
}

/** 1,400 DKK with a thousands separator. */
export function formatAmount(amount: number, currency: Currency): string {
  return `${new Intl.NumberFormat('en-GB').format(amount)} ${currency}`
}

/**
 * The difference between what was granted and what was estimated. Positive
 * means more was granted than estimated. Negative means the estimate has run
 * past the grant, which is the thing you want to catch in time.
 */
export function approvalVariance(a: Approval, e: Economics): number | null {
  if (a.amount === null || e.cost === null) return null
  return a.amount - e.cost
}

/** A comma separated string to a list, without empty items. */
export function splitList(value: string | undefined): string[] {
  if (!value) return []
  return value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '')
}
