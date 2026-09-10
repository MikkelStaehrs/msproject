import Link from 'next/link'
import { agreeHere } from '@/lib/standup-actions'
import { PersonField } from '@/components/person-field'
import { Hint } from '@/components/ui'

/**
 * What the room agreed, written where it was agreed.
 *
 * Three fields and no minutes. A minutes table would say «Jan takes the
 * firewall quote by the 17th» in prose beside a task saying the same thing in
 * columns, and the two would disagree the first time somebody moved the date.
 * So the sentence becomes a line in the log, the name becomes the owner, the
 * date becomes the due date, and next week's «what did we agree» reads the
 * task's own status rather than a second account of it.
 *
 * The date defaults to the next stand-up because that is what a stand-up
 * commitment means: by the time we meet again. It is a default and not a rule -
 * some things take a month, and typing over it is the whole of saying so.
 */
export function AgreedHere({
  nodeId,
  nextOn,
  open,
  openHref,
  closeHref,
  redirectTo,
}: {
  nodeId: string
  /** The day the room meets again. */
  nextOn: string
  open: boolean
  openHref: string
  closeHref: string
  redirectTo: string
}) {
  if (!open) {
    return (
      <Link href={openHref} className="lbl-tight text-green hover:text-oxblood">
        agreed here
      </Link>
    )
  }

  return (
    <form
      action={agreeHere}
      className="mt-5 border-l-2 border-green bg-sheet px-5 py-4"
    >
      <input type="hidden" name="node_id" value={nodeId} />
      <input type="hidden" name="redirectTo" value={redirectTo} />

      <div className="lbl text-muted">Agreed here</div>

      <label className="mt-3 block">
        <span className="lbl-tight text-muted">What was agreed</span>
        <textarea
          name="body"
          required
          rows={2}
          autoFocus
          placeholder="Jan gets a quote for the switch"
          className="field resize-none text-[13px]"
        />
      </label>

      <div className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-3">
        <label className="block">
          <span className="lbl-tight text-muted">Who takes it</span>
          <PersonField name="owner" defaultValue="" />
        </label>

        <label className="block">
          <span className="lbl-tight text-muted">By</span>
          <input
            type="date"
            name="due_date"
            defaultValue={nextOn}
            className="field tabular-nums"
          />
        </label>

        <label className="block">
          <span className="lbl-tight text-muted">
            <Hint text="On this piece: the thing under discussion gets the name and the date. A new task: what was agreed is something else that has to happen first, and it goes underneath.">
              Lands on
            </Hint>
          </span>
          <select name="shape" defaultValue="this" className="field">
            <option value="this">This piece</option>
            <option value="new">A new task under it</option>
          </select>
        </label>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button className="btn">Record it</button>
        <Link href={closeHref} className="btn btn-ghost">
          Cancel
        </Link>
        <span className="text-[10.5px] leading-snug text-rule-strong">
          Writes a line in the log, stamped with today&rsquo;s stand-up, so it
          shows up under &laquo;agreed last time&raquo; next week.
        </span>
      </div>
    </form>
  )
}
