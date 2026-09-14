/**
 * What the money looks like, once there are line items.
 *
 * Three numbers claim to be «the cost» and they mean different things:
 *
 *   approved  what the board granted. A fact with a date on it.
 *   planned   what you told them it would be. A guess, and it ages.
 *   priced    what the line items add up to. A guess replacing itself.
 *
 * The interesting figure is none of those. It is how much of the plan has not
 * been priced yet, because that is the part still capable of surprising you.
 */

export type CostRoll = {
  /** The investment, in whole amounts. What the grant covers. */
  once_estimated: number
  once_quoted: number
  once_ordered: number
  once_invoiced: number
  once_committed: number
  once_priced: number
  /** How much of the investment has a document attached. Evidence, not state. */
  once_with_paper: number
  /** What it costs to keep, per year. Never added to the figures above. */
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

export type CostPicture = CostRoll & {
  approved: number | null
  planned: number | null
  /**
   * Planned minus the one-off lines. Null when there is no plan to measure
   * against, and never negative: once the items exceed the plan the answer is
   * not «minus fifty thousand left to price», it is that the plan is wrong.
   *
   * Running costs are deliberately absent. The plan is an investment figure,
   * and subtracting a yearly licence from it would be subtracting a rate from
   * an amount.
   */
  unpriced: number | null
  /** One-off lines beyond the plan. Null while the plan still covers them. */
  over: number | null
  /**
   * Committed one-off money beyond the grant. Running costs never count here:
   * an investment board approves a purchase, not next year's operating budget,
   * and charging a licence to the grant would invent a breach.
   */
  overApproved: number | null
}

export function costPicture(input: {
  roll: CostRoll
  approved: number | null
  planned: number | null
}): CostPicture {
  const { roll, approved, planned } = input

  const unpriced =
    planned === null ? null : Math.max(0, round(planned - roll.once_priced))
  const over =
    planned === null || roll.once_priced <= planned
      ? null
      : round(roll.once_priced - planned)
  const overApproved =
    approved === null || roll.once_committed <= approved
      ? null
      : round(roll.once_committed - approved)

  return { ...roll, approved, planned, unpriced, over, overApproved }
}

/** Currency has two decimals, and floating point does not. */
const round = (n: number) => Math.round(n * 100) / 100

/**
 * How much of the plan is still a guess, as a share.
 *
 * Null without a plan, and null once the items have passed it: a share above
 * one hundred per cent reads as a bar that has broken rather than a number.
 */
export function unpricedShare(p: CostPicture): number | null {
  if (p.planned === null || p.planned <= 0 || p.unpriced === null) return null
  return Math.round((100 * p.unpriced) / p.planned)
}

/**
 * Years to pay the investment back, with the running cost taken off the saving.
 *
 * The old formula was cost divided by benefit, which quietly assumed the thing
 * costs nothing to run. A saving of 10 000 a year against a licence of 9 600 a
 * year is not a saving of 10 000, and where the running cost eats the benefit
 * there is no payback at all. Null says exactly that, and it is a real answer.
 */
export function payback(input: {
  investment: number | null
  annualBenefit: number | null
  annualRunning: number
}): number | null {
  const { investment, annualBenefit, annualRunning } = input
  if (investment === null || annualBenefit === null) return null
  if (investment <= 0) return null

  const net = annualBenefit - annualRunning
  if (net <= 0) return null
  return investment / net
}

/**
 * What one line is worth, in the currency it was written in, and in euro.
 *
 * v_node_cost computes exactly this in SQL, because that is where things are
 * added up. These two exist so no page computes it a fourth time: the quantity
 * arrived and three separate places were already dividing amount by eur_rate on
 * their own, which is how a rule ends up meaning two things. Change the rule
 * here and in the view, and nowhere else.
 *
 * Postgres numerics arrive over the wire as strings, hence the Number().
 */
type Priced = {
  amount: number | string
  quantity: number | string
  eur_rate: number | string
}

export function lineAmount(line: Priced): number {
  return Number(line.amount) * Number(line.quantity)
}

export function lineEur(line: Priced): number {
  const rate = Number(line.eur_rate)
  return lineAmount(line) / (rate > 0 ? rate : 1)
}

/** 38 000 rather than 38000, in whichever currency the project uses. */
export function formatMoney(amount: number, currency: string): string {
  const whole = Number.isInteger(amount)
  return `${new Intl.NumberFormat('en-GB', {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount)} ${currency}`
}

/**
 * Whole kroner, Danish grouping: 19.200 rather than 19200.
 *
 * Separate from `formatMoney` because it answers a different question. That one
 * prices a cost line in whichever currency the project buys in, and names the
 * currency because a number without it is not an amount. This one expresses a
 * saving against the COGS target, which is always in kroner, and the call site
 * says so in its own words: «19.200 kr a year», «19.200 kr». Putting the unit
 * in here would print it twice at three of the four places that use it.
 *
 * It lived as a one line copy in four files, and the copies had already
 * disagreed: one of them included the unit and the others did not. Same reason
 * lib/date.ts exists. The same word computed twice eventually says two things.
 */
export function kroner(n: number): string {
  return new Intl.NumberFormat('da-DK', { maximumFractionDigits: 0 }).format(n)
}

/** A count of things, grouped the same way. Units through a process stage. */
export function count(n: number): string {
  return new Intl.NumberFormat('da-DK').format(n)
}
