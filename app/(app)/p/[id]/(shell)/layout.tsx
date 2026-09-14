import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { QuickAddTrigger } from '@/components/quick-add-trigger'
import { Rule } from '@/components/ui'
import { readIdentity } from '@/lib/identity'
import type { Node } from '@/lib/types'

/**
 * Only the context band lives here. The title block, the sub navigation and
 * the right column moved into ProjectFrame, which the pages render, because
 * a layout cannot read search params and therefore cannot know which part of
 * the tree you are looking at.
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
  const base = `/p/${id}`

  /*
   * What this project is FOR, read alongside it.
   *
   * The band used to open with «Production.PR-26-0001»: a category that drove
   * nothing, glued to the number with a full stop as though the two were one
   * address. The category is gone, and what replaces it is the thing that
   * actually answers the question, which is the strategy the work is marked
   * against.
   */
  const [nodeRes, markRes] = await Promise.all([
    supabase.from('node').select('*').eq('id', id).single(),
    supabase
      .from('v_strategy_node')
      .select('strategy_id, node_id')
      .eq('node_id', id),
  ])
  const project = nodeRes.data as Node | null
  if (!project) notFound()

  const marks = (markRes.data ?? []) as { strategy_id: string }[]
  const { data: stratRows } = marks.length
    ? await supabase
        .from('strategy')
        .select('id, name')
        .in('id', marks.map((m) => m.strategy_id))
        .order('sort_order')
    : { data: [] }
  const serves = ((stratRows ?? []) as { id: string; name: string }[]).map((r) => r.name)

  const identity = readIdentity(project.reporting)

  return (
    <main>
      <div className="frame">
        <div className="lbl pl-5 lg:pl-16 py-3 pr-5 text-muted">Serves</div>
        {/*
          The number and the place moved into the rail, which is where the
          project is named. What is left here is the half the rail has no room
          for and no business carrying: what the work is FOR, and the two
          strings the company system demands.

          Said on the project because it is the question somebody standing on one
          actually has, and because until this existed the only place to see it
          was the strategy page, which is the wrong way round: you mark work from
          the strategy and you read it from the work.
        */}
        <div className="lbl border-l border-rule px-5 lg:px-10 py-3">
          {serves.length > 0 ? (
            <span className="text-ink">{serves.join(', ')}</span>
          ) : (
            <span className="text-oxblood">not marked against a strategy</span>
          )}
          {identity.admin.portfolio && (
            <span className="text-muted"> &nbsp;·&nbsp; {identity.admin.portfolio}</span>
          )}
          {identity.admin.account && (
            <span className="text-muted"> &nbsp;·&nbsp; {identity.admin.account}</span>
          )}
        </div>
        <div className="flex items-center justify-end gap-6 border-l border-rule py-3 pl-5 lg:pl-8 pr-5 lg:pr-16">
          <Link href={`${base}/meeting`} className="lbl text-muted hover:text-ink">
            Meeting
          </Link>
          <Link href={`${base}/map`} className="lbl text-muted hover:text-ink">
            Map
          </Link>
          <Link href={`${base}?edit=${id}`} className="lbl text-muted hover:text-ink">
            Edit project
          </Link>
          <QuickAddTrigger />
        </div>
      </div>
      <Rule strong />

      {children}
    </main>
  )
}
