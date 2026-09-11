import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { canonicalRecipient, medianWait, normaliseName } from '@/lib/recipient'
import { addDays } from '@/lib/date'
import { guessWaitingOnType } from '@/lib/quick-add'
import { firstError } from '@/lib/failure'
import type { WaitingOnType } from '@/lib/types'

type Row = {
  waiting_on: string
  waiting_on_type: WaitingOnType
  days_blocked: number
  is_active: boolean
}

export type Recipient = {
  name: string
  /**
   * The kind of party this is, settled per recipient rather than per blocker.
   * The keyword guess only ever recognised IT, management and vendors, so a
   * governance body like «Project Board» landed in «other» every time and the
   * chart it feeds showed one bar for everything. Set it once on any blocker
   * for that recipient and every wait of theirs, past ones included, counts
   * under it.
   */
  type: WaitingOnType
  open: number
  /** Every day ever waited on them, open cases included. */
  totalDays: number
  /** The measured expectation, or null while there is no closed case. */
  medianDays: number | null
}

/**
 * Named for the same reason ReportDataError is: a caller that renders can say
 * so, and a caller that writes must not be able to carry on.
 */
export class RecipientDataError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RecipientDataError'
  }
}

/**
 * The recipients, derived from the blockers themselves rather than kept in a
 * table of their own. The set is whatever has been written after an @, and the
 * expectation for each is the median of the waits they have already closed.
 *
 * THROWS ON A FAILED QUERY, because this one is read on the way IN.
 *
 * An empty list here is not a quiet page, it is a silent write: `settleRecipient`
 * canonicalises against this set, so with nothing in it «project board» is a
 * recipient nobody has heard of rather than the one already called «Project
 * Board». The spelling is settled on write precisely so the two can never
 * split, and a failed read would split them without anything on screen
 * changing. The chart on /blockers is the whole reason the blocker is an entity,
 * and a split number argues for less than the truth.
 */
export async function readRecipients(
  supabase: SupabaseClient,
): Promise<Recipient[]> {
  const res = await supabase
    .from('v_blocker_days')
    .select('waiting_on, waiting_on_type, days_blocked, is_active')

  const failure = firstError([res])
  if (failure) throw new RecipientDataError(failure)

  const rows = (res.data ?? []) as Row[]
  const byKey = new Map<
    string,
    { name: string; open: number; all: number[]; closed: number[]; types: WaitingOnType[] }
  >()

  for (const r of rows) {
    const name = normaliseName(r.waiting_on ?? '')
    if (name === '') continue
    const key = name.toLowerCase()
    const bucket = byKey.get(key) ?? { name, open: 0, all: [], closed: [], types: [] }
    bucket.all.push(r.days_blocked)
    if (r.waiting_on_type && r.waiting_on_type !== 'other') bucket.types.push(r.waiting_on_type)
    if (r.is_active) bucket.open += 1
    else bucket.closed.push(r.days_blocked)
    byKey.set(key, bucket)
  }

  return [...byKey.values()]
    .map((b) => ({
      name: b.name,
      type: settledType(b.name, b.types),
      open: b.open,
      totalDays: b.all.reduce((sum, d) => sum + d, 0),
      medianDays: medianWait(b.closed),
    }))
    .sort((a, b) => b.totalDays - a.totalDays || a.name.localeCompare(b.name))
}

/**
 * The type a recipient is known by: whichever non-«other» type has been chosen
 * most often for them, falling back to the keyword guess. One correction on one
 * blocker therefore fixes the whole group, retroactively.
 */
function settledType(name: string, chosen: WaitingOnType[]): WaitingOnType {
  if (chosen.length === 0) return guessWaitingOnType(name)

  const counts = new Map<WaitingOnType, number>()
  for (const t of chosen) counts.set(t, (counts.get(t) ?? 0) + 1)

  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]
}

/**
 * Settle the spelling, and put a date on the wait if the recipient has a track
 * record to put one on.
 *
 * A hand typed lead time is a wish; this is the measurement. Without history
 * `expected_by` stays null, because Off Track has to mean something and a date
 * nobody has earned would fire the light on a schedule no one chose.
 */
export async function settleRecipient(
  supabase: SupabaseClient,
  raw: string,
  today: string,
): Promise<{ name: string; type: WaitingOnType; expectedBy: string | null }> {
  const recipients = await readRecipients(supabase)
  const name = canonicalRecipient(
    raw,
    recipients.map((r) => r.name),
  )

  const match = recipients.find(
    (r) => r.name.toLowerCase() === name.toLowerCase(),
  )

  return {
    name,
    type: match?.type ?? guessWaitingOnType(name),
    expectedBy: match?.medianDays ? addDays(today, match.medianDays) : null,
  }
}
