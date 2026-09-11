import {
  approvalVariance,
  formatAmount,
  formatYears,
  readIdentity,
  splitList,
} from './identity.ts'

let failed = 0
function check(name: string, got: unknown, expected: unknown) {
  if (JSON.stringify(got) === JSON.stringify(expected)) {
    console.log(`ok    ${name}`)
  } else {
    failed++
    console.log(
      `FEJL  ${name}\n      ventet: ${JSON.stringify(expected)}\n      fik:    ${JSON.stringify(got)}`,
    )
  }
}

// --- Reading must survive anything ---------------------------------------
const tom = readIdentity(null)
check('empty reporting gives empty fields', tom.admin, {})
check('empty reporting gives the default unit', tom.economics.currency, 'EUR')
/*
 * The typed priority was removed: there is one priority in this application and
 * it is derived. What still has to hold is that a project carrying the old key
 * in its jsonb reads back without it, rather than having it quietly surface
 * again the next time somebody adds a field by that name.
 */
check(
  'a leftover priority key is not read back',
  Object.keys(readIdentity({ priority: 'High' })).includes('priority'),
  false,
)
check(
  'numbers that are not numbers become null',
  readIdentity({ economics: { benefit: 'mange' } }).economics.benefit,
  null,
)
check(
  'people are read from their own space',
  readIdentity({ people: { project_owner: 'Kvalitet', ukendt: 'x' } }).people,
  { project_owner: 'Kvalitet' },
)

// --- Formatting -----------------------------------------------------------
check('thousands separator', formatAmount(1400, 'EUR'), '1,400 EUR')
check('years rounded to one decimal', formatYears(1.85), '1.9 years')

// --- Lists ----------------------------------------------------------------
check('a comma splits', splitList('Vedligehold, Kvalitet , Indkøb'), ['Vedligehold', 'Kvalitet', 'Indkøb'])
check('empty parts are dropped', splitList('Vedligehold,,  ,Kvalitet'), ['Vedligehold', 'Kvalitet'])
check('an empty string gives an empty list', splitList(''), [])
check('undefined gives an empty list', splitList(undefined), [])

// --- Location -------------------------------------------------------------
check('location is read', readIdentity({ location: 'Hal 3' }).location, 'Hal 3')
check('an empty location becomes null', readIdentity({ location: '   ' }).location, null)
check('no location at all', readIdentity({}).location, null)

// --- Approval -------------------------------------------------------------
check('with no grant the state is not applied', readIdentity({}).approval, {
  state: 'Not applied',
  decided_on: null,
  amount: null,
  by: null,
})
check(
  'an invalid state falls back',
  readIdentity({ approval: { state: 'Maybe' } }).approval.state,
  'Not applied',
)
check(
  'approval is read whole',
  readIdentity({
    approval: {
      state: 'Approved',
      decided_on: '2026-09-06',
      amount: 1400,
      by: 'Ledelsen',
    },
  }).approval,
  { state: 'Approved', decided_on: '2026-09-06', amount: 1400, by: 'Ledelsen' },
)

const estimat = { benefit: null, cost: 1200, currency: 'EUR' } as const
check(
  'room between the grant and the estimate',
  approvalVariance({ state: 'Approved', decided_on: null, amount: 1400, by: null }, estimat),
  200,
)
check(
  'the estimate has run past the grant',
  approvalVariance({ state: 'Approved', decided_on: null, amount: 1000, by: null }, estimat),
  -200,
)
check(
  'with no amount granted there is nothing to compare',
  approvalVariance({ state: 'Applied', decided_on: null, amount: null, by: null }, estimat),
  null,
)
check(
  'with no estimate there is nothing to compare',
  approvalVariance(
    { state: 'Approved', decided_on: null, amount: 1400, by: null },
    { benefit: null, cost: null, currency: 'EUR' },
  ),
  null,
)

console.log(failed === 0 ? '\nAll tests passed.' : `\n${failed} test(s) failed.`)
process.exitCode = failed === 0 ? 0 : 1
