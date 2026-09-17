import {
  buildStatusComment,
  isoWeek,
  progressSignal,
  toSnapshot,
  toStatusUpdate,
} from './report.ts'

let failed = 0
function check(name: string, got: unknown, expected: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(expected)
  if (ok) {
    console.log(`ok    ${name}`)
  } else {
    failed++
    console.log(
      `FAIL  ${name}\n      expected: ${JSON.stringify(expected)}\n      got:      ${JSON.stringify(got)}`,
    )
  }
}

// --- The week -------------------------------------------------------------
check('the week for Tuesday 1 September 2026', isoWeek('2026-09-01'), {
  start: '2026-08-31',
  end: '2026-09-06',
  number: 36,
})
check('Monday belongs to its own week', isoWeek('2026-08-31').start, '2026-08-31')
check('Sunday belongs to the week before it', isoWeek('2026-09-06').start, '2026-08-31')
check('1 January 2026 is week 1', isoWeek('2026-01-01').number, 1)
check('4 January 2026 is still week 1', isoWeek('2026-01-04').number, 1)
check('5 January 2026 is week 2', isoWeek('2026-01-05').number, 2)

// --- Status ---------------------------------------------------------------
check('planned becomes Not started', toStatusUpdate('planned'), 'Not started')
check('active stays Active', toStatusUpdate('active'), 'Active')
check('done becomes Completed', toStatusUpdate('done'), 'Completed')
check('paused becomes On hold', toStatusUpdate('paused'), 'On hold')

// --- Progress -------------------------------------------------------------
const t = '2026-09-01'
check(
  'nothing in the way gives On Track',
  progressSignal({ daysUntilNext: 10, blockers: [], today: t }),
  'On Track',
)
check(
  'an open blocker gives At Risk',
  progressSignal({ daysUntilNext: 5, blockers: [{ expected_by: '2026-09-06' }], today: t }),
  'At Risk',
)
check(
  'an overdue date gives Off Track',
  progressSignal({ daysUntilNext: -3, blockers: [], today: t }),
  'Off Track',
)
check(
  'a blocker past its expected reply gives Off Track',
  progressSignal({ daysUntilNext: 30, blockers: [{ expected_by: '2026-08-22' }], today: t }),
  'Off Track',
)
check(
  'a date within seven days gives At Risk',
  progressSignal({ daysUntilNext: 7, blockers: [], today: t }),
  'At Risk',
)
check(
  'no date and no blocker gives On Track',
  progressSignal({ daysUntilNext: null, blockers: [], today: t }),
  'On Track',
)

// --- The status text ------------------------------------------------------
check(
  'an empty period says so plainly',
  buildStatusComment({ entries: [], blockers: [], today: t }),
  'No activity recorded in this period.',
)

check(
  'log entries come in date order and get a full stop',
  buildStatusComment({
    entries: [
      { entry_date: '2026-08-29', body: 'Layoutforslag tegnet op' },
      { entry_date: '2026-08-26', body: 'Gulvet er ikke dokumenteret.' },
    ],
    blockers: [],
    today: t,
  }),
  'Gulvet er ikke dokumenteret. Layoutforslag tegnet op.',
)

check(
  'a blocker becomes a waiting sentence',
  buildStatusComment({
    entries: [],
    blockers: [
      {
        title: 'Investeringsansøgning ikke behandlet',
        waiting_on: 'Ledelsen',
        days_blocked: 12,
        expected_by: '2026-09-06',
      },
    ],
    today: t,
  }),
  'Waiting on Ledelsen: investeringsansøgning ikke behandlet, 12 days.',
)

check(
  'a passed expectation is mentioned',
  buildStatusComment({
    entries: [],
    blockers: [
      {
        title: 'Server access and VLAN',
        waiting_on: 'IT',
        days_blocked: 34,
        expected_by: '2026-08-22',
      },
    ],
    today: t,
  }),
  'Waiting on IT: Server access and VLAN, 34 days, expected reply 22 Aug has passed.',
)

check(
  'blockers are sorted by day count',
  buildStatusComment({
    entries: [],
    blockers: [
      { title: 'Kort', waiting_on: 'Vedligehold', days_blocked: 6, expected_by: null },
      { title: 'Lang', waiting_on: 'IT', days_blocked: 34, expected_by: null },
    ],
    today: t,
  }),
  'Waiting on IT: lang, 34 days. Waiting on Vedligehold: kort, 6 days.',
)

// --- The snapshot behind a report -----------------------------------------

const blocker = (id: string, title: string, days: number, who = 'IT') => ({
  id,
  node_id: 'n1',
  title,
  waiting_on: who,
  waiting_on_type: 'other' as const,
  opened_at: '2026-08-01',
  expected_by: null,
  resolved_at: null,
  resolution: null,
  created_by: null,
  created_at: '2026-08-01T00:00:00Z',
  days_blocked: days,
  overdue: false,
})

const nextDate = {
  node_id: 'p1',
  next_node_id: 'n9',
  title: 'Acceptance test',
  due_date: '2026-09-11',
  is_milestone: true,
  status: 'planned' as const,
  days_until: 8,
}

const money = (over: Record<string, number>) =>
  ({
    node_id: 'p1',
    once_estimated: 0, once_quoted: 0, once_ordered: 0, once_invoiced: 0,
    once_committed: 0, once_priced: 0, once_with_paper: 0,
    annual_committed: 0, annual_priced: 0,
    capex_once_priced: 0, capex_once_committed: 0, capex_annual_priced: 0,
    opex_once_priced: 0, opex_once_committed: 0,
    opex_annual_priced: 0, opex_annual_committed: 0,
    once_items: 0, annual_items: 0, items: 0,
    ...over,
  }) as never

const snap = toSnapshot({
  progressPct: 58,
  leafDone: 7,
  leafTotal: 12,
  next: nextDate,
  blockers: [blocker('b1', 'Short wait', 6), blocker('b2', 'Long wait', 34)],
  entries: [{ id: 'e1' }, { id: 'e2' }] as never,
  cost: money({ once_priced: 612_000, once_committed: 438_000, once_with_paper: 400_000, annual_priced: 21_600, items: 10 }),
})

check('progress is carried over', [snap.progress_pct, snap.leaf_done, snap.leaf_total], [58, 7, 12])
check('the next node is identified, not just dated', snap.next, {
  node_id: 'n9',
  title: 'Acceptance test',
  due_date: '2026-09-11',
  is_milestone: true,
})
check(
  'blockers come longest first, so two weeks compare without reordering',
  snap.blockers.map((b) => b.title),
  ['Long wait', 'Short wait'],
)
check('a blocker keeps what it was waiting on', snap.blockers[0].waiting_on, 'IT')
check('entries are counted, not copied', snap.entry_count, 2)

// v_node_cost answers for today. «You said 612 000 in week 34 and it is 810 000
// now» cannot be reconstructed once the lines have moved.
check('the money as it stood that week is kept', snap.cost, {
  once_priced: 612_000,
  once_committed: 438_000,
  once_with_paper: 400_000,
  annual_priced: 21_600,
  items: 10,
})


const empty = toSnapshot({
  progressPct: 0,
  leafDone: 0,
  leafTotal: 0,
  next: null,
  blockers: [],
  entries: [],
  cost: null,
})
check('no next date is recorded as none', empty.next, null)
check('no blockers is an empty list, not absent', empty.blockers, [])
check('no cost lines yet is zero, not absent', empty.cost, {
  once_priced: 0,
  once_committed: 0,
  once_with_paper: 0,
  annual_priced: 0,
  items: 0,
})

// Equal waits must not reorder between two runs, or a comparison would report
// a change that never happened.
const tied = toSnapshot({
  progressPct: 0,
  leafDone: 0,
  leafTotal: 0,
  next: null,
  blockers: [blocker('b2', 'Zebra', 10), blocker('b1', 'Alpha', 10)],
  entries: [],
  cost: null,
})
check('equal waits fall back to the title', tied.blockers.map((b) => b.title), ['Alpha', 'Zebra'])

// --- What the first real report exposed -------------------------------------

const wait = (who: string, title: string, days: number) => ({
  title,
  waiting_on: who,
  days_blocked: days,
  expected_by: null,
})

check(
  'one day is not one days',
  buildStatusComment({ entries: [], blockers: [wait('IT', 'VLAN', 1)], today: '2026-09-03' }),
  'Waiting on IT: VLAN, 1 day.',
)

check(
  'two days is days',
  buildStatusComment({ entries: [], blockers: [wait('IT', 'VLAN', 2)], today: '2026-09-03' }),
  'Waiting on IT: VLAN, 2 days.',
)

// The first real report said «Waiting on Project Board: ..., 1 days. Waiting on
// Project Board: ..., 0 days.» One relationship, read as two problems.
check('an acronym keeps its capitals', buildStatusComment({
  entries: [],
  blockers: [wait('IT', 'VLAN and DMZ', 4)],
  today: '2026-09-03',
}), 'Waiting on IT: VLAN and DMZ, 4 days.')

check(
  'the same recipient is one sentence',
  buildStatusComment({
    entries: [],
    blockers: [wait('Project Board', 'VM approval', 1), wait('Project Board', 'Budget line', 0)],
    today: '2026-09-03',
  }),
  'Waiting on Project Board: VM approval and budget line, 1 day.',
)

// «Small Enhancement Approval» became «small Enhancement Approval», which looks
// broken rather than lowercased.
check('a title with capitals on every word is left alone', buildStatusComment({
  entries: [],
  blockers: [wait('Project Board', 'Small Enhancement Approval', 3)],
  today: '2026-09-03',
}), 'Waiting on Project Board: Small Enhancement Approval, 3 days.')

check('an ordinary phrase still lowers', buildStatusComment({
  entries: [],
  blockers: [wait('IT', 'Cabinet delivery slipped', 3)],
  today: '2026-09-03',
}), 'Waiting on IT: cabinet delivery slipped, 3 days.')

check(
  'the longest wait is the one quoted',
  buildStatusComment({
    entries: [],
    blockers: [wait('IT', 'Short', 2), wait('IT', 'Long', 30)],
    today: '2026-09-03',
  }),
  'Waiting on IT: long and short, 30 days.',
)

check(
  'recipients come worst first',
  buildStatusComment({
    entries: [],
    blockers: [wait('IT', 'Firewall rule', 3), wait('Vendor', 'Cabinet delivery', 19)],
    today: '2026-09-03',
  }),
  'Waiting on Vendor: cabinet delivery, 19 days. Waiting on IT: firewall rule, 3 days.',
)

console.log(failed === 0 ? '\nAll tests passed.' : `\n${failed} test(s) failed.`)
process.exitCode = failed === 0 ? 0 : 1
