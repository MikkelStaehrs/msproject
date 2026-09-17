import {
  carryForward,
  inPeriod,
  snapshot,
  validate,
  type CloseState,
} from './standup-close.ts'

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

const CLOSING = '2026-09-17T10:00:00.000Z'
const FROM = '2026-09-10T10:00:00.000Z'

const blank: CloseState = {
  standupId: 's1',
  periodFrom: FROM,
  closingAt: CLOSING,
  attendance: [],
  movement: { finished: [], lines: 0, missed: [] },
  blockers: [],
  unowned: [],
  commitments: [],
  decisions: [],
  sparks: [],
}

const blocker = (over: Partial<CloseState['blockers'][number]> = {}) => ({
  id: 'b1',
  nodeId: 'n1',
  title: 'Firewall rule',
  waitingOn: 'Internal IT',
  standups: 3,
  driverId: null as string | null,
  nextStep: null as string | null,
  resolution: null as string | null,
  ...over,
})

const unowned = (over: Partial<CloseState['unowned'][number]> = {}) => ({
  nodeId: 'n2',
  title: 'Master data',
  dueDate: null as string | null,
  blocks: 0,
  driverId: null as string | null,
  parkedUntil: null as string | null,
  ...over,
})

// --- Validation blocks the close --------------------------------------------
/*
 * Both rules are about a thing having an answer, not about a thing being
 * finished. A blocker nobody is taking forward gets read out again next week in
 * the same words.
 */
check(
  'a blocker with nobody on it stops the close',
  validate({ ...blank, blockers: [blocker()] }),
  ['«Firewall rule» has nobody taking it forward.'],
)
check(
  'and so does one with a driver and no next step',
  validate({ ...blank, blockers: [blocker({ driverId: 'u-1' })] }),
  ['«Firewall rule» has a driver but no next step.'],
)
check(
  'a next step of spaces is not a next step',
  validate({ ...blank, blockers: [blocker({ driverId: 'u-1', nextStep: '   ' })] }),
  ['«Firewall rule» has a driver but no next step.'],
)
check(
  'answered, it says nothing',
  validate({ ...blank, blockers: [blocker({ driverId: 'u-1', nextStep: 'Chase Lars' })] }),
  [],
)
/* A resolved blocker needs neither: it is over. */
check(
  'a resolved blocker needs no driver and no next step',
  validate({ ...blank, blockers: [blocker({ resolution: 'IT opened the port' })] }),
  [],
)

check(
  'a task with no driver and no date stops the close',
  validate({ ...blank, unowned: [unowned()] }),
  ['«Master data» has no driver and no date to come back to.'],
)
check(
  'a driver answers it',
  validate({ ...blank, unowned: [unowned({ driverId: 'u-1' })] }),
  [],
)
check(
  'and so does a date to come back to',
  validate({ ...blank, unowned: [unowned({ parkedUntil: '2026-10-15' })] }),
  [],
)

/*
 * Nothing about decisions, commitments or sparks. A meeting where nobody
 * decided anything is a normal meeting, and a validator that insisted
 * otherwise would be answered with a sentence nobody means.
 */
check('an empty meeting can close', validate(blank), [])

check(
  'every problem is named, not counted',
  validate({
    ...blank,
    blockers: [blocker({ id: 'b1', title: 'One' }), blocker({ id: 'b2', title: 'Two' })],
    unowned: [unowned({ nodeId: 'n9', title: 'Three' })],
  }).length,
  3,
)

// --- Blockers carry ----------------------------------------------------------
const carriedOne = carryForward({
  ...blank,
  blockers: [blocker({ driverId: 'u-1', nextStep: 'Chase Lars' })],
})
check(
  'an unresolved blocker is carried, not resolved',
  carriedOne.items.map((i) => [i.kind, i.action]),
  [['blocker', 'carried']],
)
check('and nothing is written to the blocker itself', carriedOne.blockers, [])
check(
  'the item keeps the next step and how long it has been read out',
  [carriedOne.items[0].next_step, carriedOne.items[0].note],
  ['Chase Lars', '3 stand-ups'],
)

const resolvedOne = carryForward({
  ...blank,
  blockers: [blocker({ resolution: 'IT opened the port' })],
})
check(
  'a resolved one closes the blocker',
  resolvedOne.blockers,
  [{ id: 'b1', resolution: 'IT opened the port', resolved_at: '2026-09-17' }],
)
check(
  'and carries no next step, because there is no next',
  [resolvedOne.items[0].action, resolvedOne.items[0].next_step],
  ['resolved', null],
)

// --- Unowned work ------------------------------------------------------------
const assigned = carryForward({ ...blank, unowned: [unowned({ driverId: 'u-1' })] })
check('naming a driver writes it to the node', assigned.drivers, [
  { node_id: 'n2', driver_id: 'u-1' },
])
check('and records that the meeting did it', assigned.items.map((i) => i.action), ['assigned'])

const parked = carryForward({ ...blank, unowned: [unowned({ parkedUntil: '2026-10-15' })] })
check('parking writes the date', parked.parked, [
  { node_id: 'n2', parked_until: '2026-10-15' },
])
check('and writes no driver', parked.drivers, [])

// --- Commitments carry, and so does missing one ------------------------------
check(
  'a commitment names a driver as well, which is the point of making one',
  carryForward({
    ...blank,
    commitments: [{ nodeId: 'n3', title: 'The quote', driverId: 'u-2', dueDate: '2026-09-24' }],
  }).drivers,
  [{ node_id: 'n3', driver_id: 'u-2' }],
)

/*
 * What was committed last time and is still not done is recorded AT THIS
 * MEETING, so next week's chapter one reads a row rather than recomputing a
 * rule that may have changed since.
 */
check(
  'what was not done is written down as missed',
  carryForward({
    ...blank,
    movement: {
      finished: [],
      lines: 0,
      missed: [{ nodeId: 'n4', title: 'Last week', driverId: 'u-3' }],
    },
  }).items.map((i) => [i.kind, i.action, i.node_id]),
  [['commitment', 'missed', 'n4']],
)

/*
 * Step four comes after step three, so a commitment made there is the room's
 * last word on who is driving that node.
 */
check(
  'a node named twice takes the later word',
  carryForward({
    ...blank,
    unowned: [unowned({ nodeId: 'n5', driverId: 'u-1' })],
    commitments: [{ nodeId: 'n5', title: 'Same task', driverId: 'u-2', dueDate: null }],
  }).drivers,
  [{ node_id: 'n5', driver_id: 'u-2' }],
)

// --- Decisions and sparks ----------------------------------------------------
const decided = carryForward({
  ...blank,
  decisions: [{ nodeId: 'n6', decision: 'We buy the switch', rationale: null, topic: 'hardware' }],
  sparks: [{ body: 'A dashboard for the line', note: null }],
})
check(
  'a decision is written where the work is',
  decided.decisions,
  [
    {
      node_id: 'n6',
      decision: 'We buy the switch',
      rationale: null,
      topic: 'hardware',
      decided_on: '2026-09-17',
    },
  ],
)
check('and a spark is passed through untouched', decided.sparks, [
  { body: 'A dashboard for the line', note: null },
])
check(
  'both leave a trace of the meeting that produced them',
  decided.items.map((i) => [i.kind, i.action]),
  [
    ['decision', 'logged'],
    ['spark', 'logged'],
  ],
)
check('a spark is about no node yet', decided.items[1].node_id, null)

// --- The snapshot ------------------------------------------------------------
const full: CloseState = {
  ...blank,
  attendance: [
    { personId: 'u-1', present: true },
    { personId: 'u-2', present: false },
  ],
  movement: {
    finished: [{ nodeId: 'n7', title: 'Done thing' }],
    lines: 12,
    missed: [{ nodeId: 'n4', title: 'Last week', driverId: 'u-3' }],
  },
  blockers: [
    blocker({ id: 'b1', title: 'Open one', driverId: 'u-1', nextStep: 'Chase Lars' }),
    blocker({ id: 'b2', title: 'Shut one', resolution: 'Done' }),
  ],
  unowned: [
    unowned({ nodeId: 'n2', title: 'Given away', driverId: 'u-1' }),
    unowned({ nodeId: 'n8', title: 'Put off', parkedUntil: '2026-10-15' }),
  ],
  commitments: [{ nodeId: 'n3', title: 'The quote', driverId: 'u-2', dueDate: '2026-09-24' }],
  decisions: [{ nodeId: 'n6', decision: 'We buy the switch', rationale: null, topic: null }],
  sparks: [{ body: 'An idea', note: null }],
}
const snap = snapshot(full)

check('the period is on the record', snap.period, { from: FROM, to: CLOSING })
check('who was there, and who was not', [snap.present, snap.absent], [['u-1'], ['u-2']])
check('what got finished', snap.finished, [{ nodeId: 'n7', title: 'Done thing' }])
check('and how much was written', snap.lines, 12)
check('what was promised last time and is still not done', snap.missed, [
  { nodeId: 'n4', title: 'Last week' },
])
check(
  'blockers split into the two that matter',
  [snap.blockers.resolved.length, snap.blockers.carried.length],
  [1, 1],
)
check('a carried blocker keeps its age', snap.blockers.carried[0].standups, 3)
check('who took what', snap.assigned, [
  { nodeId: 'n2', title: 'Given away', driverId: 'u-1' },
])
check('and what was put off, until when', snap.parked, [
  { nodeId: 'n8', title: 'Put off', until: '2026-10-15' },
])
check('sparks are counted, not repeated: they are private', snap.sparks, 1)

/*
 * Ids travel beside every title, because a summary of names cannot be clicked
 * and opening the thing is what somebody reading last month's meeting wants.
 * Titles travel too: a task renamed in November must not rewrite what October
 * agreed.
 */
check(
  'every line in the snapshot can be opened',
  [
    snap.finished[0].nodeId,
    snap.missed[0].nodeId,
    snap.assigned[0].nodeId,
    snap.parked[0].nodeId,
    snap.commitments[0].nodeId,
    snap.decisions[0].nodeId,
  ],
  ['n7', 'n4', 'n2', 'n8', 'n3', 'n6'],
)

// --- Period boundaries: nothing is counted twice -----------------------------
/*
 * Half open. A line written at the exact instant of closing belongs to the
 * meeting that closed, and to that one only.
 */
check('the instant of closing belongs to this meeting', inPeriod(CLOSING, FROM, CLOSING), true)
check('and not to the next one', inPeriod(CLOSING, CLOSING, '2026-09-24T10:00:00.000Z'), false)
check('the instant the last one closed is not counted again', inPeriod(FROM, FROM, CLOSING), false)
check('a moment after it is', inPeriod('2026-09-10T10:00:00.001Z', FROM, CLOSING), true)
check('anything later than the close waits its turn', inPeriod('2026-09-18T00:00:00Z', FROM, CLOSING), false)

/* Null is the first meeting: everything up to the close, and not a quiet week. */
check('the first meeting takes everything before it', inPeriod('2020-01-01T00:00:00Z', null, CLOSING), true)
check('but still nothing after it', inPeriod('2026-09-18T00:00:00Z', null, CLOSING), false)

console.log(failed === 0 ? '\nAll tests passed.' : `\n${failed} test(s) failed.`)
process.exitCode = failed === 0 ? 0 : 1
