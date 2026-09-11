import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { QueryFailure, firstError } from '@/lib/failure'
import { pathTo } from '@/lib/wbs'
import {
  createSpark,
  deleteSpark,
  dropSpark,
  editSpark,
  logSpark,
  promoteSpark,
  reopenSpark,
} from '@/lib/spark-actions'
import { Hint, Prose, ProseFolded, Rule, formatDate } from '@/components/ui'
import { Assessment } from '@/components/assessment'
import { referenceFrom, stagesFrom } from '@/lib/cogs'
import {
  SAVING_KINDS,
  SAVING_KIND_HINT,
  SAVING_KIND_LABEL,
  SPARK_SOURCE_LABEL,
  WORTH_BASES,
  WORTH_BASIS_HINT,
  WORTH_BASIS_LABEL,
  TYPE_HINT,
  TYPE_LABEL,
  type Node,
  type NodeType,
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
    log?: string
    drop?: string
    edit?: string
    assess?: string
    show?: string
  }>
}) {
  const { keep, log, drop, edit, assess, show = 'new' } = await searchParams
  const supabase = await createClient()

  const [sparkRes, nodeRes, yardstickRes, stageRes, strategyRes] = await Promise.all([
    supabase.from('spark').select('*').order('captured_at', { ascending: false }),
    supabase.from('node').select('id, parent_id, title, type').order('sort_order'),
    supabase.from('yardstick').select('*').maybeSingle(),
    supabase.from('stage_volume').select('fiscal_year, stage, units, scope'),
    supabase.from('strategy').select('id, name').order('sort_order').order('name'),
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

  /*
   * Left out of firstError beside the yardstick, and for the same reason: with
   * no strategies the gate simply offers none and every promotion takes the
   * ordinary branch. That is a narrower page, not a broken one.
   */
  const strategies = (strategyRes.data ?? []) as { id: string; name: string }[]

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
  const logging = log ? sparks.find((s) => s.id === log) : undefined
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
                          {/*
                            The third way out, and the common one nobody had a
                            button for. A thought about work ALREADY running is
                            not a task: forced through «Make it work» it becomes
                            a task that is not a task, and dropped it is thrown
                            away while being true.
                          */}
                          <Link
                            href={`/spark?show=${show}&log=${s.id}`}
                            className="lbl-tight text-rule-strong hover:text-green"
                          >
                            Log it on existing work
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-3">
                      <label className="col-span-1 sm:col-span-2 block">
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

                      {/*
                        Defaulting to «project», because the field below it
                        defaults to «nowhere, it is a project» and the two have
                        to agree. They did not: the type defaulted to task while
                        the parent defaulted to none, so the first press of
                        «Create it» on an untouched form always threw «a task
                        needs somewhere to sit». The same reasoning node-form
                        uses, which picks its default from whether a parent is
                        known at all.

                        The hint sits INSIDE each option rather than under the
                        select. This is a server component and the select is
                        uncontrolled, so a hint outside it can only ever
                        describe one of the four, and it described the one that
                        is no longer the default. Same spelling as node-form.
                      */}
                      <label className="block">
                        <span className="lbl text-muted">As a</span>
                        <select name="type" defaultValue="project" className="field">
                          {(Object.keys(TYPE_LABEL) as NodeType[]).map((t) => (
                            <option key={t} value={t}>
                              {TYPE_LABEL[t]} · {TYPE_HINT[t]}
                            </option>
                          ))}
                        </select>
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

                    {/*
                      THE GATE, and the reason it is here rather than optional
                      on a page of its own.

                      Seven thoughts were captured and none assessed, because
                      assessing was a separate act you could always do later.
                      Optional means never, and that is not a claim about
                      discipline, it is what the table said after a fortnight.

                      It asks for an ANSWER and never for an amount. A required
                      budget on a thought that has none produces a 0 or a
                      fiction, and a fiction in a column outlives whoever typed
                      it: `sold_units` is the house example. So three answers are
                      accepted and only silence is refused.
                    */}
                    <div className="mt-6 border-t border-rule pt-4">
                      <div className="lbl text-muted">Before it becomes work</div>

                      {/*
                        Which rules it signs up to, and that decides which answer
                        below is good enough.

                        A marking used to be something you added later, on a page
                        nobody opened, which is why there were none at all. Asked
                        here it is made at the moment the commitment is.

                        Marked, it has to carry a saving: «take a euro out of
                        every unit» is not served by work with no figure, it is
                        only hoped at. Unmarked, the question is the goal
                        instead, because a project nobody can state the point of
                        is one nobody can ever close.
                      */}
                      <div className="mt-3 grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2">
                        <label className="block">
                          <span className="lbl text-muted">
                            <Hint text="Marked work has to carry a saving. If the figure is not worked out yet, leave it unmarked and mark it the day it is.">
                              Does it serve a strategy
                            </Hint>
                          </span>
                          <select name="strategy_id" defaultValue="" className="field">
                            <option value="">no, an ordinary project</option>
                            {strategies.map((st) => (
                              <option key={st.id} value={st.id}>
                                {st.name} · needs a figure
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="block">
                          <span className="lbl text-muted">
                            <Hint text="Required for an ordinary project. What it must achieve, and how you can tell whether it worked. A goal without the second half is a wish.">
                              Goal, if it is ordinary
                            </Hint>
                          </span>
                          <input
                            name="goal"
                            placeholder="operators see line stops without asking IT for a report"
                            className="field"
                          />
                        </label>
                      </div>

                      <div className="mt-3 grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
                        <label className="col-span-1 block sm:col-span-2">
                          <span className="lbl text-muted">
                            <Hint text="Any of the three is a real answer. Leaving it blank is not, which is the only thing this refuses.">
                              What is it worth
                            </Hint>
                          </span>
                          <select name="worth_basis" defaultValue="unknown" className="field">
                            {WORTH_BASES.map((w) => (
                              <option key={w} value={w}>
                                {WORTH_BASIS_LABEL[w]} · {WORTH_BASIS_HINT[w]}
                              </option>
                            ))}
                          </select>
                        </label>

                        {/*
                          Both of the conditional fields are always rendered.
                          This is a server component with no client state, so
                          hiding one would need the page to know the answer
                          before it is given. The server refuses the combinations
                          that do not hold together, and says which.
                        */}
                        <label className="block">
                          <span className="lbl text-muted">If it saves</span>
                          <select name="saving_kind" defaultValue="" className="field">
                            <option value="">not a saving</option>
                            {SAVING_KINDS.map((k) => (
                              <option key={k} value={k}>
                                {SAVING_KIND_LABEL[k]} · {SAVING_KIND_HINT[k]}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="block">
                          <span className="lbl text-muted">How much</span>
                          <input name="saving_value" inputMode="decimal" className="field" />
                        </label>

                        <label className="col-span-1 block sm:col-span-2">
                          <span className="lbl text-muted">
                            <Hint text="Only for a saving per unit: the stages do not run the same quantities, so the same figure is worth more on one line than another.">
                              Through which stage
                            </Hint>
                          </span>
                          <select name="saving_stage" defaultValue="" className="field">
                            <option value="">not per unit</option>
                            {stages.map((v) => (
                              <option key={v.stage} value={v.stage}>
                                {v.stage} ·{' '}
                                {new Intl.NumberFormat('en-GB').format(v.units)} units
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="col-span-1 block sm:col-span-2">
                          <span className="lbl text-muted">
                            <Hint text="Required when there is no direct saving. It is the whole answer in that case, and the thing somebody reads in six months.">
                              Why it is worth doing anyway
                            </Hint>
                          </span>
                          <input
                            name="worth_note"
                            placeholder="it lets the data platform start, and removes the manual step"
                            className="field"
                          />
                        </label>
                      </div>

                      {/*
                        All three or none. priorityScore returns null unless
                        every one is set, because two out of three make a number
                        that looks comparable to a complete one and is not. The
                        matrix is the whole reason they exist.
                      */}
                      <div className="mt-4 grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-3">
                        {[
                          ['benefit_score', 'Benefit', '1 marginal, 5 large'],
                          ['cost_score', 'Cost', '1 cheap, 5 expensive'],
                          ['complexity_score', 'Complexity', '1 simple, 5 hairy'],
                        ].map(([name, label_, hint]) => (
                          <label key={name} className="block">
                            <span className="lbl text-muted">
                              <Hint text={hint}>{label_}</Hint>
                            </span>
                            <select name={name} defaultValue="3" className="field">
                              {[1, 2, 3, 4, 5].map((n) => (
                                <option key={n} value={n}>
                                  {n}
                                </option>
                              ))}
                            </select>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="mt-4 flex items-center gap-3">
                      <button className="btn">Create it</button>
                      <Link href={here} className="btn btn-ghost">
                        Cancel
                      </Link>
                    </div>
                  </form>
                )}

                {/*
                  It was never work: a line in the log on work already running.

                  No gate here, deliberately. The claim is demanded of a thought
                  that becomes WORK, because work is what gets ranked, funded and
                  reported upwards. An observation about something already
                  underway owes nobody a business case, and asking for one is how
                  you teach somebody not to write the line at all.
                */}
                {logging?.id === s.id && (
                  <form
                    action={logSpark}
                    className="mt-4 ml-[82px] max-w-3xl border-l-2 border-rule-strong pl-4"
                  >
                    <input type="hidden" name="id" value={s.id} />
                    <input type="hidden" name="redirectTo" value={`/spark?show=new`} />
                    <label className="block">
                      <span className="lbl text-muted">
                        <Hint text="Every node, tasks included. A line belongs on the work it happened on, not on the box above it.">
                          Which work is this about
                        </Hint>
                      </span>
                      <select name="node_id" required defaultValue="" className="field">
                        <option value="" disabled>
                          Choose the node
                        </option>
                        {nodes.map((n) => (
                          <option key={n.id} value={n.id}>
                            {label(n.id)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <p className="mt-2 max-w-prose text-[11px] leading-relaxed text-rule-strong">
                      The thought becomes a log entry, word for word, with whatever
                      was noted around it. No task is created, and the spark closes
                      pointing at the line it became.
                    </p>
                    <div className="mt-4 flex items-center gap-3">
                      <button className="btn">Write it in the log</button>
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
