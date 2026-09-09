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
 * Quick win, or a fill-in.
 *
 * Here the recovered rule is thinner than the name suggests, and it is worth
 * being straight about that. Across all fourteen candidates the label follows
 * BENEFIT ALONE: four or five is a quick win, three or below is a fill-in. Cost
 * does not discriminate at all, and one candidate with a cost of five is
 * labelled a quick win.
 *
 * So this reproduces what the sheet does rather than what a two by two would
 * normally do. If the real rule has four names and a cost threshold, this is
 * the function to correct, and the label it produces would change for rows
 * nobody has scored that way yet.
 */
export const QUADRANTS = ['Quick win', 'Fill-in'] as const
export type Quadrant = (typeof QUADRANTS)[number]

export function quadrant(j: Judgement): Quadrant | null {
  if (!inScale(j.benefit)) return null
  return j.benefit >= 4 ? 'Quick win' : 'Fill-in'
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
