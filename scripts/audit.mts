/**
 * Hold the running database up against the code that talks to it.
 *
 * `npm test` proves the pure functions are right. This proves the other half:
 * that the schema the application believes in is the schema that exists, that
 * nothing is readable without logging in, and that every derived view still
 * says what an independent recomputation says it should.
 *
 *   npm run audit
 *
 * It only reads. Nothing here writes, and nothing here is destructive.
 *
 * Why it exists: the schema is applied by hand through the Supabase SQL editor,
 * so the migration files are a record of intent, not proof of state. A
 * migration that half applied, a view recreated without security_invoker, a
 * column renamed on one side only: all of them look fine in the repository.
 * PostgREST publishes what actually exists at /rest/v1/, and that is the only
 * honest answer.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { subtreeIds } from '../lib/subtree.ts'

// --- Environment ------------------------------------------------------------

const env: Record<string, string> = {}
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '')
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!URL_ || !SERVICE || !ANON) {
  console.error(
    'Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or ' +
      'NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local',
  )
  process.exit(1)
}

const get = async (path: string, key: string) => {
  const r = await fetch(`${URL_}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
  return { status: r.status, body: await r.json().catch(() => null) }
}

const rows = async (path: string) => {
  const { body } = await get(path, SERVICE)
  return Array.isArray(body) ? body : []
}

// --- Reporting --------------------------------------------------------------

let failures = 0
let unmeasured = 0
const ok = (m: string) => console.log(`  ok    ${m}`)
const bad = (m: string, detail: string[] = []) => {
  failures++
  console.log(`  FAIL  ${m}`)
  for (const d of detail.slice(0, 8)) console.log(`          ${d}`)
}
/*
 * A third state, and the reason it exists: a check that cannot run must not
 * print like a check that passed. Access control is the one thing here that
 * could be verified by reading the policies and believing them, and reading is
 * not measuring - so when it cannot be measured it says so, and the verdict at
 * the bottom stops claiming the database and the code agree.
 */
const skip = (m: string, why: string) => {
  unmeasured++
  console.log(`  ----  ${m}`)
  console.log(`          ${why}`)
}
const section = (m: string) => console.log(`\n${m}\n${'-'.repeat(m.length)}`)

const same = <T,>(a: Map<string, T>, b: Map<string, T>) => {
  const keys = new Set([...a.keys(), ...b.keys()])
  const off: string[] = []
  for (const k of keys) {
    const x = JSON.stringify(a.get(k) ?? null)
    const y = JSON.stringify(b.get(k) ?? null)
    if (x !== y) off.push(`${k}: computed ${x}, view ${y}`)
  }
  return off
}

// --- The live schema --------------------------------------------------------

const spec = (await get('', SERVICE)).body as {
  definitions: Record<string, { properties?: Record<string, { enum?: string[] }> }>
}
const COLS = new Map(
  Object.entries(spec.definitions).map(([k, v]) => [k, new Set(Object.keys(v.properties ?? {}))]),
)

section(`Schema: ${COLS.size} relations exposed`)

// --- 1. Every select the code makes ----------------------------------------

const sources: string[] = []
const walk = (dir: string) => {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === '.next' || e === '.git') continue
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p)
    else if (/\.tsx?$|\.mts$/.test(e)) sources.push(p)
  }
}
walk('.')

const CALL = /\.from\(\s*'([a-z_]+)'\s*\)\s*(?:\n\s*)?\.select\(\s*'([^']*)'/g
const queries = new Map<string, string>()
const ghosts: string[] = []

for (const file of sources) {
  const src = readFileSync(file, 'utf8')
  for (const m of src.matchAll(CALL)) {
    const rel = m[1]
    const cols = m[2].replace(/\s+/g, ' ').trim()
    const where = relative('.', file).replace(/\\/g, '/')
    queries.set(`${rel}|${cols}`, where)

    const known = COLS.get(rel)
    if (!known) {
      ghosts.push(`${where}: from('${rel}') does not exist`)
      continue
    }
    for (const raw of cols.split(',')) {
      const c = raw.trim().split(':').pop()!.replace(/\(.*/, '').trim()
      if (!c || c === '*') continue
      if (!known.has(c)) ghosts.push(`${where}: ${rel}.${c} does not exist`)
    }
  }
}

section('1. What the code asks the database for')
if (ghosts.length === 0) ok(`${queries.size} distinct selects, every column exists`)
else bad('columns or relations the code asks for that are not there', ghosts)

let answered = 0
const broken: string[] = []
for (const [key, where] of queries) {
  const [rel, cols] = key.split('|')
  const q = new URLSearchParams({ select: cols || '*', limit: '1' })
  const { status } = await get(`${rel}?${q}`, SERVICE)
  if (status === 200) answered++
  else broken.push(`${rel} [${status}] ${cols}  (${where})`)
}
if (broken.length === 0) ok(`all ${answered} of them answer against the live schema`)
else bad('queries the live schema refuses', broken)

// --- 2. Nothing is readable without logging in ------------------------------

section('2. Nothing is readable without logging in')
const leaks: string[] = []
for (const rel of [...COLS.keys()].sort()) {
  const { body } = await get(`${rel}?select=*&limit=1`, ANON)
  if (Array.isArray(body) && body.length > 0) leaks.push(`${rel} returns rows to the anon key`)
}
if (leaks.length === 0) ok(`all ${COLS.size} relations refuse the anonymous key`)
else bad('readable without a session', leaks)

const objectPath = (await rows('document?select=path&limit=1'))[0]?.path
if (objectPath) {
  const pub = await fetch(`${URL_}/storage/v1/object/public/documents/${objectPath}`)
  const anon = await fetch(`${URL_}/storage/v1/object/documents/${objectPath}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
  })
  if (pub.ok || anon.ok) bad('a stored document is fetchable without a session')
  else ok('stored documents are not fetchable without a session')
}

// --- 3. The data holds together --------------------------------------------

const node = await rows('node?select=*')
const blocker = await rows('blocker?select=*')
const entry = await rows('entry?select=node_id')
const cost = await rows('cost?select=*')
const document = await rows('document?select=id,node_id,path')
const decision = await rows('decision?select=node_id')
const report = await rows('report?select=node_id')
const dep = await rows('node_dependency?select=*')

section('3. Does the data hold together')
const ids = new Set(node.map((n) => n.id))
const by = new Map(node.map((n) => [n.id, n]))
const kids = new Map<string | null, string[]>()
for (const n of node) kids.set(n.parent_id, [...(kids.get(n.parent_id) ?? []), n.id])

const orphans: string[] = []
for (const [name, list] of [
  ['blocker', blocker], ['decision', decision], ['entry', entry],
  ['cost', cost], ['document', document], ['report', report],
] as [string, { node_id: string }[]][]) {
  const off = list.filter((r) => !ids.has(r.node_id))
  if (off.length) orphans.push(`${name}: ${off.length} rows point at a node that is gone`)
}
for (const n of node) {
  if (n.parent_id !== null && !ids.has(n.parent_id)) {
    orphans.push(`node ${n.title}: parent does not exist`)
  }
}
const docIds = new Set(document.map((d) => d.id))
for (const c of cost) {
  if (c.document_id !== null && !docIds.has(c.document_id)) {
    orphans.push(`cost ${c.description}: points at a document that is gone`)
  }
}
if (orphans.length === 0) ok('no row points at something that does not exist')
else bad('dangling references', orphans)

const cycles: string[] = []
for (const n of node) {
  const seen = new Set<string>()
  let cur: string | null = n.id
  while (cur !== null) {
    if (seen.has(cur)) { cycles.push(`tree cycle at ${by.get(cur)?.title}`); break }
    seen.add(cur)
    cur = by.get(cur)?.parent_id ?? null
  }
}
const edges = new Map<string, string[]>()
for (const d of dep) edges.set(d.node_id, [...(edges.get(d.node_id) ?? []), d.depends_on_id])
const state = new Map<string, 'open' | 'done'>()
const walkDep = (n: string, path: string[]) => {
  if (state.get(n) === 'done') return
  if (state.get(n) === 'open') {
    cycles.push('circular sequence: ' + [...path, n].map((p) => by.get(p)?.title).join(' -> '))
    return
  }
  state.set(n, 'open')
  for (const m of edges.get(n) ?? []) walkDep(m, [...path, n])
  state.set(n, 'done')
}
for (const n of edges.keys()) walkDep(n, [])
if (cycles.length === 0) ok('no cycle in the tree and none in the sequence')
else bad('cycles', cycles)

const model: string[] = []
const today = new Date().toISOString().slice(0, 10)
for (const n of node) {
  const children = kids.get(n.id) ?? []
  if (n.type === 'task' && children.length) {
    model.push(`task ${n.title} has ${children.length} children. A task is a leaf`)
  }
  if (n.type === 'project' && n.parent_id !== null) model.push(`project ${n.title} sits under another node`)
  if (n.type !== 'project' && n.parent_id === null) model.push(`${n.type} ${n.title} has no parent`)
  if (n.status === 'done' && n.completed_at === null) model.push(`${n.title} is done with no completion date`)
  if (n.status !== 'done' && n.completed_at !== null) model.push(`${n.title} is ${n.status} but carries a completion date`)
  if (n.estimate_low_days !== null && n.estimate_high_days !== null &&
      n.estimate_low_days > n.estimate_high_days) model.push(`${n.title}: low estimate above the high one`)
  if (n.start_date && n.due_date && n.start_date > n.due_date) model.push(`${n.title} starts after it is due`)
}
for (const b of blocker) {
  if (b.resolved_at !== null && b.resolved_at < b.opened_at) model.push(`blocker ${b.title} resolved before it opened`)
  if (!(b.waiting_on ?? '').trim()) model.push(`blocker ${b.title} has no recipient`)
}
for (const c of cost) {
  if (Number(c.eur_rate) <= 0) model.push(`cost ${c.description}: rate of ${c.eur_rate}`)
  if (c.currency === 'EUR' && Number(c.eur_rate) !== 1) model.push(`cost ${c.description}: in euro but carries a rate`)
  if (Number(c.quantity) <= 0) model.push(`cost ${c.description}: quantity of ${c.quantity}`)
}
if (model.length === 0) ok(`${node.length} nodes obey the model's own rules`)
else bad("rows that break the model's rules", model)

// --- 4. The derived views, recomputed ---------------------------------------

section('4. Every derivation, recomputed from the raw tables')

const below = (root: string) => subtreeIds(node, root).filter((d) => d !== root)

const descComputed = new Set(node.flatMap((n) => subtreeIds(node, n.id).map((d) => `${n.id}|${d}`)))
const descView = new Set((await rows('v_node_descendant?select=root_id,node_id&limit=5000'))
  .map((r) => `${r.root_id}|${r.node_id}`))
if (descComputed.size === descView.size && [...descComputed].every((k) => descView.has(k))) {
  ok(`v_node_descendant: ${descComputed.size} pairs`)
} else bad(`v_node_descendant: computed ${descComputed.size}, view has ${descView.size}`)

const prog = await rows('v_node_progress?select=*&limit=5000')
const leavesOf = (root: string) =>
  subtreeIds(node, root).filter((d) => !(kids.get(d) ?? []).length && by.get(d)!.type === 'task')

for (const [label, mine, theirs] of [
  ['v_node_progress.leaf_total',
   new Map(node.map((n) => [n.id, leavesOf(n.id).length])),
   new Map(prog.map((r) => [r.node_id, r.leaf_total]))],
  ['v_node_progress.leaf_done',
   new Map(node.map((n) => [n.id, leavesOf(n.id).filter((d) => by.get(d)!.status === 'done').length])),
   new Map(prog.map((r) => [r.node_id, r.leaf_done]))],
] as [string, Map<string, number>, Map<string, number>][]) {
  const off = same(mine, theirs)
  off.length === 0 ? ok(label) : bad(label, off)
}

const openBy = new Map<string, number>()
for (const b of blocker) {
  if (b.resolved_at === null) openBy.set(b.node_id, (openBy.get(b.node_id) ?? 0) + 1)
}
const st = await rows('v_node_state?select=*&limit=5000')
for (const [label, mine, theirs] of [
  ['v_node_state.open_blockers',
   new Map(node.map((n) => [n.id, openBy.get(n.id) ?? 0])),
   new Map(st.map((r) => [r.node_id, r.open_blockers]))],
  ['v_node_state.status_effective',
   new Map(node.map((n) => [n.id, (openBy.get(n.id) ?? 0) > 0 ? 'blocked' : n.status])),
   new Map(st.map((r) => [r.node_id, r.status_effective]))],
] as [string, Map<string, unknown>, Map<string, unknown>][]) {
  const off = same(mine, theirs)
  off.length === 0 ? ok(label) : bad(label, off)
}

const ancestors = (id: string) => {
  const out: string[] = []
  let cur: string | null = id
  while (cur !== null) { out.push(cur); cur = by.get(cur)?.parent_id ?? null }
  return out
}
const ready = await rows('v_node_ready?select=*&limit=5000')
const waitingComputed = new Map(node.map((n) => {
  const chain = new Set(ancestors(n.id))
  const preds = dep.filter((d) => chain.has(d.node_id)).map((d) => d.depends_on_id)
  return [n.id, preds.filter((p) => by.get(p)!.status !== 'done').length]
}))
for (const [label, mine, theirs] of [
  ['v_node_ready.waiting_on_count', waitingComputed, new Map(ready.map((r) => [r.node_id, r.waiting_on_count]))],
  ['v_node_ready.is_ready',
   new Map([...waitingComputed].map(([k, v]) => [k, v === 0])),
   new Map(ready.map((r) => [r.node_id, r.is_ready]))],
] as [string, Map<string, unknown>, Map<string, unknown>][]) {
  const off = same(mine, theirs)
  off.length === 0 ? ok(label) : bad(label, off)
}

// v_next_date deliberately looks only BELOW a node: it is not its own next date.
const next = await rows('v_next_date?select=*&limit=5000')
const nextComputed = new Map<string, unknown>()
for (const n of node) {
  const cand = below(n.id).map((d) => by.get(d)!).filter(
    (c) => c.due_date && c.completed_at === null && c.status !== 'done' && c.status !== 'cancelled',
  )
  if (!cand.length) continue
  cand.sort((a, b2) =>
    a.due_date !== b2.due_date ? (a.due_date < b2.due_date ? -1 : 1)
      : a.is_milestone !== b2.is_milestone ? (a.is_milestone ? -1 : 1)
        : a.title < b2.title ? -1 : 1)
  nextComputed.set(n.id, [cand[0].id, cand[0].due_date])
}
const offNext = same(nextComputed, new Map(next.map((r) => [r.node_id, [r.next_node_id, r.due_date]])))
offNext.length === 0 ? ok('v_next_date: same node and same date everywhere') : bad('v_next_date', offNext)

const active = await rows('v_active_blocker?select=*')
const activeOff = same(
  new Map(blocker.filter((b) => b.resolved_at === null).map((b) => [b.id, true])),
  new Map(active.map((r) => [r.id, true])),
)
activeOff.length === 0 ? ok('v_active_blocker: only the unresolved ones') : bad('v_active_blocker', activeOff)

// --- 5. Enums against lib/types.ts ------------------------------------------

section('5. Every closed set matches lib/types.ts')
const types = readFileSync('lib/types.ts', 'utf8')
const declared = (name: string) => {
  const arr = types.match(new RegExp(`export const ${name} = \\[([^\\]]*)\\]`))
  if (arr) return new Set([...arr[1].matchAll(/'([^']+)'/g)].map((m) => m[1]))
  const uni = types.match(new RegExp(`export type ${name}\\s*=\\s*((?:[^\\n]|\\n(?!\\S))*)`))
  return uni ? new Set([...uni[1].matchAll(/'([^']+)'/g)].map((m) => m[1])) : null
}
const PAIRS: [string, string, string][] = [
  ['node', 'status', 'NodeStatus'], ['node', 'type', 'NodeType'],
  ['entry', 'kind', 'EntryKind'],
  ['blocker', 'waiting_on_type', 'WaitingOnType'], ['cost', 'state', 'COST_STATES'],
  ['cost', 'recurrence', 'COST_RECURRENCES'], ['cost', 'budget', 'COST_BUDGETS'],
  ['cost', 'currency', 'COST_CURRENCIES'], ['cost', 'kind', 'COST_KINDS'],
  ['decision', 'topic', 'DECISION_TOPICS'],
  ['spark_token', 'scope', 'TOKEN_SCOPES'],
  ['spark', 'source', 'SPARK_SOURCES'],
  ['spark', 'state', 'SPARK_STATES'],
  ['spark', 'saving_kind', 'SAVING_KINDS'],
  ['spark', 'worth_basis', 'WORTH_BASES'],
  // The copy carries the same answer, and has to agree with it for the same
  // reason node_origin.saving_kind does.
  ['node_origin', 'worth_basis', 'WORTH_BASES'],
  // Same enum as on `spark`, and it has to be: node_origin is a copy of what a
  // spark claimed, read back by the same functions.
  ['node_origin', 'saving_kind', 'SAVING_KINDS'],
]
const loose: string[] = []
for (const [rel, col, name] of PAIRS) {
  const db = spec.definitions[rel]?.properties?.[col]?.enum
  if (!db) { loose.push(`${rel}.${col} is not a constrained type in the database`); continue }
  const ts = declared(name)
  if (!ts) { loose.push(`${name} not found in lib/types.ts`); continue }
  const extra = [...ts].filter((v) => !db.includes(v))
  const missing = db.filter((v) => !ts.has(v))
  if (extra.length || missing.length) {
    loose.push(`${rel}.${col} vs ${name}: TypeScript has extra [${extra}], missing [${missing}]`)
  }
}
if (loose.length === 0) ok(`all ${PAIRS.length} closed sets are enums and match TypeScript`)
else bad('closed sets that drifted or were never constrained', loose)

/*
 * The list above is written by hand, so the count it reports is a number I
 * chose rather than a fact about the database. A new enum would slip past it
 * in silence, which is exactly how the last one did. So ask the schema what
 * enums it actually has and complain about any the list forgot. Views are left
 * out: they re-expose their base table's columns, and checking the same enum
 * twice under a second name proves nothing.
 */
const covered = new Set(PAIRS.map(([r, c]) => `${r}.${c}`))
const unwatched: string[] = []
for (const [rel, def] of Object.entries(spec.definitions)) {
  if (rel.startsWith('v_')) continue
  for (const [col, prop] of Object.entries((def as any).properties ?? {})) {
    if ((prop as any).enum && !covered.has(`${rel}.${col}`)) unwatched.push(`${rel}.${col}`)
  }
}
unwatched.length === 0
  ? ok('and no enum in the schema is going unwatched')
  : bad('enums the database has and this audit was never told about', unwatched)

/*
 * And every field lib/types.ts says a row has.
 *
 * Section 1 reads the SELECT lists, so it only sees columns the code names.
 * `select('*')` names none, and the fields are then picked off the result in
 * TypeScript where nothing checks them - which is exactly how `entry.standup_id`
 * came to be read on the stand-up screen for an afternoon while the column did
 * not exist. The audit said 67 selects were fine, and it was right about all
 * sixty seven.
 *
 * So take the other side: every interface here that names a relation must have
 * every one of its fields in that relation. Interfaces that name nothing - the
 * shapes lib/cogs and lib/identity pass around - are skipped, because they are
 * not claims about the database.
 */
const relationOf = (name: string) => {
  const snake = name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()
  if (COLS.has(snake)) return snake
  if (COLS.has(`v_${snake}`)) return `v_${snake}`
  return null
}

const missing: string[] = []
let checked = 0
for (const m of types.matchAll(/export interface (\w+)[^{]*\{([\s\S]*?)\n\}/g)) {
  const rel = relationOf(m[1])
  if (!rel) continue
  checked++
  const known = COLS.get(rel)!
  for (const line of m[2].split('\n')) {
    const field = line.match(/^\s{2}(\w+)[?]?:/)
    if (field && !known.has(field[1])) missing.push(`${m[1]}.${field[1]} is not a column on ${rel}`)
  }
}
missing.length === 0
  ? ok(`and every field on ${checked} row types exists on its relation`)
  : bad('fields lib/types.ts claims a row has and the database does not', missing)

// --- 6. Membership, measured rather than read --------------------------------

/*
 * Everything above this point could be true with the access model completely
 * broken. Section 2 proves a signed-OUT request gets nothing, and that is the
 * easy half; it says nothing about whether one signed-in colleague can read
 * another one's project. Until there were two accounts that was unmeasurable,
 * and the honest thing was to say the policies had been READ.
 *
 * So this signs in as a real second user and asks for things they must not
 * have. It needs their password, which nothing here can derive, so it is taken
 * from .env.local and the whole section reports "not measured" without it
 * rather than passing quietly. A green line for a check that never ran is worse
 * than a missing line.
 */
section('6. Membership keeps a second account out')

const PROBE_EMAIL = env.AUDIT_PROBE_EMAIL
const PROBE_PASSWORD = env.AUDIT_PROBE_PASSWORD

if (!PROBE_EMAIL || !PROBE_PASSWORD) {
  skip(
    'isolation between two signed-in accounts',
    'set AUDIT_PROBE_EMAIL and AUDIT_PROBE_PASSWORD in .env.local to a real ' +
      'second account. Until then the policies have been read, not measured.',
  )
} else {
  const auth = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: PROBE_EMAIL, password: PROBE_PASSWORD }),
  })
  const session = (await auth.json().catch(() => null)) as {
    access_token?: string
    user?: { id?: string }
  } | null

  if (!session?.access_token || !session.user?.id) {
    bad(`could not sign in as ${PROBE_EMAIL}`, [
      'the audit cannot measure isolation without a session for it',
    ])
  } else {
    const TOKEN = session.access_token
    const probeId = session.user.id

    /** As the probe user: their own key for apikey, their session for identity. */
    const asProbe = async (path: string) => {
      const r = await fetch(`${URL_}/rest/v1/${path}`, {
        headers: { apikey: ANON, Authorization: `Bearer ${TOKEN}` },
      })
      const body = await r.json().catch(() => null)
      return { status: r.status, rows: Array.isArray(body) ? body : [] }
    }

    // What the database says they may see, read with the key that ignores RLS.
    const membership = await rows(
      `project_member?select=project_id&user_id=eq.${probeId}`,
    )
    const allowed = new Set(membership.map((m) => m.project_id as string))
    const roots = node.filter((n) => n.parent_id === null)
    const forbidden = roots.filter((r) => !allowed.has(r.id))

    ok(
      `signed in as ${PROBE_EMAIL}: member of ${allowed.size} of ${roots.length} ` +
        `project${roots.length === 1 ? '' : 's'}`,
    )

    if (forbidden.length === 0) {
      skip(
        'nothing to be kept out of',
        'this account is a member of every project, so a passing result would ' +
          'prove nothing. Leave them off one project to measure it.',
      )
    } else {
      /*
       * The whole subtree, not just the root. Membership is inherited, and the
       * failure worth catching is a policy that guards the project and forgets
       * the task three levels down where the actual work is written.
       */
      const off: string[] = []
      for (const root of forbidden) {
        for (const id of subtreeIds(node, root.id)) {
          const { rows: seen } = await asProbe(`node?select=id&id=eq.${id}`)
          if (seen.length > 0) {
            off.push(`node ${id} under ${root.title} is readable`)
          }
        }
      }
      off.length === 0
        ? ok(
            `every node under ${forbidden.length} project${forbidden.length === 1 ? '' : 's'} ` +
              'they are not on comes back empty',
          )
        : bad('nodes readable by an account that is not a member', off)

      // The tables that hang off a node carry their own policy, and each one is
      // a separate chance to have written can_see_node the wrong way round.
      const hidden = new Set(
        forbidden.flatMap((r) => [...subtreeIds(node, r.id)]),
      )
      const leaks: string[] = []
      for (const [rel, ids] of [
        ['blocker', blocker.filter((b) => hidden.has(b.node_id)).map((b) => b.id)],
        ['entry', (await rows('entry?select=id,node_id')).filter((e) => hidden.has(e.node_id)).map((e) => e.id)],
        ['decision', (await rows('decision?select=id,node_id')).filter((d) => hidden.has(d.node_id)).map((d) => d.id)],
        ['cost', (await rows('cost?select=id,node_id')).filter((c) => hidden.has(c.node_id)).map((c) => c.id)],
        ['document', (await rows('document?select=id,node_id')).filter((d) => hidden.has(d.node_id)).map((d) => d.id)],
        ['report', (await rows('report?select=id,node_id')).filter((r) => hidden.has(r.node_id)).map((r) => r.id)],
      ] as [string, string[]][]) {
        for (const id of ids.slice(0, 20)) {
          const { rows: seen } = await asProbe(`${rel}?select=id&id=eq.${id}`)
          if (seen.length > 0) leaks.push(`${rel} ${id}`)
        }
      }
      leaks.length === 0
        ? ok('and so does everything hanging off those nodes')
        : bad('rows on a hidden node that a non-member can read', leaks)
    }

    /*
     * Sparks are private to their author, which is a different rule from
     * membership and therefore a separate measurement. A spark is half a
     * thought at eleven at night; it is not project work and a colleague has no
     * business reading it.
     */
    const mine = await rows(`spark?select=id&user_id=neq.${probeId}&limit=20`)
    if (mine.length === 0) {
      skip('sparks stay private to their author', 'nobody else has captured one')
    } else {
      const readable: string[] = []
      for (const s of mine) {
        const { rows: seen } = await asProbe(`spark?select=id&id=eq.${s.id}`)
        if (seen.length > 0) readable.push(`spark ${s.id}`)
      }
      readable.length === 0
        ? ok(`and none of the ${mine.length} sparks belonging to somebody else`)
        : bad('sparks readable by somebody who did not write them', readable)
    }

    /*
     * The other half, and the one a too-strict policy breaks: they must still
     * see what they ARE on. An audit that only checks for leaks passes happily
     * on a database nobody can read at all.
     */
    /*
     * A probe on NO project cannot measure this half, and saying nothing about
     * it was the bug. The first real run of section 6 used an account that was
     * a member of nothing, so this block was skipped entirely: no ok, no bad,
     * no `----`, and the verdict then read «the database and the code agree»
     * with half of the only check that measures the access model never having
     * run.
     *
     * That is the exact thing the third state was added for, applied to
     * everything except itself. An unmeasured half now says so.
     */
    if (allowed.size === 0) {
      skip(
        'and that they can still read the projects they ARE on',
        `${PROBE_EMAIL} is a member of no project, so only the leak half of this ` +
          'section ran. Add them to exactly one project: a probe on none cannot ' +
          'tell a working policy from one that refuses everybody.',
      )
    } else {
      const shouldSee = [...allowed].flatMap((r) => [...subtreeIds(node, r)])
      const missing: string[] = []
      for (const id of shouldSee.slice(0, 40)) {
        const { rows: seen } = await asProbe(`node?select=id&id=eq.${id}`)
        if (seen.length === 0) missing.push(`node ${id}`)
      }
      missing.length === 0
        ? ok('and they can still read every node on the projects they are on')
        : bad('nodes a member cannot read on their own project', missing)
    }
  }
}

// --- Verdict ----------------------------------------------------------------

console.log()
if (failures > 0) {
  console.log(`${failures} check(s) failed.`)
} else if (unmeasured > 0) {
  console.log(
    `The database and the code agree, with ${unmeasured} check(s) not measured.`,
  )
} else {
  console.log('The database and the code agree.')
}
process.exitCode = failures === 0 ? 0 : 1
