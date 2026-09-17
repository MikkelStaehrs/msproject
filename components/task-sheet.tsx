import Link from 'next/link'
import { daysBetween } from '@/lib/date'
import { editTaskBasics, setStatusWithLine } from '@/lib/node-actions'
import { QuickAddOn } from '@/components/quick-add-on'
import { PersonPicker, WasNamed } from '@/components/person-picker'
import { createClient } from '@/lib/supabase/server'
import { readPeople } from '@/lib/person-data'
import { formatDate, relativeDays } from '@/components/ui'
import { STATUS_LABEL } from '@/lib/types'
import type {
  BlockerDays,
  Decision,
  Entry,
  Node,
  NodeDependency,
  NodeStatus,
} from '@/lib/types'

/**
 * One task, opened over the board.
 *
 * It is a sheet rather than a column because a task carries a description
 * written to be read, and four hundred pixels of margin turns that into a
 * column of six words. It is a sheet rather than a page because you walk a
 * board one card at a time, and losing the board at every click is what makes
 * a review take an afternoon.
 *
 * Everything in it is either typed or derived, and the two never mix. Title,
 * date, driver and description are typed, and sit in one form. The state, the
 * wait, the order of work and the log are derived or recorded elsewhere, and
 * are shown rather than edited here. The one exception is the state, which is
 * a decision, and which is therefore the one thing that asks for a line.
 */

const COLUMNS: NodeStatus[] = ['idea', 'planned', 'active', 'paused', 'done']

export async function TaskSheet({
  node,
  code,
  path,
  closeHref,
  redirectTo,
  blockers,
  decisions,
  entries,
  waitsOn,
  holdsUp,
  titleOf,
  today,
  preselect,
}: {
  node: Node
  code: string
  /** The chain above it, relative to the project, already joined. */
  path: string
  closeHref: string
  redirectTo: string
  blockers: BlockerDays[]
  decisions: Decision[]
  entries: Entry[]
  waitsOn: NodeDependency[]
  holdsUp: NodeDependency[]
  titleOf: (id: string) => string
  today: string
  /** The state a drop asked for. The move still has to be said out loud. */
  preselect?: NodeStatus
}) {
  /* Read here rather than threaded down: this is a server component, and the
     sheet is opened from three views of the same page. */
  const people = await readPeople(await createClient())

  const open = blockers.filter((b) => b.is_active)
  const chosen = preselect ?? node.status
  const late =
    node.due_date !== null && node.status !== 'done' && daysBetween(today, node.due_date) < 0

  return (
    <>
      {/*
        The scrim. A click anywhere off the sheet closes it, which is why it is
        a link covering the page rather than a div: it works without JavaScript,
        and so does Escape, through the browser's own back.
      */}
      <Link
        href={closeHref}
        aria-label="Close"
        className="fixed inset-0 z-40 bg-ink/30"
      />

      <div className="pointer-events-none fixed inset-0 z-50 overflow-auto px-5 py-11">
        <div className="pointer-events-auto mx-auto w-full max-w-[1100px] border border-line-strong bg-inset">
          {/* Where it is, and the way out */}
          <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-line-strong px-5 py-3">
            <div className="flex flex-wrap items-baseline gap-3">
              <span className="micro text-muted">{node.type}</span>
              <span className="micro text-muted">{code}</span>
              <span className="text-[12px] text-muted">{path}</span>
            </div>
            <Link href={closeHref} className="act">
              Close
            </Link>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_330px]">
            {/* What is typed */}
            <div className="min-w-0 px-5 py-6">
              <form action={editTaskBasics}>
                <input type="hidden" name="id" value={node.id} />
                <input type="hidden" name="redirectTo" value={redirectTo} />

                <input
                  name="title"
                  defaultValue={node.title}
                  aria-label="Title"
                  className="field !text-[26px] !font-semibold tracking-[-0.025em]"
                />

                <div className="grp-gap flex flex-wrap items-baseline gap-5">
                  <label className="flex items-baseline gap-2">
                    <span className="lbl text-muted">Due</span>
                    <input
                      type="date"
                      name="due_date"
                      defaultValue={node.due_date ?? ''}
                      className="field !w-auto"
                    />
                  </label>
                  {node.due_date && (
                    <span className={`mono text-[12px] ${late ? 'text-oxblood' : 'text-muted'}`}>
                      {relativeDays(daysBetween(today, node.due_date))}
                    </span>
                  )}
                  <label className="flex flex-1 items-baseline gap-2">
                    <span className="lbl shrink-0 text-muted">Driver</span>
                    <span className="min-w-0 flex-1">
                      <PersonPicker
                        name="driver_id"
                        people={people}
                        value={node.driver_id ? [node.driver_id] : []}
                      />
                      <WasNamed name={node.driver_name} />
                    </span>
                  </label>
                </div>

                <div className="grp-gap">
                  <span className="lbl text-muted">What it is</span>
                  <textarea
                    name="description"
                    defaultValue={node.description ?? ''}
                    rows={5}
                    placeholder="The brief and the weekly report read from this field."
                    className="field mt-1.5 leading-relaxed"
                  />
                </div>

                <button className="btn grp-gap">Save</button>
              </form>

              {/* What has happened, in one stream */}
              <h3 className="sec-gap text-[15px] font-semibold">Its own log</h3>
              {entries.length + decisions.length + open.length === 0 ? (
                <p className="mt-2 text-[13px] text-muted">
                  Nothing has ever been written on this task.
                </p>
              ) : (
                <div className="panel mt-3">
                  {open.map((b) => (
                    <div key={b.id} className="border-b border-rule px-3.5 py-3 last:border-b-0">
                      <div className="flex items-start gap-3">
                        <span className="mono w-[1.1em] shrink-0 text-center text-oxblood">!</span>
                        <div className="min-w-0 flex-1">
                          <div className="leading-snug">{b.title}</div>
                          <div className="mt-1 text-[12px] text-muted">
                            {b.waiting_on} ·{' '}
                            <span className="mono text-oxblood">{b.days_blocked} days</span>
                            {b.expected_by
                              ? `, expected by ${formatDate(b.expected_by)}`
                              : ', no expected reply'}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {decisions.map((d) => (
                    <div key={d.id} className="border-b border-rule px-3.5 py-3 last:border-b-0">
                      <div className="flex items-start gap-3">
                        <span className="mono w-[1.1em] shrink-0 text-center text-muted">?</span>
                        <div className="min-w-0 flex-1">
                          <div className="leading-snug">{d.decision}</div>
                          <div
                            className={`mt-1 text-[12px] ${
                              d.rationale ? 'text-muted' : 'text-oxblood'
                            }`}
                          >
                            {d.rationale ?? 'No rationale written down'}
                          </div>
                        </div>
                        <span className="mono shrink-0 text-[9.5px] uppercase tracking-[0.1em] text-muted">
                          {formatDate(d.decided_on)}
                        </span>
                      </div>
                    </div>
                  ))}
                  {entries.map((e) => (
                    <div key={e.id} className="border-b border-rule px-3.5 py-3 last:border-b-0">
                      <div className="flex items-start gap-3">
                        <span className="mono w-[1.1em] shrink-0 text-center text-muted">·</span>
                        <div className="min-w-0 flex-1 leading-snug">{e.body}</div>
                        <span className="mono shrink-0 text-[9.5px] uppercase tracking-[0.1em] text-muted">
                          {formatDate(e.entry_date)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="grp-gap flex items-center gap-4">
                <QuickAddOn nodeId={node.id} />
                <span className="text-[12px] text-muted">
                  A line, or <span className="mono">!</span> a blocker,{' '}
                  <span className="mono">?</span> a decision, <span className="mono">+</span> a
                  task under this one.
                </span>
              </div>
            </div>

            {/* What is decided, and what is derived */}
            <div className="min-w-0 border-t border-rule px-5 py-6 lg:border-l lg:border-t-0">
              {/*
                The state is the one thing here that is a decision rather than a
                fact, and it is the one thing that asks for a line. Friday is
                assembled out of those lines, so a move nobody wrote about is a
                week nobody can report.
              */}
              <form action={setStatusWithLine}>
                <input type="hidden" name="id" value={node.id} />
                <input type="hidden" name="redirectTo" value={redirectTo} />

                <span className="lbl text-muted">State</span>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {COLUMNS.map((s) => (
                    <label
                      key={s}
                      className={`tag cursor-pointer ${
                        chosen === s ? 'border-green text-green' : ''
                      }`}
                    >
                      <input
                        type="radio"
                        name="status"
                        value={s}
                        defaultChecked={chosen === s}
                        className="sr-only"
                      />
                      {STATUS_LABEL[s]}
                    </label>
                  ))}
                </div>

                <input
                  name="body"
                  placeholder="Say what changed, in one line"
                  autoFocus={preselect !== undefined}
                  className="field mt-3"
                />
                {preselect !== undefined && preselect !== node.status && (
                  <p className="mt-2 text-[12px] leading-relaxed text-oxblood">
                    Dropped into {STATUS_LABEL[preselect]}. Nothing has moved yet.
                  </p>
                )}
                <button className="btn btn-ghost mt-3">Move it</button>
              </form>

              <h3 className="sec-gap text-[15px] font-semibold">Order of work</h3>
              {waitsOn.length + holdsUp.length === 0 ? (
                <p className="mt-2 text-[13px] text-muted">
                  Nothing before it, nothing after it.
                </p>
              ) : (
                <div className="panel mt-3">
                  {waitsOn.map((d) => (
                    <div key={d.id} className="border-b border-rule px-3.5 py-2.5 last:border-b-0">
                      <div className="flex items-baseline gap-2.5">
                        <span className="mono shrink-0 text-muted">→</span>
                        <span className="text-[12.5px]">
                          Waits on {titleOf(d.depends_on_id)}
                        </span>
                      </div>
                      {d.note && (
                        <p className="mt-1 pl-6 text-[11.5px] leading-relaxed text-muted">
                          {d.note}
                        </p>
                      )}
                    </div>
                  ))}
                  {holdsUp.map((d) => (
                    <div key={d.id} className="border-b border-rule px-3.5 py-2.5 last:border-b-0">
                      <div className="flex items-baseline gap-2.5">
                        <span className="mono shrink-0 text-muted">→</span>
                        <span className="text-[12.5px] text-muted">
                          Holds up {titleOf(d.node_id)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <h3 className="sec-gap text-[15px] font-semibold">The guess</h3>
              <p className="mt-2 text-[13px] text-muted">
                {node.estimate_low_days !== null || node.estimate_high_days !== null ? (
                  <span className="mono text-ink">
                    {node.estimate_low_days ?? '?'} to {node.estimate_high_days ?? '?'} days
                  </span>
                ) : (
                  'No estimate. Nothing reads these yet; they are kept so that in half a year the gap between the guess and the outcome can be read at all.'
                )}
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
