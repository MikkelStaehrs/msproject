/**
 * What a strategy adds up to.
 *
 * A strategy is fed by work sitting under several unrelated projects, so none
 * of this can be read off one project. It is assembled from the markings, and
 * the two things worth being careful about are both about not lying upwards.
 *
 * The first is double counting. A marked subproject inside a marked project is
 * one contribution, not two, and `v_strategy_node` decides which marking is the
 * topmost in its branch. Only those are added up here.
 *
 * The second is the missing figure. The expected annual benefit is typed on the
 * PROJECT, under Identity, so a marked subproject has no number of its own and
 * the marking has to carry one. Where neither exists the contribution is
 * unknown, and unknown is reported as unknown rather than as zero. A strategy
 * that quietly counts a blank as nothing is a strategy that reads as further
 * behind than it is, and the first person to notice will stop trusting the
 * whole page.
 */

import type { NodeStatus } from './types.ts'

export type Marking = {
  nodeId: string
  /** False where an ancestor carries the same strategy. Those are not counted. */
  isTop: boolean
  /** Stated on the marking. Overrides the node's own benefit. */
  annualEur: number | null
  /** The node's own expected annual benefit, where it has one. */
  ownBenefit: number | null
  /**
   * What the work promised on the day it became work, in euro.
   *
   * Converted by the caller with lib/cogs, from the raw claim the view carries.
   * It is the oldest of the three and therefore the last to be believed, but it
   * is the only one that exists for a project that came from a spark and has
   * never had its identity page filled in, which is every one of them at first.
   */
  originBenefit: number | null
  status: NodeStatus
  /** Whether the node has an open blocker of its own. */
  blocked: boolean
  /** Committed one-off cost under this node, in euro. */
  investedEur: number
}

/**
 * What one marking promises per year.
 *
 * Three sources, most specific first, and each is a different fact rather than
 * a copy of the one above it.
 *
 * The figure on the MARKING wins, because it was written about this strategy in
 * particular. Then the NODE's own benefit, which makes the common case, a whole
 * project serving one strategy, need no second number anywhere. Then what was
 * CLAIMED on the day the work started.
 *
 * The last one is why this function changed. Mark a promoted idea as serving
 * COGS and the total used to report it as unquantified, because the saving sat
 * on the spark and on node_origin and the sum read neither. The number was in
 * the database twice and the page that adds up could see no copy of it.
 *
 * It is last because it is the oldest and the least considered: a claim made
 * while the thing was still an idea. It is not copied into the node, because a
 * figure copied once keeps whatever it said after the rate, the stage volume or
 * the estimate moves underneath it.
 */
export function contributionOf(m: Marking): number | null {
  if (m.annualEur !== null) return m.annualEur
  if (m.ownBenefit !== null) return m.ownBenefit
  return m.originBenefit
}

/**
 * Which of the three answered, so a page can say so.
 *
 * A figure with no provenance invites the reader to assume the most considered
 * source. «What was claimed when this started» and «what the project says it
 * will deliver» are different promises with different ages, and a strategy
 * total built mostly from the first should say that out loud rather than read
 * as though somebody sat down and worked it out last week.
 */
export type Provenance = 'marking' | 'node' | 'origin' | 'none'

export function provenanceOf(m: Marking): Provenance {
  if (m.annualEur !== null) return 'marking'
  if (m.ownBenefit !== null) return 'node'
  if (m.originBenefit !== null) return 'origin'
  return 'none'
}

export type StrategyPicture = {
  /** Markings that count. Nested ones are already excluded. */
  counted: number
  /** Annual euro promised, from the markings that carry a figure. */
  promised: number
  /** Markings that count but carry no figure at all. */
  unquantified: number
  /** Of `promised`, the part coming from work that is finished. */
  delivered: number
  /** Committed one-off euro spent to get it. */
  invested: number
  /** Markings that are blocked or on hold. */
  stalled: number
  /** What the strategy is measured against. */
  target: number | null
  /**
   * Target minus promised. Positive is what is still unaccounted for, negative
   * means more has been promised than the target asks. Null where there is no
   * target, or where something counted has no figure: a gap computed from an
   * incomplete sum is a number that reads as precise and is not.
   */
  shortfall: number | null
}

export function strategyPicture(
  markings: Marking[],
  target: number | null,
): StrategyPicture {
  const counted = markings.filter((m) => m.isTop)

  let promised = 0
  let delivered = 0
  let unquantified = 0
  let invested = 0
  let stalled = 0

  for (const m of counted) {
    invested += m.investedEur
    if (m.blocked || m.status === 'paused') stalled++

    const c = contributionOf(m)
    if (c === null) {
      unquantified++
      continue
    }
    promised += c
    if (m.status === 'done') delivered += c
  }

  return {
    counted: counted.length,
    promised,
    unquantified,
    delivered,
    invested,
    stalled,
    target,
    shortfall: target === null || unquantified > 0 ? null : target - promised,
  }
}

/**
 * How much of the promise rests on work nobody has started.
 *
 * Not a warning in itself. A strategy announced in September is supposed to be
 * mostly ahead of itself; the same share in June is the thing to look at.
 */
export function notStartedShare(markings: Marking[]): number | null {
  const counted = markings.filter((m) => m.isTop)
  let total = 0
  let ahead = 0
  for (const m of counted) {
    const c = contributionOf(m)
    if (c === null) continue
    total += c
    if (m.status === 'idea' || m.status === 'planned') ahead += c
  }
  return total <= 0 ? null : ahead / total
}
