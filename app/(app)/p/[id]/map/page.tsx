import Link from 'next/link'
import { today as todayIso } from '@/lib/date'
import { notFound } from 'next/navigation'
import { hierarchy, tree } from 'd3-hierarchy'
import { createClient } from '@/lib/supabase/server'
import { subtreeSet } from '@/lib/subtree'
import { QueryFailure, firstError } from '@/lib/failure'
import { ProgressScale, Rule, formatDate, formatDateLong } from '@/components/ui'
import { readIdentity } from '@/lib/identity'
import {
  CATEGORY_LABEL,
  EFFECTIVE_STATUS_LABEL,
  type NodeDependency,
  type NodeReady,
  type NodeState,
  type ActiveBlocker,
  type Node,
  type NodeProgress,
} from '@/lib/types'

export const dynamic = 'force-dynamic'

/**
 * The geometry of the map. The boxes have a fixed size so d3-hierarchy can
 * compute exact coordinates, and the connectors then meet the centre of each
 * box precisely instead of as close as CSS could manage.
 */
const BOX_W = 184
const BOX_H = 84
const GAP_X = 26
const GAP_Y = 58

function Mark({ node, blocked }: { node: Node; blocked: boolean }) {
  // An open blocker wins the colour: on a printed map it is the one thing
  // someone has to act on.
  const fill = blocked
    ? '#8a3520'
    : node.status === 'done'
      ? '#1a1f1b'
      : node.status === 'active'
        ? '#1e4a34'
        : 'none'

  if (node.is_milestone) {
    return (
      <svg width="9" height="9" viewBox="0 0 9 9" className="mt-[3px] shrink-0">
        <path
          d="M4.5 0 L9 4.5 L4.5 9 L0 4.5 Z"
          fill={fill}
          stroke={fill === 'none' ? '#6b6b65' : 'none'}
          strokeWidth="1.2"
        />
      </svg>
    )
  }

  return (
    <span
      className="mt-[4px] block size-[7px] shrink-0"
      style={fill === 'none' ? { border: '1px solid #6b6b65' } : { background: fill }}
    />
  )
}

/**
 * A4 landscape at 96 dpi, less the 12 mm margin the @page rule uses. «Fit»
 * means fits on one printed sheet, which is a promise worth being able to keep.
 */
const SHEET_W = 1032

export default async function MapPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ depth?: string; zoom?: string }>
}) {
  const { id } = await params
  const { depth: depthParam, zoom: zoomParam } = await searchParams
  const supabase = await createClient()

  /*
   * One round trip. Asking which nodes sit underneath and only then filtering
   * by the answer costs a second wait for nothing at this size.
   */
  const [nodesRes, progressRes, blockerRes, stateRes, readyRes, depRes] = await Promise.all([
    supabase.from('node').select('*').order('sort_order'),
    supabase.from('v_node_progress').select('*').eq('node_id', id).maybeSingle(),
    supabase.from('v_active_blocker').select('*'),
    supabase.from('v_node_state').select('*'),
    supabase.from('v_node_ready').select('*'),
    supabase.from('node_dependency').select('*'),
  ])

  const failure = firstError([nodesRes, progressRes, blockerRes, stateRes, readyRes, depRes])
  if (failure) return <QueryFailure message={failure} />

  const everyNode = (nodesRes.data ?? []) as Node[]
  const project = everyNode.find((n) => n.id === id)
  if (!project) notFound()
  // Fetched whole, cut here. See lib/subtree.
  const inProject = subtreeSet(everyNode, id)
  const nodes = everyNode.filter((n) => inProject.has(n.id))

  const progress = progressRes.data as NodeProgress | null
  const blockers = ((blockerRes.data ?? []) as ActiveBlocker[]).filter((b) =>
    inProject.has(b.node_id),
  )
  const state = new Map(((stateRes.data ?? []) as NodeState[]).map((s) => [s.node_id, s]))
  const ready = new Map(((readyRes.data ?? []) as NodeReady[]).map((r) => [r.node_id, r]))
  const deps = ((depRes.data ?? []) as NodeDependency[]).filter(
    (d) => inProject.has(d.node_id) && inProject.has(d.depends_on_id),
  )
  const goal = readIdentity(project.reporting).pid.goal

  const childrenOf = new Map<string, Node[]>()
  for (const n of nodes) {
    if (n.parent_id === null) continue
    childrenOf.set(n.parent_id, [...(childrenOf.get(n.parent_id) ?? []), n])
  }
  for (const list of childrenOf.values()) {
    list.sort((a, b) => a.sort_order - b.sort_order)
  }

  /*
   * Depth, and how far the drawing goes.
   *
   * A map is a thing you show someone, and five levels of tasks on one sheet is
   * a wall rather than an explanation. Cutting the tree is not hiding anything:
   * the branches that are cut say how much is underneath them, which is often
   * the more useful reading anyway.
   */
  const depthOf = new Map<string, number>()
  const measure = (nodeId: string, d: number) => {
    depthOf.set(nodeId, d)
    for (const k of childrenOf.get(nodeId) ?? []) measure(k.id, d + 1)
  }
  measure(id, 0)
  const maxDepth = Math.max(...depthOf.values())

  const depth =
    depthParam === undefined || depthParam === 'all'
      ? maxDepth
      : Math.min(Math.max(1, Number(depthParam) || maxDepth), maxDepth)

  const countBelow = (nodeId: string): number =>
    (childrenOf.get(nodeId) ?? []).reduce((sum, k) => sum + 1 + countBelow(k.id), 0)

  /** How much a branch is holding that the drawing stops short of. */
  const cutBelow = (nodeId: string) =>
    (depthOf.get(nodeId) ?? 0) >= depth ? countBelow(nodeId) : 0

  // --- Layout ---------------------------------------------------------------
  const root = hierarchy(project, (n) =>
    (depthOf.get(n.id) ?? 0) >= depth ? undefined : childrenOf.get(n.id),
  )
  const layout = tree<Node>()
    .nodeSize([BOX_W + GAP_X, BOX_H + GAP_Y])
    // Cousins need a little more air than siblings, or the branches clump.
    .separation((a, b) => (a.parent === b.parent ? 1 : 1.18))
  const laid = layout(root)

  const points = laid.descendants()
  const xs = points.map((p) => p.x)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const maxY = Math.max(...points.map((p) => p.y))

  // Shift the whole tree into positive coordinates and allow for box width.
  const offsetX = -minX + BOX_W / 2
  const canvasW = maxX - minX + BOX_W
  const canvasH = maxY + BOX_H

  const today = todayIso()
  const cx = (p: { x: number }) => p.x + offsetX

  /*
   * Zoom is a transform on the finished drawing, not a second layout. The
   * geometry stays exact, so the connectors keep meeting the box centres at
   * any scale.
   */
  const zoom =
    zoomParam === 'fit'
      ? Math.min(1, SHEET_W / canvasW)
      : Math.min(1, Math.max(0.25, (Number(zoomParam) || 100) / 100))

  /*
   * Sequence, drawn on top of the hierarchy.
   *
   * The elbows say what sits under what. These say what must finish before what,
   * and the two run across each other by nature: a task in one subproject waits
   * on a task in another. So they are drawn differently on purpose, dashed and
   * in oxblood, leaving the box edges sideways rather than top and bottom, so
   * they cannot be mistaken for parentage.
   *
   * A dependency pointing outside this project has no box to reach. Those are
   * not drawn; the box is marked instead, and v_node_ready has counted them
   * either way.
   */
  const placed = new Map(points.map((pt) => [pt.data.id, pt]))
  const sequence = deps
    .map((d) => ({ dep: d, from: placed.get(d.depends_on_id), to: placed.get(d.node_id) }))
    .filter((e) => e.from !== undefined && e.to !== undefined)
    .map(({ dep, from, to }) => {
      const fx = cx(from!)
      const tx = cx(to!)
      const rightwards = tx >= fx
      const half = BOX_W / 2
      const x1 = fx + (rightwards ? half : -half)
      const y1 = from!.y + BOX_H / 2
      const x2 = tx + (rightwards ? -half : half)
      const y2 = to!.y + BOX_H / 2
      const bow = Math.max(40, Math.abs(x2 - x1) / 2)
      // A predecessor that is merely unfinished is a plan. One that has passed
      // its own date is the only one that has broken a promise.
      const pred = from!.data
      const late =
        pred.status !== 'done' &&
        pred.status !== 'cancelled' &&
        pred.due_date !== null &&
        pred.due_date < today
      return {
        id: dep.id,
        late,
        d: `M ${x1} ${y1} C ${x1 + (rightwards ? bow : -bow)} ${y1}, ${x2 - (rightwards ? bow : -bow)} ${y2}, ${x2} ${y2}`,
      }
    })
  const blockersOf = (nodeId: string) => blockers.filter((b) => b.node_id === nodeId)

  const dated = nodes
    .filter((n) => n.due_date !== null && n.id !== id)
    .map((n) => n.due_date!)
    .sort()

  return (
    <main className="print-sheet page-map">
      <div className="no-print frame">
        <div className="lbl pl-5 lg:pl-16 py-3 pr-5 text-muted">Project map</div>
        <div className="lbl flex flex-wrap items-baseline gap-x-5 gap-y-1 border-l border-rule px-5 lg:px-10 py-3 text-muted">
          <span>
            {nodes.length - 1} nodes · {blockers.length} open blockers
          </span>

          <span className="flex items-baseline gap-2.5">
            <span className="text-rule-strong">Depth</span>
            {Array.from({ length: maxDepth }, (_, i) => i + 1).map((d) => (
              <Link
                key={d}
                href={`/p/${id}/map?depth=${d}${zoomParam ? `&zoom=${zoomParam}` : ''}`}
                className={depth === d ? 'text-ink' : 'hover:text-ink'}
              >
                {d}
              </Link>
            ))}
            <Link
              href={`/p/${id}/map?depth=all${zoomParam ? `&zoom=${zoomParam}` : ''}`}
              className={depth === maxDepth ? 'text-ink' : 'hover:text-ink'}
            >
              All
            </Link>
          </span>

          <span className="flex items-baseline gap-2.5">
            <span className="text-rule-strong">Zoom</span>
            {(['fit', '50', '75', '100'] as const).map((z) => (
              <Link
                key={z}
                href={`/p/${id}/map?zoom=${z}${depthParam ? `&depth=${depthParam}` : ''}`}
                className={
                  (zoomParam ?? '100') === z ? 'text-ink' : 'hover:text-ink'
                }
              >
                {z === 'fit' ? 'Fit' : `${z} %`}
              </Link>
            ))}
            {zoom < 1 && (
              <span className="tabular-nums text-rule-strong">
                {Math.round(zoom * 100)} %
              </span>
            )}
          </span>
        </div>
        <div className="flex items-center justify-end border-l border-rule py-3 pl-5 lg:pl-8 pr-5 lg:pr-16">
          <Link href={`/p/${id}`} className="lbl text-muted hover:text-ink">
            Back to the project
          </Link>
        </div>
      </div>
      <div className="no-print">
        <Rule strong />
      </div>

      <div className="px-5 lg:px-16 pb-6 pt-9">
        <div className="flex items-end justify-between gap-10 border-b border-rule-strong pb-5">
          <div>
            <div className="lbl text-muted">
              {project.category ? CATEGORY_LABEL[project.category] : 'No category'}
              {typeof project.reporting?.project_no === 'string' && (
                <> &nbsp;·&nbsp; {project.reporting.project_no}</>
              )}
            </div>
            <h1 className="mt-1.5 max-w-4xl font-display text-[38px] font-medium leading-[1.08] tracking-[-0.02em]">
              {project.title}
            </h1>
            {goal && (
              <p className="mt-3 max-w-3xl border-l border-rule-strong pl-4 text-[13px] leading-relaxed text-pretty">
                <span className="lbl mr-2.5 text-muted">Goal</span>
                {goal}
              </p>
            )}
          </div>

          <div className="shrink-0 text-right">
            <div className="flex items-center justify-end gap-4">
              <div className="w-[120px] sm:w-[200px]">
                <ProgressScale
                  done={progress?.leaf_done ?? 0}
                  total={progress?.leaf_total ?? 0}
                />
              </div>
              <span className="num text-[28px]">{progress?.progress_pct ?? 0} %</span>
            </div>
            <div className="mt-2 text-[11px] tabular-nums text-muted">
              {progress?.leaf_done ?? 0} of {progress?.leaf_total ?? 0} leaves
              {dated.length > 0 && (
                <>
                  {' '}
                  · {formatDateLong(dated[0])} – {formatDateLong(dated[dated.length - 1])}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* The map: SVG draws the lines, HTML places the boxes on top */}
      <div className="overflow-x-auto px-5 lg:px-16 pb-12">
        <div
          className="relative mx-auto"
          style={{
            width: canvasW * zoom,
            height: canvasH * zoom,
          }}
        >
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{ width: canvasW, height: canvasH, transform: `scale(${zoom})` }}
        >
          <svg
            width={canvasW}
            height={canvasH}
            className="absolute left-0 top-0"
            aria-hidden="true"
          >
            <defs>
              <marker
                id="seq-arrow"
                viewBox="0 0 8 8"
                refX="7"
                refY="4"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 7 4 L 0 7 z" fill="#b4b4ad" />
              </marker>
              <marker
                id="seq-late"
                viewBox="0 0 8 8"
                refX="7"
                refY="4"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 7 4 L 0 7 z" fill="#8a3520" />
              </marker>
            </defs>

            {sequence.map((e) => (
              <path
                key={e.id}
                d={e.d}
                fill="none"
                stroke={e.late ? '#8a3520' : '#b4b4ad'}
                strokeWidth="1.2"
                strokeDasharray="4 3"
                markerEnd={e.late ? 'url(#seq-late)' : 'url(#seq-arrow)'}
              />
            ))}

            {laid.links().map((link, i) => {
              const sx = cx(link.source)
              const sy = link.source.y + BOX_H
              const tx = cx(link.target)
              const ty = link.target.y
              const mid = sy + GAP_Y / 2
              return (
                <path
                  key={i}
                  d={`M ${sx} ${sy} V ${mid} H ${tx} V ${ty}`}
                  fill="none"
                  stroke="#b4b4ad"
                  strokeWidth="1"
                  shapeRendering="crispEdges"
                />
              )
            })}
          </svg>

          {points.map((p) => {
            const n = p.data
            const mine = blockersOf(n.id)
            const done = n.status === 'done'

            return (
              <div
                key={n.id}
                className={`absolute flex flex-col justify-between border bg-sheet px-3 py-2.5 ${
                  mine.length > 0 ? 'border-oxblood' : 'border-rule-strong'
                }`}
                style={{
                  left: cx(p) - BOX_W / 2,
                  top: p.y,
                  width: BOX_W,
                  height: BOX_H,
                }}
              >
                <div className="flex items-start gap-2">
                  <Mark node={n} blocked={state.get(n.id)?.is_blocked ?? false} />
                  <span
                    className={`line-clamp-2 text-[12px] leading-[1.3] ${
                      done ? 'text-muted line-through decoration-rule' : ''
                    }`}
                  >
                    {n.title}
                  </span>
                </div>

                <div>
                  <div className="flex items-baseline justify-between gap-2 text-[9.5px] uppercase tracking-[0.12em] text-muted">
                    <span>
                      {EFFECTIVE_STATUS_LABEL[state.get(n.id)?.status_effective ?? n.status]}
                      {ready.get(n.id)?.is_ready === false &&
                        ((ready.get(n.id)?.overdue_count ?? 0) > 0 ? (
                          <span className="ml-1.5 text-oxblood">
                            &middot; held up {ready.get(n.id)?.overdue_count}
                          </span>
                        ) : (
                          <span className="ml-1.5 text-rule-strong">
                            &middot; waits {ready.get(n.id)?.waiting_on_count}
                          </span>
                        ))}
                    </span>
                    <span className="tabular-nums">
                      {n.due_date ? formatDate(n.due_date) : ''}
                    </span>
                  </div>
                  {mine.length > 0 && (
                    <div className="mt-1 truncate border-t border-rule pt-1 text-[9.5px] tabular-nums text-oxblood">
                      {mine[0].days_blocked} days · {mine[0].waiting_on}
                      {mine.length > 1 && ` +${mine.length - 1}`}
                    </div>
                  )}
                  {cutBelow(n.id) > 0 && (
                    <div className="mt-1 truncate border-t border-rule pt-1 text-[9.5px] tabular-nums text-rule-strong">
                      + {cutBelow(n.id)} below
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        </div>
      </div>

      <div className="px-5 lg:px-16 pb-14">
        <div className="flex flex-wrap items-center gap-x-7 gap-y-2 border-t border-rule pt-4 text-[10px] uppercase tracking-[0.12em] text-muted">
          <span className="flex items-center gap-2">
            <span className="block size-[7px] bg-green" /> Active
          </span>
          <span className="flex items-center gap-2">
            <span className="block size-[7px] bg-oxblood" /> Blocked
          </span>
          <span className="flex items-center gap-2">
            <span className="block size-[7px] bg-ink" /> Completed
          </span>
          <span className="flex items-center gap-2">
            <span className="block size-[7px] border border-muted" /> Planned
          </span>
          <span className="flex items-center gap-2">
            <svg width="9" height="9" viewBox="0 0 9 9">
              <path
                d="M4.5 0 L9 4.5 L4.5 9 L0 4.5 Z"
                fill="none"
                stroke="#6b6b65"
                strokeWidth="1.2"
              />
            </svg>
            Milestone
          </span>
          <span className="flex items-center gap-2">
            <span className="block h-3 w-4 border border-oxblood" /> Has an open blocker
          </span>
          <span className="flex items-center gap-2">
            <svg width="26" height="8" viewBox="0 0 26 8">
              <path
                d="M 0 4 H 20"
                stroke="#8a3520"
                strokeWidth="1.2"
                strokeDasharray="4 3"
                fill="none"
              />
              <path d="M 19 1 L 26 4 L 19 7 z" fill="#8a3520" />
            </svg>
            Must finish first
          </span>
          <span className="flex items-center gap-2">
            <svg width="26" height="8" viewBox="0 0 26 8">
              <path d="M 0 4 H 20" stroke="#8a3520" strokeWidth="1.2" strokeDasharray="4 3" fill="none" />
              <path d="M 19 1 L 26 4 L 19 7 z" fill="#8a3520" />
            </svg>
            Predecessor is late
          </span>
          <span className="ml-auto tabular-nums">
            Printed {formatDateLong(today)}
          </span>
        </div>
      </div>
    </main>
  )
}
