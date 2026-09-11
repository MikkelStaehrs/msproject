import Link from 'next/link'
import { addDays, today, today as todayIso } from '@/lib/date'
import { createClient } from '@/lib/supabase/server'
import { QueryFailure, firstError } from '@/lib/failure'
import { QuickAddTrigger } from '@/components/quick-add-trigger'
import { Prose, Rule, formatDate } from '@/components/ui'
import {
  deleteTemplate,
  deployTemplate,
  templateFromNode,
  updateTemplate,
} from '@/lib/template-actions'
import {
  countMilestones,
  countNodes,
  readBody,
  spanDays,
  type Template,
  type TemplateNode,
} from '@/lib/template'
import { CATEGORY_LABEL, type NodeCategory, type Node } from '@/lib/types'

export const dynamic = 'force-dynamic'

function Tree({ nodes, start }: { nodes: TemplateNode[]; start: string | null }) {
  return (
    <div>
      {nodes.map((n, i) => (
        <div key={`${n.title}-${i}`}>
          <div className="flex items-baseline gap-3 border-t border-rule py-2">
            {n.is_milestone ? (
              <svg width="9" height="9" viewBox="0 0 9 9" className="shrink-0 translate-y-px">
                <path
                  d="M4.5 0 L9 4.5 L4.5 9 L0 4.5 Z"
                  fill="none"
                  stroke="#6b6b65"
                  strokeWidth="1.2"
                />
              </svg>
            ) : (
              <span className="size-[7px] shrink-0 border border-rule-strong" />
            )}
            <span className="flex-1 text-[13px]">{n.title}</span>
            <span className="w-[92px] shrink-0 text-right text-[11px] tabular-nums text-muted">
              {n.offset_days === null
                ? '-'
                : start
                  ? formatDate(addDays(start, n.offset_days))
                  : `dag ${n.offset_days}`}
            </span>
          </div>
          {n.children.length > 0 && (
            <div className="ml-1 border-l border-rule pl-5">
              <Tree nodes={n.children} start={start} />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ deploy?: string; edit?: string; from?: string }>
}) {
  const { deploy: deployId, edit: editId, from: fromNode } = await searchParams
  const supabase = await createClient()
  const today = todayIso()

  const [templateRes, nodeRes] = await Promise.all([
    supabase.from('template').select('*').order('name'),
    supabase.from('node').select('*').order('sort_order'),
  ])

  const failure = firstError([templateRes, nodeRes])
  if (failure) return <QueryFailure message={failure} />

  const templates = (templateRes.data ?? []).map((t) => ({
    ...t,
    body: readBody(t.body),
  })) as Template[]
  const allNodes = (nodeRes.data ?? []) as Node[]

  /*
   * Anything that can hold a tree, shown with its path so two nodes called
   * «Frontend» can be told apart. Tasks are left out: a template of one leaf is
   * a node, not a template.
   */
  const titleOf = new Map(allNodes.map((n) => [n.id, n.title]))
  const pathOf = (n: Node) => {
    const parts: string[] = []
    let current: string | null = n.parent_id
    while (current) {
      parts.unshift(titleOf.get(current) ?? '')
      current = allNodes.find((x) => x.id === current)?.parent_id ?? null
    }
    return parts.length === 0 ? n.title : `${parts.join(' › ')} › ${n.title}`
  }
  const containers = allNodes.filter((n) => n.type !== 'task')
  const projects = allNodes.filter((n) => n.parent_id === null)

  const deploying = deployId ? templates.find((t) => t.id === deployId) : undefined
  const editing = editId ? templates.find((t) => t.id === editId) : undefined

  return (
    <main>
      <div className="frame">
        <div className="lbl pl-5 lg:pl-16 py-3 pr-5 text-muted">Templates</div>
        <div className="lbl border-l border-rule px-5 lg:px-10 py-3 text-muted">
          {templates.length} in the library
        </div>
        <div className="flex items-center justify-end border-l border-rule py-3 pl-5 lg:pl-8 pr-5 lg:pr-16">
          <QuickAddTrigger />
        </div>
      </div>
      <Rule strong />

      {/* Ny skabelon ud fra et eksisterende projekt */}
      {fromNode === 'pick' && (
        <div className="border-y border-rule-strong bg-sheet px-6 py-5">
          <div className="lbl mb-4 text-muted">New template from a project</div>
          {containers.length === 0 ? (
            <p className="text-[13px] text-muted">There is nothing to derive from yet.</p>
          ) : (
            <form action={templateFromNode} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-4">
              <label className="col-span-1 sm:col-span-2 block">
                <span className="lbl text-muted">Capture from</span>
                <select name="node_id" required className="field">
                  {containers.map((n) => (
                    <option key={n.id} value={n.id}>
                      {pathOf(n)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="col-span-1 sm:col-span-2 block">
                <span className="lbl text-muted">Template name</span>
                <input
                  name="name"
                  placeholder="CAPEX acquisition"
                  className="field"
                  autoFocus
                />
              </label>
              <div className="col-span-1 sm:col-span-2 lg:col-span-4 mt-2 flex items-center gap-3">
                <button type="submit" className="btn">
                  Derive template
                </button>
                <Link href="/templates" className="btn btn-ghost">
                  Cancel
                </Link>
                <span className="ml-2 text-[11px] text-muted">
                  The tree is copied with due dates converted to days from the project start.
                  Open and resolved blockers become known risks.
                </span>
              </div>
            </form>
          )}
        </div>
      )}

      {editing && (
        <div className="border-y border-rule-strong bg-sheet px-6 py-5">
          <div className="lbl mb-4 text-muted">Edit template</div>
          <form id="tpl-edit" action={updateTemplate} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-4">
            <input type="hidden" name="id" value={editing.id} />
            <label className="col-span-1 sm:col-span-2 block">
              <span className="lbl text-muted">Name</span>
              <input name="name" required defaultValue={editing.name} className="field" autoFocus />
            </label>
            <label className="block">
              <span className="lbl text-muted">Category</span>
              <select name="category" defaultValue={editing.category ?? ''} className="field">
                <option value="">-</option>
                {(Object.keys(CATEGORY_LABEL) as NodeCategory[]).map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </option>
                ))}
              </select>
            </label>
            <label className="col-span-1 sm:col-span-2 lg:col-span-4 block">
              <span className="lbl text-muted">Description</span>
              <textarea
                name="description"
                rows={2}
                defaultValue={editing.description ?? ''}
                className="field resize-y"
              />
            </label>
          </form>
          <div className="mt-6 flex items-center gap-3">
            <button type="submit" form="tpl-edit" className="btn">
              Save
            </button>
            <Link href="/templates" className="btn btn-ghost">
              Cancel
            </Link>
            <form action={deleteTemplate} className="ml-auto">
              <input type="hidden" name="id" value={editing.id} />
              <button type="submit" className="btn btn-danger">
                Delete
              </button>
            </form>
          </div>
        </div>
      )}

      {deploying && (
        <div className="border-y border-rule-strong bg-sheet px-6 py-5">
          <div className="lbl mb-1 text-muted">Deploy template</div>
          <div className="mb-4 text-[13px]">
            {deploying.name}, {countNodes(deploying.body.nodes)} nodes
            {deploying.body.risks.length > 0 && (
              <> and {deploying.body.risks.length} known risks</>
            )}
          </div>

          <form
            id="tpl-deploy"
            action={deployTemplate}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-4"
          >
            <input type="hidden" name="template_id" value={deploying.id} />

            <label className="col-span-1 sm:col-span-2 block">
              <span className="lbl text-muted">Put it</span>
              <select name="parent_id" defaultValue="" className="field">
                <option value="">As a new project</option>
                {containers.map((n) => (
                  <option key={n.id} value={n.id}>
                    Under {pathOf(n)}
                  </option>
                ))}
              </select>
            </label>

            <label className="col-span-1 block">
              <span className="lbl text-muted">Project title</span>
              <input name="title" required autoFocus className="field text-base" />
              <span className="mt-1 block text-[10.5px] leading-snug text-rule-strong">
                Ignored when it goes under an existing node
              </span>
            </label>
            <label className="block">
              <span className="lbl text-muted">Start date</span>
              <input
                type="date"
                name="start_date"
                required
                defaultValue={today}
                className="field"
              />
            </label>

            <label className="block">
              <span className="lbl text-muted">Category</span>
              <select name="category" defaultValue={deploying.category ?? ''} className="field">
                <option value="">-</option>
                {(Object.keys(CATEGORY_LABEL) as NodeCategory[]).map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </option>
                ))}
              </select>
            </label>

            {deploying.body.risks.length > 0 && (
              <label className="col-span-1 sm:col-span-2 lg:col-span-4 flex items-center gap-2.5 text-xs">
                <input
                  type="checkbox"
                  name="include_risks"
                  className="size-3.5 accent-[#1e4a34]"
                />
                Open the {deploying.body.risks.length} known risks as blockers right
                away
              </label>
            )}
          </form>

          <div className="mt-6 flex items-center gap-3">
            <button type="submit" form="tpl-deploy" className="btn">
              Deploy
            </button>
            <Link href="/templates" className="btn btn-ghost">
              Cancel
            </Link>
          </div>
        </div>
      )}

      <div className="frame-pair min-h-[60vh]">
        <div className="pl-5 lg:pl-16 py-8 pr-5">
          <h1 className="font-display text-[30px] font-medium leading-[1.06] tracking-[-0.01em]">
            Tem&shy;plates
          </h1>
          <p className="mt-4 text-[11px] leading-relaxed text-muted">
            A template is a project tree with due dates measured in days from the start
            rather than in calendar dates.
          </p>
          <Link
            href="/templates?from=pick"
            className="btn mt-5 block w-full text-center"
          >
            New template
          </Link>
        </div>

        <div className="border-l border-rule px-5 lg:px-10 py-8">
          {templates.length === 0 ? (
            <p className="text-sm text-muted">
              The library is empty. Derive the first one from a project you have already
              built. That is faster than writing a tree from scratch.
            </p>
          ) : (
            <div className="flex flex-col gap-8">
              {templates.map((t) => {
                const span = spanDays(t.body.nodes)
                return (
                  <article key={t.id}>
                    <div className="flex items-baseline justify-between gap-5">
                      <div className="lbl text-muted">
                        {t.category ? CATEGORY_LABEL[t.category] : 'No category'}
                      </div>
                      <div className="flex items-baseline gap-4">
                        <Link
                          href={`/templates?deploy=${t.id}`}
                          className="lbl text-green hover:text-oxblood"
                        >
                          Deploy
                        </Link>
                        <Link
                          href={`/templates?edit=${t.id}`}
                          className="lbl-tight text-muted hover:text-ink"
                        >
                          Rediger
                        </Link>
                      </div>
                    </div>

                    <h2 className="mt-1.5 font-display text-[26px] font-medium leading-tight">
                      {t.name}
                    </h2>
                    <Prose
                      text={t.description}
                      className="mt-2 max-w-2xl text-[12.5px]"
                    />

                    <div className="mt-2 text-[11px] tabular-nums text-muted">
                      {countNodes(t.body.nodes)} nodes ·{' '}
                      {countMilestones(t.body.nodes)} milestones ·{' '}
                      {span === null ? 'no due dates' : `${span} day span`}
                      {t.body.risks.length > 0 && <> · {t.body.risks.length} known risks</>}
                    </div>

                    <div className="mt-4 max-w-3xl border-b border-rule">
                      <Tree nodes={t.body.nodes} start={null} />
                    </div>

                    {t.body.risks.length > 0 && (
                      <div className="mt-4 max-w-3xl">
                        <div className="lbl text-muted">Known risks</div>
                        <div className="mt-2">
                          {t.body.risks.map((r, i) => (
                            <div
                              key={`${r.title}-${i}`}
                              className="flex items-baseline gap-3 border-t border-rule py-2 last:border-b"
                            >
                              <span className="flex-1 text-[12.5px]">{r.title}</span>
                              <span className="text-[11px] text-muted">{r.waiting_on}</span>
                              <span className="w-[92px] shrink-0 text-right text-[11px] tabular-nums text-muted">
                                {r.expected_days === null
                                  ? '-'
                                  : `dag ${r.expected_days}`}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </article>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
