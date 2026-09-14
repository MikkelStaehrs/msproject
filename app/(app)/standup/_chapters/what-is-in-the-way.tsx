import Link from 'next/link'
import type { AgendaItem } from '@/lib/standup'
import { StatusMark, formatDate } from '@/components/ui'
import { STATUS_LABEL, type Decision, type Entry, type Node, type NodeState } from '@/lib/types'
import { Room, type Attendee } from './room'

/**
 * Chapter one: what is in the way.
 *
 * Whoever is waiting, worst first, taken from the same agenda the queue is
 * ranked by rather than from the blockers table, so the status rule and the
 * ordering are applied once and cannot drift apart.
 *
 * Split out of `page.tsx` for reading rather than for speed. The page fetches
 * once for all three chapters and still does: the queries run in one
 * `Promise.all`, so they cost one wait rather than twelve, and letting each
 * chapter fetch its own would buy a second round trip in exchange for nothing.
 */

/** One node on the agenda, with every reason it is there. */
export type Row = { nodeId: string; lead: AgendaItem; also: AgendaItem[] }

export function WhatIsInTheWay({
  waitingRows,
  room,
  moved,
  agreedLast,
  lastStandup,
  byId,
  state,
  today,
  projectTitle,
  at,
  here,
}: {
  waitingRows: Row[]
  room: Attendee[]
  moved: { completed: unknown[]; resolved: unknown[]; opened: unknown[]; written: number }
  /** What the room asked for last time, and what became of it. */
  agreedLast: { lines: Entry[]; tasks: Node[]; decisions: Decision[] } | null
  lastStandup: { held_on: string } | null
  byId: Map<string, Node>
  state: Map<string, NodeState>
  today: string
  projectTitle: (nodeId: string) => string
  at: (nodeId: string, extra?: string) => string
  here: (part: '1' | '2' | '3', extra?: string) => string
}) {
  return (
    <div className="frame [--frame-label:360px] [--frame-margin:330px] min-h-[60vh]">
      <div className="pl-5 lg:pl-16 py-8 pr-5">
        <h1 className="font-display text-[30px] font-medium leading-[1.06]">
          What is in the way
        </h1>
        {/*
          Blockers on work somebody is actually doing, and nothing else.
          
          This chapter used to be the retrospective: what finished, what came
          unstuck, what got stuck. That is a read rather than a working
          surface, and it had the whole first chapter of a meeting. It is now
          the line above the chapters, which keeps the boundary meaning
          something without spending a chapter on it.
        */}
        <p className="mt-5 max-w-[24ch] text-[11px] leading-relaxed text-rule-strong">
          Only on work that has been started. A blocker on something nobody
          has begun is a note about a future problem, not something standing
          in the way today.
        </p>
      </div>

      <div className="border-l border-rule px-5 lg:px-10 py-8">
        {waitingRows.length === 0 ? (
          <p className="max-w-prose text-[13px] leading-relaxed text-muted">
            Nothing is waiting on anybody. Every open blocker sits on work
            that has not been started, or there are none at all.
          </p>
        ) : (
          <div>
            {waitingRows.map((r) => {
              const b = r.lead
              return (
                <Link
                  key={r.nodeId + b.title}
                  href={here('2', r.nodeId)}
                  className="group grid grid-cols-1 items-baseline gap-x-5 gap-y-1 border-t border-rule py-3 last:border-b lg:grid-cols-[54px_1fr_auto]"
                >
                  <span
                    className={`num text-[19px] ${
                      b.kind === 'overdue_blocker' ? 'text-oxblood' : 'text-ink'
                    }`}
                  >
                    {b.days}
                    <span className="lbl-tight text-rule-strong"> d</span>
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] leading-snug group-hover:text-green">
                      {b.title}
                    </span>
                    <span className="lbl-tight text-muted">
                      {byId.get(r.nodeId)?.title} · {projectTitle(r.nodeId)}
                    </span>
                  </span>
                  <span
                    className={`lbl-tight shrink-0 ${
                      b.kind === 'overdue_blocker' ? 'text-oxblood' : 'text-muted'
                    }`}
                  >
                    {b.who}
                    {b.kind === 'overdue_blocker' && ' · answer is late'}
                  </span>
                </Link>
              )
            })}
          </div>
        )}

        {agreedLast && (
          <div className="mt-8 border-t border-rule-strong pt-5">
            <div className="flex items-baseline gap-4">
              <h2 className="lbl">Agreed last time</h2>
              <span className="lbl-tight tabular-nums text-rule-strong">
                {formatDate(lastStandup!.held_on)}
              </span>
            </div>

            {agreedLast.lines.length === 0 && agreedLast.tasks.length === 0 ? (
              <p className="mt-2.5 max-w-prose text-[11.5px] leading-relaxed text-rule-strong">
                Nothing was written down at that stand-up. Use{' '}
                <span className="text-ink">agreed here</span> on a piece in
                chapter two and it lands in this list next week.
              </p>
            ) : (
              <div className="mt-3">
                {agreedLast.tasks.map((n) => {
                  const done = n.status === 'done' || n.completed_at !== null
                  const late =
                    !done && n.due_date !== null && n.due_date < today
                  return (
                    <div
                      key={n.id}
                      className="flex items-baseline gap-3 border-t border-rule py-2.5 last:border-b"
                    >
                      <StatusMark
                        status={n.status}
                        blocked={state.get(n.id)?.is_blocked ?? false}
                      />
                      <Link
                        href={at(n.id)}
                        className={`min-w-0 flex-1 text-[12.5px] leading-snug hover:text-green ${
                          done ? 'text-muted line-through' : ''
                        }`}
                      >
                        {n.title}
                      </Link>
                      {n.owner && (
                        <span className="lbl-tight shrink-0 text-muted">
                          {n.owner}
                        </span>
                      )}
                      <span
                        className={`shrink-0 text-[10px] tabular-nums ${
                          late ? 'text-oxblood' : 'text-rule-strong'
                        }`}
                      >
                        {done
                          ? 'done'
                          : n.due_date
                            ? formatDate(n.due_date)
                            : STATUS_LABEL[n.status]}
                      </span>
                    </div>
                  )
                })}

                {/* Lines that changed nothing structural. Still the record. */}
                {agreedLast.lines
                  .filter(
                    (e) => !agreedLast.tasks.some((n) => n.title === e.body),
                  )
                  .map((e) => (
                    <div
                      key={e.id}
                      className="flex items-baseline gap-3 border-t border-rule py-2.5 last:border-b"
                    >
                      <span className="w-[9px] shrink-0" />
                      <Link
                        href={at(e.node_id)}
                        className="min-w-0 flex-1 text-[12.5px] leading-snug hover:text-green"
                      >
                        {e.body}
                        <span className="text-rule-strong">
                          {' '}
                          · {byId.get(e.node_id)?.title}
                        </span>
                      </Link>
                    </div>
                  ))}

                {agreedLast.decisions.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-baseline gap-3 border-t border-rule py-2.5 last:border-b"
                  >
                    <span className="lbl-tight w-[9px] shrink-0 text-green">
                      &#9670;
                    </span>
                    <span className="min-w-0 flex-1 text-[12.5px] leading-snug">
                      {d.decision}
                    </span>
                    <span className="lbl-tight shrink-0 text-rule-strong">
                      decided
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <p className="mt-7 max-w-prose border-t border-rule pt-3.5 text-[11.5px] leading-relaxed text-rule-strong">
          {moved.written === 0
            ? 'Not one log line was written in the period. Friday assembles the weekly report out of those, so it has nothing to say. That is the cheapest thing on this whole page to fix.'
            : `${moved.written} log ${moved.written === 1 ? 'line' : 'lines'} written. That is what Friday assembles the report from.`}
        </p>
      </div>

      <div className="border-l border-rule py-8 pl-5 lg:pl-8 pr-5 lg:pr-16">
        <Room room={room} />
      </div>
    </div>
  )
}
