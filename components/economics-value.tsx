import Link from 'next/link'
import { formatDate } from '@/components/ui'
import { formatMoney } from '@/lib/cost'
import { formatYears } from '@/lib/identity'
import type { Reference } from '@/lib/cogs'
import type { NodeOrigin } from '@/lib/types'

/**
 * The value column: what it is worth, whether it pays back, and what is
 * missing before either can be said.
 *
 * Every dash here is deliberate. A share nobody can divide is not a nought,
 * and a payback with one half missing is not «never»; the page says which
 * half is missing rather than showing a number that reads like an answer.
 */

export type SavingSource = 'marking' | 'read' | 'claim' | 'none'

export type Missing = {
  line: string
  note: string
  action: { label: string; href: string }
}

const eur = (n: number) => formatMoney(Math.round(n), 'EUR')
const count = (n: number) => new Intl.NumberFormat('en-GB').format(Math.round(n))

const SOURCE: Record<SavingSource, string> = {
  marking: 'the figure on the marking against the strategy',
  read: 'what Read says it will deliver',
  claim: 'what was claimed when it became work',
  none: '',
}

function Dash() {
  return <span className="mono text-muted">–</span>
}

function Row({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
  return (
    <tr>
      <td className="grow">
        {label}
        {note && <div className="mt-[5px] text-[12px] leading-[1.45] text-muted">{note}</div>}
      </td>
      <td className="text-right">{children}</td>
    </tr>
  )
}

export function EconomicsValue({
  scopeTitle,
  claimEur,
  origin,
  reference,
  target,
  perUnit,
  share,
  delivered,
  doneOn,
  serves,
  euroStrategy,
  investment,
  running,
  saving,
  years,
  limit,
  missing,
}: {
  scopeTitle: string
  claimEur: number | null
  origin: NodeOrigin | null
  reference: Reference | null
  /** What the whole strategy asks for in a year, in euro. */
  target: number | null
  perUnit: number | null
  share: number | null
  delivered: number | null
  doneOn: string | null
  serves: { id: string; name: string }[]
  /** The strategy whose target is the yardstick's, when this serves it. */
  euroStrategy: string | null
  investment: number | null
  running: number
  saving: { eur: number | null; source: SavingSource }
  years: number | null
  limit: { name: string; years: number | null } | null
  missing: Missing[]
}) {
  const over = years !== null && limit?.years != null && years > limit.years

  return (
    <>
      <h2 className="text-[17px] font-semibold tracking-[-0.025em]">What it is worth</h2>
      <div className="panel grp-gap">
        <table className="tbl">
          <tbody>
            <Row label="Claimed a year" note="what was promised when it became work">
              {claimEur !== null ? (
                <span className="mono">{eur(claimEur)}</span>
              ) : (
                <span className="mono text-rust">
                  {origin !== null && reference === null ? 'No yardstick' : 'Nothing claimed'}
                </span>
              )}
            </Row>
            <Row
              label="Per unit"
              note={
                reference === null
                  ? 'no reference volume to divide by'
                  : `against ${count(reference.costBasisUnits)} units`
              }
            >
              {perUnit !== null ? (
                <span className="mono">{perUnit.toFixed(3)} EUR</span>
              ) : (
                <Dash />
              )}
            </Row>
            <Row
              label="Share of the euro"
              note={target === null ? 'no target to divide by' : `the target is ${eur(target)} a year`}
            >
              {share !== null ? (
                <span className="mono">{(share * 100).toFixed(1)} %</span>
              ) : (
                <Dash />
              )}
            </Row>
            <Row
              label="Delivered so far"
              note={
                doneOn
                  ? `counted from ${formatDate(doneOn.slice(0, 10))}, the day it finished`
                  : 'counted from the day a part finished'
              }
            >
              {delivered !== null ? <span className="mono">{eur(delivered)} a year</span> : <Dash />}
            </Row>
          </tbody>
        </table>
      </div>
      <p className="prose-measure grp-gap text-green-soft">
        {origin !== null ? (
          <>
            Read against {origin.fiscal_year ?? reference?.fiscalYear ?? 'no year'}, the year it
            was promised in.
            {reference !== null && !reference.confirmed && (
              <span className="text-rust"> The yardstick it divides by is unconfirmed.</span>
            )}
          </>
        ) : (
          <>
            {scopeTitle} was not promoted from a spark, so there is no frozen claim to read
            back.
          </>
        )}{' '}
        {serves.length === 0 ? (
          <>
            It is also not marked against a strategy, which is why the share is a dash rather
            than a nought: nobody has said what it is for, so nothing can be divided by the
            target.
          </>
        ) : euroStrategy === null ? (
          <>
            It serves {serves.map((s) => s.name).join(' and ')}, which is not measured in euro
            a unit, so there is no share of the euro to show.
          </>
        ) : (
          <>It serves {euroStrategy}, so the share above is read against that target.</>
        )}
      </p>

      {/* ---------------------------------------------------------------- */}
      {/* Payback                                                          */}
      {/* ---------------------------------------------------------------- */}
      <h2 className="sec-gap text-[15px] font-semibold tracking-[-0.02em]">Payback</h2>
      <div className="panel grp-gap">
        <table className="tbl">
          <tbody>
            <Row label="Cost, once">
              {investment !== null ? (
                <span className="mono">{eur(investment)}</span>
              ) : (
                <span className="mono text-rust">Nothing recorded</span>
              )}
            </Row>
            <Row label="Saving a year" note={saving.source === 'none' ? undefined : SOURCE[saving.source]}>
              {saving.eur !== null ? (
                <span className="mono">{eur(saving.eur)}</span>
              ) : (
                <span className="mono text-rust">Nothing claimed</span>
              )}
            </Row>
            <Row
              label="Paid back after"
              note={running > 0 ? `${eur(running)} a year of running cost comes off first` : undefined}
            >
              {years !== null ? (
                <span className={`mono ${over ? 'text-rust' : ''}`}>{formatYears(years)}</span>
              ) : (
                <Dash />
              )}
            </Row>
          </tbody>
        </table>
      </div>
      <p className="grp-gap max-w-[64ch] text-[12px] leading-[1.5] text-muted">
        {limit === null
          ? 'No strategy sets a limit here, because nothing this serves carries one.'
          : limit.years === null
            ? `The ${limit.name} strategy sets no limit.`
            : `The ${limit.name} strategy sets a limit of ${formatYears(limit.years)}.`}{' '}
        {years !== null
          ? over
            ? 'This is past it, and stays on the page as it stands: a payback is an outcome, not a claim.'
            : 'Within it, as the figures stand today.'
          : investment === null && saving.eur === null
            ? 'Neither half of the division exists yet, so the page says so rather than showing a nought that reads like an answer.'
            : investment === null
              ? 'The saving is claimed and nothing is priced yet, so there is nothing to pay back.'
              : saving.eur === null
                ? 'The cost is recorded and no saving is claimed, so there is nothing to pay it back with.'
                : 'The running cost eats the saving, so it never pays back.'}
      </p>

      {/* ---------------------------------------------------------------- */}
      {/* What is missing                                                  */}
      {/* ---------------------------------------------------------------- */}
      <h2 className="sec-gap text-[15px] font-semibold tracking-[-0.02em]">What is missing</h2>
      {missing.length === 0 ? (
        <p className="grp-gap max-w-[64ch] text-[12px] leading-[1.5] text-muted">
          Nothing. Every figure here has a line, a claim or a marking behind it.
        </p>
      ) : (
        <div className="panel panel-list grp-gap">
          {missing.map((m) => (
            <div key={m.line} className="flex items-start gap-3">
              <span className="mono w-[1.1em] shrink-0 text-center text-rust">!</span>
              <div className="min-w-0 flex-1">
                <div className="leading-[1.5]">{m.line}</div>
                <div className="mt-[5px] text-[12px] leading-[1.45] text-muted">{m.note}</div>
              </div>
              <Link href={m.action.href} className="act shrink-0">
                {m.action.label}
              </Link>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
