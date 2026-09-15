import Link from 'next/link'
import { DecisionForm } from '@/components/decision-form'
import { Origin } from '@/components/origin'
import { formatDate } from '@/components/ui'
import { formatMoney, lineAmount, lineEur } from '@/lib/cost'
import type { Reference } from '@/lib/cogs'
import {
  COST_KINDS,
  COST_KIND_HINT,
  COST_KIND_LABEL,
  COST_STATE_LABEL,
  DECISION_TOPICS,
  DECISION_TOPIC_HINT,
  DECISION_TOPIC_LABEL,
  type Cost,
  type CostKind,
  type Decision,
  type DecisionTopic,
  type NodeOrigin,
} from '@/lib/types'

/**
 * Basis: what the work rests on, as a section of Economics.
 *
 * Two questions live here, and they are not the same question. What did we
 * choose, and what did we turn down, is a moment: it happened, it is fixed,
 * and six months later it is the only thing that answers «why didn't you just
 * use a Raspberry Pi». What does it consist of is a state: it moves until the
 * cabinet is built.
 *
 * So the choices come from `decision`, and the parts are the same cost lines
 * Economics totals, read as a specification instead of a sum. There is
 * deliberately no parts table: a sensor you are going to buy is already a
 * priced line with a vendor and a quotation attached, and writing it a second
 * time is the one thing this application exists to avoid.
 */
export function EconomicsBasis({
  code,
  scopeId,
  scopeTitle,
  whole,
  economicsHref,
  here,
  newHref,
  editHref,
  decisions,
  editing,
  newTopic,
  lines,
  origins,
  reference,
  pathOf,
}: {
  code: string
  scopeId: string
  scopeTitle: string
  /** Back to the whole project, when standing on a part. */
  whole: string | null
  economicsHref: string
  here: string
  newHref: (topic: DecisionTopic | null) => string
  editHref: (decisionId: string) => string
  decisions: Decision[]
  editing: Decision | undefined
  /** Undefined: closed. Null: open with no topic. A topic: open, preselected. */
  newTopic: DecisionTopic | null | undefined
  lines: { line: Cost; path: string | null }[]
  origins: { origin: NodeOrigin; stageUnits: number | null; title?: string }[]
  reference: Reference | null
  pathOf: (nodeId: string) => string
}) {
  const formOpen = editing !== undefined || newTopic !== undefined

  // Grouped in the declared order, so the page reads the same way every time.
  const byTopic = new Map<DecisionTopic, Decision[]>()
  for (const d of decisions) byTopic.set(d.topic, [...(byTopic.get(d.topic) ?? []), d])
  const byKind = new Map<CostKind, Cost[]>()
  for (const v of lines) byKind.set(v.line.kind, [...(byKind.get(v.line.kind) ?? []), v.line])
  const pathOfLine = new Map(lines.map((v) => [v.line.id, v.path]))

  const withoutRejected = decisions.filter(
    (d) => d.alternatives === null || d.alternatives.trim() === '',
  ).length

  return (
    <>
      <div className="lbl text-muted">
        {whole && (
          <>
            <Link href={whole} className="text-ink hover:text-green">
              Whole project
            </Link>
            <span className="mx-2 text-line-strong">&rsaquo;</span>
          </>
        )}
        {code} · what it rests on
      </div>
      <h1 className="mt-2 text-[34px] font-semibold leading-[1.08] tracking-[-0.03em] text-balance text-green">
        Basis
      </h1>
      <p className="prose-measure grp-gap text-green-soft">
        What {scopeTitle} rests on: the choices that were made, what was turned down instead,
        and what it is going to be built out of. The totals live on{' '}
        <Link href={economicsHref} className="text-green underline-offset-[3px] hover:underline">
          Economics
        </Link>
        .
      </p>

      <div className="grp-gap flex flex-wrap items-center gap-4">
        {!formOpen && (
          <Link href={newHref(null)} className="btn btn-ghost">
            Record a decision
          </Link>
        )}
        <Link href={economicsHref} className="act">
          Economics
        </Link>
      </div>

      {formOpen && (
        <div className="grp-gap">
          <DecisionForm
            decision={editing}
            nodeId={scopeId}
            redirectTo={here}
            cancelHref={here}
            defaultTopic={newTopic ?? undefined}
          />
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Where it came from                                               */}
      {/* ---------------------------------------------------------------- */}
      {origins.length > 0 && (
        <>
          <h2 className="sec-gap text-[17px] font-semibold tracking-[-0.025em]">
            Where it came from
          </h2>
          <div className="grp-gap flex flex-col gap-6">
            {origins.map((o) => (
              <Origin
                key={o.origin.node_id}
                origin={o.origin}
                reference={reference}
                stageUnits={o.stageUnits}
                title={o.title}
              />
            ))}
          </div>
        </>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Decided                                                          */}
      {/* ---------------------------------------------------------------- */}
      <h2 className="sec-gap text-[17px] font-semibold tracking-[-0.025em]">Decided</h2>
      {decisions.length === 0 ? (
        <p className="grp-gap max-w-[64ch] text-[12px] leading-[1.5] text-muted">
          Nothing decided here yet. The hardware, the software, the network segment, the
          supplier: each of those is a choice somebody will ask about later, and this is the
          cheapest place to answer them in advance.
        </p>
      ) : (
        <>
          {withoutRejected > 0 && (
            <p className="grp-gap max-w-[64ch] text-[12px] leading-[1.5] text-rust">
              {withoutRejected} {withoutRejected === 1 ? 'decision carries' : 'decisions carry'}{' '}
              nothing turned down. A decision without the rejected option is a note: it is the
              half you are missing when someone asks why.
            </p>
          )}
          {DECISION_TOPICS.filter((t) => byTopic.has(t)).map((topic) => (
            <div key={topic} className="grp-gap">
              <div className="flex flex-wrap items-baseline gap-3">
                <h3 className="text-[15px] font-semibold">{DECISION_TOPIC_LABEL[topic]}</h3>
                <span className="text-[12px] text-muted">
                  {topic === 'other'
                    ? 'captured in a hurry. Open one to give it a heading.'
                    : DECISION_TOPIC_HINT[topic]}
                </span>
              </div>
              <div className="panel panel-list mt-2 max-w-[1120px]">
                {(byTopic.get(topic) ?? []).map((d) => (
                  <div key={d.id} className="flex items-start gap-3">
                    <span className="mono w-[1.1em] shrink-0 text-center text-muted">?</span>
                    <div className="min-w-0 flex-1">
                      <div className="leading-[1.5]">{d.decision}</div>
                      <div
                        className={`mt-[5px] text-[12px] leading-[1.45] ${
                          d.rationale ? 'text-muted' : 'text-rust'
                        }`}
                      >
                        {d.rationale ?? 'No rationale written down'}
                        {d.node_id !== scopeId && (
                          <span className="text-muted"> · {pathOf(d.node_id)}</span>
                        )}
                      </div>
                      {/*
                        The rejected option is kept apart from the reasoning. It is
                        the half that survives: the reasoning is often guessable,
                        what you turned down never is.
                      */}
                      <div
                        className={`mt-[5px] text-[12px] leading-[1.45] ${
                          d.alternatives ? 'text-muted' : 'text-rust'
                        }`}
                      >
                        <span className="micro mr-2">Turned down</span>
                        {d.alternatives ?? 'Nothing recorded as turned down'}
                      </div>
                    </div>
                    <span className="mono shrink-0 pt-0.5 text-[9.5px] uppercase tracking-[0.1em] text-muted">
                      {formatDate(d.decided_on)}
                    </span>
                    <Link href={editHref(d.id)} className="act shrink-0">
                      Edit
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </>
      )}

      {/*
        The topics with nothing under them, offered rather than listed as a
        failure. An empty heading is a question worth being asked once.
      */}
      {decisions.length > 0 && DECISION_TOPICS.some((t) => t !== 'other' && !byTopic.has(t)) && (
        <p className="grp-gap flex max-w-[64ch] flex-wrap items-baseline gap-x-4 gap-y-1 text-[12px] leading-[1.5] text-muted">
          <span>Not decided here:</span>
          {DECISION_TOPICS.filter((t) => t !== 'other' && !byTopic.has(t)).map((t) => (
            <Link key={t} href={newHref(t)} className="act">
              {DECISION_TOPIC_LABEL[t]}
            </Link>
          ))}
        </p>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* What it consists of                                              */}
      {/* ---------------------------------------------------------------- */}
      <h2 className="sec-gap text-[17px] font-semibold tracking-[-0.025em]">
        What it consists of
      </h2>
      <p className="grp-gap max-w-[64ch] text-[12px] leading-[1.5] text-muted">
        The same lines as Economics, read as a specification instead of a total.
      </p>
      {lines.length === 0 ? (
        <p className="grp-gap max-w-[64ch] text-[12px] leading-[1.5] text-muted">
          No parts yet. A part is a{' '}
          <Link href={economicsHref} className="text-green underline-offset-[3px] hover:underline">
            cost line
          </Link>
          , so writing one here and a price there would be writing it twice. Free software
          counts too, at nothing: it is still part of what this is built from.
        </p>
      ) : (
        COST_KINDS.filter((k) => byKind.has(k)).map((kind) => {
          const group = byKind.get(kind) ?? []
          const total = group.reduce((sum, l) => sum + lineEur(l), 0)
          return (
            <div key={kind} className="grp-gap">
              <div className="flex flex-wrap items-baseline gap-3">
                <h3 className="text-[15px] font-semibold">{COST_KIND_LABEL[kind]}</h3>
                <span className="text-[12px] text-muted">{COST_KIND_HINT[kind]}</span>
                <span className="mono ml-auto text-[13px]">
                  {formatMoney(Math.round(total), 'EUR')}
                </span>
              </div>
              <div className="panel mt-2 max-w-[1120px]">
                <table className="tbl">
                  <tbody>
                    {group.map((l) => (
                      <tr key={l.id}>
                        <td className="grow">
                          {l.description}
                          <div className="mt-[5px] flex flex-wrap gap-x-3 text-[12px] leading-[1.45] text-muted">
                            {pathOfLine.get(l.id) && <span>{pathOfLine.get(l.id)}</span>}
                            {l.vendor && <span>{l.vendor}</span>}
                            {l.reference && <span className="mono">{l.reference}</span>}
                            <span>{COST_STATE_LABEL[l.state]}</span>
                            {l.document_id === null && l.state !== 'estimate' && (
                              <span className="text-rust">no paper</span>
                            )}
                          </div>
                        </td>
                        <td className="mono text-right text-muted">
                          {Number(l.quantity) !== 1 &&
                            `${Number(l.quantity)} x ${formatMoney(Number(l.amount), '').trim()}`}
                        </td>
                        <td className="mono text-right">
                          {formatMoney(lineAmount(l), l.currency)}
                          {l.recurrence !== 'once' && (
                            <span className="ml-1 text-[11px] text-muted">
                              {l.recurrence === 'monthly'
                                ? 'a month'
                                : l.recurrence === 'quarterly'
                                  ? 'a quarter'
                                  : 'a year'}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })
      )}
    </>
  )
}
