import { feedItems, unseenCount, type FeedInput } from './feed.ts'

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

const ME = 'u-me'
const OTHER = 'u-other'

const blank: FeedInput = {
  nodes: [],
  entries: [],
  blockers: [],
  decisions: [],
  nameOf: new Map([
    [ME, 'Mikkel Stæhr'],
    [OTHER, 'Anna Berg'],
  ]),
  me: { id: ME, name: 'Mikkel Stæhr' },
}

const node = (over: Partial<FeedInput['nodes'][number]> = {}) => ({
  id: 'n1',
  parent_id: 'p1',
  title: 'Master data',
  type: 'task',
  owner_id: null as string | null,
  status: 'active',
  completed_at: null as string | null,
  created_at: '2026-09-01T09:00:00Z',
  /*
   * I made it, by default. A task somebody else creates with my name on it is
   * itself news for me, so a fixture created by anybody else would put a
   * second item in every count below and hide what each case is testing. That
   * case gets a test of its own.
   */
  created_by: ME as string | null,
  ...over,
})

const entry = (over: Partial<FeedInput['entries'][number]> = {}) => ({
  id: 'e1',
  node_id: 'n1',
  body: 'Waiting on the export',
  created_at: '2026-09-10T09:00:00Z',
  created_by: OTHER as string | null,
  ...over,
})

const blocker = (over: Partial<FeedInput['blockers'][number]> = {}) => ({
  id: 'b1',
  node_id: 'n1',
  title: 'Firewall rule',
  waiting_on: 'Internal IT',
  opened_at: '2026-09-05',
  resolved_at: null as string | null,
  resolution: null as string | null,
  created_at: '2026-09-05T09:00:00Z',
  created_by: OTHER as string | null,
  ...over,
})

/** Only the items the bell would count. */
const mine = (input: Partial<FeedInput>) =>
  feedItems({ ...blank, ...input }).filter((i) => i.mine)

// --- What names you ---------------------------------------------------------
check(
  'a line on work I drive is mine',
  mine({ nodes: [node({ owner_id: ME })], entries: [entry()] }).map((i) => i.kind),
  ['line'],
)
check(
  'and so is the task itself, when somebody else made it for me',
  mine({ nodes: [node({ owner_id: ME, created_by: OTHER })] }).map((i) => i.kind),
  ['created'],
)
check(
  'a task I made for myself is not',
  mine({ nodes: [node({ owner_id: ME })] }).length,
  0,
)
check(
  'a line on work somebody else drives is not',
  mine({ nodes: [node({ owner_id: OTHER })], entries: [entry()] }).length,
  0,
)
check(
  'and neither is a line on work nobody drives',
  mine({ nodes: [node({ owner_id: null })], entries: [entry()] }).length,
  0,
)

/*
 * The half that keeps the bell worth looking at. Writing a line on your own
 * task is the commonest thing anybody does here, and a feed that reported it
 * back would be mostly your own echo.
 */
check(
  'my own line on my own work is not a notification',
  mine({
    nodes: [node({ owner_id: ME })],
    entries: [entry({ created_by: ME })],
  }).length,
  0,
)
check(
  'but it is still in the feed',
  feedItems({
    ...blank,
    nodes: [node({ owner_id: ME })],
    entries: [entry({ created_by: ME })],
  }).filter((i) => i.kind === 'line').length,
  1,
)

// --- Spelling ---------------------------------------------------------------
check(
  'work I drive is matched by key, not by spelling',
  mine({
    nodes: [node({ owner_id: ME })],
    entries: [entry()],
  }).length,
  1,
)
check(
  'a task driven by somebody else is not mine',
  mine({ nodes: [node({ owner_id: 'u-nobody' })], entries: [entry()] }).length,
  0,
)
/*
 * A driver is a key now, so a person with no name set still gets told about
 * their own work. The name only decides blocker recipients, which are still
 * text because they are usually organisations.
 */
check(
  'an account with no name is still told about work it drives',
  feedItems({
    ...blank,
    me: { id: ME, name: null },
    nodes: [node({ owner_id: ME })],
    entries: [entry()],
  }).filter((i) => i.mine).length,
  1,
)
check(
  'but a blocker recipient is still matched by name, so it finds nobody',
  feedItems({
    ...blank,
    me: { id: ME, name: null },
    nodes: [node()],
    blockers: [blocker({ waiting_on: 'Mikkel Stæhr' })],
  }).some((i) => i.rust),
  false,
)

// --- Blockers ---------------------------------------------------------------
/*
 * The one deliberate exception. Every other kind tells you what somebody did;
 * this tells you that something is waiting, which goes on being true and goes
 * on being yours whoever typed it.
 */
check(
  'a blocker waiting on me is mine even though I opened it',
  mine({
    nodes: [node({ owner_id: OTHER })],
    blockers: [blocker({ waiting_on: 'Mikkel Stæhr', created_by: ME })],
  }).map((i) => i.kind),
  ['blocker_opened'],
)
check(
  'and it is the one thing here that is rust',
  feedItems({
    ...blank,
    nodes: [node()],
    blockers: [blocker({ waiting_on: 'Mikkel Stæhr' })],
  }).filter((i) => i.rust).map((i) => i.kind),
  ['blocker_opened'],
)
check(
  'a blocker waiting on somebody else is not rust',
  feedItems({ ...blank, nodes: [node()], blockers: [blocker()] }).some((i) => i.rust),
  false,
)
check(
  'closing one is its own item',
  feedItems({
    ...blank,
    nodes: [node()],
    blockers: [blocker({ resolved_at: '2026-09-12', resolution: 'IT opened the port' })],
  }).map((i) => i.kind).sort(),
  ['blocker_opened', 'blocker_closed', 'created'].sort(),
)
check(
  'and nothing records who closed it, so nobody is named',
  feedItems({
    ...blank,
    nodes: [node()],
    blockers: [blocker({ resolved_at: '2026-09-12' })],
  }).find((i) => i.kind === 'blocker_closed')?.who,
  null,
)

// --- What the rows say ------------------------------------------------------
check(
  'a row written before the column existed says nobody',
  feedItems({ ...blank, nodes: [node()], entries: [entry({ created_by: null })] }).find(
    (i) => i.kind === 'line',
  )?.who,
  null,
)
check(
  'and one written since carries the name',
  feedItems({ ...blank, nodes: [node()], entries: [entry()] }).find((i) => i.kind === 'line')
    ?.who,
  'Anna Berg',
)

// --- Order ------------------------------------------------------------------
/*
 * Newest first, and a date with no time sits at the end of its day: the only
 * thing known about it is the day, and putting it first would claim it came
 * before events that carry an actual time.
 */
const ordered = feedItems({
  ...blank,
  nodes: [node({ created_at: '2026-09-01T09:00:00Z' })],
  entries: [
    entry({ id: 'early', body: 'Early', created_at: '2026-09-12T08:00:00Z' }),
    entry({ id: 'late', body: 'Late', created_at: '2026-09-12T18:00:00Z' }),
  ],
  decisions: [
    {
      id: 'd1',
      node_id: 'n1',
      decision: 'Same day, no time',
      decided_on: '2026-09-12',
      created_at: '2026-09-12T10:00:00Z',
      created_by: OTHER,
    },
  ],
})
check(
  'newest first, and the dateless one closes its day',
  ordered.map((i) => i.line),
  ['Same day, no time', 'Late', 'Early', 'Master data'],
)

// --- The number on the bell -------------------------------------------------
const forCounting = feedItems({
  ...blank,
  nodes: [node({ owner_id: ME })],
  entries: [
    entry({ id: 'old', created_at: '2026-09-01T09:00:00Z' }),
    entry({ id: 'new', created_at: '2026-09-15T09:00:00Z' }),
  ],
})
check('never looked means all of it', unseenCount(forCounting, null), 2)
check('looked on the 10th means one', unseenCount(forCounting, '2026-09-10T00:00:00Z'), 1)
check('looked since means none', unseenCount(forCounting, '2026-09-20T00:00:00Z'), 0)
check(
  'and it only ever counts what names me',
  unseenCount(
    feedItems({ ...blank, nodes: [node({ owner_id: OTHER })], entries: [entry()] }),
    null,
  ),
  0,
)

console.log(failed === 0 ? '\nAll tests passed.' : `\n${failed} test(s) failed.`)
process.exitCode = failed === 0 ? 0 : 1
