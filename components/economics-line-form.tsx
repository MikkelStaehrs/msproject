import Link from 'next/link'
import { Hint } from '@/components/ui'
import { createCost, updateCost } from '@/lib/cost-actions'
import { today } from '@/lib/date'
import {
  COST_BUDGETS,
  COST_BUDGET_HINT,
  COST_BUDGET_LABEL,
  COST_CURRENCIES,
  COST_KINDS,
  COST_KIND_LABEL,
  COST_RECURRENCES,
  COST_RECURRENCE_HINT,
  COST_RECURRENCE_LABEL,
  COST_STATES,
  COST_STATE_HINT,
  COST_STATE_LABEL,
  type Cost,
} from '@/lib/types'

/**
 * A cost line, typed. The one form on Economics.
 *
 * Nothing on it is derived. The amount and the state are the two facts only
 * you can know, and everything the page says about money is rolled up from
 * them. Opened in place by «New line» or by «Price it» on a document, and the
 * document is then already picked: a quote that has to be found a second time
 * is a quote that does not get attached.
 */
export function EconomicsLineForm({
  editing,
  targets,
  defaultTarget,
  defaultRate,
  documents,
  defaultDocument,
  redirectTo,
  cancelHref,
  filesHref,
}: {
  editing: Cost | undefined
  /** The nodes in scope a new line may land on, with their path as the label. */
  targets: { id: string; label: string }[]
  defaultTarget: string
  /** From the yardstick. Kept on the line once written; changing it later moves nothing. */
  defaultRate: number
  documents: { id: string; name: string }[]
  defaultDocument: string | null
  redirectTo: string
  cancelHref: string
  filesHref: string
}) {
  return (
    <div className="panel max-w-[1120px]">
      <div className="panel-h">
        <span className="lbl text-muted">{editing ? 'Edit line' : 'New line'}</span>
        <Link href={cancelHref} className="act">
          Cancel
        </Link>
      </div>
      <form
        action={editing ? updateCost : createCost}
        encType="multipart/form-data"
        className="panel-b grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2 lg:grid-cols-6"
      >
        {editing && <input type="hidden" name="id" value={editing.id} />}
        <input type="hidden" name="redirectTo" value={redirectTo} />

        <label className="col-span-1 block sm:col-span-2 lg:col-span-3">
          <span className="lbl text-muted">What</span>
          <input
            name="description"
            required
            autoFocus
            defaultValue={editing?.description ?? ''}
            placeholder="DIM cabinet, Rittal"
            className="field"
          />
        </label>

        <label className="block">
          <span className="lbl text-muted">
            <Hint text="What sort of thing this is. It is what lets the line stand as a part on Basis as well as a price here, so neither has to be typed twice.">
              Kind
            </Hint>
          </span>
          <select name="kind" defaultValue={editing?.kind ?? 'other'} className="field">
            {COST_KINDS.map((k) => (
              <option key={k} value={k}>
                {COST_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="lbl text-muted">Quantity</span>
          <input
            name="quantity"
            inputMode="decimal"
            defaultValue={editing?.quantity ?? 1}
            placeholder="1"
            className="field tabular-nums"
          />
        </label>

        <label className="block">
          <span className="lbl text-muted">
            <Hint text="The price of ONE. Two masters at 180 are entered as quantity 2 and 180, not as a single 360 nobody can check.">
              Unit price
            </Hint>
          </span>
          <input
            name="amount"
            required
            inputMode="decimal"
            defaultValue={editing?.amount ?? ''}
            placeholder="38000"
            className="field tabular-nums"
          />
        </label>

        <label className="block">
          <span className="lbl text-muted">Currency</span>
          <select name="currency" defaultValue={editing?.currency ?? 'DKK'} className="field">
            {COST_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="lbl text-muted">
            <Hint text="Kept on the line. Changing it later never rewrites a total already reported. Ignored for a euro line.">
              Rate per euro
            </Hint>
          </span>
          <input
            name="eur_rate"
            inputMode="decimal"
            defaultValue={editing?.eur_rate ?? defaultRate}
            placeholder="7.46"
            className="field tabular-nums"
          />
        </label>

        <label className="block">
          <span className="lbl text-muted">How often</span>
          <select name="recurrence" defaultValue={editing?.recurrence ?? 'once'} className="field">
            {COST_RECURRENCES.map((r) => (
              <option key={r} value={r}>
                {COST_RECURRENCE_LABEL[r]} &middot; {COST_RECURRENCE_HINT[r]}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="lbl text-muted">Budget</span>
          <select name="budget" defaultValue={editing?.budget ?? 'capex'} className="field">
            {COST_BUDGETS.map((b) => (
              <option key={b} value={b}>
                {COST_BUDGET_LABEL[b]} &middot; {COST_BUDGET_HINT[b]}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="lbl text-muted">Certainty</span>
          <select name="state" defaultValue={editing?.state ?? 'estimate'} className="field">
            {COST_STATES.map((s) => (
              <option key={s} value={s}>
                {COST_STATE_LABEL[s]} &middot; {COST_STATE_HINT[s]}
              </option>
            ))}
          </select>
        </label>

        {/* A line belongs to the part it is for. Moving one is editing it there, not here. */}
        {!editing && (
          <label className="col-span-1 block sm:col-span-2">
            <span className="lbl text-muted">On</span>
            <select name="node_id" defaultValue={defaultTarget} className="field" required>
              {targets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="block">
          <span className="lbl text-muted">Vendor</span>
          <input
            name="vendor"
            defaultValue={editing?.vendor ?? ''}
            placeholder="Rittal DK"
            className="field"
          />
        </label>

        <label className="block">
          <span className="lbl text-muted">Reference</span>
          <input
            name="reference"
            defaultValue={editing?.reference ?? ''}
            placeholder="Quote, PO or invoice no."
            className="field"
          />
        </label>

        <label className="block">
          <span className="lbl text-muted">Dated</span>
          <input
            type="date"
            name="dated"
            defaultValue={editing?.dated ?? today()}
            className="field"
          />
        </label>

        <label className="col-span-1 block sm:col-span-2">
          <span className="lbl text-muted">
            <Hint text="Up to 4.5 MB here, which is the most a server action can receive. Anything larger goes on Files, then pick it beside this.">
              Paper
            </Hint>
          </span>
          <input
            type="file"
            name="file"
            className="field text-[11px] file:mr-3 file:border-0 file:bg-transparent file:p-0 file:text-[10px] file:uppercase file:tracking-[0.16em] file:text-green"
          />
        </label>

        <label className="col-span-1 block sm:col-span-2">
          <span className="lbl text-muted">Or one already here</span>
          <select name="document_id" defaultValue={defaultDocument ?? ''} className="field">
            <option value="">None</option>
            {documents.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          {documents.length === 0 && (
            <span className="mt-1 block text-[11px] leading-snug text-muted">
              Nothing uploaded yet. Larger files go on{' '}
              <Link href={filesHref} className="text-green underline-offset-[3px] hover:underline">
                Files
              </Link>
              .
            </span>
          )}
        </label>

        <label className="col-span-1 block sm:col-span-2 lg:col-span-4">
          <span className="lbl text-muted">Note</span>
          <input
            name="note"
            defaultValue={editing?.note ?? ''}
            placeholder="What it covers, or what is still open"
            className="field"
          />
        </label>

        <div className="col-span-1 mt-1 flex items-center gap-3 sm:col-span-2 lg:col-span-6">
          <button className="btn">{editing ? 'Save' : 'Add'}</button>
          <Link href={cancelHref} className="btn btn-ghost">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
