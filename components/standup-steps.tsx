import Link from 'next/link'
import { PersonPicker, type Person } from '@/components/person-picker'
import { formatDate, formatDateLong } from '@/components/ui'
import { nameOf } from '@/lib/person-data'
import {
  answerBlocker,
  closeStandup,
  commit,
  draftDecision,
  draftSpark,
  driveOrPark,
  dropDraft,
  setFacilitator,
  setPresence,
  settleBlocker,
} from '@/lib/standup-close-actions'
import type { CloseState } from '@/lib/standup-close'
import type { Node, StandupItem } from '@/lib/types'

export const STEP_KEYS = ['1', '2', '3', '4', '5', '6', '7']

/**
 * The seven steps, in the order the room walks them.
 *
 * Each one asks a different KIND of question, which is why they are steps and
 * not sections of one page: what happened, what is stuck, who is driving what,
 * what we promise, what we decided, what we thought of, and are we done. A
 * facilitator on step three should not be able to see step five, because the
 * room will start answering it.
 *
 * Every step writes as it goes. Nothing here is a draft waiting for the close
 * except a decision and a spark, and both say so where they are typed.
 */
const STEPS: [string, string, number][] = [
  ['1', 'Since last time', 3],
  ['2', 'Blockers', 5],
  ['3', 'No driver', 2],
  ['4', 'Ahead', 4],
  ['5', 'Decisions', 2],
  ['6', 'Sparks', 1],
  ['7', 'Close', 2],
]

type Live = {
  id: string
  title: string
  project: string
  driverId: string | null
  dueDate: string | null
}

export function StandupSteps({
  step,
  standupId,
  state,
  problems,
  items,
  attendance,
  people,
  peopleById,
  facilitatorId,
  live,
  byId,
  projectOfNode,
}: {
  step: string
  standupId: string
  state: CloseState
  problems: string[]
  items: StandupItem[]
  attendance: Map<string, boolean>
  people: Person[]
  peopleById: Map<string, string>
  facilitatorId: string | null
  live: Live[]
  byId: Map<string, Node>
  projectOfNode: Map<string, string>
}) {
  const here = (s: string) => `/standup?step=${s}`
  const at = (nodeId: string) =>
    `/p/${projectOfNode.get(nodeId) ?? nodeId}?task=${nodeId}`
  const projectOf = (nodeId: string) =>
    byId.get(projectOfNode.get(nodeId) ?? nodeId)?.title ?? ''

  /*
   * Which part a piece of work sits in, and what that part is called.
   *
   * Two screens group by it, and both group by the SAME thing: the node's own
   * parent, not its project. A project with five subprojects each carrying the
   * same three task names draws fifteen identical rows if you group by project,
   * which is the problem the board already had and solved the same way.
   */
  const partOf = (nodeId: string) => {
    const parent = byId.get(nodeId)?.parent_id
    const part = parent ? byId.get(parent) : undefined
    return {
      id: part?.id ?? '__none',
      title: part?.title ?? 'Straight under the project',
      project: projectOf(nodeId),
    }
  }

  /*
   * Everywhere a decision can be put, as a tree.
   *
   * Any node, not only a leaf: «we buy the switch rather than renting it»
   * belongs to the subproject it changes, and forcing it onto a task would put
   * it under one of the five things it affects. The depth is carried so the
   * list can be read as the shape it is, which is the whole reason it is a list
   * and not the select it was.
   */
  const places: { id: string; title: string; depth: number }[] = []
  {
    const kids = new Map<string, Node[]>()
    for (const n of byId.values()) {
      const key = n.parent_id ?? '__root__'
      kids.set(key, [...(kids.get(key) ?? []), n])
    }
    const walk = (key: string, depth: number) => {
      for (const n of kids.get(key) ?? []) {
        places.push({ id: n.id, title: n.title, depth })
        walk(n.id, depth + 1)
      }
    }
    walk('__root__', 0)
  }

  const index = STEPS.findIndex(([n]) => n === step)
  const previous = index > 0 ? STEPS[index - 1] : null
  const next = index < STEPS.length - 1 ? STEPS[index + 1] : null

  const decisions = items.filter((i) => i.kind === 'decision')
  const sparks = items.filter((i) => i.kind === 'spark')
  const commitments = items.filter((i) => i.kind === 'commitment')

  return (
    <>
      {/* The seven, always in view, so the room knows how far in it is */}
      <nav className="flex flex-wrap items-baseline gap-x-7 gap-y-2 border-b border-line px-[var(--gut)] py-3.5">
        {STEPS.map(([n, label, minutes]) => (
          <Link
            key={n}
            href={here(n)}
            aria-current={step === n ? 'step' : undefined}
            className={`flex items-baseline gap-2 ${
              step === n ? 'text-ink' : 'text-muted hover:text-ink'
            }`}
          >
            <span className={`num text-[15px] ${step === n ? '' : 'text-rule-strong'}`}>
              {n}
            </span>
            <span
              className={`text-[13px] ${
                step === n ? 'border-b border-ink pb-0.5 font-medium' : ''
              }`}
            >
              {label}
            </span>
            <span className="lbl-tight tabular-nums text-rule-strong">{minutes}m</span>
          </Link>
        ))}
      </nav>

      <div className="px-[var(--gut)] py-[26px]">
        <div className="work mx-auto">
          {step === '1' && (
            <StepSince
              state={state}
              people={people}
              peopleById={peopleById}
              attendance={attendance}
              facilitatorId={facilitatorId}
              at={at}
              here={here(step)}
            />
          )}
          {step === '2' && (
            <StepBlockers
              state={state}
              people={people}
              peopleById={peopleById}
              at={at}
              projectOf={projectOf}
              here={here(step)}
            />
          )}
          {step === '3' && (
            <StepNoDriver
              state={state}
              people={people}
              at={at}
              partOf={partOf}
              here={here(step)}
            />
          )}
          {step === '4' && (
            <StepAhead
              live={live}
              commitments={commitments}
              people={people}
              peopleById={peopleById}
              byId={byId}
              at={at}
              partOf={partOf}
              here={here(step)}
            />
          )}
          {step === '5' && (
            <StepDecisions
              drafts={decisions}
              places={places}
              byId={byId}
              at={at}
              here={here(step)}
            />
          )}
          {step === '6' && <StepSparks drafts={sparks} here={here(step)} />}
          {step === '7' && (
            <StepClose
              standupId={standupId}
              state={state}
              problems={problems}
              peopleById={peopleById}
              at={at}
            />
          )}

          {/* Forward and back, so the meeting is walked rather than clicked at */}
          <div className="sec-gap flex flex-wrap items-center justify-between gap-4 border-t border-line pt-5">
            {previous ? (
              <Link href={here(previous[0])} className="act">
                ← {previous[1]}
              </Link>
            ) : (
              <span />
            )}
            {next && (
              <Link href={here(next[0])} className="btn">
                {next[1]} →
              </Link>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

/* ---------------------------------------------------------------- 1 ------ */

function StepSince({
  state,
  people,
  peopleById,
  attendance,
  facilitatorId,
  at,
  here,
}: {
  state: CloseState
  people: Person[]
  peopleById: Map<string, string>
  attendance: Map<string, boolean>
  facilitatorId: string | null
  at: (id: string) => string
  here: string
}) {
  return (
    <>
      <Head
        title="Since last time"
        note="What moved, read from the work rather than from anybody's memory. Nothing here was written for the meeting."
      />

      {/*
        Attendance is recorded, not derived. `attendees()` in lib/standup
        answers a different question, which is who the AGENDA needs; this is
        who was in the room, and nothing could answer it before.
      */}
      <h3 className="sec-gap text-[15px] font-semibold">Who is here</h3>
      <div className="panel grp-gap max-w-[640px]">
        {people.map((p) => {
          const present = attendance.get(p.id) ?? false
          return (
            <div
              key={p.id}
              className="flex items-baseline gap-3 border-b border-line px-[14px] py-2 last:border-b-0"
            >
              <span className="min-w-0 flex-1 truncate text-[13px]">{p.label}</span>
              <form action={setPresence} className="flex items-baseline gap-3">
                <input type="hidden" name="person_id" value={p.id} />
                <input type="hidden" name="redirectTo" value={here} />
                <input type="hidden" name="present" value={present ? 'no' : 'yes'} />
                <button className={present ? 'act text-green' : 'lbl text-muted hover:text-ink'}>
                  {present ? 'Here' : 'Not here'}
                </button>
              </form>
            </div>
          )
        })}
      </div>

      <form action={setFacilitator} className="grp-gap flex flex-wrap items-end gap-3">
        <input type="hidden" name="redirectTo" value={here} />
        <label className="block min-w-[220px]">
          <span className="lbl text-muted">Who is running it</span>
          <PersonPicker
            name="facilitator_id"
            people={people}
            value={facilitatorId ? [facilitatorId] : []}
          />
        </label>
        <button className="btn btn-ghost">Set</button>
      </form>

      <Figures
        rows={[
          ['Finished', state.movement.finished.length, false],
          ['Lines written', state.movement.lines, false],
          ['Not done from last time', state.movement.missed.length, state.movement.missed.length > 0],
        ]}
      />

      {state.movement.missed.length > 0 && (
        <>
          <h3 className="sec-gap text-[15px] font-semibold text-rust">Not done</h3>
          <p className="prose-measure grp-gap text-[13px] text-muted">
            Promised at the last stand-up and still open. Read from what that
            meeting recorded, not from a rule that might have changed since.
          </p>
          <div className="panel grp-gap max-w-[900px]">
            {state.movement.missed.map((m) => (
              <Row key={m.nodeId} href={at(m.nodeId)} title={m.title}>
                {m.driverId ? nameOf(peopleById, m.driverId) : 'nobody was named'}
              </Row>
            ))}
          </div>
        </>
      )}

      <h3 className="sec-gap text-[15px] font-semibold">Finished</h3>
      {state.movement.finished.length === 0 ? (
        <p className="grp-gap text-[13px] text-muted">Nothing was finished in this period.</p>
      ) : (
        <div className="panel grp-gap max-w-[900px]">
          {state.movement.finished.map((f) => (
            <Row key={f.nodeId} href={at(f.nodeId)} title={f.title} />
          ))}
        </div>
      )}
    </>
  )
}

/* ---------------------------------------------------------------- 2 ------ */

function StepBlockers({
  state,
  people,
  peopleById,
  at,
  projectOf,
  here,
}: {
  state: CloseState
  people: Person[]
  peopleById: Map<string, string>
  at: (id: string) => string
  projectOf: (id: string) => string
  here: string
}) {
  return (
    <>
      <Head
        title="Blockers"
        note="Every open one. Each needs somebody chasing it and a next step, or it gets read out again next week in the same words. The close will not happen while one is missing either."
      />

      {state.blockers.length === 0 ? (
        <p className="grp-gap text-[13px] text-muted">Nothing is stuck.</p>
      ) : (
        <div className="grp-gap flex flex-col gap-4">
          {state.blockers.map((b) => (
            <div key={b.id} className="panel px-[14px] py-3.5">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <Link href={at(b.nodeId)} className="text-[15px] font-medium hover:text-green">
                  {b.title}
                </Link>
                {/*
                  How many meetings it has been read out in. The number is the
                  argument for escalating, so it is counted from the record
                  rather than kept as a figure that can drift.
                */}
                <span className={`tag ${b.standups >= 3 ? 'tag-rust' : ''}`}>
                  {b.standups} {b.standups === 1 ? 'stand-up' : 'stand-ups'}
                </span>
                <span className="ml-auto text-[12px] text-muted">
                  waiting on {b.waitingOn} · {projectOf(b.nodeId)}
                </span>
              </div>

              <form
                action={answerBlocker}
                className="mt-3 flex flex-wrap items-end gap-3"
              >
                <input type="hidden" name="id" value={b.id} />
                <input type="hidden" name="redirectTo" value={here} />
                <label className="block min-w-[200px]">
                  <span className="lbl text-muted">Who is chasing it</span>
                  <PersonPicker
                    name="driver_id"
                    people={people}
                    value={b.driverId ? [b.driverId] : []}
                  />
                </label>
                <label className="block min-w-[260px] flex-1">
                  <span className="lbl text-muted">Next step</span>
                  <input
                    name="next_step"
                    defaultValue={b.nextStep ?? ''}
                    placeholder="What happens before we meet again"
                    className="field"
                  />
                </label>
                <button className="btn btn-ghost shrink-0">Save</button>
              </form>

              {/* The other answer: it is over. */}
              <form action={settleBlocker} className="mt-2.5 flex flex-wrap items-end gap-3">
                <input type="hidden" name="id" value={b.id} />
                <input type="hidden" name="redirectTo" value={here} />
                <label className="block min-w-[260px] flex-1">
                  <span className="lbl text-muted">Or it came unstuck, because</span>
                  <input
                    name="resolution"
                    required
                    placeholder="IT opened the port"
                    className="field"
                  />
                </label>
                <button className="btn shrink-0">Close it</button>
              </form>

              {b.driverId && b.nextStep && (
                <p className="mt-2.5 text-[12px] text-green">
                  {nameOf(peopleById, b.driverId)} · {b.nextStep}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  )
}

/* ---------------------------------------------------------------- 3 ------ */

function StepNoDriver({
  state,
  people,
  at,
  partOf,
  here,
}: {
  state: CloseState
  people: Person[]
  at: (id: string) => string
  partOf: (id: string) => { id: string; title: string; project: string }
  here: string
}) {
  /*
   * Grouped by the part the work sits in, in the order the list arrived, which
   * is nearest date first. A project with five subprojects each carrying
   * «Master data» draws five identical rows otherwise, and you cannot tell
   * which one you just answered.
   */
  const groups: {
    key: string
    title: string
    project: string
    rows: CloseState['unowned']
  }[] = []
  for (const u of state.unowned) {
    const part = partOf(u.nodeId)
    const last = groups.find((g) => g.key === part.id)
    if (last) last.rows.push(u)
    else groups.push({ key: part.id, title: part.title, project: part.project, rows: [u] })
  }

  const inFlight = state.unowned.filter((u) => u.inFlight && u.parkedUntil === null).length

  return (
    <>
      <Head
        title="No driver"
        note="Every piece of work with nobody on it, whatever state it is in, grouped by the part it sits in. Nearest date first, and within a date whatever holds most people up."
      />

      {/*
        The whole list is here, and only the part of it that is under way can
        stop the close. Refusing over an idea nobody has begun is how a step
        becomes one the room learns to click past, and then the two that matter
        go past with it.
      */}
      <p className="prose-measure grp-gap text-[13px] text-muted">
        {inFlight > 0 ? (
          <>
            <span className="text-rust">{inFlight} of these are under way</span>, and those
            are the ones that hold the close: say a name, or say when it comes back.
            The rest are here because «who has nothing on it» is a question about the
            whole portfolio, and they stop nothing.
          </>
        ) : (
          'Nothing under way is missing a driver. What is left has not been started, so it is here to be seen rather than answered.'
        )}
      </p>

      {state.unowned.length === 0 ? (
        <p className="grp-gap text-[13px] text-muted">Everything has somebody on it.</p>
      ) : (
        <div className="grp-gap flex flex-col gap-[var(--sec)]">
          {groups.map((g) => (
            <div key={g.key}>
              <div className="flex flex-wrap items-baseline gap-x-2.5 border-b border-line-strong pb-2">
                <span className="text-[15px] font-semibold tracking-[-0.02em] text-green">
                  {g.title}
                </span>
                <span className="text-[12px] text-muted">{g.project}</span>
                <span className="mono ml-auto text-[12px] text-muted">{g.rows.length}</span>
              </div>

              {g.rows.map((u) => (
                <div key={u.nodeId} className="border-b border-line py-3 last:border-b-0">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <Link href={at(u.nodeId)} className="text-[14px] font-medium hover:text-green">
                      {u.title}
                    </Link>
                    {u.inFlight ? (
                      <span className="tag tag-rust">Under way</span>
                    ) : (
                      <span className="tag">Not started</span>
                    )}
                    {u.dueDate && (
                      <span className="mono text-[12px] text-muted">{formatDate(u.dueDate)}</span>
                    )}
                    {u.blocks > 0 && (
                      <span className="text-[12px] text-rust">{u.blocks} waiting on it</span>
                    )}
                    {u.parkedUntil && (
                      <span className="ml-auto text-[12px] text-muted">
                        parked until {formatDateLong(u.parkedUntil)}
                      </span>
                    )}
                  </div>

                  <form action={driveOrPark} className="mt-2 flex flex-wrap items-end gap-3">
                    <input type="hidden" name="id" value={u.nodeId} />
                    <input type="hidden" name="redirectTo" value={here} />
                    <label className="block min-w-[200px] flex-1">
                      <span className="lbl text-muted">Driver</span>
                      <PersonPicker name="driver_id" people={people} value={[]} />
                    </label>
                    <label className="block">
                      <span className="lbl text-muted">Or park it until</span>
                      <input
                        type="date"
                        name="parked_until"
                        defaultValue={u.parkedUntil ?? ''}
                        className="field tabular-nums"
                      />
                    </label>
                    <button className="btn btn-ghost shrink-0">Save</button>
                  </form>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </>
  )
}

/* ---------------------------------------------------------------- 4 ------ */

function StepAhead({
  live,
  commitments,
  people,
  peopleById,
  byId,
  at,
  partOf,
  here,
}: {
  live: Live[]
  commitments: StandupItem[]
  people: Person[]
  peopleById: Map<string, string>
  byId: Map<string, Node>
  at: (id: string) => string
  partOf: (id: string) => { id: string; title: string; project: string }
  here: string
}) {
  /*
   * A list, not a picker.
   *
   * It was a select, and a select is exactly wrong here: every option read
   * «2D mapping · Mapping of the Production Lines», nine times, because the
   * same three tasks exist under five subprojects. You cannot choose from a
   * list where the options are indistinguishable, and the thing that
   * distinguishes them is the part they sit in, which a flat list of strings
   * cannot show.
   *
   * So the work is laid out grouped, the way the board lays it out, and each
   * row carries its own two fields. Committing is then one gesture on the
   * thing itself rather than three on a form that describes it.
   */
  const promised = new Set(commitments.map((c) => c.node_id))

  const groups: { key: string; title: string; project: string; rows: Live[] }[] = []
  for (const l of live) {
    if (promised.has(l.id)) continue
    const part = partOf(l.id)
    const found = groups.find((g) => g.key === part.id)
    if (found) found.rows.push(l)
    else groups.push({ key: part.id, title: part.title, project: part.project, rows: [l] })
  }

  return (
    <>
      <Head
        title="Ahead"
        note="What the room promises before it meets again: the task, who takes it, and by when. It is written onto the work rather than into minutes, because minutes and a task disagree the first time somebody moves the date."
      />

      <h3 className="sec-gap text-[15px] font-semibold">
        Agreed here · {commitments.length}
      </h3>
      {commitments.length === 0 ? (
        <p className="grp-gap text-[13px] text-muted">
          Nothing yet. A meeting that promises nothing is a meeting nobody has to
          remember, which is worth noticing rather than filling in.
        </p>
      ) : (
        <div className="panel grp-gap max-w-[900px]">
          {commitments.map((c) => (
            <Row
              key={c.id}
              href={c.node_id ? at(c.node_id) : '#'}
              title={byId.get(c.node_id ?? '')?.title ?? 'work you cannot open'}
              dropId={c.id}
              here={here}
            >
              {c.driver_id ? nameOf(peopleById, c.driver_id) : 'nobody named'}
              {c.due_date && ` · by ${formatDate(c.due_date)}`}
            </Row>
          ))}
        </div>
      )}

      <h3 className="sec-gap text-[15px] font-semibold">Everything in flight</h3>
      {groups.length === 0 ? (
        <p className="grp-gap text-[13px] text-muted">
          Every piece of live work has been promised for this week already.
        </p>
      ) : (
        <div className="grp-gap flex flex-col gap-[var(--sec)]">
          {groups.map((g) => (
            <div key={g.key}>
              <div className="flex flex-wrap items-baseline gap-x-2.5 border-b border-line-strong pb-2">
                <span className="text-[15px] font-semibold tracking-[-0.02em] text-green">
                  {g.title}
                </span>
                <span className="text-[12px] text-muted">{g.project}</span>
                <span className="mono ml-auto text-[12px] text-muted">{g.rows.length}</span>
              </div>

              {g.rows.map((l) => (
                <form
                  key={l.id}
                  action={commit}
                  className="flex flex-wrap items-end gap-3 border-b border-line py-2.5 last:border-b-0"
                >
                  <input type="hidden" name="node_id" value={l.id} />
                  <input type="hidden" name="redirectTo" value={here} />
                  <span className="min-w-[200px] flex-1">
                    <Link href={at(l.id)} className="text-[13px] font-medium hover:text-green">
                      {l.title}
                    </Link>
                    <span className="mt-0.5 block text-[11.5px] text-muted">
                      {l.driverId ? nameOf(peopleById, l.driverId) : 'nobody on it'}
                      {l.dueDate && ` · ${formatDate(l.dueDate)}`}
                    </span>
                  </span>
                  <label className="block min-w-[170px]">
                    <span className="lbl text-muted">Who takes it</span>
                    {/* Defaulted to whoever drives it, because most weeks it is them. */}
                    <PersonPicker
                      name="driver_id"
                      people={people}
                      value={l.driverId ? [l.driverId] : []}
                    />
                  </label>
                  <label className="block">
                    <span className="lbl text-muted">By</span>
                    <input
                      type="date"
                      name="due_date"
                      defaultValue={l.dueDate ?? ''}
                      className="field tabular-nums"
                    />
                  </label>
                  <button className="btn shrink-0">Agree it</button>
                </form>
              ))}
            </div>
          ))}
        </div>
      )}
    </>
  )
}

/* ---------------------------------------------------------------- 5 ------ */

function StepDecisions({
  drafts,
  places,
  byId,
  at,
  here,
}: {
  drafts: StandupItem[]
  places: { id: string; title: string; depth: number }[]
  byId: Map<string, Node>
  at: (id: string) => string
  here: string
}) {
  return (
    <>
      <Head
        title="Decisions"
        note="What the room settled, and where it belongs. These are held until the meeting closes, because a decision is a row that comes into being and one recorded twice is worse than one recorded late."
      />

      {/*
        One form, and the place is chosen inside it.
        It was a select, and a select could not show the one thing that tells
        the options apart: which part they sit in. A decision can also go on a
        project or a subproject, which a list of leaf tasks could not offer at
        all, and «we buy the switch» belongs to the subproject it changes
        rather than to one of the five tasks it affects.
      */}
      <form action={draftDecision} className="grp-gap">
        <input type="hidden" name="redirectTo" value={here} />

        <label className="block">
          <span className="lbl text-muted">What was decided</span>
          <input
            name="decision"
            required
            autoFocus
            placeholder="We buy the switch rather than renting it"
            className="field text-[15px]"
          />
        </label>

        <label className="grp-gap block">
          <span className="lbl text-muted">Why, in one line</span>
          <input
            name="rationale"
            placeholder="The rental is paid back in fourteen months"
            className="field"
          />
        </label>

        <div className="grp-gap">
          <span className="lbl text-muted">Where it belongs</span>
          <div className="panel mt-1.5 max-h-[340px] max-w-[760px] overflow-y-auto">
            {places.map((p) => (
              <label
                key={p.id}
                className="flex cursor-pointer items-baseline gap-2.5 border-b border-line px-[14px] py-1.5 last:border-b-0 hover:bg-hover"
              >
                <input
                  type="radio"
                  name="node_id"
                  value={p.id}
                  required
                  className="shrink-0 accent-green"
                />
                <span
                  className="text-[13px] leading-snug"
                  style={{ paddingLeft: `${p.depth * 16}px` }}
                >
                  {p.title}
                </span>
              </label>
            ))}
          </div>
        </div>

        <button className="btn grp-gap">Record it</button>
      </form>

      <h3 className="sec-gap text-[15px] font-semibold">Decided here · {drafts.length}</h3>
      {drafts.length === 0 ? (
        <p className="grp-gap text-[13px] text-muted">
          Nothing was decided. That is a normal meeting, and nothing here asks you
          to invent one.
        </p>
      ) : (
        <div className="panel grp-gap max-w-[900px]">
          {drafts.map((d) => (
            <Row
              key={d.id}
              href={d.node_id ? at(d.node_id) : '#'}
              title={d.note ?? ''}
              dropId={d.id}
              here={here}
            >
              {byId.get(d.node_id ?? '')?.title ?? 'work you cannot open'}
              {d.next_step && ` · ${d.next_step}`}
            </Row>
          ))}
        </div>
      )}
    </>
  )
}

/* ---------------------------------------------------------------- 6 ------ */

function StepSparks({ drafts, here }: { drafts: StandupItem[]; here: string }) {
  return (
    <>
      <Head
        title="Sparks"
        note="Half thoughts, caught and not discussed. One minute, and the room moves on."
      />

      {/*
        A spark is private to its author, which is the whole premise of the
        spark table. Caught in a meeting it lands in the inbox of whoever
        closes it, and saying so here is the alternative to quietly changing
        what a spark is.
      */}
      <p className="prose-measure grp-gap text-[13px] text-rust">
        These land in your own spark inbox when the meeting closes, not in a
        shared list. A spark is private to whoever caught it.
      </p>

      <form action={draftSpark} className="grp-gap flex flex-wrap items-end gap-3">
        <input type="hidden" name="redirectTo" value={here} />
        <label className="block min-w-[280px] flex-1">
          <span className="lbl text-muted">What was said</span>
          <input
            name="body"
            required
            autoFocus
            placeholder="A dashboard for the line"
            className="field"
          />
        </label>
        <button className="btn shrink-0">Catch it</button>
      </form>

      <h3 className="sec-gap text-[15px] font-semibold">Caught · {drafts.length}</h3>
      {drafts.length === 0 ? (
        <p className="grp-gap text-[13px] text-muted">Nothing yet.</p>
      ) : (
        <div className="panel grp-gap max-w-[900px]">
          {drafts.map((s) => (
            <Row key={s.id} href="#" title={s.note ?? ''} dropId={s.id} here={here} />
          ))}
        </div>
      )}
    </>
  )
}

/* ---------------------------------------------------------------- 7 ------ */

function StepClose({
  standupId,
  state,
  problems,
  peopleById,
  at,
}: {
  standupId: string
  state: CloseState
  problems: string[]
  peopleById: Map<string, string>
  at: (id: string) => string
}) {
  const resolved = state.blockers.filter((b) => b.resolution !== null)
  const carried = state.blockers.filter((b) => b.resolution === null)
  const assigned = state.unowned.filter((u) => u.driverId !== null)
  const parked = state.unowned.filter((u) => u.driverId === null && u.parkedUntil !== null)
  const present = state.attendance.filter((a) => a.present)

  return (
    <>
      <Head
        title="That is the stand-up"
        note="Closing it stamps what the meeting came to, carries what is not finished into the next one, and opens that next one a week from today. The record is then read only: what it says is what was true, which is the whole reason to keep it."
      />

      <Figures
        rows={[
          ['In the room', present.length, present.length === 0],
          ['Came unstuck', resolved.length, false],
          ['Still stuck', carried.length, carried.length > 0],
          ['Given a driver', assigned.length, false],
          ['Agreed ahead', state.commitments.length, false],
          ['Decided', state.decisions.length, false],
        ]}
      />

      {parked.length > 0 && (
        <p className="prose-measure grp-gap text-[13px] text-muted">
          {parked.length} {parked.length === 1 ? 'task is' : 'tasks are'} parked with a
          date to come back to, which the next meeting will not ask about again
          until then.
        </p>
      )}

      <h3 className="sec-gap text-[15px] font-semibold">
        {problems.length === 0 ? 'Nothing is in the way' : 'Before it can close'}
      </h3>

      {problems.length === 0 ? (
        <>
          <p className="prose-measure grp-gap text-[13px] text-green-soft">
            Every blocker has somebody on it and a next step, and every task in
            flight has a driver or a date.
          </p>
          <form action={closeStandup} className="grp-gap">
            <input type="hidden" name="id" value={standupId} />
            <button className="btn">Close the stand-up</button>
          </form>
        </>
      ) : (
        <>
          <div className="panel grp-gap max-w-[900px]">
            {problems.map((p, i) => (
              <p
                key={i}
                className="m-0 border-b border-line px-[14px] py-2.5 text-[13px] leading-snug text-rust last:border-b-0"
              >
                {p}
              </p>
            ))}
          </div>
          <p className="prose-measure grp-gap text-[12px] text-muted">
            The button is not here rather than here and refusing. Steps two and
            three are where these are answered.
          </p>
        </>
      )}

      {state.movement.missed.length > 0 && (
        <>
          <h3 className="sec-gap text-[15px] font-semibold">Carried into the next one</h3>
          <div className="panel grp-gap max-w-[900px]">
            {carried.map((b) => (
              <Row key={b.id} href={at(b.nodeId)} title={b.title}>
                {b.driverId ? nameOf(peopleById, b.driverId) : 'nobody'} ·{' '}
                {b.nextStep ?? 'no next step'}
              </Row>
            ))}
          </div>
        </>
      )}
    </>
  )
}

/* ------------------------------------------------------------ pieces ----- */

function Head({ title, note }: { title: string; note: string }) {
  return (
    <>
      <h1 className="text-[34px] font-semibold leading-[1.08] tracking-[-0.03em] text-green [text-wrap:balance]">
        {title}
      </h1>
      <p className="prose-measure grp-gap text-green-soft">{note}</p>
    </>
  )
}

function Figures({ rows }: { rows: [string, number, boolean][] }) {
  return (
    <div className="sec-gap grid grid-cols-2 border-y border-line-strong lg:grid-cols-3 xl:grid-cols-6">
      {rows.map(([label, value, rust]) => (
        <div key={label} className="border-l border-line px-5 py-[18px] first:border-l-0">
          <b className={`fig-num block ${rust ? 'text-rust' : ''}`}>{value}</b>
          <span className="mt-2 block text-[12px] leading-snug text-muted">{label}</span>
        </div>
      ))}
    </div>
  )
}

function Row({
  href,
  title,
  children,
  dropId,
  here,
}: {
  href: string
  title: string
  children?: React.ReactNode
  /** Set where the row is a draft the meeting can take back. */
  dropId?: string
  here?: string
}) {
  return (
    <div className="flex items-baseline gap-3 border-b border-line px-[14px] py-2.5 last:border-b-0">
      <span className="min-w-0 flex-1">
        {href === '#' ? (
          <span className="text-[13px] leading-snug">{title}</span>
        ) : (
          <Link href={href} className="text-[13px] leading-snug hover:text-green">
            {title}
          </Link>
        )}
        {children && (
          <span className="mt-0.5 block text-[12px] leading-snug text-muted">{children}</span>
        )}
      </span>
      {dropId && here && (
        <form action={dropDraft} className="shrink-0">
          <input type="hidden" name="id" value={dropId} />
          <input type="hidden" name="redirectTo" value={here} />
          <button className="act text-muted">Take back</button>
        </form>
      )}
    </div>
  )
}
