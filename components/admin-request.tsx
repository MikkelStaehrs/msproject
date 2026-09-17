import { formatDate } from '@/components/ui'
import { declineRequest, forgetRequest, inviteRequester } from '@/lib/admin-actions'
import type { AccessRequest } from '@/lib/types'

/**
 * One person asking, and the two answers.
 *
 * A server component, because both answers are forms posting to a server
 * action and neither needs a single byte of JavaScript. The decline carries a
 * note field that is open on the row rather than hidden behind a dialog: the
 * note is the whole value of keeping a declined row, and a field you have to
 * open is a field left empty.
 *
 * An answered row shows the same shape with the answer in place of the
 * buttons, so the list reads as one list rather than two.
 */
export function AccessRequestRow({
  request,
  decidedBy,
}: {
  request: AccessRequest
  /** Who answered it, for the rows that have been. Null while it waits. */
  decidedBy?: string | null
}) {
  const waiting = request.state === 'new'

  return (
    <div className="border-b border-line px-[14px] py-3.5 last:border-b-0">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[15px] font-medium">{request.full_name}</span>
        <span className="mono text-[12px] text-muted">{request.email}</span>
        <span className="mono ml-auto shrink-0 text-[9.5px] uppercase tracking-[0.1em] text-muted">
          {formatDate(request.requested_at.slice(0, 10))}
        </span>
      </div>

      {request.reason && (
        <p className="prose-measure mt-2 text-[13px] leading-[1.5]">{request.reason}</p>
      )}

      {waiting ? (
        <div className="mt-3.5 flex flex-wrap items-end gap-x-4 gap-y-3">
          <form action={inviteRequester} className="shrink-0">
            <input type="hidden" name="id" value={request.id} />
            <button className="btn">Invite</button>
          </form>

          {/*
            Two forms, not one with two buttons. A single form would put the
            note on the invitation as well, where it means nothing, and would
            make the decline the default action of the Enter key in the note
            field, which is right, but only by accident.
          */}
          <form action={declineRequest} className="flex min-w-[260px] flex-1 items-end gap-3">
            <input type="hidden" name="id" value={request.id} />
            <label className="block min-w-0 flex-1">
              <span className="lbl text-muted">Why not, for your own record</span>
              <input
                name="note"
                className="field"
                placeholder="Nobody here knows them."
              />
            </label>
            <button className="btn btn-ghost shrink-0">Decline</button>
          </form>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[12px] text-muted">
          <span className={request.state === 'declined' ? 'text-rust' : 'text-green'}>
            {request.state === 'invited' ? 'Invited' : 'Declined'}
          </span>
          {request.decided_at && <span>{formatDate(request.decided_at.slice(0, 10))}</span>}
          {decidedBy && <span>by {decidedBy}</span>}
          {request.note && <span className="text-ink">{request.note}</span>}
          <form action={forgetRequest} className="ml-auto">
            <input type="hidden" name="id" value={request.id} />
            <button className="act text-muted">Remove</button>
          </form>
        </div>
      )}
    </div>
  )
}
