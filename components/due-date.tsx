'use client'

import { useRef } from 'react'
import { setDueDate } from '@/lib/node-actions'

/**
 * A date you can move while somebody is still talking.
 *
 * The same shape as StatusSelect and for the same reason: the agenda says «its
 * date was the 1st, either it moves or it is finished», and answering that
 * should not mean opening the edit form, finding the field among eleven others
 * and losing the thread of the meeting.
 *
 * Saves on change. There is no button, because a date picker that has been
 * changed and not saved is the worst of the three states.
 */
export function DueDate({
  id,
  due,
  today,
}: {
  id: string
  due: string | null
  /** So an overdue date is red without asking the browser what day it is. */
  today: string
}) {
  const form = useRef<HTMLFormElement>(null)
  const late = due !== null && due < today

  return (
    <form ref={form} action={setDueDate} className="flex flex-col">
      <input type="hidden" name="id" value={id} />
      <span className="lbl-tight text-muted">Due</span>
      <input
        type="date"
        name="due_date"
        defaultValue={due ?? ''}
        onChange={() => form.current?.requestSubmit()}
        aria-label="Due date"
        className={`mt-0.5 border-0 bg-transparent p-0 text-[14px] tabular-nums focus:outline-none focus:underline ${
          late ? 'text-oxblood' : ''
        }`}
      />
    </form>
  )
}
