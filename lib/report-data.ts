import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  buildStatusComment,
  isoWeek,
  progressReason,
  progressSignal,
  readStage,
  toStatusUpdate,
  type Progress,
  type Stage,
  type StatusUpdate,
  type Week,
} from '@/lib/report'
import { firstError } from '@/lib/failure'
import type {
  ActiveBlocker,
  Entry,
  NextDate,
  Node,
  NodeCost,
  NodeProgress,
  Report,
} from '@/lib/types'

export type ProjectReport = {
  project: Node
  week: Week
  /** The boundary for «since last»: the previous submitted report's end. */
  since: string | null
  fields: {
    status: StatusUpdate
    stage: Stage | null
    progress: Progress
    comment: string
  }
  context: {
    progressPct: number
    leafDone: number
    leafTotal: number
    next: NextDate | null
    progressReason: string
    blockers: ActiveBlocker[]
    entries: Entry[]
    /** The money as it stands. Written into the snapshot when reported. */
    cost: NodeCost | null
  }
  previous: Report | null
  saved: Report | null
}

/**
 * Named so a caller can tell a database that is behind the code from a genuine
 * fault in the assembly. The page catches this one and shows the message; it
 * does not catch anything else.
 */
export class ReportDataError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ReportDataError'
  }
}

/**
 * Collects the weekly report for every running project. Both the page and the
 * server action use this one, so what is stored is what was shown.
 *
 * THROWS ON A FAILED QUERY, rather than reporting an empty week.
 *
 * This is the one read in the application where `data ?? []` is not merely
 * unhelpful but actively dangerous, because the caller is not only a page. A
 * failed `entry` read yields no lines, `buildStatusComment` assembles a status
 * out of nothing, and a quiet week and a broken query produce the same
 * sentence. On the page that text is copied into the company system by hand;
 * through `saveReport` it is written to `report` with `submitted` set and a
 * context snapshot of zeroes, and that snapshot exists precisely because it
 * cannot be recomputed once the tree has moved on.
 *
 * So the failure is raised rather than returned. A caller that renders can
 * catch it and say so; a caller that WRITES must not be able to ignore it, and
 * an exception is the only shape both of those read the same way.
 */
export async function collectReports(
  supabase: SupabaseClient,
  today: string,
): Promise<ProjectReport[]> {
  const week = isoWeek(today)

  const [nodeRes, progressRes, nextRes, blockerRes, entryRes, reportRes, descRes, costRes] =
    await Promise.all([
      supabase.from('node').select('*').order('sort_order'),
      supabase.from('v_node_progress').select('*'),
      supabase.from('v_next_date').select('*'),
      supabase.from('v_active_blocker').select('*'),
      supabase.from('entry').select('*').order('entry_date'),
      supabase.from('report').select('*').order('period_end', { ascending: false }),
      supabase.from('v_node_descendant').select('root_id, node_id'),
      supabase.from('v_node_cost').select('*'),
    ])

  const failure = firstError([
    nodeRes,
    progressRes,
    nextRes,
    blockerRes,
    entryRes,
    reportRes,
    descRes,
    costRes,
  ])
  if (failure) throw new ReportDataError(failure)

  const nodes = (nodeRes.data ?? []) as Node[]
  const progress = new Map(
    ((progressRes.data ?? []) as NodeProgress[]).map((p) => [p.node_id, p]),
  )
  const nextDates = new Map(
    ((nextRes.data ?? []) as NextDate[]).map((n) => [n.node_id, n]),
  )
  const allBlockers = (blockerRes.data ?? []) as ActiveBlocker[]
  const allEntries = (entryRes.data ?? []) as Entry[]
  const reports = (reportRes.data ?? []) as Report[]
  const descendants = (descRes.data ?? []) as { root_id: string; node_id: string }[]
  const costs = new Map(((costRes.data ?? []) as NodeCost[]).map((c) => [c.node_id, c]))

  const roots = nodes.filter((n) => n.parent_id === null)
  const rootIds = new Set(roots.map((n) => n.id))
  const projectOfNode = new Map<string, string>()
  for (const d of descendants) {
    if (rootIds.has(d.root_id)) projectOfNode.set(d.node_id, d.root_id)
  }

  return roots
    .filter((p) => p.status !== 'done' && p.status !== 'cancelled')
    .map((project) => {
      const mine = (nodeId: string) => projectOfNode.get(nodeId) === project.id

      const previous =
        reports.find(
          (r) => r.node_id === project.id && r.submitted && r.period_start !== week.start,
        ) ?? null
      const saved =
        reports.find(
          (r) => r.node_id === project.id && r.period_start === week.start,
        ) ?? null

      const since = previous?.period_end ?? null
      const entries = allEntries.filter(
        (e) => mine(e.node_id) && (since === null || e.entry_date > since),
      )
      const blockers = allBlockers.filter((b) => mine(b.node_id))
      const next = nextDates.get(project.id) ?? null
      const p = progress.get(project.id)

      const signalInput = {
        daysUntilNext: next?.days_until ?? null,
        blockers,
        today,
      }

      return {
        project,
        week,
        since,
        fields: {
          status: toStatusUpdate(project.status),
          stage: readStage(project.reporting),
          progress: progressSignal(signalInput),
          comment: buildStatusComment({ entries, blockers, today }),
        },
        context: {
          progressPct: p?.progress_pct ?? 0,
          leafDone: p?.leaf_done ?? 0,
          leafTotal: p?.leaf_total ?? 0,
          next,
          progressReason: progressReason(signalInput),
          blockers,
          entries,
          cost: costs.get(project.id) ?? null,
        },
        previous,
        saved,
      }
    })
}
