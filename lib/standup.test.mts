import { agenda, attendees, movement, AGENDA_ORDER, type AgendaInput } from './standup.ts'

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

const TODAY = '2026-09-10'

const blank: AgendaInput = {
  nodes: [],
  blockers: [],
  ready: new Map(),
  looseEnds: [],
  today: TODAY,
}

const node = (over: Partial<AgendaInput['nodes'][number]> = {}) => ({
  id: 'n1',
  parent_id: 'p1',
  title: 'A task',
  status: 'active',
  due_date: null,
  completed_at: null,
  ...over,
})

const blocker = (over: Partial<AgendaInput['blockers'][number]> = {}) => ({
  id: 'b1',
  node_id: 'n1',
  title: 'Firewall rule',
  waiting_on: 'Internal IT',
  opened_at: '2026-08-01T09:00:00Z',
  expected_by: null,
  resolved_at: null,
  ...over,
})

// --- The order of the meeting -----------------------------------------------
/*
 * The whole point of the screen. Every kind is present exactly once, so the
 * order that comes out is the order the room walks, and this test is the only
 * thing standing between that order and a future edit that quietly reshuffles
 * it.
 */
const oneOfEach = agenda({
  ...blank,
  nodes: [
    node({ id: 'n1', title: 'The blocked one' }),
    node({ id: 'late', title: 'Late one', due_date: '2026-09-01' }),
    node({ id: 'soon', title: 'Soon one', due_date: '2026-09-12' }),
  ],
  blockers: [
    blocker({ id: 'b-late', title: 'Overdue answer', expected_by: '2026-09-05' }),
    blocker({ id: 'b-open', title: 'Ordinary wait' }),
  ],
  looseEnds: [{ nodeId: 'late', what: 'Finished without a word', on: '2026-09-08' }],
})
check(
  'every kind appears, in the declared order',
  oneOfEach.map((i) => i.kind),
  [...AGENDA_ORDER],
)

// --- Within a kind, the longest wait goes first ------------------------------
const twoWaits = agenda({
  ...blank,
  nodes: [node()],
  blockers: [
    blocker({ id: 'short', title: 'Short', opened_at: '2026-09-08T09:00:00Z' }),
    blocker({ id: 'long', title: 'Long', opened_at: '2026-07-01T09:00:00Z' }),
  ],
})
check('the longest wait is first', twoWaits.map((i) => i.title), ['Long', 'Short'])
check('and it says how long', twoWaits[0].days, 71)

// --- What is deliberately NOT on the agenda ----------------------------------
check(
  'finished work is not discussed',
  agenda({
    ...blank,
    nodes: [node({ status: 'done', due_date: '2026-08-01' })],
  }).length,
  0,
)

check(
  'nor is work that was completed but left open',
  agenda({
    ...blank,
    nodes: [node({ due_date: '2026-08-01', completed_at: '2026-08-30T12:00:00Z' })],
  }).length,
  0,
)

/*
 * A project is late because something under it is late. Listing both says the
 * same thing twice and puts the vaguer one first.
 */
check(
  'a project does not appear beside its own late task',
  agenda({
    ...blank,
    nodes: [
      node({ id: 'root', parent_id: null, title: 'The project', due_date: '2026-08-01' }),
      node({ id: 'part', title: 'The part', due_date: '2026-08-01' }),
    ],
  }).map((i) => i.title),
  ['The part'],
)

check(
  'a resolved blocker is over',
  agenda({
    ...blank,
    nodes: [node()],
    blockers: [blocker({ resolved_at: '2026-09-02T10:00:00Z' })],
  }).length,
  0,
)

/*
 * Not ready means something it depends on is unfinished, and that predecessor
 * is the thing worth discussing. Listing the successor as well would put two
 * rows on the agenda for one conversation.
 */
check(
  'a planned task that is not ready stays off',
  agenda({ ...blank, nodes: [node({ status: 'planned' })], ready: new Map() }).length,
  0,
)

check(
  'and an active one is not offered to be started',
  agenda({
    ...blank,
    nodes: [node({ status: 'active' })],
    ready: new Map([['n1', true]]),
  }).length,
  0,
)

// A date beyond the next stand-up is next week's problem, not this one's.
check(
  'work due after the next stand-up waits its turn',
  agenda({ ...blank, nodes: [node({ due_date: '2026-09-18' })] }).length,
  0,
)
check(
  'and work due on the day of the next one makes it',
  agenda({ ...blank, nodes: [node({ due_date: '2026-09-17' })] }).map((i) => i.kind),
  ['due_soon'],
)

// --- Who the agenda needs ---------------------------------------------------
const many = agenda({
  ...blank,
  nodes: [node()],
  blockers: [
    blocker({ id: '1', title: 'One', waiting_on: 'Internal IT', opened_at: '2026-09-01T09:00:00Z' }),
    blocker({ id: '2', title: 'Two', waiting_on: 'Internal IT', opened_at: '2026-06-01T09:00:00Z' }),
    blocker({ id: '3', title: 'Three', waiting_on: 'Bayer' }),
  ],
})
check(
  'the room is whoever the agenda needs, busiest first',
  attendees(many),
  [
    { who: 'Internal IT', items: 2, longestWait: 101 },
    { who: 'Bayer', items: 1, longestWait: 40 },
  ],
)

check('nobody is invited to an empty agenda', attendees([]), [])

// --- Since last time --------------------------------------------------------
const history = {
  nodes: [
    { id: 'a', title: 'Done before', completed_at: '2026-08-20T10:00:00Z' },
    { id: 'b', title: 'Done since', completed_at: '2026-09-08T10:00:00Z' },
    { id: 'c', title: 'Still open', completed_at: null },
  ],
  blockers: [
    { title: 'Old wait', waiting_on: 'IT', opened_at: '2026-08-01T09:00:00Z', resolved_at: '2026-09-05T09:00:00Z' },
    { title: 'New wait', waiting_on: 'Bayer', opened_at: '2026-09-07T09:00:00Z', resolved_at: null },
  ],
  entries: [{ entry_date: '2026-08-15' }, { entry_date: '2026-09-08' }, { entry_date: '2026-09-09' }],
}

const week = movement(history, '2026-09-03')
check('what got finished since', week.completed.map((c) => c.title), ['Done since'])
check('what got unstuck', week.resolved.map((r) => r.title), ['Old wait'])
check('what got stuck', week.opened.map((o) => o.title), ['New wait'])
check('and how much was written down', week.written, 2)

/*
 * Null is the first meeting, not a quiet one. A fallback date would make those
 * two look the same, and the first stand-up is exactly when you want the whole
 * history in front of you.
 */
const ever = movement(history, null)
check('the first stand-up counts everything', ever.completed.length, 2)
check('including every blocker ever opened', ever.opened.length, 2)

// --- Only work somebody is actually doing ------------------------------------

/*
 * The room is not interested in a project nobody has begun. Every rule now
 * looks at the status first, and these four cases are the whole of it: a
 * blocker hanging on work that has not started is a note about a future
 * problem, not something in the way today.
 */
for (const state of ['idea', 'planned', 'paused'] as const) {
  check(
    `a blocker on ${state} work is not on the agenda`,
    agenda({ ...blank, nodes: [node({ status: state })], blockers: [blocker()] }).length,
    0,
  )
  check(
    `nor is a missed date on ${state} work`,
    agenda({ ...blank, nodes: [node({ status: state, due_date: '2026-08-01' })] }).length,
    0,
  )
}
check(
  'and the same blocker on active work is',
  agenda({ ...blank, nodes: [node()], blockers: [blocker()] }).length,
  1,
)

/*
 * A blocker whose node is not in the set at all is dropped rather than shown
 * without one. It cannot be placed, and an item on the agenda that nobody can
 * open is worse than one that is missing.
 */
check(
  'a blocker with no node to hang on is not shown',
  agenda({ ...blank, nodes: [], blockers: [blocker()] }).length,
  0,
)

/*
 * The last door. lib/loose-ends reports silence on planned work as well, which
 * is right there and wrong here, and it slipped through the first time: a
 * planned task arrived on an agenda that had just been narrowed to active work,
 * wearing the one label nobody had filtered.
 */
check(
  'a loose end on planned work is not on the agenda',
  agenda({
    ...blank,
    nodes: [node({ status: 'planned' })],
    looseEnds: [{ nodeId: 'n1', what: 'Nothing written', on: '2026-09-08' }],
  }).length,
  0,
)
check(
  'and the same loose end on active work is',
  agenda({
    ...blank,
    nodes: [node()],
    looseEnds: [{ nodeId: 'n1', what: 'Nothing written', on: '2026-09-08' }],
  }).length,
  1,
)

console.log(failed === 0 ? '\nAll tests passed.' : `\n${failed} test(s) failed.`)
process.exitCode = failed === 0 ? 0 : 1
