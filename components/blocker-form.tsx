import Link from 'next/link'
import { today } from '@/lib/date'
import {
  createBlocker,
  deleteBlocker,
  reopenBlocker,
  resolveBlocker,
  updateBlocker,
} from '@/lib/blocker-actions'
import { WAITING_ON_TYPE_LABEL, type Blocker, type WaitingOnType } from '@/lib/types'
import { createClient } from '@/lib/supabase/server'
import { readRecipients } from '@/lib/recipient-data'

function Field({
  label,
  children,
  span = 1,
}: {
  label: string
  children: React.ReactNode
  span?: number
}) {
  return (
    <label className="block" style={{ gridColumn: `span ${span}` }}>
      <span className="lbl text-muted">{label}</span>
      {children}
    </label>
  )
}

/**
 * Create and edit. `days_blocked` does not appear: it is a view, and a
 * waiting time you can type yourself is not a measurement.
 */
export async function BlockerForm({
  blocker,
  nodeId,
  redirectTo,
  cancelHref,
}: {
  blocker?: Blocker
  nodeId?: string
  redirectTo: string
  cancelHref: string
}) {
  const editing = blocker !== undefined
  const formId = `blocker-form-${blocker?.id ?? 'new'}`
  const listId = `${formId}-recipients`

  // Whoever has been written after an @ before. Offered rather than enforced:
  // a new recipient is still just a name you type.
  const supabase = await createClient()
  const recipients = await readRecipients(supabase)

  return (
    <div className="border-y border-rule-strong bg-sheet px-6 py-5">
      <div className="lbl mb-4 text-muted">
        {editing ? 'Edit blocker' : 'New blocker'}
      </div>

      <form
        id={formId}
        action={editing ? updateBlocker : createBlocker}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-4"
      >
        {editing ? (
          <input type="hidden" name="id" value={blocker.id} />
        ) : (
          <input type="hidden" name="node_id" value={nodeId ?? ''} />
        )}
        <input type="hidden" name="redirectTo" value={redirectTo} />

        <Field label="What is blocking" span={4}>
          <input
            name="title"
            required
            autoFocus
            defaultValue={blocker?.title ?? ''}
            className="field text-base"
          />
        </Field>

        <Field label="Waiting on">
          <input
            name="waiting_on"
            required
            list={listId}
            defaultValue={blocker?.waiting_on ?? ''}
            placeholder="IT, Vendor, Management..."
            className="field"
          />
          <datalist id={listId}>
            {recipients.map((r) => (
              <option key={r.name} value={r.name}>
                {r.medianDays === null
                  ? `${r.totalDays} days waited, none closed yet`
                  : `${r.totalDays} days waited, usually answers in ${r.medianDays}`}
              </option>
            ))}
          </datalist>
        </Field>

        <Field label="Type">
          <select
            name="waiting_on_type"
            defaultValue={blocker?.waiting_on_type ?? 'other'}
            className="field"
          >
            {(Object.keys(WAITING_ON_TYPE_LABEL) as WaitingOnType[]).map((t) => (
              <option key={t} value={t}>
                {WAITING_ON_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Opened">
          <input
            type="date"
            name="opened_at"
            required={editing}
            defaultValue={blocker?.opened_at ?? today()}
            className="field"
          />
        </Field>

        <Field label="Expected reply">
          <input
            type="date"
            name="expected_by"
            defaultValue={blocker?.expected_by ?? ''}
            className="field"
          />
        </Field>

        {editing && (
          <>
            <Field label="Closed">
              <input
                type="date"
                name="resolved_at"
                defaultValue={blocker.resolved_at ?? ''}
                className="field"
              />
            </Field>
            <Field label="How it was resolved" span={3}>
              <input
                name="resolution"
                defaultValue={blocker.resolution ?? ''}
                className="field"
              />
            </Field>
          </>
        )}
      </form>

      <div className="mt-6 flex items-center gap-3">
        <button type="submit" form={formId} className="btn">
          {editing ? 'Save' : 'Open blocker'}
        </button>
        <Link href={cancelHref} className="btn btn-ghost">
          Cancel
        </Link>
        {editing && (
          <form action={deleteBlocker} className="ml-auto">
            <input type="hidden" name="id" value={blocker.id} />
            <input type="hidden" name="redirectTo" value={redirectTo} />
            <button type="submit" className="btn btn-danger">
              Delete
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

/** The most frequent action: stop the clock, and write what resolved it. */
export function ResolveBlockerForm({
  blocker,
  redirectTo,
  cancelHref,
}: {
  blocker: Blocker
  redirectTo: string
  cancelHref: string
}) {
  return (
    <div className="border-y border-rule-strong bg-sheet px-6 py-5">
      <div className="lbl mb-1 text-muted">Close blocker</div>
      <div className="mb-4 text-[13px]">{blocker.title}</div>

      <form action={resolveBlocker} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-4">
        <input type="hidden" name="id" value={blocker.id} />
        <input type="hidden" name="redirectTo" value={redirectTo} />

        <label className="col-span-1 sm:col-span-2 lg:col-span-3 block">
          <span className="lbl text-muted">How it was resolved</span>
          <input
            name="resolution"
            autoFocus
            placeholder="Access created in change window week 37"
            className="field"
          />
        </label>

        <label className="block">
          <span className="lbl text-muted">Closed</span>
          <input type="date" name="resolved_at" defaultValue={today()} className="field" />
        </label>

        <div className="col-span-1 sm:col-span-2 lg:col-span-4 mt-2 flex items-center gap-3">
          <button type="submit" className="btn">
            Close
          </button>
          <Link href={cancelHref} className="btn btn-ghost">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}

export function ReopenBlockerButton({
  id,
  redirectTo,
}: {
  id: string
  redirectTo: string
}) {
  return (
    <form action={reopenBlocker}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="redirectTo" value={redirectTo} />
      <button type="submit" className="lbl-tight text-muted hover:text-oxblood">
        Reopen
      </button>
    </form>
  )
}
