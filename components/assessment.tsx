import Link from 'next/link'
import { assessSpark } from '@/lib/spark-actions'
import { Hint } from '@/components/ui'
import {
  basisCoversTarget,
  impactOf,
  savingFrom,
  scopesAgree,
  type Reference,
  type Saving,
} from '@/lib/cogs'
import { priorityScore, quadrant } from '@/lib/priority'
import { SAVING_KINDS, SAVING_KIND_HINT, SAVING_KIND_LABEL, type Spark } from '@/lib/types'

/**
 * What an idea is worth, said in the one currency the strategy is written in.
 *
 * Two numbers go in. Everything shown is computed from them, which is the whole
 * point: in a spreadsheet the share of the target is a column, and a column
 * keeps whatever it said after somebody changes the figure beside it.
 */

/** The saving as `lib/cogs` wants it, or null where it is not yet described. */
export function savingOf(spark: Spark, stageUnits: number | null): Saving | null {
  return savingFrom(spark.saving_kind, spark.saving_value, stageUnits)
}

const kr = (n: number) =>
  `${new Intl.NumberFormat('da-DK', { maximumFractionDigits: 0 }).format(n)} kr`

export function Assessment({
  spark,
  reference,
  stages,
  editing,
  editHref,
  cancelHref,
  redirectTo,
}: {
  spark: Spark
  reference: Reference | null
  /** The stages that ran in the reference year, with their volumes. */
  stages: { stage: string; units: number; scope: string | null }[]
  editing: boolean
  editHref: string
  cancelHref: string
  redirectTo: string
}) {
  const stage =
    spark.saving_stage === null
      ? undefined
      : stages.find((s) => s.stage === spark.saving_stage)
  const stageUnits = stage?.units ?? null

  /*
   * The stage volumes are unfiltered; the cost basis is one slice of them. A
   * saving spread across every type, divided by a target set for a slice, comes
   * out too large. Said rather than silently corrected: correcting it needs a
   * filtered stage volume nobody has.
   */
  const mixedPopulations =
    reference !== null &&
    stage !== undefined &&
    !scopesAgree(reference, stage.scope)

  /*
   * The denominator counts less than the strategy covers, so the target is too
   * small and every share of it too large. Shown on the figure itself rather
   * than in a footnote: a percentage nobody has been warned about is a
   * percentage somebody will quote.
   */
  const flattered = reference !== null && !basisCoversTarget(reference)

  const saving = savingOf(spark, stageUnits)
  const impact = saving && reference ? impactOf(saving, reference) : null

  const judgement = {
    cost: spark.cost_score,
    benefit: spark.benefit_score,
    complexity: spark.complexity_score,
  }
  const score = priorityScore(judgement)
  const where = quadrant(judgement)

  if (!editing) {
    const nothing = impact === null && score === null

    return (
      <div className="lbl-tight mt-1.5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        {impact !== null && (
          <>
            <span className="num text-ink">{kr(impact.annualDkk)} a year</span>
            <span className="num text-muted">
              {impact.eurPerUnit.toFixed(3)} &euro;/unit
            </span>
            {/*
              The number that decides anything. A saving means nothing on its
              own; against the year's target it is either worth a quarter or it
              is not.
            */}
            <span
              className={`num ${
                impact.shareOfTarget >= 0.1 ? 'text-green' : 'text-rule-strong'
              }`}
            >
              {(impact.shareOfTarget * 100).toFixed(1)}% of the year
            </span>
            {/*
              Said before the other two, because it is the broader doubt: those
              two are about which population the figure covers, and this one is
              about whether anybody has checked the figure at all. A percentage
              printed in tabular numerals with no caveat is a percentage
              somebody quotes in a meeting.
            */}
            {reference !== null && !reference.confirmed && (
              <span className="text-oxblood">
                against figures nobody has confirmed
              </span>
            )}
            {flattered && (
              <span className="text-oxblood">
                overstated: measured on {reference?.scope}, target covers{' '}
                {reference?.targetScope}
              </span>
            )}
            {mixedPopulations && (
              <span className="text-oxblood">
                and mixes {stage?.scope} with {reference?.scope}
              </span>
            )}
          </>
        )}

        {where !== null && <span className="text-muted">{where}</span>}
        {score !== null && <span className="num text-rule-strong">priority {score}</span>}

        <Link href={editHref} className="text-rule-strong hover:text-ink">
          {nothing ? 'Assess it' : 'Change'}
        </Link>
      </div>
    )
  }

  return (
    <form
      action={assessSpark}
      className="mt-3 max-w-3xl border-l-2 border-rule-strong pl-4"
    >
      <input type="hidden" name="id" value={spark.id} />
      <input type="hidden" name="redirectTo" value={redirectTo} />

      <div className="lbl text-muted">What it takes out</div>
      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-3">
        <label className="block">
          <span className="lbl text-muted">
            <Hint text="Whichever way the saving was actually described. All three end at kroner a year, so the answer is the same however it was put.">
              Described as
            </Hint>
          </span>
          <select
            name="saving_kind"
            defaultValue={spark.saving_kind ?? ''}
            className="field"
          >
            <option value="">not worked out yet</option>
            {SAVING_KINDS.map((k) => (
              <option key={k} value={k}>
                {SAVING_KIND_LABEL[k]}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-[10px] leading-snug text-rule-strong">
            {spark.saving_kind ? SAVING_KIND_HINT[spark.saving_kind] : 'leave it empty until you know'}
          </span>
        </label>

        <label className="block">
          <span className="lbl text-muted">How much</span>
          <input
            name="saving_value"
            inputMode="decimal"
            defaultValue={spark.saving_value ?? ''}
            placeholder="80"
            className="field tabular-nums"
          />
        </label>

        <label className="col-span-1 sm:col-span-2 block">
          <span className="lbl text-muted">
            <Hint text="Only for a saving per unit. The stages do not run the same quantities, so the same saving is worth 68% more on cleaning than on coating.">
              At which stage
            </Hint>
          </span>
          <select
            name="saving_stage"
            defaultValue={spark.saving_stage ?? ''}
            className="field"
          >
            <option value="">not per unit</option>
            {stages.map((s) => (
              <option key={s.stage} value={s.stage}>
                {s.stage} — {new Intl.NumberFormat('da-DK').format(s.units)} units
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="lbl mt-6 text-muted">What the project group scores</div>
      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-5">
        {(
          [
            ['cost_score', 'Cost', spark.cost_score, '1 cheap, 5 expensive'],
            ['benefit_score', 'Benefit', spark.benefit_score, '1 marginal, 5 large'],
            ['complexity_score', 'Complexity', spark.complexity_score, '1 simple, 5 hairy'],
          ] as const
        ).map(([name, label, value, hint]) => (
          <label key={name} className="block">
            <span className="lbl text-muted">
              <Hint text={`${hint}. Only a person can set this.`}>{label}</Hint>
            </span>
            <select name={name} defaultValue={value ?? ''} className="field">
              <option value="">—</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>

      <p className="mt-4 max-w-prose text-[11px] leading-relaxed text-rule-strong">
        The priority, the quadrant and the share of the year are worked out from
        these. Nothing derived is stored, so none of it can disagree with the
        numbers it came from.
      </p>

      <div className="mt-4 flex items-center gap-3">
        <button className="btn">Save</button>
        <Link href={cancelHref} className="btn btn-ghost">
          Cancel
        </Link>
      </div>
    </form>
  )
}
