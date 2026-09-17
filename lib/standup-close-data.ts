import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { CloseState } from '@/lib/standup-close'
import { inPeriod } from '@/lib/standup-close'
import type { BlockerDays, Entry, Node, StandupAttendee, StandupItem } from '@/lib/types'

/**
 * Everything the close needs to decide, read in one place.
 *
 * Kept apart from lib/standup-close.ts on purpose: that file is pure and is
 * tested, and the moment it knows how to reach a database it stops being
 * either. This is the seam. It reads rows and shapes them; it decides nothing.
 *
 * It is read by BOTH the last step of the stepper, to show why the button is
 * still disabled, and by the action that presses it. Two readings of the same
 * state, so the screen cannot promise something the close then refuses.
 */
export async function readCloseState(
  supabase: SupabaseClient,
  standupId: string,
): Promise<CloseState> {
  const [standupRes, nodeRes, blockerRes, entryRes, itemRes, attendeeRes, historyRes] =
    await Promise.all([
      supabase.from('standup').select('*').eq('id', standupId).single(),
      supabase.from('node').select('*'),
      supabase.from('v_blocker_days').select('*'),
      supabase.from('entry').select('id, node_id, created_at'),
      supabase.from('standup_item').select('*').eq('standup_id', standupId),
      supabase.from('standup_attendee').select('*').eq('standup_id', standupId),
      /* Every item ever, so a carried blocker can say how long it has been read out. */
      supabase.from('standup_item').select('ref_id, kind, standup_id'),
    ])

  const standup = standupRes.data as {
    id: string
    period_from: string | null
  }
  if (!standup) throw new Error('That stand-up does not exist, or you cannot see it.')

  const nodes = (nodeRes.data ?? []) as Node[]
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const blockers = (blockerRes.data ?? []) as BlockerDays[]
  const items = (itemRes.data ?? []) as StandupItem[]
  const closingAt = new Date().toISOString()
  const from = standup.period_from

  /*
   * How many stand-ups each blocker has been read out in, this one included.
   * Counted from the items rather than kept as a number on the blocker: a
   * counter is a figure that can be wrong while everything around it is right,
   * and this is the argument for escalating.
   */
  const seen = new Map<string, number>()
  for (const row of (historyRes.data ?? []) as { ref_id: string | null; kind: string }[]) {
    if (row.kind !== 'blocker' || row.ref_id === null) continue
    seen.set(row.ref_id, (seen.get(row.ref_id) ?? 0) + 1)
  }

  /*
   * What moved in the period. Half open at both ends, so a line written at the
   * instant of closing belongs to this meeting and to no other. See inPeriod.
   */
  const finished = nodes
    .filter((n) => n.completed_at !== null && inPeriod(n.completed_at, from, closingAt))
    .map((n) => ({ nodeId: n.id, title: n.title }))

  const lines = ((entryRes.data ?? []) as Entry[]).filter((e) =>
    inPeriod(e.created_at, from, closingAt),
  ).length

  /*
   * What was promised at the last meeting and is still not done.
   *
   * Read from the previous meeting's own rows rather than recomputed from a
   * rule, so what counted as a promise is what the room recorded as one.
   */
  const missed: CloseState['movement']['missed'] = []
  {
    const { data } = await supabase
      .from('standup_item')
      .select('node_id, driver_id, standup_id, kind, action')
      .eq('kind', 'commitment')
      .eq('action', 'logged')
      .neq('standup_id', standupId)

    for (const row of (data ?? []) as {
      node_id: string | null
      driver_id: string | null
    }[]) {
      if (row.node_id === null) continue
      const n = byId.get(row.node_id)
      /* Still not done is the whole test: status, not a second flag. */
      if (!n || n.status === 'done' || n.status === 'cancelled') continue
      if (missed.some((m) => m.nodeId === row.node_id)) continue
      missed.push({ nodeId: n.id, title: n.title, driverId: row.driver_id })
    }
  }

  const open = blockers.filter((b) => b.is_active)

  /* A task in flight that nobody is driving and nobody has parked. */
  const hasChildren = new Set(
    nodes.map((n) => n.parent_id).filter((p): p is string => p !== null),
  )
  const waiting = new Map<string, number>()
  {
    const { data } = await supabase.from('node_dependency').select('depends_on_id')
    for (const d of (data ?? []) as { depends_on_id: string }[]) {
      waiting.set(d.depends_on_id, (waiting.get(d.depends_on_id) ?? 0) + 1)
    }
  }

  const unowned = nodes
    .filter(
      (n) =>
        n.status === 'active' &&
        n.completed_at === null &&
        n.parent_id !== null &&
        !hasChildren.has(n.id) &&
        n.driver_id === null,
    )
    .map((n) => ({
      nodeId: n.id,
      title: n.title,
      dueDate: n.due_date,
      blocks: waiting.get(n.id) ?? 0,
      driverId: n.driver_id,
      parkedUntil: n.parked_until,
    }))
    /* Nearest date first, and within a date whatever holds most people up. */
    .sort(
      (a, b) =>
        (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || b.blocks - a.blocks,
    )

  return {
    standupId,
    periodFrom: from,
    closingAt,
    attendance: ((attendeeRes.data ?? []) as StandupAttendee[]).map((a) => ({
      personId: a.person_id,
      present: a.present,
    })),
    movement: { finished, lines, missed },
    blockers: open.map((b) => ({
      id: b.id,
      nodeId: b.node_id,
      title: b.title,
      waitingOn: b.waiting_on,
      standups: (seen.get(b.id) ?? 0) + 1,
      driverId: b.driver_id,
      nextStep: b.next_step,
      resolution: null,
    })),
    unowned,
    commitments: items
      .filter((i) => i.kind === 'commitment' && i.node_id !== null)
      .map((i) => ({
        nodeId: i.node_id as string,
        title: byId.get(i.node_id as string)?.title ?? 'work you cannot open',
        driverId: i.driver_id,
        dueDate: i.due_date,
      })),
    decisions: items
      .filter((i) => i.kind === 'decision' && i.node_id !== null)
      .map((i) => ({
        nodeId: i.node_id as string,
        decision: i.note ?? '',
        rationale: i.next_step,
        topic: null,
      })),
    sparks: items
      .filter((i) => i.kind === 'spark')
      .map((i) => ({ body: i.note ?? '', note: null })),
  }
}
