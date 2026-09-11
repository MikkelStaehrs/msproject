/**
 * The weekly stand-up, worked out rather than written down.
 *
 * A stand-up agenda is normally a document somebody prepares, which means it is
 * out of date by the time the room sits down and it is prepared by the one
 * person who least needs it. Everything on this agenda is already in the
 * database: what is waiting, what is late, what is ready and nobody started,
 * what happened that nobody wrote a line about. So the agenda is derived, and
 * the only thing anyone has to do is hold the meeting.
 *
 * THE ONE THING THAT CANNOT BE DERIVED is when the last stand-up actually
 * happened. It is tempting to take it from the calendar - it is weekly, so last
 * Monday - but a skipped week would then hide a week of movement without saying
 * so. So a stand-up records the day it was held, and that single date is the
 * boundary every "since last time" here is measured from.
 *
 * NOTHING IS TICKED OFF. An item leaves the agenda by being answered: the
 * blocker is resolved, the task is done, the line is written. A list you tick
 * is a second copy of the truth, and the second copy is the one that goes
 * stale.
 */

import { addDays, daysBetween } from './date.ts'

/** How often the room meets. One line, so it is one line to change. */
export const CADENCE_DAYS = 7

/**
 * Why an item is on the agenda. The order of this list IS the order of the
 * meeting, and it is deliberate:
 *
 *   someone is waiting, and the wait is now late      talk about it first
 *   someone is waiting                                they may be in the room
 *   work whose date has passed                        it did not happen
 *   work due before the next stand-up                 it is about to
 *   something happened and nobody wrote a line        the record, not the work
 *
 * Waiting outranks lateness because a wait needs a person and a late task needs
 * a decision, and the person is the one who might walk out of the room.
 */
export const AGENDA_ORDER = [
  'overdue_blocker',
  'blocker',
  'overdue',
  'due_soon',
  'loose_end',
] as const
export type AgendaKind = (typeof AGENDA_ORDER)[number]

export const AGENDA_LABEL: Record<AgendaKind, string> = {
  overdue_blocker: 'Late answer',
  blocker: 'Waiting',
  overdue: 'Past its date',
  due_soon: 'Before next time',
  loose_end: 'Unwritten',
}

export type AgendaItem = {
  kind: AgendaKind
  /** What the item is about, so the room can open it. */
  nodeId: string
  title: string
  /**
   * Who the item needs. Null where it needs a decision rather than a person,
   * which is most of them: only a blocker names somebody.
   */
  who: string | null
  /**
   * The number that earns its place within its kind: days waited, or days late.
   * Zero where neither applies.
   */
  days: number
  /** A date worth showing, where there is one. */
  on: string | null
  /** One line saying what the room is being asked to do about it. */
  why: string
}

export type AgendaInput = {
  nodes: {
    id: string
    parent_id: string | null
    title: string
    status: string
    due_date: string | null
    completed_at: string | null
  }[]
  blockers: {
    id: string
    node_id: string
    title: string
    waiting_on: string
    opened_at: string
    expected_by: string | null
    resolved_at: string | null
  }[]
  /** From v_node_ready. A node absent from this map is treated as not ready. */
  ready: Map<string, boolean>
  /** Already derived on the overview; reused rather than worked out twice. */
  looseEnds: { nodeId: string; what: string; on: string }[]
  today: string
}

const day = (timestamp: string) => timestamp.slice(0, 10)
const OVER = new Set(['done', 'cancelled'])

/**
 * What a stand-up is about: work somebody is actually doing.
 *
 * Not `idea`, not `planned`, not `paused`. The room is not interested in
 * discussing a project nobody has begun, and a list that carries them is a list
 * where the eight things in flight are outnumbered by the nineteen that are not.
 *
 * This is narrower than it was and narrower on a DIFFERENT axis than the version
 * MASTER argued against. That one filtered by RULE, showing only what a dated
 * rule had flagged, and it came to four pieces out of thirty five: the ranking
 * was fine and the surface was hiding the work. This filters by STATUS, which
 * hides nothing that anybody has started.
 */
const ACTIVE = 'active'

/**
 * The agenda, in the order it should be walked.
 *
 * Projects themselves are left out of the dated kinds on purpose. A project is
 * late because something under it is late, and putting both on the agenda means
 * saying the same thing twice with the vaguer one first.
 */
export function agenda(input: AgendaInput): AgendaItem[] {
  const { today } = input
  const until = addDays(today, CADENCE_DAYS)
  const items: AgendaItem[] = []

  const byId = new Map(input.nodes.map((n) => [n.id, n]))

  for (const b of input.blockers) {
    if (b.resolved_at !== null) continue
    /*
     * On active work only. A blocker on something nobody has started is a note
     * about a future problem, and the meeting is for the ones in the way now.
     */
    if (byId.get(b.node_id)?.status !== ACTIVE) continue
    const waited = daysBetween(day(b.opened_at), today)
    const late = b.expected_by !== null && b.expected_by < today
    items.push({
      kind: late ? 'overdue_blocker' : 'blocker',
      nodeId: b.node_id,
      title: b.title,
      who: b.waiting_on,
      days: waited,
      on: b.expected_by,
      why: late
        ? `Promised by ${b.expected_by} and still open after ${waited} days. Ask for a date, or take it somewhere else.`
        : `Waiting ${waited} days on ${b.waiting_on}.`,
    })
  }

  for (const n of input.nodes) {
    if (n.status !== ACTIVE || n.completed_at !== null) continue

    // A project is late because its parts are. Only the parts go on the list.
    const isProject = n.parent_id === null
    if (isProject) continue

    if (n.due_date !== null) {
      if (n.due_date < today) {
        items.push({
          kind: 'overdue',
          nodeId: n.id,
          title: n.title,
          who: null,
          days: daysBetween(n.due_date, today),
          on: n.due_date,
          why: `Its date was ${n.due_date}. Either it moves or it is finished.`,
        })
        continue
      }
      if (n.due_date <= until) {
        items.push({
          kind: 'due_soon',
          nodeId: n.id,
          title: n.title,
          who: null,
          days: daysBetween(today, n.due_date),
          on: n.due_date,
          why: `Due ${n.due_date}, before the next stand-up.`,
        })
        continue
      }
    }

    /*
     * «Ready and untouched» used to live here: planned or idea, nothing in its
     * way, nobody has picked it up. It was the cheapest item on the agenda and
     * it is gone, because it is the one rule that could only ever fire on work
     * nobody had started, which is what this meeting has decided not to discuss.
     *
     * Losing it costs something real and it is worth naming rather than
     * pretending otherwise: that work is now invisible on this page, and it was
     * invisible everywhere else, which is why the rule existed. Bring it back by
     * putting the status filter behind a choice rather than by reinstating the
     * rule underneath one.
     */
  }

  for (const l of input.looseEnds) {
    /*
     * The same cut, through the last door it could come in by.
     *
     * lib/loose-ends has its own rule and reports silence on `planned` work as
     * well as active, which is right there: a scheduled task nobody has written
     * about is worth a nudge. It is wrong HERE, and it slipped through on the
     * first run: «Retrofit: CT Scan» arrived on an agenda that had just been
     * narrowed to active work, wearing the one label that was not filtered.
     */
    if (byId.get(l.nodeId)?.status !== ACTIVE) continue
    items.push({
      kind: 'loose_end',
      nodeId: l.nodeId,
      title: byId.get(l.nodeId)?.title ?? l.what,
      who: null,
      days: daysBetween(l.on, today),
      on: l.on,
      why: `${l.what}. Nobody wrote a line about it.`,
    })
  }

  const rank = (k: AgendaKind) => AGENDA_ORDER.indexOf(k)
  return items.sort(
    (a, b) =>
      rank(a.kind) - rank(b.kind) ||
      b.days - a.days ||
      (a.title < b.title ? -1 : a.title > b.title ? 1 : 0),
  )
}

export type Attendee = {
  who: string
  items: number
  /** The longest anybody has waited on them. The reason to chase, in a number. */
  longestWait: number
}

/**
 * Who the agenda needs in the room.
 *
 * Derived, and that is the point: an invitation list kept by hand invites the
 * same six people every week whether or not anything needs them, and then the
 * one person who could unblock the oldest item is not there. Here the list is
 * whoever something is waiting on, ordered by how much of the meeting is about
 * them.
 */
export function attendees(items: AgendaItem[]): Attendee[] {
  const by = new Map<string, Attendee>()
  for (const i of items) {
    if (i.who === null || i.who.trim() === '') continue
    const key = i.who.trim()
    const seen = by.get(key)
    if (seen) {
      seen.items += 1
      seen.longestWait = Math.max(seen.longestWait, i.days)
    } else {
      by.set(key, { who: key, items: 1, longestWait: i.days })
    }
  }
  return [...by.values()].sort(
    (a, b) =>
      b.items - a.items || b.longestWait - a.longestWait || (a.who < b.who ? -1 : 1),
  )
}

export type Movement = {
  completed: { nodeId: string; title: string; on: string }[]
  resolved: { title: string; who: string; on: string }[]
  opened: { title: string; who: string; on: string }[]
  /** How many log lines were written in the period. Effort, not outcome. */
  written: number
}

/**
 * What moved since the last stand-up.
 *
 * `since` is exclusive and may be null, which means there has never been a
 * stand-up and everything counts. Null rather than a fallback date, because
 * "the first meeting" and "a quiet week" are different things and a fallback
 * would make them look identical.
 */
export function movement(
  input: {
    nodes: { id: string; title: string; completed_at: string | null }[]
    blockers: {
      title: string
      waiting_on: string
      opened_at: string
      resolved_at: string | null
    }[]
    entries: { entry_date: string }[]
  },
  since: string | null,
): Movement {
  const after = (iso: string) => since === null || iso > since
  const newestFirst = (a: { on: string }, b: { on: string }) => (a.on < b.on ? 1 : -1)

  return {
    completed: input.nodes
      .filter((n) => n.completed_at !== null && after(day(n.completed_at)))
      .map((n) => ({ nodeId: n.id, title: n.title, on: day(n.completed_at as string) }))
      .sort(newestFirst),
    resolved: input.blockers
      .filter((b) => b.resolved_at !== null && after(day(b.resolved_at)))
      .map((b) => ({ title: b.title, who: b.waiting_on, on: day(b.resolved_at as string) }))
      .sort(newestFirst),
    opened: input.blockers
      .filter((b) => after(day(b.opened_at)))
      .map((b) => ({ title: b.title, who: b.waiting_on, on: day(b.opened_at) }))
      .sort(newestFirst),
    written: input.entries.filter((e) => after(e.entry_date)).length,
  }
}
