import Link from 'next/link'
import { AGENDA_LABEL, type AgendaItem } from '@/lib/standup'
import { moveInStandupQueue, setNodeStatus } from '@/lib/node-actions'
import { formatMoney } from '@/lib/cost'
import { daysBetween } from '@/lib/date'
import { BlockerForm, ResolveBlockerForm } from '@/components/blocker-form'
import { DecisionForm } from '@/components/decision-form'
import { AgreedHere } from '@/components/agreed-here'
import { DueDate } from '@/components/due-date'
import { NodeForm } from '@/components/node-form'
import { QuickAddOn } from '@/components/quick-add-on'
import { StatusSelect } from '@/components/status-select'
import { Prose, StatusMark, formatDate, relativeDays } from '@/components/ui'
import {
  COST_BUDGET_LABEL,
  COST_STATE_LABEL,
  DECISION_TOPIC_LABEL,
  TYPE_LABEL,
  type BlockerDays,
  type Cost,
  type Decision,
  type Entry,
  type Node,
  type NodeCost,
  type NodeState,
  type Standup,
} from '@/lib/types'
import { Room, type Attendee } from './room'
/**
 * One piece of work on the agenda, with whatever else is also true of it.
 * It lived in the chapter that has gone; it is the agenda's own shape, so it
 * belongs to the chapter that walks the agenda.
 */
export type Row = { nodeId: string; lead: AgendaItem; also: AgendaItem[] }

/**
 * Chapter two: what we are doing.
 *
 * One queue across every project, because a stand-up asks «what do we take
 * first» and that is answered over all the work at once or not at all.
 * Grouping by project answers it once per project, which is a different and
 * less useful question.
 *
 * The largest of the three by a distance, and the only one that WRITES: status,
 * the date, a blocker opened or closed, a decision, a line in the log, and the
 * order of the queue itself. Everything an item needs in order to leave the
 * agenda is on this screen, which is the whole reason there is no «handled»
 * button anywhere on it.
 *
 * Split out of `page.tsx` for reading rather than for speed. The page fetches
 * once for all three chapters and still does: the queries run in one
 * `Promise.all`, so they cost one wait rather than twelve.
 */
export function WhatWeAreDoing({
  queue,
  liveCount,
  selected,
  prev,
  next,
  reasons,
  closing,
  blockers,
  entries,
  decisions,
  lines,
  cost,
  state,
  held,
  room,
  today,
  nextOn,
  editId,
  newBlocker,
  newDecision,
  agreeing,
  projectTitle,
  projectOfNode,
  at,
}: {
  /** Every live piece, in the order the room takes it. */
  queue: { node: Node; project: Node }[]
  liveCount: number
  selected: Node | undefined
  prev: Node | undefined
  next: Node | undefined
  /** Why the selected piece is on the agenda, where it is. */
  reasons: Row['also']
  closing: BlockerDays | undefined
  blockers: BlockerDays[]
  entries: Entry[]
  decisions: Decision[]
  lines: Cost[]
  cost: Map<string, NodeCost>
  state: Map<string, NodeState>
  held: Standup[]
  room: Attendee[]
  today: string
  /** The day the room meets again, the default for anything agreed here. */
  nextOn: string
  editId?: string
  newBlocker?: string
  newDecision?: string
  agreeing?: string
  projectTitle: (nodeId: string) => string
  projectOfNode: Map<string, string>
  at: (nodeId: string, extra?: string) => string
}) {
  return (
    <div className="frame [--frame-label:360px] [--frame-margin:330px] min-h-[76vh] lg:min-h-svh">
      {/* The agenda, always in view */}
      <aside className="border-b border-rule lg:sticky lg:top-0 lg:h-svh lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <div className="sticky top-0 z-10 border-b border-rule-strong bg-paper px-5 lg:pl-16 lg:pr-7 py-5">
          <h1 className="font-display text-[24px] font-medium leading-tight">
            The whole portfolio
          </h1>
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
            <span className="num text-ink">{liveCount}</span> pieces of work
            under way. Walk them and decide what happens before{' '}
            {formatDate(nextOn)}.
          </p>
        </div>


        {/*
          Everything else that is alive. Not a second screen and not behind a
          toggle: the agenda saw four of thirty five pieces, and the other
          thirty one are the ones a toggle would hide again.
        */}
        {/*
          One queue, in the order the room decided, across every project.
          
          It was grouped by project, which answers «what do we take first»
          once per project. A stand-up asks it once, over all the work, so
          the grouping had to go and the project becomes a line under the
          title instead.
        */}
        {queue.length === 0 ? (
          <p className="px-5 lg:pl-16 lg:pr-7 py-6 text-[13px] text-muted">
            Nothing is under way. Everything is either finished or has not
            been started.
          </p>
        ) : (
          queue.map(({ node: n, project }, i) => {
            const isOn = selected?.id === n.id
            const late = n.due_date !== null && n.due_date < today
            const held = n.status === 'paused'
            return (
              <div
                key={n.id}
                className={`border-b border-rule px-5 lg:pl-16 lg:pr-7 py-2.5 ${
                  isOn ? 'bg-sheet' : 'hover:bg-sheet'
                }`}
              >
                <div className="flex items-baseline gap-2.5">
                  <StatusMark
                    status={n.status}
                    blocked={state.get(n.id)?.is_blocked ?? false}
                  />
                  <Link
                    href={at(n.id)}
                    className={`min-w-0 flex-1 truncate text-[13px] ${
                      isOn ? 'font-medium text-ink' : 'text-ink'
                    } ${held ? 'line-through decoration-rule-strong' : ''}`}
                  >
                    {n.title}
                  </Link>
                  {n.due_date && (
                    <span
                      className={`shrink-0 text-[10px] tabular-nums ${
                        late ? 'text-oxblood' : 'text-rule-strong'
                      }`}
                    >
                      {formatDate(n.due_date)}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex items-baseline gap-3">
                  <span className="min-w-0 flex-1 truncate text-[10.5px] text-muted">
                    {project.title}
                  </span>
                  {/*
                    Ranking and parking, the two things this chapter decides,
                    on the row rather than on the piece. Both are one press,
                    because a meeting does not wait while somebody navigates.
                  */}
                  <form action={moveInStandupQueue} className="shrink-0">
                    <input type="hidden" name="id" value={n.id} />
                    <input type="hidden" name="direction" value="up" />
                    <input type="hidden" name="redirectTo" value={at(n.id)} />
                    <button
                      disabled={i === 0}
                      className="px-0.5 text-[10px] text-rule-strong hover:text-ink disabled:opacity-25"
                      title="Take it earlier"
                    >
                      ▲
                    </button>
                  </form>
                  <form action={moveInStandupQueue} className="shrink-0">
                    <input type="hidden" name="id" value={n.id} />
                    <input type="hidden" name="direction" value="down" />
                    <input type="hidden" name="redirectTo" value={at(n.id)} />
                    <button
                      disabled={i === queue.length - 1}
                      className="px-0.5 text-[10px] text-rule-strong hover:text-ink disabled:opacity-25"
                      title="Take it later"
                    >
                      ▼
                    </button>
                  </form>
                  <form action={setNodeStatus} className="shrink-0">
                    <input type="hidden" name="id" value={n.id} />
                    <input
                      type="hidden"
                      name="status"
                      value={held ? 'active' : 'paused'}
                    />
                    <input type="hidden" name="redirectTo" value={at(n.id)} />
                    <button
                      className="text-[10px] text-rule-strong hover:text-green"
                      title={held ? 'Pick it up again' : 'Park it until it matters'}
                    >
                      {held ? 'resume' : 'hold'}
                    </button>
                  </form>
                </div>
              </div>
            )
          })
        )}

      </aside>

      {/* The item under discussion */}
      <section className="px-5 lg:px-10 py-8">
        {!selected ? (
          <p className="text-[15px] text-muted">
            Nothing needs the room. Chapter three is where the time goes.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div className="min-w-0">
                <div className="lbl text-rule-strong">
                  <Link
                    href={`/p/${projectOfNode.get(selected.id) ?? selected.id}`}
                    className="hover:text-ink"
                  >
                    {projectTitle(selected.id)}
                  </Link>
                  &nbsp;·&nbsp; {TYPE_LABEL[selected.type]}
                </div>
                <h2 className="mt-1.5 font-display text-[36px] font-medium leading-[1.08] tracking-[-0.02em]">
                  {selected.title}
                </h2>
              </div>

              <div className="flex shrink-0 items-center gap-5">
                {prev && (
                  <Link href={at(prev.id)} className="lbl-tight text-muted hover:text-ink">
                    &larr; Prev
                  </Link>
                )}
                {next && (
                  <Link href={at(next.id)} className="lbl-tight text-muted hover:text-ink">
                    Next &rarr;
                  </Link>
                )}
                <Link
                  href={editId === selected.id ? at(selected.id) : at(selected.id, `edit=${selected.id}`)}
                  className={`lbl-tight ${
                    editId === selected.id ? 'text-green' : 'text-muted hover:text-ink'
                  }`}
                >
                  {editId === selected.id ? 'Close' : 'Edit'}
                </Link>
                <Link
                  href={`/p/${projectOfNode.get(selected.id) ?? selected.id}/meeting?task=${selected.id}`}
                  className="lbl-tight text-rule-strong hover:text-ink"
                >
                  Open in project
                </Link>
              </div>
            </div>

            {/* Why it is on the agenda at all */}
            <div
              className={`mt-4 flex flex-col gap-1.5 pl-3 ${
                reasons.length > 0 ? 'border-l-2 border-rule-strong' : ''
              }`}
            >
              {reasons.map((i, n) => (
                <p key={n} className="text-[12.5px] leading-snug text-muted">
                  <span className="font-medium text-ink">
                    {AGENDA_LABEL[i.kind]}
                  </span>{' '}
                  {i.why}
                </p>
              ))}
            </div>

            {editId === selected.id ? (
              <div className="mt-6">
                <NodeForm
                  node={selected}
                  redirectTo={at(selected.id)}
                  cancelHref={at(selected.id)}
                />
              </div>
            ) : (
              <Prose
                text={selected.description}
                className="mt-7 max-w-[680px] text-[15px] leading-[1.75]"
              />
            )}

            {/* What you change while somebody is still talking */}
            <div className="mt-10 flex flex-wrap items-center gap-x-10 gap-y-5 border-y border-rule py-5">
              <StatusSelect
                id={selected.id}
                status={selected.status}
                blocked={state.get(selected.id)?.is_blocked ?? false}
                waitDays={state.get(selected.id)?.worst_wait ?? 0}
              />
              <DueDate id={selected.id} due={selected.due_date} today={today} />
              {selected.due_date && (
                <span className="text-[11px] text-muted">
                  {relativeDays(daysBetween(today, selected.due_date))}
                </span>
              )}
              <Fact label="Driver" value={selected.owner} />
              <Fact
                label="Priced"
                value={
                  cost.get(selected.id) && Number(cost.get(selected.id)!.once_priced) > 0
                    ? formatMoney(Number(cost.get(selected.id)!.once_priced), 'EUR')
                    : null
                }
              />
              <span className="ml-auto flex items-center gap-5">
                <AgreedHere
                  nodeId={selected.id}
                  nextOn={nextOn}
                  open={agreeing === selected.id}
                  openHref={at(selected.id, `agree=${selected.id}`)}
                  closeHref={at(selected.id)}
                  redirectTo={at(selected.id)}
                />
                <QuickAddOn nodeId={selected.id} label="write a line" />
                <Link
                  href={at(selected.id, `bnew=${selected.id}`)}
                  className="text-[11.5px] text-rule-strong hover:text-green"
                >
                  new blocker
                </Link>
                <Link
                  href={at(selected.id, `dnew=${selected.id}`)}
                  className="text-[11.5px] text-rule-strong hover:text-green"
                >
                  record a decision
                </Link>
                <Link
                  href={`/p/${projectOfNode.get(selected.id) ?? selected.id}/cost?focus=${selected.id}`}
                  className="text-[11.5px] text-rule-strong hover:text-green"
                >
                  price it
                </Link>
              </span>
            </div>

            {agreeing === selected.id && (
              <AgreedHere
                nodeId={selected.id}
                nextOn={nextOn}
                open
                openHref={at(selected.id, `agree=${selected.id}`)}
                closeHref={at(selected.id)}
                redirectTo={at(selected.id)}
              />
            )}

            {newBlocker === selected.id && (
              <div className="mt-5">
                <BlockerForm
                  nodeId={selected.id}
                  redirectTo={at(selected.id)}
                  cancelHref={at(selected.id)}
                />
              </div>
            )}
            {/*
              Found rather than asserted. A stale link - somebody resolved it
              from another screen while this one was open - would otherwise
              hand the form undefined and take the page down mid-meeting.
            */}
            {closing && (
              <div className="mt-5">
                <ResolveBlockerForm
                  blocker={closing}
                  redirectTo={at(selected.id)}
                  cancelHref={at(selected.id)}
                />
              </div>
            )}
            {newDecision === selected.id && (
              <div className="mt-5">
                <DecisionForm
                  nodeId={selected.id}
                  redirectTo={at(selected.id)}
                  cancelHref={at(selected.id)}
                />
              </div>
            )}

            <div className="mt-12 grid gap-x-14 gap-y-10 lg:grid-cols-2">
              <div>
                <Head title="Blockers" />
                {blockers.filter((b) => b.node_id === selected.id).length === 0 ? (
                  <p className="text-[13px] text-muted">None recorded.</p>
                ) : (
                  blockers
                    .filter((b) => b.node_id === selected.id)
                    .map((b) => (
                      <div
                        key={b.id}
                        className={`flex items-baseline gap-3.5 border-t border-rule py-3 last:border-b ${
                          b.is_active ? '' : 'opacity-55'
                        }`}
                      >
                        <span
                          className={`num min-w-[40px] text-[22px] leading-none ${
                            b.is_active ? 'text-oxblood' : ''
                          }`}
                        >
                          {b.days_blocked}
                        </span>
                        <span className="flex-1">
                          <span className="block text-[13.5px] leading-snug">
                            {b.title}
                          </span>
                          <span className="mt-0.5 block text-[11px] text-muted">
                            {b.waiting_on}
                            {b.expected_by && <> · expected {formatDate(b.expected_by)}</>}
                          </span>
                        </span>
                        {b.is_active && (
                          <Link
                            href={at(selected.id, `bresolve=${b.id}`)}
                            className="lbl-tight text-green hover:text-oxblood"
                          >
                            Close
                          </Link>
                        )}
                      </div>
                    ))
                )}
              </div>

              {entries.some((e) => e.node_id === selected.id) && (
              <div>
                <Head title="Log" />
                {(
                  entries
                    .filter((e) => e.node_id === selected.id)
                    .slice(0, 6)
                    .map((e) => (
                      <div key={e.id} className="border-t border-rule py-3 last:border-b">
                        <div className="text-[10px] tabular-nums text-muted">
                          {formatDate(e.entry_date)}
                        </div>
                        <p className="mt-1 text-[13px] leading-relaxed">{e.body}</p>
                      </div>
                    ))
                )}
              </div>
              )}

              {decisions.some((d) => d.node_id === selected.id) && (
              <div>
                <Head title="Decisions" />
                {(
                  decisions
                    .filter((d) => d.node_id === selected.id)
                    .map((d) => (
                      <div key={d.id} className="border-t border-rule py-3 last:border-b">
                        <div className="flex items-baseline gap-2.5 text-[10px] tabular-nums text-muted">
                          {formatDate(d.decided_on)}
                          {d.topic !== 'other' && (
                            <span className="lbl-tight text-rule-strong">
                              {DECISION_TOPIC_LABEL[d.topic]}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-[13.5px] leading-snug">{d.decision}</div>
                      </div>
                    ))
                )}
              </div>
              )}

              {lines.some((l) => l.node_id === selected.id) && (
              <div>
                <Head title="Cost" />
                {(
                  lines
                    .filter((l) => l.node_id === selected.id)
                    .map((l) => (
                      <div
                        key={l.id}
                        className="flex items-baseline gap-4 border-t border-rule py-3 last:border-b"
                      >
                        <span className="flex-1 text-[13px]">{l.description}</span>
                        <span className="lbl-tight text-rule-strong">
                          {COST_BUDGET_LABEL[l.budget]} · {COST_STATE_LABEL[l.state]}
                        </span>
                        <span className="num text-[14px]">
                          {formatMoney(Number(l.amount), l.currency)}
                        </span>
                      </div>
                    ))
                )}
              </div>
              )}
            </div>
          </>
        )}
      </section>

      {/*
        The room, in the same column it occupies on the other two chapters.
        It used to sit at the bottom of this chapter's rail, so the same list
        appeared in a different place depending on which chapter you were on,
        which is a large part of why the page read as three pages.
      */}
      <div className="border-l border-rule py-8 pl-5 lg:pl-8 pr-5 lg:pr-16">
        <Room room={room} />
      </div>
    </div>
  )
}


function Head({ title }: { title: string }) {
  return (
    <div className="mb-2.5 border-b border-rule-strong pb-1.5">
      <h3 className="lbl">{title}</h3>
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string | null }) {
  return (
    <span className="flex flex-col">
      <span className="lbl-tight text-muted">{label}</span>
      <span className="mt-0.5 text-[14px] tabular-nums">
        {value ?? <span className="text-rule-strong">not set</span>}
      </span>
    </span>
  )
}
