import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { QueryFailure, firstError } from '@/lib/failure'
import { pathTo } from '@/lib/wbs'
import {
  createSpark,
  deleteSpark,
  dropSpark,
  editSpark,
  promoteSpark,
  reopenSpark,
} from '@/lib/spark-actions'
import { Hint, Prose, ProseFolded, Rule, formatDate } from '@/components/ui'
import { Assessment } from '@/components/assessment'
import { referenceFrom, stagesFrom } from '@/lib/cogs'
import {
  SPARK_SOURCE_LABEL,
  TYPE_HINT,
  TYPE_LABEL,
  type Node,
  type Spark,
  type StageVolume,
  type Yardstick,
} from '@/lib/types'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Sparks' }

/**
 * Where a thought lands before it is work.
 *
 * The capture box takes one field and nothing else, because the good ideas
 * arrive in a car park and anything that asks which project this is under
 * before it will accept the sentence is a thing you will not open at eleven at
 * night.
 *
 * Triage is a separate act, done here, with the tree in front of you. Most
 * sparks should die: an inbox you never empty is a list you stop reading, and
 * «decided against, because» is a real outcome worth recording.
 */
export default async function SparkPage({
  searchParams,
}: {
  searchParams: Promise<{
    keep?: string
    drop?: string
    edit?: string
    assess?: string
    show?: string
  }>
}) {
  const { keep, drop, edit, assess, show = 'new' } = await searchParams
  const supabase = await createClient()

  const [sparkRes, nodeRes, yardstickRes, stageRes] = await Promise.all([
    supabase.from('spark').select('*').order('captured_at', { ascending: false }),
    supabase.from('node').select('id, parent_id, title, type').order('sort_order'),
    supabase.from('yardstick').select('*').maybeSingle(),
    supabase.from('stage_volume').select('fiscal_year, stage, units, scope'),
  ])

  const failure = firstError([sparkRes, nodeRes])
  if (failure) return <QueryFailure message={failure} />

  /*
   * The yardstick is what a saving is measured against. Absent, the page still
   * works and simply says nothing about what an idea is worth: an assessment
   * with no reference is not zero, it is not yet knowable.
   */
  const yard = yardstickRes.data as Yardstick | null
  const reference = referenceFrom(yard)
  const stages = stagesFrom((stageRes.data ?? []) as StageVolume[], yard?.fiscal_year ?? null)

  const sparks = (sparkRes.data ?? []) as Spark[]
  const nodes = (nodeRes.data ?? []) as Pick<Node, 'id' | 'parent_id' | 'title' | 'type'>[]

  const titleOf = new Map(nodes.map((n) => [n.id, n.title]))
  const roots = nodes.filter((n) => n.parent_id === null)
  const projectOf = (nodeId: string) => {
    let cur: string | null = nodeId
    const parent = new Map(nodes.map((n) => [n.id, n.parent_id]))
    while (cur !== null) {
      const next: string | null = parent.get(cur) ?? null
      if (next === null) return cur
      cur = next
    }
    return nodeId
  }
  const label = (nodeId: string) => {
    const project = projectOf(nodeId)
    const rest = pathTo(nodes, project, nodeId)
      .slice(1)
      .map((n) => titleOf.get(n) ?? '')
    return [titleOf.get(project) ?? '', ...rest].filter(Boolean).join(' › ')
  }

  const counts = {
    new: sparks.filter((s) => s.state === 'new').length,
    kept: sparks.filter((s) => s.state === 'kept').length,
    dropped: sparks.filter((s) => s.state === 'dropped').length,
  }
  const shown = sparks.filter((s) => s.state === show)
  const keeping = keep ? sparks.find((s) => s.id === keep) : undefined
  const dropping = drop ? sparks.find((s) => s.id === drop) : undefined
  const editing = edit ? sparks.find((s) => s.id === edit) : undefined
  const here = `/spark?show=${show}`

  return (
    <main>
      <div className="frame [--frame-margin:340px] items-baseline">
        <div className="lbl pl-5 lg:pl-16 py-3 pr-5 text-muted">Sparks</div>
        <div className="lbl border-l border-rule px-5 lg:px-10 py-3 text-muted">
          Thoughts, before they are work
        </div>
        <div className="border-l border-rule py-3 pl-5 lg:pl-8 pr-5 lg:pr-16 text-right">
          {counts.new > 0 && (
            <span className="lbl text-ink">
              {counts.new} to look at
            </span>
          )}
        </div>
      </div>
      <Rule strong />

      <div className="px-5 lg:px-16 py-8">
        {/* -------------------------------------------------------------- */}
        {/* Capture. One field.                                            */}
        {/* -------------------------------------------------------------- */}
        <form action={createSpark} className="max-w-3xl">
          <input type="hidden" name="redirectTo" value={here} />
          <label className="block">
            <span className="lbl text-muted">
              <Hint text="No type, no project, no date. Write the sentence and go back to sleep. Deciding where it goes is a different job, done here later.">
                What was the thought
              </Hint>
            </span>
            <textarea
              name="body"
              required
              rows={2}
              placeholder="We should be logging the cleaning line stops automatically"
              className="field resize-y text-base"
            />
          </label>
          <label className="mt-3 block">
            <span className="lbl text-muted">
              <Hint text="Optional, and skip it at eleven at night. It is what makes the thought still readable in three weeks.">
                What was around it
              </Hint>
            </span>
            <textarea
              name="note"
              rows={2}
              placeholder="Came up while looking at the stop log on line 3"
              className="field resize-y text-[12.5px]"
            />
          </label>
          <button className="btn mt-3">Capture</button>
        </form>

        {/* -------------------------------------------------------------- */}
        {/* Triage                                                         */}
        {/* -------------------------------------------------------------- */}
        <div className="mt-12 flex items-baseline gap-6">
          {(['new', 'kept', 'dropped'] as const).map((state) => (
            <Link
              key={state}
              href={`/spark?show=${state}`}
              className={`lbl ${
                show === state
                  ? 'text-ink underline decoration-rule-strong underline-offset-4'
                  : 'text-muted hover:text-ink'
              }`}
            >
              {state === 'new' ? 'Inbox' : state === 'kept' ? 'Became work' : 'Decided against'}
              <span className="ml-2 tabular-nums text-rule-strong">{counts[state]}</span>
            </Link>
          ))}
        </div>
        <Rule strong />

        {shown.length === 0 ? (
          <p className="mt-5 max-w-prose text-[13px] leading-relaxed text-muted">
            {show === 'new'
              ? 'Nothing waiting. An empty inbox here is the normal state, not an achievement to protect.'
              : show === 'kept'
                ? 'Nothing has become work yet.'
                : 'Nothing decided against yet. Most sparks should end up here, and that is the list working.'}
          </p>
        ) : (
          <div className="divide-y divide-rule border-b border-rule">
            {shown.map((s) => (
              <article key={s.id} className="py-4">
                <div className="flex items-baseline gap-5">
                  <span className="num w-[62px] shrink-0 text-[10px] text-rule-strong">
                    {formatDate(s.captured_at.slice(0, 10))}
                  </span>

                  <div className="min-w-0 flex-1">
                    {editing?.id === s.id ? (
                      <form action={editSpark} className="flex flex-col gap-3">
                        <input type="hidden" name="id" value={s.id} />
                        <input type="hidden" name="redirectTo" value={here} />
                        <textarea
                          name="body"
                          required
                          autoFocus
                          rows={2}
                          defaultValue={s.body}
                          className="field resize-y"
                        />
                        <label className="block">
                          <span className="lbl text-muted">
                            <Hint text="What made the thought make sense at the time. Claude fills this in when it captures one; you can change it or empty it.">
                              What was around it
                            </Hint>
                          </span>
                          <textarea
                            name="note"
                            rows={2}
                            defaultValue={s.note ?? ''}
                            className="field resize-y text-[12.5px]"
                          />
                        </label>
                        <div className="flex items-center gap-3">
                          <button className="btn">Save</button>
                          <Link href={here} className="btn btn-ghost">
                            Cancel
                          </Link>
                        </div>
                      </form>
                    ) : (
                      <>
                        <Prose text={s.body} className="text-[14px]" />
                        {/*
                          Subordinate on purpose. The sentence is the thought;
                          this is what was around it, and it must not compete
                          with it for attention.
                        */}
                        {/*
                          Folded, because two price tables would push the
                          thought they belong to off the screen. The summary
                          counts tables and rows, so a folded note still shows
                          that it is a bill of materials rather than a
                          sentence.
                        */}
                        <ProseFolded
                          text={s.note}
                          className="mt-1.5 border-l-2 border-rule pl-3 text-[12.5px] text-muted"
                        />
                      </>
                    )}

                    {/*
                      What it is worth, in the one currency the strategy is
                      written in. Only in the inbox: once a spark has become
                      work or been decided against, the assessment has done its
                      job and the tree carries the story from there.
                    */}
                    {s.state === 'new' && (
                      <Assessment
                        spark={s}
                        reference={reference}
                        stages={stages}
                        editing={assess === s.id}
                        editHref={`${here}&assess=${s.id}`}
                        cancelHref={here}
                        redirectTo={here}
                      />
                    )}

                    <div className="lbl-tight mt-1.5 flex flex-wrap items-baseline gap-x-4 text-rule-strong">
                      <span>{SPARK_SOURCE_LABEL[s.source]}</span>
                      {s.became_node_id && (
                        <Link
                          href={`/p/${projectOf(s.became_node_id)}?focus=${s.became_node_id}`}
                          className="text-green hover:text-ink"
                        >
                          {label(s.became_node_id)}
                        </Link>
                      )}
                      {s.state === 'kept' && s.became_node_id === null && (
                        <span>
                          <Hint text="It became a node, and that node has since been deleted. The record that the thought was had and acted on stays.">
                            what it became is gone
                          </Hint>
                        </span>
                      )}
                      {s.verdict && <span className="text-muted">{s.verdict}</span>}
                    </div>
                  </div>

                  {editing?.id !== s.id && (
                    <div className="flex shrink-0 items-baseline gap-3">
                      {s.state === 'new' ? (
                        <>
                          <Link
                            href={`/spark?show=${show}&keep=${s.id}`}
                            className="lbl-tight text-rule-strong hover:text-green"
                          >
                            Make it work
                          </Link>
                          <Link
                            href={`/spark?show=${show}&drop=${s.id}`}
                            className="lbl-tight text-rule-strong hover:text-oxblood"
                          >
                            Drop
                          </Link>
                          <Link
                            href={`/spark?show=${show}&edit=${s.id}`}
                            className="lbl-tight text-rule-strong hover:text-ink"
                          >
                            Edit
                          </Link>
                        </>
                      ) : (
                        <form action={reopenSpark}>
                          <input type="hidden" name="id" value={s.id} />
                          <input type="hidden" name="redirectTo" value={here} />
                          <button className="lbl-tight text-rule-strong hover:text-ink">
                            Back to inbox
                          </button>
                        </form>
                      )}
                      <form action={deleteSpark}>
                        <input type="hidden" name="id" value={s.id} />
                        <input type="hidden" name="redirectTo" value={here} />
                        <button
                          className="lbl-tight text-rule-strong hover:text-oxblood"
                          title="Gone for good. For the ones that were a typo, not a thought"
                        >
                          ×
                        </button>
                      </form>
                    </div>
                  )}
                </div>

                {/* It becomes work */}
                {keeping?.id === s.id && (
                  <form
                    action={promoteSpark}
                    className="mt-4 ml-[82px] max-w-3xl border-l-2 border-rule-strong pl-4"
                  >
                    <input type="hidden" name="id" value={s.id} />
                    <input type="hidden" name="redirectTo" value={`/spark?show=new`} />
                    <div className="grid grid-cols-4 gap-x-5 gap-y-3">
                      <label className="col-span-2 block">
                        <span className="lbl text-muted">
                          <Hint text="The thought becomes the description. Give it a name here: how you first put it is often clearer than the name, so both are kept.">
                            Call it
                          </Hint>
                        </span>
                        <input
                          name="title"
                          required
                          autoFocus
                          defaultValue={s.body.split('\n')[0].slice(0, 70)}
                          className="field"
                        />
                      </label>

                      <label className="block">
                        <span className="lbl text-muted">As a</span>
                        <select name="type" defaultValue="task" className="field">
                          {(['project', 'subproject', 'development', 'task'] as const).map((t) => (
                            <option key={t} value={t}>
                              {TYPE_LABEL[t]}
                            </option>
                          ))}
                        </select>
                        <span className="mt-1 block text-[10px] leading-snug text-rule-strong">
                          {TYPE_HINT.task}
                        </span>
                      </label>

                      <label className="block">
                        <span className="lbl text-muted">
                          <Hint text="Leave empty only for a project. Everything else has to sit somewhere.">
                            Under
                          </Hint>
                        </span>
                        <select name="parent_id" defaultValue="" className="field">
                          <option value="">nowhere, it is a project</option>
                          {nodes
                            .filter((n) => n.type !== 'task')
                            .map((n) => (
                              <option key={n.id} value={n.id}>
                                {label(n.id)}
                              </option>
                            ))}
                        </select>
                      </label>
                    </div>
                    <div className="mt-4 flex items-center gap-3">
                      <button className="btn">Create it</button>
                      <Link href={here} className="btn btn-ghost">
                        Cancel
                      </Link>
                    </div>
                  </form>
                )}

                {/* Decided against */}
                {dropping?.id === s.id && (
                  <form
                    action={dropSpark}
                    className="mt-4 ml-[82px] flex max-w-3xl items-end gap-3 border-l-2 border-rule-strong pl-4"
                  >
                    <input type="hidden" name="id" value={s.id} />
                    <input type="hidden" name="redirectTo" value={`/spark?show=new`} />
                    <label className="block flex-1">
                      <span className="lbl text-muted">
                        <Hint text="Worth a line. It is what stops the same idea arriving again in three months and going round the loop a second time.">
                          Why not
                        </Hint>
                      </span>
                      <input
                        name="verdict"
                        autoFocus
                        placeholder="The PLC cannot expose it without a licence we are not buying"
                        className="field"
                      />
                    </label>
                    <button className="btn">Drop it</button>
                    <Link href={here} className="btn btn-ghost">
                      Cancel
                    </Link>
                  </form>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
