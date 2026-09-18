/**
 * What closing a stand-up decides.
 *
 * Every judgement the close makes lives here, in functions that take rows and
 * return values, and the Postgres function that does the writing holds none of
 * it. That split is not tidiness. The test suite in this repo runs pure
 * functions with node and cannot reach a stored procedure at all, so logic
 * written in plpgsql is logic nothing checks and therefore logic nobody will
 * dare change six months from now. TypeScript decides; the database does the
 * one thing TypeScript cannot, which is to apply five tables' worth of writes
 * or none of them.
 *
 * Three functions, in the order the close runs them:
 *
 *   validate      why the button is still disabled
 *   carryForward  what the room did not finish, and what becomes of it
 *   snapshot      what the meeting says it was, frozen
 *
 * THE SNAPSHOT IS NEVER RECOMPUTED. It is stored on the row and read back as
 * it was written. A retrospective that changes when the work moves is not a
 * record of a meeting, it is a view of today wearing last week's date.
 */

export type CloseKind = 'blocker' | 'unowned' | 'commitment' | 'decision' | 'spark'
export type CloseAction =
  | 'resolved'
  | 'carried'
  | 'assigned'
  | 'parked'
  | 'logged'
  | 'missed'

/** An open blocker as the meeting answered it. */
export type BlockerAnswer = {
  id: string
  nodeId: string
  title: string
  /** Who it waits on, as typed. Still text: usually an organisation. */
  waitingOn: string
  /** How many stand-ups it has now been carried through, this one included. */
  standups: number
  /** The account taking it forward. Null until somebody says. */
  driverId: string | null
  /** What happens next. Null until somebody says. */
  nextStep: string | null
  /** Set when the room closed it. */
  resolution: string | null
}

/** A task with nobody on it. */
export type UnownedAnswer = {
  nodeId: string
  title: string
  dueDate: string | null
  /** How many other pieces of work wait on this one. */
  blocks: number
  driverId: string | null
  parkedUntil: string | null
  /**
   * Whether it is under way, which is what decides whether it can stop the
   * close. The list shows every task with nobody on it, because «who has
   * nothing on it» is a question about the whole portfolio and an answer that
   * only counted active work would be a list that looks complete and is not.
   * Refusing the close over an idea nobody has begun would turn the step into
   * something the room learns to click past, so only work in flight blocks it.
   */
  inFlight: boolean
}

/** Something the room committed to before the next meeting. */
export type Commitment = {
  nodeId: string
  title: string
  driverId: string | null
  dueDate: string | null
}

export type DecisionAnswer = {
  nodeId: string
  decision: string
  rationale: string | null
  topic: string | null
}

export type SparkAnswer = { body: string; note: string | null }

export type Attendance = { personId: string; present: boolean }

/** What happened in the period, read from the work rather than from the room. */
export type Movement = {
  finished: { nodeId: string; title: string }[]
  lines: number
  /** Commitments made last time that are still not done. */
  missed: { nodeId: string; title: string; driverId: string | null }[]
}

export type CloseState = {
  standupId: string
  /** Null on the first meeting, which is the absence of a period, not a quiet one. */
  periodFrom: string | null
  /** The instant the close is being made. */
  closingAt: string
  attendance: Attendance[]
  movement: Movement
  blockers: BlockerAnswer[]
  unowned: UnownedAnswer[]
  commitments: Commitment[]
  decisions: DecisionAnswer[]
  sparks: SparkAnswer[]
}

/* ------------------------------------------------------------------------ */
/* 1. Why the button is still disabled                                       */
/* ------------------------------------------------------------------------ */

/**
 * What is stopping the meeting from closing, in the words the room needs.
 *
 * Two rules, and both are about a thing having an answer rather than about a
 * thing being finished.
 *
 * A BLOCKER NEEDS A NEXT STEP. It used to need a driver as well, and that was
 * one demand too many: the next step IS the position the room took, and the
 * name is often obvious in a team of three. Insisting on both meant a meeting
 * that had genuinely dealt with something still could not close, which teaches
 * people to type a name they do not mean. What stops a blocker sitting for a
 * month is not the field, it is the count of how many stand-ups it has been
 * read out in, and that is on the row where the room can see it.
 *
 * A TASK IN FLIGHT needs a driver or a date to come back to. Work that has not
 * started is exempt: it is on the list, because «who has nothing on it» is a
 * question about the whole portfolio, and it does not block the close, because
 * refusing over an idea nobody has begun is how a step becomes one people click
 * past.
 *
 * Nothing about decisions, commitments or sparks: those are things the room
 * MAY produce, and a meeting where nobody decided anything is a normal meeting.
 * A validator that insisted otherwise would be answered with a typed sentence
 * nobody means, which is worse than an empty list.
 *
 * The messages name the thing rather than counting it. «2 blockers need a
 * driver» is a number you then have to go and find.
 */
export function validate(state: CloseState): string[] {
  const problems: string[] = []

  for (const b of state.blockers) {
    if (b.resolution !== null) continue
    if (b.nextStep === null || b.nextStep.trim() === '') {
      problems.push(`«${b.title}» has no next step.`)
    }
  }

  for (const u of state.unowned) {
    if (!u.inFlight) continue
    if (u.driverId === null && u.parkedUntil === null) {
      problems.push(`«${u.title}» is under way with no driver and no date to come back to.`)
    }
  }

  return problems
}

/* ------------------------------------------------------------------------ */
/* 2. What the room did not finish                                           */
/* ------------------------------------------------------------------------ */

export type ItemWrite = {
  node_id: string | null
  kind: CloseKind
  action: CloseAction
  driver_id: string | null
  next_step: string | null
  due_date: string | null
  parked_until: string | null
  note: string | null
}

export type Writes = {
  items: ItemWrite[]
  drivers: { node_id: string; driver_id: string }[]
  parked: { node_id: string; parked_until: string }[]
  blockers: { id: string; resolution: string; resolved_at: string }[]
  decisions: {
    node_id: string
    decision: string
    rationale: string | null
    topic: string | null
    decided_on: string
  }[]
  sparks: SparkAnswer[]
}

/**
 * Everything the close writes, worked out in one place.
 *
 * The RPC applies this list and reads nothing of its own, so what is here is
 * exactly what the meeting changes. Reading it is reading the whole of what
 * pressing the button does.
 *
 * A blocker is `resolved` or `carried`; there is no third state, because a
 * blocker the room discussed and left alone is carried whether anybody said so
 * or not. An unowned task is `assigned` or `parked`, and validate has already
 * refused the case where it is neither. A commitment is `logged`. What was
 * committed last time and is still not done is `missed`, and that row is what
 * puts it under «not done» in next week's chapter one: the finding is recorded
 * at the meeting that found it, not recomputed later by a rule that might have
 * changed.
 */
export function carryForward(state: CloseState): Writes {
  const day = state.closingAt.slice(0, 10)
  const items: ItemWrite[] = []

  const blockers: Writes['blockers'] = []
  for (const b of state.blockers) {
    const resolved = b.resolution !== null && b.resolution.trim() !== ''
    if (resolved) {
      blockers.push({ id: b.id, resolution: b.resolution as string, resolved_at: day })
    }
    items.push({
      node_id: b.nodeId,
      kind: 'blocker',
      action: resolved ? 'resolved' : 'carried',
      driver_id: b.driverId,
      next_step: resolved ? null : b.nextStep,
      due_date: null,
      parked_until: null,
      /* How long it has been read out. The number the next meeting needs. */
      note: resolved ? b.resolution : `${b.standups} stand-ups`,
    })
  }

  const drivers: Writes['drivers'] = []
  const parked: Writes['parked'] = []
  for (const u of state.unowned) {
    if (u.driverId !== null) {
      drivers.push({ node_id: u.nodeId, driver_id: u.driverId })
      items.push({
        node_id: u.nodeId,
        kind: 'unowned',
        action: 'assigned',
        driver_id: u.driverId,
        next_step: null,
        due_date: u.dueDate,
        parked_until: null,
        note: null,
      })
    } else if (u.parkedUntil !== null) {
      parked.push({ node_id: u.nodeId, parked_until: u.parkedUntil })
      items.push({
        node_id: u.nodeId,
        kind: 'unowned',
        action: 'parked',
        driver_id: null,
        next_step: null,
        due_date: null,
        parked_until: u.parkedUntil,
        note: null,
      })
    }
  }

  for (const c of state.commitments) {
    /* A commitment names a driver as well, which is the point of making one. */
    if (c.driverId !== null) drivers.push({ node_id: c.nodeId, driver_id: c.driverId })
    items.push({
      node_id: c.nodeId,
      kind: 'commitment',
      action: 'logged',
      driver_id: c.driverId,
      next_step: null,
      due_date: c.dueDate,
      parked_until: null,
      note: null,
    })
  }

  for (const m of state.movement.missed) {
    items.push({
      node_id: m.nodeId,
      kind: 'commitment',
      action: 'missed',
      driver_id: m.driverId,
      next_step: null,
      due_date: null,
      parked_until: null,
      note: null,
    })
  }

  const decisions: Writes['decisions'] = state.decisions.map((d) => ({
    node_id: d.nodeId,
    decision: d.decision,
    rationale: d.rationale,
    topic: d.topic,
    decided_on: day,
  }))

  for (const d of state.decisions) {
    items.push({
      node_id: d.nodeId,
      kind: 'decision',
      action: 'logged',
      driver_id: null,
      next_step: null,
      due_date: null,
      parked_until: null,
      note: d.decision,
    })
  }

  for (const s of state.sparks) {
    items.push({
      node_id: null,
      kind: 'spark',
      action: 'logged',
      driver_id: null,
      next_step: null,
      due_date: null,
      parked_until: null,
      note: s.body,
    })
  }

  /*
   * The same node can be named twice, once under «no driver» and once in a
   * commitment. The last word wins, which is the order the room walked: step
   * four comes after step three, so a commitment made there overrides a name
   * given earlier in the same meeting.
   */
  const byNode = new Map<string, string>()
  for (const d of drivers) byNode.set(d.node_id, d.driver_id)

  return {
    items,
    drivers: [...byNode.entries()].map(([node_id, driver_id]) => ({ node_id, driver_id })),
    parked,
    blockers,
    decisions,
    sparks: state.sparks,
  }
}

/* ------------------------------------------------------------------------ */
/* 3. What the meeting says it was                                           */
/* ------------------------------------------------------------------------ */

export type Summary = {
  /** The range this meeting reported on. `from` is null on the first one. */
  period: { from: string | null; to: string }
  present: string[]
  absent: string[]
  finished: { nodeId: string; title: string }[]
  lines: number
  missed: { nodeId: string; title: string }[]
  blockers: {
    resolved: { title: string; resolution: string }[]
    carried: { title: string; waitingOn: string; standups: number; nextStep: string | null }[]
  }
  assigned: { nodeId: string; title: string; driverId: string }[]
  parked: { nodeId: string; title: string; until: string }[]
  commitments: { nodeId: string; title: string; driverId: string | null; dueDate: string | null }[]
  decisions: { nodeId: string; decision: string }[]
  sparks: number
}

/**
 * The snapshot, exactly as it will be read back.
 *
 * Ids travel beside every title. A summary of names alone cannot be clicked,
 * and the one thing somebody reading last month's meeting wants is to open the
 * thing it was about. Titles travel too, and are not looked up later: a task
 * renamed in November must not rewrite what October's meeting said it agreed.
 */
export function snapshot(state: CloseState): Summary {
  const resolved = state.blockers.filter(
    (b) => b.resolution !== null && b.resolution.trim() !== '',
  )
  const carried = state.blockers.filter(
    (b) => b.resolution === null || b.resolution.trim() === '',
  )

  return {
    period: { from: state.periodFrom, to: state.closingAt },
    present: state.attendance.filter((a) => a.present).map((a) => a.personId),
    absent: state.attendance.filter((a) => !a.present).map((a) => a.personId),
    finished: state.movement.finished,
    lines: state.movement.lines,
    missed: state.movement.missed.map((m) => ({ nodeId: m.nodeId, title: m.title })),
    blockers: {
      resolved: resolved.map((b) => ({ title: b.title, resolution: b.resolution as string })),
      carried: carried.map((b) => ({
        title: b.title,
        waitingOn: b.waitingOn,
        standups: b.standups,
        nextStep: b.nextStep,
      })),
    },
    assigned: state.unowned
      .filter((u) => u.driverId !== null)
      .map((u) => ({ nodeId: u.nodeId, title: u.title, driverId: u.driverId as string })),
    parked: state.unowned
      .filter((u) => u.driverId === null && u.parkedUntil !== null)
      .map((u) => ({ nodeId: u.nodeId, title: u.title, until: u.parkedUntil as string })),
    commitments: state.commitments.map((c) => ({
      nodeId: c.nodeId,
      title: c.title,
      driverId: c.driverId,
      dueDate: c.dueDate,
    })),
    decisions: state.decisions.map((d) => ({ nodeId: d.nodeId, decision: d.decision })),
    sparks: state.sparks.length,
  }
}

/* ------------------------------------------------------------------------ */
/* The period                                                                */
/* ------------------------------------------------------------------------ */

/**
 * Whether an instant belongs to this meeting's period.
 *
 * Half open: after `from`, up to and including `to`. That is what stops a line
 * written at the moment of closing being counted by both meetings, and it is
 * the only rule here that is about arithmetic rather than about a decision.
 *
 * A null `from` is the first meeting and takes everything before `to`, which is
 * not the same as a quiet period and is why it is not a date.
 */
export function inPeriod(at: string, from: string | null, to: string): boolean {
  if (at > to) return false
  return from === null || at > from
}
