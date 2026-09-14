import {
  costPicture,
  count,
  formatMoney,
  kroner,
  payback,
  unpricedShare,
  type CostRoll,
} from './cost.ts'

let failed = 0
function check(name: string, got: unknown, expected: unknown) {
  if (JSON.stringify(got) === JSON.stringify(expected)) console.log(`ok    ${name}`)
  else {
    failed++
    console.log(`FAIL  ${name}\n      expected: ${JSON.stringify(expected)}\n      got:      ${JSON.stringify(got)}`)
  }
}

const roll = (over: Partial<CostRoll> = {}): CostRoll => ({
  once_estimated: 0,
  once_quoted: 0,
  once_ordered: 0,
  once_invoiced: 0,
  once_committed: 0,
  once_priced: 0,
  once_with_paper: 0,
  annual_committed: 0,
  annual_priced: 0,
  capex_once_priced: 0,
  capex_once_committed: 0,
  capex_annual_priced: 0,
  opex_once_priced: 0,
  opex_once_committed: 0,
  opex_annual_priced: 0,
  opex_annual_committed: 0,
  once_items: 0,
  annual_items: 0,
  items: 0,
  ...over,
})

const pic = (r: Partial<CostRoll>, approved: number | null, planned: number | null) =>
  costPicture({ roll: roll(r), approved, planned })

// --- How much of the plan is still a guess ----------------------------------
check('nothing priced yet leaves the whole plan open', pic({}, null, 1_450_000).unpriced, 1_450_000)
check(
  'priced items eat into the plan',
  pic({ once_priced: 620_000 }, null, 1_450_000).unpriced,
  830_000,
)
check('no plan, nothing to measure against', pic({ once_priced: 620_000 }, null, null).unpriced, null)

// Once the items pass the plan the answer is not «minus fifty thousand left to
// price», it is that the plan is wrong.
check('passing the plan does not go negative', pic({ once_priced: 1_500_000 }, null, 1_450_000).unpriced, 0)
check('passing the plan is reported as over', pic({ once_priced: 1_500_000 }, null, 1_450_000).over, 50_000)
check('under the plan is not over', pic({ once_priced: 900_000 }, null, 1_450_000).over, null)

// The plan is an investment figure. Subtracting a yearly licence from it would
// be subtracting a rate from an amount.
check(
  'a running cost never eats into the plan',
  pic({ annual_priced: 200_000, annual_committed: 200_000 }, null, 1_450_000).unpriced,
  1_450_000,
)

// --- Against the grant ------------------------------------------------------
check(
  'a quote alone does not breach the grant',
  pic({ once_quoted: 900_000, once_priced: 900_000 }, 500_000, null).overApproved,
  null,
)
check(
  'committed beyond the grant is reported',
  pic({ once_committed: 620_000, once_priced: 620_000 }, 500_000, null).overApproved,
  120_000,
)

// An investment board approves a purchase, not next year's operating budget.
check(
  'a running cost is never charged to the grant',
  pic({ annual_committed: 900_000, annual_priced: 900_000 }, 500_000, null).overApproved,
  null,
)

// --- The share --------------------------------------------------------------
check('share of the plan still unpriced', unpricedShare(pic({ once_priced: 725_000 }, null, 1_450_000)), 50)
check('no plan gives no share', unpricedShare(pic({ once_priced: 5 }, null, null)), null)

// --- Payback ----------------------------------------------------------------
check(
  'without a running cost it is the old sum',
  payback({ investment: 1_400_000, annualBenefit: 400_000, annualRunning: 0 }),
  3.5,
)

// A saving of 10 000 a year against a licence of 9 600 a year is not a saving
// of 10 000.
check(
  'the running cost comes off the saving',
  payback({ investment: 100_000, annualBenefit: 10_000, annualRunning: 5_000 }),
  20,
)

// The old formula quietly assumed the thing costs nothing to run, and would
// have answered «ten years» to a project that never pays for itself.
check(
  'a running cost that eats the benefit means no payback',
  payback({ investment: 100_000, annualBenefit: 10_000, annualRunning: 9_600 }),
  250,
)
check(
  'a running cost above the benefit never pays back',
  payback({ investment: 100_000, annualBenefit: 10_000, annualRunning: 12_000 }),
  null,
)
check(
  'breaking exactly even never pays back either',
  payback({ investment: 100_000, annualBenefit: 10_000, annualRunning: 10_000 }),
  null,
)
check('no investment, no answer', payback({ investment: null, annualBenefit: 400_000, annualRunning: 0 }), null)
check('no benefit, no answer', payback({ investment: 1_000, annualBenefit: null, annualRunning: 0 }), null)

// --- Formatting -------------------------------------------------------------
check('whole amounts carry no decimals', formatMoney(38_000, 'DKK'), '38,000 DKK')
check('an amount with ore keeps them', formatMoney(4_200.5, 'DKK'), '4,200.50 DKK')
check('the currency comes from the project', formatMoney(1_200, 'EUR'), '1,200 EUR')

/*
 * Danish grouping, and no unit. Four files carried a copy of this and one of
 * them had already drifted to including the «kr», which is why it is here.
 */
check('whole kroner are grouped, not suffixed', kroner(19_200), '19.200')
check('and rounded, because a saving is not to the ore', kroner(19_200.6), '19.201')
check('a small number is left alone', kroner(48), '48')
check('a count groups the same way', count(465_216), '465.216')

console.log(failed === 0 ? '\nAll tests passed.' : `\n${failed} test(s) failed.`)
process.exitCode = failed === 0 ? 0 : 1
