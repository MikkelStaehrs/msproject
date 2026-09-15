import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { QueryFailure, firstError } from '@/lib/failure'
import { ProjectNav, type RailCount, type RailNode } from '@/components/project-nav'
import { readIdentity } from '@/lib/identity'
import type { BlockerDays, Node } from '@/lib/types'

/**
 * The project shell: a rail, and the state you are in.
 *
 * The horizontal band is gone. It carried the project number, the place and
 * what the work serves, above a page that then named the project again in a
 * title block of its own, and the result was the same words twice with a strip
 * of metadata wedged between them. The rail names the project once; what the
 * work serves belongs on Read, where the rest of the identity is.
 *
 * The rail can sit in a layout because it works out where you are standing from
 * the address rather than being told. A layout in Next cannot read search
 * params, and that single fact is why the old frame had to be a component the
 * pages rendered; the rail reads them on the client, so the wrapper that
 * existed to carry it is not needed.
 */
export default async function ProjectShell({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const [nodeRes, treeRes, countRes, blockerRes] = await Promise.all([
    supabase.from('node').select('*').eq('id', id).single(),
    supabase
      .from('node')
      .select('id, parent_id, title, type, status')
      .order('sort_order'),
    supabase.from('v_node_progress').select('node_id, leaf_total, leaf_done'),
    supabase.from('v_blocker_days').select('*'),
  ])

  const project = nodeRes.data as Node | null
  if (!project) notFound()

  /*
   * A failed read here empties the rail on every project page at once, and an
   * empty table of contents reads as a project with nothing in it. The node
   * itself is left out of the check: an absent row is a project you are not a
   * member of, and that is notFound above rather than a fault.
   */
  const failure = firstError([treeRes, countRes, blockerRes])
  if (failure) return <QueryFailure message={failure} />

  const identity = readIdentity(project.reporting)

  /*
   * Waiting days per node, its OWN open blockers rather than its subtree's. A
   * project is not blocked because one task out of twelve is, and a table of
   * contents should point at the line that hurts rather than colour every
   * ancestor of it.
   */
  const blocked: Record<string, number> = {}
  for (const b of (blockerRes.data ?? []) as BlockerDays[]) {
    if (!b.is_active) continue
    blocked[b.node_id] = Math.max(blocked[b.node_id] ?? 0, b.days_blocked)
  }

  return (
    <main className="grid grid-cols-1 lg:grid-cols-[264px_minmax(0,1fr)]">
      <div className="border-b border-line-strong lg:border-b-0 lg:border-r">
        <ProjectNav
          base={`/p/${id}`}
          projectId={id}
          projectTitle={project.title}
          projectNo={identity.admin.project_no}
          place={identity.admin.location}
          nodes={(treeRes.data ?? []) as RailNode[]}
          counts={(countRes.data ?? []) as RailCount[]}
          blocked={blocked}
        />
      </div>
      <div className="min-w-0">{children}</div>
    </main>
  )
}
