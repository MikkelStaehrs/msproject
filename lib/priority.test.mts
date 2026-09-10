import { byPriority, priorityScore, quadrant } from './priority.ts'

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

/*
 * The fourteen candidates from the company's own spreadsheet, with the score
 * and the label it shows against each. This is the whole justification for the
 * formula: it was recovered from these rows, so these rows are the test. If a
 * change here breaks one of them, the change is wrong, not the row.
 */
const SHEET: [string, number, number, number, number, string][] = [
  ['Predictive model on germination testing', 2, 5, 2, 6, 'Quick win'],
  ['Monitor OEE in cleaning', 3, 3, 2, 1, 'Fill-in'],
  ['Uni labeling in DK', 2, 3, 2, 2, 'Fill-in'],
  ['Reduce re-clean BE by 80% using CT data', 2, 4, 3, 3, 'Quick win'],
  ['SeedInspector automated AI classification', 2, 4, 3, 3, 'Quick win'],
  ['Mix before pelleting', 4, 3, 2, 0, 'Fill-in'],
  ['Mix and pack in-line', 4, 3, 2, 0, 'Fill-in'],
  ['Single or dual layer pellet', 5, 4, 2, 1, 'Quick win'],
  ['Harmonizing seed color supplier', 3, 3, 2, 1, 'Fill-in'],
  ['Seed processing with CT data', 2, 4, 2, 4, 'Quick win'],
  ['Digitalization of internal purity analysis', 3, 3, 1, 2, 'Fill-in'],
  ['Polishers cleaning', 4, 4, 1, 3, 'Quick win'],
  ['Expanding roll priming capacity', 4, 3, 1, 1, 'Fill-in'],
  ['ALFA rensemaskine i sliberi', 5, 3, 2, -1, 'Fill-in'],
]

for (const [name, cost, benefit, complexity, score, label] of SHEET) {
  check(`${name}: score`, priorityScore({ cost, benefit, complexity }), score)
  check(`${name}: quadrant`, quadrant({ cost, benefit, complexity }), label)
}

// --- Incomplete judgements --------------------------------------------------
check(
  'nothing judged yet',
  priorityScore({ cost: null, benefit: null, complexity: null }),
  null,
)

/*
 * Two out of three is not a score. A partial sum looks comparable to a complete
 * one and is not, and a ranked list where some rows are missing a term is worse
 * than a list with gaps in it.
 */
check(
  'two of three is not a score',
  priorityScore({ cost: 2, benefit: 4, complexity: null }),
  null,
)

check('off the scale is not a judgement', priorityScore({ cost: 0, benefit: 4, complexity: 2 }), null)
check('above the scale either', priorityScore({ cost: 2, benefit: 6, complexity: 2 }), null)

/*
 * The half of the grid the sheet has never used. The first version of this
 * function inferred the rule from those fourteen rows alone, all of which sit
 * at complexity three or below, and got it wrong in a way no row could catch.
 */
check('high benefit, hard: a big bet', quadrant({ cost: 2, benefit: 5, complexity: 4 }), 'Big bet')
check('low benefit, hard: a money pit', quadrant({ cost: 2, benefit: 2, complexity: 5 }), 'Money pit')
check('the boundary is four, not three', quadrant({ cost: 2, benefit: 4, complexity: 3 }), 'Quick win')
check('and four is already hard', quadrant({ cost: 2, benefit: 4, complexity: 4 }), 'Big bet')

check('no quadrant without a benefit', quadrant({ cost: 2, benefit: null, complexity: 2 }), null)
check('nor without a complexity', quadrant({ cost: 2, benefit: 5, complexity: null }), null)

// A negative score is the scale working, not a fault. One real candidate has one.
check('a negative score is allowed', priorityScore({ cost: 5, benefit: 3, complexity: 2 }), -1)

// --- Ordering ---------------------------------------------------------------
const named = (n: string, cost: number, benefit: number, complexity: number) => ({
  n,
  cost,
  benefit,
  complexity,
})

check(
  'highest score first',
  byPriority([named('low', 4, 3, 2), named('high', 2, 5, 2)]).map((x) => x.n),
  ['high', 'low'],
)

/*
 * A score of one is reached both by a large benefit that costs a lot and by a
 * small benefit that costs little. Those are not the same candidate, and the
 * bigger benefit goes first.
 */
check(
  'among equal scores the bigger benefit wins',
  byPriority([named('small', 3, 3, 2), named('big', 5, 4, 2)]).map((x) => x.n),
  ['big', 'small'],
)

check(
  'unscored go last rather than counting as zero',
  byPriority([
    { n: 'unscored', cost: null, benefit: null, complexity: null },
    named('negative', 5, 3, 2),
  ]).map((x) => x.n),
  ['negative', 'unscored'],
)

console.log(failed === 0 ? '\nAll tests passed.' : `\n${failed} test(s) failed.`)
process.exitCode = failed === 0 ? 0 : 1
