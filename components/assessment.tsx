import Link from 'next/link'
import { assessSpark } from '@/lib/spark-actions'
import { Hint } from '@/components/ui'
import { impactOf, type Reference, type Saving } from '@/lib/cogs'
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
  if (spark.saving_kind === null || spark.saving_value === null) return null
  const value = Number(spark.saving_value)

  switch (spark.saving_kind) {
    case 'hours':
      return { kind: 'hours', hoursPerYear: value }
    case 'annual':
      return { kind: 'annual', dkkPerYear: value }
    case 'per_unit':
      // Without the stage volume this cannot become kroner at all, and that is
      // reported as unknown rather than guessed at.
      return stageUnits === null
        ? null
        : { kind: 'perUnit', dkkPerUnit: value, stageUnits }
  }
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
  stages: { stage: string; units: number }[]
  editing: boolean
  editHref: string
  cancelHref: string
  redirectTo: string
}) {
  const stageUnits =
    spark.saving_stage === null
      ? null
      : (stages.find((s) => s.stage === spark.saving_stage)?.units ?? null)

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
      <div className="mt-2 grid grid-cols-4 gap-x-5 gap-y-3">
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

        <label className="col-span-2 block">
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
      <div className="mt-2 grid grid-cols-4 gap-x-5">
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
