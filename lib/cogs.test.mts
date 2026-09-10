import {
  annualDkk,
  basisCoversTarget,
  impactOf,
  scopesAgree,
  targetAnnual,
  targetInHours,
  type Reference,
} from './cogs.ts'

let failed = 0
function check(name: string, got: unknown, expected: unknown) {
  if (JSON.stringify(got) === JSON.stringify(expected)) console.log(`ok    ${name}`)
  else {
    failed++
    console.log(
      `FAIL  ${name}\n      expected: ${JSON.stringify(expected)}\n      got:      ${JSON.stringify(got)}`,
    )
  }
}
const round = (n: number, places = 4) => Math.round(n * 10 ** places) / 10 ** places

/**
 * The real FY26 figures, from the company's own COGS dashboard.
 *
 * 266 253 is PROCESSED units - the divisor the 577,70 kr unit cost is computed
 * with - in the slice that dashboard was filtered to. It is not units sold, and
 * it was labelled as such here for a day on nothing but an assumption.
 */
const FY26: Reference = {
  fiscalYear: 'FY26',
  costBasisUnits: 266_253,
  scope: 'In-house · Sugar',
  // What the strategy covers is wider than what the figure counts, so this
  // reference is knowingly flattering. Named, not corrected.
  targetScope: 'Sukkerroefrø · hele virksomheden',
  hourRateDkk: 240,
  eurRate: 7.46,
  targetEurPerUnit: 1,
}

// --- What the strategy is worth ---------------------------------------------
check('the target in euro', targetAnnual(FY26)?.eur, 266_253)
check(
  'and in kroner',
  round(targetAnnual(FY26)!.dkk, 0),
  round(266_253 * 7.46, 0),
)

/*
 * The number that changes the conversation. Meeting a one euro per unit target
 * on labour alone would take about five people, every year, for ever. It says
 * out loud that the target cannot be reached by saving time.
 */
check('the target in man-hours', Math.round(targetInHours(FY26)!), 8_276)

// --- Hours, which is how ideas usually arrive -------------------------------
check('a hundred hours a year', annualDkk({ kind: 'hours', hoursPerYear: 100 }, FY26), 24_000)

check(
  'two hundred hours is 2.4% of the year',
  round(impactOf({ kind: 'hours', hoursPerYear: 200 }, FY26)!.shareOfTarget * 100, 1),
  2.4,
)

check(
  'a thousand hours is 12.1%',
  round(impactOf({ kind: 'hours', hoursPerYear: 1000 }, FY26)!.shareOfTarget * 100, 1),
  12.1,
)

// --- Per processed unit, where the stage volume matters ---------------------
check(
  'a krone per cleaned unit',
  annualDkk({ kind: 'perUnit', dkkPerUnit: 1, stageUnits: 465_216 }, FY26),
  465_216,
)

/*
 * The same saving is worth 68% more on the cleaning line than on coating,
 * because the stages do not run the same quantities. That is a fact about the
 * process, not about the idea, and it is the thing a spreadsheet loses.
 */
const cleaning = impactOf({ kind: 'perUnit', dkkPerUnit: 1, stageUnits: 465_216 }, FY26)!
const coating = impactOf({ kind: 'perUnit', dkkPerUnit: 1, stageUnits: 277_393 }, FY26)!
check(
  'the same saving is worth more where more units pass',
  round(cleaning.shareOfTarget / coating.shareOfTarget, 2),
  1.68,
)

// --- The waste example, which is where the money actually is ----------------
/*
 * Pelleting waste runs at 3.6% of a seed cost of 243.5 kr per sold unit.
 * Halving it is 4.38 kr per unit, and that one thing is over half the target.
 */
check(
  'halving pelleting waste is most of the year',
  round(
    impactOf(
      { kind: 'annual', dkkPerYear: 243.5 * 0.036 * 0.5 * 266_253 },
      FY26,
    )!.shareOfTarget * 100,
    0,
  ),
  59,
)

// --- An annual figure passes straight through -------------------------------
check(
  'a million kroner a year',
  round(impactOf({ kind: 'annual', dkkPerYear: 1_000_000 }, FY26)!.eurPerUnit, 4),
  round(1_000_000 / 7.46 / 266_253, 4),
)

check(
  'one euro per sold unit is the whole target',
  round(impactOf({ kind: 'annual', dkkPerYear: 266_253 * 7.46 }, FY26)!.shareOfTarget, 4),
  1,
)

// --- Missing terms ----------------------------------------------------------
/*
 * Null rather than zero. A saving per processed unit with no volume behind it
 * is not worth nothing, it is not yet known, and the difference is the
 * difference between an idea that has been assessed and one that has not.
 */
check(
  'a per-unit saving with no volume is unknown',
  annualDkk({ kind: 'perUnit', dkkPerUnit: 2, stageUnits: Number.NaN }, FY26),
  null,
)

check(
  'no rate, no answer',
  impactOf({ kind: 'hours', hoursPerYear: 100 }, { ...FY26, eurRate: 0 }),
  null,
)

check(
  'no volume, no answer',
  impactOf({ kind: 'annual', dkkPerYear: 100_000 }, { ...FY26, costBasisUnits: 0 }),
  null,
)

// A cost increase is a negative saving, and the arithmetic must carry it.
check(
  'a negative saving stays negative',
  impactOf({ kind: 'annual', dkkPerYear: -500_000 }, FY26)!.shareOfTarget < 0,
  true,
)

// --- The denominator does not cover what the strategy covers -----------------
/*
 * Both errors point the same way and both flatter: the target is
 * costBasisUnits x 1 euro, so too small a denominator UNDERSTATES it, and every
 * share divides by the same figure, so each idea is OVERSTATED against it. A
 * smaller mountain with every step up it looking longer.
 */
check('a filtered basis does not cover the whole strategy', basisCoversTarget(FY26), false)
check(
  'and it does once the two are the same population',
  basisCoversTarget({ ...FY26, scope: 'Sukkerroefrø · hele virksomheden' }),
  true,
)
check(
  'an unrecorded scope is not evidence of a mismatch',
  basisCoversTarget({ ...FY26, targetScope: null }),
  true,
)

// --- Two populations, which is the live hazard -------------------------------
/*
 * The stage volumes are unfiltered and the cost basis is not. Multiplying by one
 * and dividing by the other overstates the share, and neither number can say so
 * on its own, so the arithmetic reports the mismatch rather than correcting it:
 * correcting it would need a filtered stage volume nobody has.
 */
check('the same population is comparable', scopesAgree(FY26, 'In-house · Sugar'), true)
check('spacing and case do not make it a different one', scopesAgree(FY26, ' in-house · sugar '), true)
check('a wider population is not', scopesAgree(FY26, 'Alle typer'), false)
check('and an unstated one is not claimed either way', scopesAgree(FY26, null), true)

console.log(failed === 0 ? '\nAll tests passed.' : `\n${failed} test(s) failed.`)
process.exitCode = failed === 0 ? 0 : 1
