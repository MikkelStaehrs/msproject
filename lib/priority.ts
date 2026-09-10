/**
 * The company's own way of ranking a candidate project.
 *
 * Three judgements on a one to five scale, and a score built from them. The
 * formula was not written down anywhere: it was recovered from a spreadsheet of
 * fourteen candidates by working out what fitted, and it fits all fourteen with
 * no exceptions.
 *
 *     Priority = 2 x Benefit - Cost - Complexity
 *
 * Benefit counts double, cost and complexity once each, so the ranking says
 * "worth it, discounted by what it takes" rather than "cheap". A score can be
 * negative, and one of the fourteen is: that is the scale working, not a fault.
 *
 * It is DERIVED, which is the whole reason it belongs here. In the spreadsheet
 * it is a column, and a column can be stale: change a benefit and the score
 * beside it keeps whatever it said. Here you cannot get the two out of step.
 */

/** The three judgements. One to five, and only a person can make them. */
export type Judgement = {
  /** What it takes to do, 1 cheap to 5 expensive. */
  cost: number | null
  /** What it is worth, 1 marginal to 5 large. */
  benefit: number | null
  /** How hard it is to get right, 1 simple to 5 hairy. */
  complexity: number | null
}

const inScale = (n: number | null): n is number =>
  n !== null && Number.isFinite(n) && n >= 1 && n <= 5

/**
 * The score, or null until all three have been judged.
 *
 * Null rather than a partial sum on purpose. Two judgements out of three would
 * produce a number that looks comparable to a complete one and is not, and a
 * ranked list where some rows are missing a term is worse than a list with
 * gaps in it.
 */
export function priorityScore(j: Judgement): number | null {
  if (!inScale(j.cost) || !inScale(j.benefit) || !inScale(j.complexity)) return null
  return 2 * j.benefit - j.cost - j.complexity
}

/**
 * The quadrant: benefit against complexity.
 *
 * Recovered wrongly the first time. Across the fourteen candidates the label
 * followed benefit alone, so that is what the first version did, and it fitted
 * every row. It fitted because every one of those fourteen happens to sit at
 * complexity three or below: the other half of the grid had simply never been
 * used, and a rule inferred from data that never exercises it is a rule you do
 * not have.
 *
 * The matrix itself settles it:
 *
 *                     Low complexity 1-3    High complexity 4-5
 *   High benefit 4-5      Quick win              Big bet
 *   Low benefit 1-3       Fill-in                Money pit
 *
 * Worth keeping as a lesson: fourteen for fourteen felt like proof and was a
 * coincidence of coverage.
 */
export const QUADRANTS = ['Quick win', 'Big bet', 'Fill-in', 'Money pit'] as const
export type Quadrant = (typeof QUADRANTS)[number]

export function quadrant(j: Judgement): Quadrant | null {
  if (!inScale(j.benefit) || !inScale(j.complexity)) return null

  const worthIt = j.benefit >= 4
  const hard = j.complexity >= 4

  if (worthIt) return hard ? 'Big bet' : 'Quick win'
  return hard ? 'Money pit' : 'Fill-in'
}

/**
 * Highest score first, and among equals the bigger benefit.
 *
 * The tie-break matters more than it looks: a score of one is reached both by a
 * large benefit that costs a lot and by a small benefit that costs little, and
 * those are not the same candidate. Unscored ones go last rather than being
 * treated as zero.
 */
export function byPriority<T extends Judgement>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const sa = priorityScore(a)
    const sb = priorityScore(b)
    if (sa === null && sb === null) return 0
    if (sa === null) return 1
    if (sb === null) return -1
    if (sa !== sb) return sb - sa
    return (b.benefit ?? 0) - (a.benefit ?? 0)
  })
}
