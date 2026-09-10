/**
 * What an idea is worth, in the one currency the strategy is written in.
 *
 * The target is to take 1 euro of COGS out of every unit sold, every year. So
 * every idea, however it is described, has to end up as a share of that number,
 * and this is the only place the arithmetic happens.
 *
 * Ideas arrive described in three different ways, and all three funnel into
 * annual kroner before anything else happens. That single hinge is the whole
 * design: convert once, then divide once.
 *
 *   hours saved a year   x  the hourly rate            -> kroner a year
 *   kroner per unit at a stage  x  that stage's volume -> kroner a year
 *   kroner a year                                      -> already there
 *
 * Then:
 *
 *   kroner a year / eur rate / units sold = euro per unit sold
 *
 * THE DENOMINATOR IS FROZEN, and that is not a detail. Units sold fell 23% from
 * FY25 to FY26, and the indirect cost per unit rose about 33 kroner because of
 * it: roughly four and a half times the entire annual target, from volume
 * alone. Measured against whatever volume happens to be current, every project
 * would look better in a bad year and worse in a good one, having changed
 * nothing. So a saving is held in absolute kroner and converted at a stated
 * reference volume, exactly as a cost line holds the rate that applied when the
 * price landed.
 *
 * A stage volume is still needed for the middle case, because the stages do not
 * run the same quantities: cleaning handled 465 216 units in FY26 where coating
 * handled 277 393. The same saving per processed unit is worth 68% more on the
 * cleaning line, and that is a fact about the process rather than about the
 * idea.
 */

export type Reference = {
  /** Which year the figures below are taken from, so the frozen number is named. */
  fiscalYear: string
  /** Units sold in that year. The denominator, and it does not float. */
  soldUnits: number
  /** Kroner per man-hour. */
  hourRateDkk: number
  /** Kroner per euro, as used for this reference. */
  eurRate: number
  /** What the strategy asks for, per unit sold, per year. */
  targetEurPerUnit: number
}

/** How a saving was described. Exactly one of these is filled in. */
export type Saving =
  | { kind: 'hours'; hoursPerYear: number }
  | { kind: 'perUnit'; dkkPerUnit: number; stageUnits: number }
  | { kind: 'annual'; dkkPerYear: number }

export type Impact = {
  /** The hinge. Everything else is derived from this one number. */
  annualDkk: number
  eurPerUnit: number
  /** 1 means this idea alone would meet the year's target. */
  shareOfTarget: number
}

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)

/**
 * Annual kroner, whichever way the saving was put.
 *
 * Null rather than zero where a term is missing. A saving per processed unit
 * with no volume behind it is not worth nothing, it is not yet known, and the
 * difference between those two is the difference between an idea that has been
 * assessed and one that has not.
 */
export function annualDkk(saving: Saving, reference: Reference): number | null {
  switch (saving.kind) {
    case 'hours':
      if (!finite(saving.hoursPerYear) || !finite(reference.hourRateDkk)) return null
      return saving.hoursPerYear * reference.hourRateDkk
    case 'perUnit':
      if (!finite(saving.dkkPerUnit) || !finite(saving.stageUnits)) return null
      return saving.dkkPerUnit * saving.stageUnits
    case 'annual':
      return finite(saving.dkkPerYear) ? saving.dkkPerYear : null
  }
}

export function impactOf(saving: Saving, reference: Reference): Impact | null {
  const annual = annualDkk(saving, reference)
  if (annual === null) return null

  if (
    !finite(reference.eurRate) ||
    reference.eurRate <= 0 ||
    !finite(reference.soldUnits) ||
    reference.soldUnits <= 0 ||
    !finite(reference.targetEurPerUnit) ||
    reference.targetEurPerUnit <= 0
  ) {
    return null
  }

  const eurPerUnit = annual / reference.eurRate / reference.soldUnits

  return {
    annualDkk: annual,
    eurPerUnit,
    shareOfTarget: eurPerUnit / reference.targetEurPerUnit,
  }
}

/**
 * What the whole strategy is worth in a year, at the reference volume.
 *
 * Worth showing beside any single idea, because a share is meaningless without
 * it: 2% of the target is a different conversation when the target is 266 000
 * euro than when it is two million.
 */
export function targetAnnual(reference: Reference): { eur: number; dkk: number } | null {
  if (
    !finite(reference.soldUnits) ||
    !finite(reference.targetEurPerUnit) ||
    !finite(reference.eurRate)
  ) {
    return null
  }
  const eur = reference.soldUnits * reference.targetEurPerUnit
  return { eur, dkk: eur * reference.eurRate }
}

/**
 * How many man-hours a year it would take to meet the target on labour alone.
 *
 * Not a calculation anybody asked for, and the most useful number here. At the
 * FY26 reference it comes out around 8 300 hours, about five people. It says
 * out loud that the target cannot be reached by saving time, which is worth
 * knowing before a quarter goes into an idea that is three per cent of it.
 */
export function targetInHours(reference: Reference): number | null {
  const target = targetAnnual(reference)
  if (target === null || !finite(reference.hourRateDkk) || reference.hourRateDkk <= 0) {
    return null
  }
  return target.dkk / reference.hourRateDkk
}
