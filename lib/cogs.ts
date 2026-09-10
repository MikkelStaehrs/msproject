/**
 * What an idea is worth, in the one currency the strategy is written in.
 *
 * The target is to take 1 euro of COGS out of every unit, every year. So
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
 *   kroner a year / eur rate / cost basis units = euro per unit
 *
 * THE DENOMINATOR IS THE ONE THE UNIT COST USES, and getting this wrong is the
 * easiest way to make every figure here quietly meaningless. «Take one euro of
 * COGS out of every unit» can only be subtracted from «577,70 kr per unit» if
 * both are per the SAME unit. On the FY26 COGS dashboard that divisor is
 * labelled «Units» and counts PROCESSED units in one filtered slice - In-house,
 * Sugar - which is why this field is called the cost basis and not units sold.
 * It was called `soldUnits` for a day, on nothing but an assumption, and the
 * name was the only evidence anybody had for it.
 *
 * IT IS ALSO FROZEN, which is a separate point and not a detail. Volume through
 * shipping fell 23% from FY25 to FY26, and the indirect cost per unit rose about
 * 33 kroner because of it: roughly four and a half times the entire annual
 * target, from volume alone. Measured against whatever volume happens to be
 * current, every project would look better in a bad year and worse in a good one
 * having changed nothing. So a saving is held in absolute kroner and converted
 * at a stated reference volume, exactly as a cost line holds the rate that
 * applied when the price landed.
 *
 * AND THE TWO POPULATIONS MUST MATCH. A stage volume is unfiltered - Rensning
 * ran 465 216 units of everything - while the cost basis counts one slice of
 * that. Multiplying by the first and dividing by the second mixes populations
 * and overstates the share. Neither number knows this, so both carry a scope
 * and the pages that show a share say which.
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
  /**
   * The divisor the unit cost is computed with: PROCESSED units, in `scope`.
   * The denominator, and it does not float.
   */
  costBasisUnits: number
  /** Which population that counts, e.g. «In-house · Sugar». Null where unsaid. */
  scope: string | null
  /**
   * What the strategy actually covers. Where this is wider than `scope`, the
   * denominator is too small: the target comes out understated and every share
   * of it overstated. Both errors flatter, which is why it is named rather than
   * quietly carried.
   */
  targetScope: string | null
  /** Kroner per man-hour. */
  hourRateDkk: number
  /** Kroner per euro, as used for this reference. */
  eurRate: number
  /** What the strategy asks for, per unit, per year. */
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
    !finite(reference.costBasisUnits) ||
    reference.costBasisUnits <= 0 ||
    !finite(reference.targetEurPerUnit) ||
    reference.targetEurPerUnit <= 0
  ) {
    return null
  }

  const eurPerUnit = annual / reference.eurRate / reference.costBasisUnits

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
    !finite(reference.costBasisUnits) ||
    !finite(reference.targetEurPerUnit) ||
    !finite(reference.eurRate)
  ) {
    return null
  }
  const eur = reference.costBasisUnits * reference.targetEurPerUnit
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

// ---------------------------------------------------------------------------
// From stored rows to the shapes above.
//
// These live here rather than on a page because two pages now need them, and a
// reference assembled twice is a reference that eventually differs. They take
// structural arguments rather than the row types so this file keeps its one
// job and no imports.
// ---------------------------------------------------------------------------

/**
 * The yardstick row as a Reference, or null where there is no yardstick.
 *
 * Null rather than a set of sensible defaults. A saving measured against a made
 * up denominator is worse than a saving with no figure beside it: the first
 * looks like an answer.
 */
export function referenceFrom(
  y: {
    fiscal_year: string
    cost_basis_units: number | string
    cost_basis_scope?: string | null
    target_scope?: string | null
    hour_rate_dkk: number | string
    eur_rate: number | string
    cogs_target_eur_per_unit: number | string
  } | null,
): Reference | null {
  if (y === null) return null
  return {
    fiscalYear: y.fiscal_year,
    costBasisUnits: Number(y.cost_basis_units),
    scope: y.cost_basis_scope ?? null,
    targetScope: y.target_scope ?? null,
    hourRateDkk: Number(y.hour_rate_dkk),
    eurRate: Number(y.eur_rate),
    targetEurPerUnit: Number(y.cogs_target_eur_per_unit),
  }
}

/** The stages that ran in the reference year, busiest first. */
export function stagesFrom(
  rows: {
    fiscal_year: string
    stage: string
    units: number | string
    scope?: string | null
  }[],
  fiscalYear: string | null,
): { stage: string; units: number; scope: string | null }[] {
  if (fiscalYear === null) return []
  return rows
    .filter((v) => v.fiscal_year === fiscalYear)
    .map((v) => ({ stage: v.stage, units: Number(v.units), scope: v.scope ?? null }))
    .sort((a, b) => b.units - a.units)
}

/**
 * Whether a saving through a stage can honestly be read as a share of the
 * target.
 *
 * It can when the stage counts the same population the cost basis does. Where
 * they differ - the process dashboard is unfiltered, the COGS one is not - the
 * kroner are still right and the PERCENTAGE is not: a saving spread across
 * every type, divided by a target set for one slice of it, comes out too large.
 *
 * Returned rather than corrected. Correcting it would need a filtered stage
 * volume nobody has, and inventing a ratio to scale by is exactly the kind of
 * guess that put «sold units» in this file in the first place.
 */
/**
 * Whether the figure everything divides by counts what the strategy covers.
 *
 * When it does not, the two errors point the same way and both flatter. The
 * year's target is `costBasisUnits x 1 euro`, so a denominator that is too
 * small UNDERSTATES the target; and every share divides by the same figure, so
 * each idea is OVERSTATED against it. A smaller mountain with every step up it
 * looking longer, and nothing on the screen out of place.
 *
 * True where either is unsaid: an unrecorded scope is not evidence of a
 * mismatch, and treating it as one would put a warning on every page for want
 * of a sentence nobody has written yet.
 */
export function basisCoversTarget(reference: Reference): boolean {
  if (reference.scope === null || reference.targetScope === null) return true
  return reference.scope.trim().toLowerCase() === reference.targetScope.trim().toLowerCase()
}

export function scopesAgree(
  reference: Reference,
  stageScope: string | null,
): boolean {
  if (reference.scope === null || stageScope === null) return true
  return reference.scope.trim().toLowerCase() === stageScope.trim().toLowerCase()
}

/**
 * A stored assessment as a Saving.
 *
 * The `per_unit` case is the reason this is not a one liner: without the volume
 * of the stage it names it cannot become kroner at all, and that is reported as
 * unknown rather than guessed at.
 */
export function savingFrom(
  kind: 'hours' | 'per_unit' | 'annual' | null,
  value: number | string | null,
  stageUnits: number | null,
): Saving | null {
  if (kind === null || value === null) return null
  const n = Number(value)

  switch (kind) {
    case 'hours':
      return { kind: 'hours', hoursPerYear: n }
    case 'annual':
      return { kind: 'annual', dkkPerYear: n }
    case 'per_unit':
      return stageUnits === null ? null : { kind: 'perUnit', dkkPerUnit: n, stageUnits }
  }
}
