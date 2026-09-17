import Link from 'next/link'
import { strategyTarget, type Reference } from '@/lib/cogs'
import { createStrategy, deleteStrategy, updateStrategy } from '@/lib/strategy-actions'
import { Hint } from '@/components/ui'
import type { Strategy } from '@/lib/types'

/**
 * Naming a strategy, or correcting one.
 *
 * The concept has no form here, because a prototype does not have to be able to
 * create anything. The function stays: four strategies exist because somebody
 * typed them, and the page that shows what the work is for has to be the page
 * that lets you say it.
 */
export function StrategyForm({
  strategy,
  reference,
}: {
  strategy?: Strategy
  reference: Reference | null
}) {
  return (
    <div className="panel max-w-3xl px-6 py-5">
      <div className="lbl mb-4 text-muted">
        {strategy ? 'Edit strategy' : 'New strategy'}
      </div>
      <form
        action={strategy ? updateStrategy : createStrategy}
        className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        {strategy && <input type="hidden" name="id" value={strategy.id} />}
        <input type="hidden" name="redirectTo" value="/strategy" />

        <label className="col-span-1 block sm:col-span-2">
          <span className="lbl text-muted">Name</span>
          <input
            name="name"
            required
            autoFocus
            defaultValue={strategy?.name ?? ''}
            placeholder="COGS saving"
            className="field text-base"
          />
        </label>

        {/*
          A strategy whose target is the yardstick's is not offered a box to
          type one into. The database refuses both at once, and a form that
          lets you type a value it will then reject is a form that teaches you
          to distrust it. Shown instead, so the figure is still visible and
          still derived.
        */}
        <label className="block">
          <span className="lbl text-muted">
            <Hint text="What the strategy is measured against, per year, in euro. Leave it empty where the strategy carries no number: an invented target is worse than none.">
              Target a year
            </Hint>
          </span>
          {strategy?.target_from_yardstick ? (
            <div className="border-b border-line py-[7px] text-[13px] tabular-nums text-muted">
              {strategyTarget(strategy, reference)?.toLocaleString('en-GB', {
                maximumFractionDigits: 0,
              }) ?? 'no yardstick'}{' '}
              <span className="lbl-tight">from the yardstick</span>
            </div>
          ) : (
            <input
              name="target_annual"
              inputMode="decimal"
              defaultValue={strategy?.target_annual ?? ''}
              placeholder="250000"
              className="field tabular-nums"
            />
          )}
        </label>

        <label className="block">
          <span className="lbl text-muted">Owner</span>
          <input name="owner" defaultValue={strategy?.owner ?? ''} className="field" />
        </label>

        <label className="block">
          <span className="lbl text-muted">Started</span>
          <input
            type="date"
            name="started_on"
            defaultValue={strategy?.started_on ?? ''}
            className="field"
          />
        </label>

        <label className="block">
          <span className="lbl text-muted">
            <Hint text="Leave empty while it runs. A finished strategy stays on the page: what it delivered is the evidence for the next one.">
              Ended
            </Hint>
          </span>
          <input
            type="date"
            name="ended_on"
            defaultValue={strategy?.ended_on ?? ''}
            className="field"
          />
        </label>

        <label className="col-span-1 block sm:col-span-2 lg:col-span-4">
          <span className="lbl text-muted">What it is</span>
          <textarea
            name="description"
            rows={2}
            defaultValue={strategy?.description ?? ''}
            className="field resize-y"
          />
        </label>

        <div className="col-span-1 mt-1 flex items-center gap-3 sm:col-span-2 lg:col-span-4">
          <button className="btn">{strategy ? 'Save' : 'Create'}</button>
          <Link href="/strategy" className="btn btn-ghost">
            Cancel
          </Link>
          {strategy && (
            <form action={deleteStrategy} className="ml-auto">
              <input type="hidden" name="id" value={strategy.id} />
              <input type="hidden" name="redirectTo" value="/strategy" />
              <button className="btn btn-danger">Delete</button>
            </form>
          )}
        </div>
      </form>
    </div>
  )
}
