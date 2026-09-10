import { impactOf, savingFrom, type Reference } from '@/lib/cogs'
import { priorityScore, quadrant } from '@/lib/priority'
import { formatDateLong } from '@/components/ui'
import type { NodeOrigin } from '@/lib/types'

/**
 * What this was, before it was work.
 *
 * The sentence somebody first said, and the figure it was approved on. Six
 * months in this is the only thing that answers «what did we say this would
 * save», and until now it lived on a private spark where nobody but its author
 * could read it.
 *
 * The words are stored. The money is not: the kroner a year, the euro per unit
 * and the share of the target are worked out here from the same three columns
 * the spark carried, so the promise can be re-read against the yardstick as it
 * stands rather than as a number frozen in a sentence.
 *
 * WHICH YEAR IT WAS WEIGHED IN IS SHOWN when it is not the current one. A
 * saving is a share of a target, and the target moves: FY26 sold 23% fewer
 * units than FY25. The same kroner is a different promise in each, and a page
 * that quietly recomputed an old claim in this year's money would be inventing
 * a number nobody made.
 */
export function Origin({
  origin,
  reference,
  stageUnits,
  title,
}: {
  origin: NodeOrigin
  reference: Reference | null
  /** What the named stage ran, where the saving was per unit. */
  stageUnits: number | null
  /** Whose origin this is, shown when it is not the project itself. */
  title?: string
}) {
  const saving = savingFrom(origin.saving_kind, origin.saving_value, stageUnits)
  const impact = saving && reference ? impactOf(saving, reference) : null

  const judgement = {
    cost: origin.cost_score,
    benefit: origin.benefit_score,
    complexity: origin.complexity_score,
  }
  const score = priorityScore(judgement)
  const where = quadrant(judgement)

  const otherYear =
    origin.fiscal_year !== null &&
    reference !== null &&
    origin.fiscal_year !== reference.fiscalYear

  const kr = (n: number) =>
    new Intl.NumberFormat('da-DK', { maximumFractionDigits: 0 }).format(n)

  return (
    <div className="border-l-2 border-rule-strong pl-4">
      {title && <div className="lbl-tight text-muted">{title}</div>}

      <p className="max-w-prose text-[14px] leading-relaxed">{origin.body}</p>
      {origin.note && (
        <p className="mt-2 max-w-prose text-[12.5px] leading-relaxed text-muted">
          {origin.note}
        </p>
      )}

      {impact === null && score === null ? (
        <p className="mt-3 text-[11px] leading-relaxed text-rule-strong">
          It carried no figure. Nothing was promised for it in money, which is
          worth knowing rather than worth hiding.
        </p>
      ) : (
        <div className="lbl-tight mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          {impact !== null && (
            <>
              <span className="num text-ink">{kr(impact.annualDkk)} kr a year</span>
              <span className="num text-muted">
                {impact.eurPerUnit.toFixed(3)} &euro;/unit
              </span>
              <span
                className={`num ${
                  impact.shareOfTarget >= 0.1 ? 'text-green' : 'text-rule-strong'
                }`}
              >
                {(impact.shareOfTarget * 100).toFixed(1)}% of the year
              </span>
            </>
          )}
          {where !== null && <span className="text-muted">{where}</span>}
          {score !== null && (
            <span className="num text-rule-strong">priority {score}</span>
          )}
        </div>
      )}

      <p className="mt-2.5 text-[10.5px] leading-relaxed text-rule-strong">
        Promised {formatDateLong(origin.promised_at.slice(0, 10))}
        {origin.fiscal_year && <> · weighed against {origin.fiscal_year}</>}.
        {otherYear && (
          <span className="text-oxblood">
            {' '}
            The figure above is recomputed against {reference?.fiscalYear}, which
            is not the year the claim was made in.
          </span>
        )}{' '}
        The words are kept as they were said; the money is worked out, so it can
        be read in today&rsquo;s terms rather than yesterday&rsquo;s.
      </p>
    </div>
  )
}
