import Link from 'next/link'
import { deleteEntry, updateEntry } from '@/lib/entry-actions'
import type { Entry } from '@/lib/types'

export function EntryForm({
  entry,
  redirectTo,
  cancelHref,
}: {
  entry: Entry
  redirectTo: string
  cancelHref: string
}) {
  const formId = `entry-form-${entry.id}`

  return (
    <div className="border-y border-rule-strong bg-sheet px-6 py-5">
      <div className="lbl mb-4 text-muted">Edit entry</div>

      <form id={formId} action={updateEntry} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-4">
        <input type="hidden" name="id" value={entry.id} />
        <input type="hidden" name="redirectTo" value={redirectTo} />

        <label className="col-span-1 sm:col-span-2 lg:col-span-4 block">
          <span className="lbl text-muted">Text</span>
          <textarea
            name="body"
            rows={2}
            required
            autoFocus
            defaultValue={entry.body}
            className="field resize-y text-base"
          />
        </label>

        <label className="block">
          <span className="lbl text-muted">Date</span>
          <input
            type="date"
            name="entry_date"
            required
            defaultValue={entry.entry_date}
            className="field"
          />
        </label>

        {/*
          The kind used to be a picker here too. It changed nothing - the weekly
          report never read it - so the stored value travels untouched and is
          not offered for editing. What a line SAYS is worth correcting; which
          of four labels it wears is not.
        */}
        <input type="hidden" name="kind" value={entry.kind} />
      </form>

      <div className="mt-6 flex items-center gap-3">
        <button type="submit" form={formId} className="btn">
          Save
        </button>
        <Link href={cancelHref} className="btn btn-ghost">
          Cancel
        </Link>
        <form action={deleteEntry} className="ml-auto">
          <input type="hidden" name="id" value={entry.id} />
          <input type="hidden" name="redirectTo" value={redirectTo} />
          <button type="submit" className="btn btn-danger">
            Delete
          </button>
        </form>
      </div>
    </div>
  )
}
