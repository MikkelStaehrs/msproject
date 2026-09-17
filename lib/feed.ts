/**
 * What has happened, and which of it is about you.
 *
 * DERIVED, not recorded. Every item here is a row that already existed with a
 * date on it: a line, a blocker opened or closed, a decision, a piece of work
 * finished or created. Nothing is written when something happens, which is why
 * this works backwards over the whole database rather than starting empty on
 * the day it shipped, and why there is no second copy of the truth to keep in
 * step with the first.
 *
 * What it costs is precision about verbs. A feed assembled from rows can say a
 * task was finished; it cannot say who changed its status from active to done,
 * because nothing anywhere recorded that. In particular IT CANNOT SEE WHEN A
 * DRIVER CHANGED HANDS: `node.owner` holds who it is now and no history of who
 * it was, so «you have been made driver of Master data» is not a thing this can
 * ever say. Adding it means recording status and owner changes as events, which
 * is the event table this deliberately does not have.
 *
 * WHAT «ABOUT YOU» MEANS, and it is a narrow thing on purpose:
 *
 *   - you are the driver of the work it happened on
 *   - it is a blocker waiting on you by name
 *
 * And never, in either case, when you did it yourself. A notification about
 * your own typing is noise with your name on it.
 *
 * A DRIVER IS MATCHED BY KEY. This used to fold names and compare spellings,
 * which made the bell a thing that silently stopped ringing the day somebody
 * typed «Mikkel S» on a task. `node.driver_id` is a reference now, so the
 * question «is this mine» is an equality and not a guess.
 *
 * `blocker.waiting_on` is still text and still matched by name, and that is
 * not an oversight left behind: the party a blocker waits on is «Internal IT»
 * or a supplier far more often than it is a colleague. It is the one place
 * here where a spelling still decides something, and the only cost of a miss
 * is a notification you do not get about a wait you can see on the work.
 */

export const FEED_ORDER = [
  'blocker_opened',
  'blocker_closed',
  'decision',
  'finished',
  'created',
  'line',
] as const
export type FeedKind = (typeof FEED_ORDER)[number]

export const FEED_LABEL: Record<FeedKind, string> = {
  blocker_opened: 'Stuck',
  blocker_closed: 'Unstuck',
  decision: 'Decided',
  finished: 'Finished',
  created: 'Added',
  line: 'Line',
}

/** The glyph each kind carries, the same four the log stream uses. */
export const FEED_GLYPH: Record<FeedKind, string> = {
  blocker_opened: '!',
  blocker_closed: '!',
  decision: '?',
  finished: '·',
  created: '+',
  line: '·',
}

export type FeedItem = {
  /** Stable within one assembly: the kind and the row it came from. */
  id: string
  kind: FeedKind
  /** The node it happened on, so the row can be opened. */
  nodeId: string
  /** What the work is called. */
  where: string
  /** The event itself, in one line. */
  line: string
  /**
   * An ISO instant, or a plain date where the row only ever carried one.
   * `sortKey` is what ordering and the seen boundary actually use.
   */
  at: string
  sortKey: string
  /** Who did it, already resolved to a name. Null where nothing recorded it. */
  who: string | null
  /** It names you, and you are not the one who did it. */
  mine: boolean
  /** Requires a human: a blocker that opened on you. */
  rust: boolean
}

export type FeedInput = {
  nodes: {
    id: string
    parent_id: string | null
    title: string
    type: string
    driver_id: string | null
    status: string
    completed_at: string | null
    created_at: string
    created_by: string | null
  }[]
  entries: {
    id: string
    node_id: string
    body: string
    created_at: string
    created_by: string | null
  }[]
  blockers: {
    id: string
    node_id: string
    title: string
    waiting_on: string
    opened_at: string
    resolved_at: string | null
    resolution: string | null
    created_at: string
    created_by: string | null
  }[]
  decisions: {
    id: string
    node_id: string
    decision: string
    decided_on: string
    created_at: string
    created_by: string | null
  }[]
  /** id to name, for the author. An account with no name shows as its email. */
  nameOf: Map<string, string>
  /** The account reading the feed. The name is only for blocker recipients. */
  me: { id: string; name: string | null }
}

/**
 * A date with no time sorts at the END of its day.
 *
 * Two of these rows carry a date and not an instant, because that is what was
 * asked for when they were designed: a blocker is resolved ON a day and a
 * decision is made ON a day, and nobody was ever going to type a time. Placing
 * them at the start of the day would claim they happened before every line
 * written that day, which is a claim nothing supports. Placing them at the end
 * claims the opposite, which is equally unsupported and at least errs towards
 * «this is the newest thing I know about that day», which is the reading a feed
 * is for.
 */
/** Case and stray spacing do not make a new person. */
const fold = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase()

const sortable = (at: string) => (at.length === 10 ? `${at}T23:59:59.999Z` : at)

export function feedItems(input: FeedInput): FeedItem[] {
  const byId = new Map(input.nodes.map((n) => [n.id, n]))
  const myName = input.me.name === null ? null : fold(input.me.name)

  /**
   * A name that is mine, for the one field that is still a name.
   * Null on either side is nobody, and nobody is not me.
   */
  const isMyName = (written: string | null) =>
    myName !== null && written !== null && fold(written) === myName

  /** Work I drive. An equality, because a driver is an account. */
  const iDrive = (nodeId: string) => {
    const owner = byId.get(nodeId)?.driver_id ?? null
    return owner !== null && owner === input.me.id
  }

  const titleOf = (nodeId: string) => byId.get(nodeId)?.title ?? 'work you cannot open'

  /**
   * It is about me if it happened on work I drive, and I did not do it.
   *
   * The second half is the half that keeps the bell worth looking at. Writing a
   * line on your own task is the most common thing anybody does in this
   * application, and a feed that reported it back would be mostly your own
   * echo.
   */
  const isMine = (author: string | null) => author !== null && author === input.me.id

  const aboutMe = (nodeId: string, author: string | null) =>
    !isMine(author) && iDrive(nodeId)

  const out: FeedItem[] = []

  for (const e of input.entries) {
    out.push({
      id: `line:${e.id}`,
      kind: 'line',
      nodeId: e.node_id,
      where: titleOf(e.node_id),
      line: e.body,
      at: e.created_at,
      sortKey: sortable(e.created_at),
      who: e.created_by === null ? null : (input.nameOf.get(e.created_by) ?? null),
      mine: aboutMe(e.node_id, e.created_by),
      rust: false,
    })
  }

  for (const b of input.blockers) {
    /*
     * A blocker waiting on you is about you whoever opened it, INCLUDING when
     * you opened it yourself. That is the one deliberate exception to the rule
     * above, and it is not an inconsistency: the other kinds tell you what
     * somebody did, and this one tells you that something is waiting, which
     * goes on being true and goes on being yours no matter who typed it.
     */
    const waitingOnMe = isMyName(b.waiting_on)
    out.push({
      id: `stuck:${b.id}`,
      kind: 'blocker_opened',
      nodeId: b.node_id,
      where: titleOf(b.node_id),
      line: `${b.title} · waiting on ${b.waiting_on}`,
      at: b.created_at,
      sortKey: sortable(b.created_at),
      who: b.created_by === null ? null : (input.nameOf.get(b.created_by) ?? null),
      mine: waitingOnMe || aboutMe(b.node_id, b.created_by),
      rust: waitingOnMe,
    })

    if (b.resolved_at !== null) {
      out.push({
        id: `unstuck:${b.id}`,
        kind: 'blocker_closed',
        nodeId: b.node_id,
        where: titleOf(b.node_id),
        line: b.resolution ? `${b.title} · ${b.resolution}` : b.title,
        at: b.resolved_at,
        sortKey: sortable(b.resolved_at),
        /* Nothing records who closed it, and the opener is a bad guess. */
        who: null,
        mine: waitingOnMe || iDrive(b.node_id),
        rust: false,
      })
    }
  }

  for (const d of input.decisions) {
    out.push({
      id: `decision:${d.id}`,
      kind: 'decision',
      nodeId: d.node_id,
      where: titleOf(d.node_id),
      line: d.decision,
      at: d.decided_on,
      sortKey: sortable(d.decided_on),
      who: d.created_by === null ? null : (input.nameOf.get(d.created_by) ?? null),
      mine: aboutMe(d.node_id, d.created_by),
      rust: false,
    })
  }

  for (const n of input.nodes) {
    if (n.completed_at !== null) {
      out.push({
        id: `done:${n.id}`,
        kind: 'finished',
        nodeId: n.id,
        where: byId.get(n.parent_id ?? '')?.title ?? n.title,
        line: n.title,
        at: n.completed_at,
        sortKey: sortable(n.completed_at),
        /* `created_by` made it; nothing recorded who finished it. */
        who: null,
        mine: iDrive(n.id),
        rust: false,
      })
    }

    /*
     * A project appearing is news. A task appearing under a subproject you
     * drive is news. A task appearing under somebody else's work is the shape
     * of the tree changing, which the map already draws, so it is in the feed
     * and it is not yours.
     */
    out.push({
      id: `new:${n.id}`,
      kind: 'created',
      nodeId: n.id,
      where: byId.get(n.parent_id ?? '')?.title ?? 'the portfolio',
      line: n.title,
      at: n.created_at,
      sortKey: sortable(n.created_at),
      who: n.created_by === null ? null : (input.nameOf.get(n.created_by) ?? null),
      mine: !isMine(n.created_by) && iDrive(n.id),
      rust: false,
    })
  }

  return out.sort((a, b) => (a.sortKey < b.sortKey ? 1 : a.sortKey > b.sortKey ? -1 : 0))
}

/**
 * How many of the items that name you have arrived since you last looked.
 *
 * The number on the bell, and the only number in this file. `seenAt` null means
 * you have never marked it seen, and everything counts: a bell that starts at
 * zero on a database with a year of history in it would be lying about the
 * only thing it says.
 */
export function unseenCount(items: FeedItem[], seenAt: string | null): number {
  return items.filter((i) => i.mine && (seenAt === null || i.sortKey > seenAt)).length
}
