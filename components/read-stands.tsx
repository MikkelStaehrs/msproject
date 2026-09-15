import Link from 'next/link'
import { formatDate } from '@/components/ui'
import type { BlockerDays, Entry, NodeProgress } from '@/lib/types'

/**
 * Where it stands, assembled from the log.
 *
 * The summary is never written by hand. It is the work log read backwards,
 * the open blockers said out loud with their waiting days, and the count of
 * what has finished. Three paragraphs, each of which is only as long as the
 * record allows: a project with four lines in its log gets four sentences,
 * and the last paragraph says so rather than padding it out.
 *
 * The blocker sentence follows the rule in lib/report.ts: an open blocker
 * holds the project at At Risk, and only a passed expected reply date can
 * take it to Off Track. A blocker with no expected reply therefore cannot
 * move the light however long it sits, which is worth saying because it is
 * the one thing a person can fix by asking for a date.
 */

/** How many lines the first paragraph reads before it points at the log. */
const SHOWN = 12

export function WhereItStands({
  entries,
  open,
  progress,
  titleOf,
  logHref,
}: {
  /** The subtree's work log, newest first. */
  entries: Entry[]
  /** Open blockers anywhere in the subtree. */
  open: BlockerDays[]
  progress: NodeProgress | null
  titleOf: (id: string) => string
  logHref: string
}) {
  const shown = entries.slice(0, SHOWN)
  const earlier = entries.length - shown.length
  const noReply = open.filter((b) => b.expected_by === null)
  const done = progress?.leaf_done ?? 0
  const total = progress?.leaf_total ?? 0

  return (
    <div className="grp-gap flex max-w-[64ch] flex-col gap-[18px] text-[15px] leading-[1.55]">
      {shown.length > 0 && (
        <p className="text-ink">
          {shown.map((e, i) => (
            <span key={e.id}>
              {i > 0 && ' '}
              {e.body.trim()}{' '}
              <span className="text-muted">
                ({titleOf(e.node_id)}, {formatDate(e.entry_date)})
              </span>
            </span>
          ))}
          {earlier > 0 && (
            <span className="text-muted">
              {' '}
              <Link href={logHref} className="hover:text-green">
                {earlier} earlier {earlier === 1 ? 'line is' : 'lines are'} on Work.
              </Link>
            </span>
          )}
        </p>
      )}

      {open.length > 0 && (
        <p className="text-green-soft">
          {open
            .map(
              (b) =>
                `Waiting on ${b.waiting_on} for ${b.title}, ${b.days_blocked} ${
                  b.days_blocked === 1 ? 'day' : 'days'
                }${b.expected_by ? `, reply expected ${formatDate(b.expected_by)}` : ''}`,
            )
            .join('. ')}
          .{' '}
          {noReply.length === open.length
            ? open.length === 1
              ? 'It carries no expected reply, so it cannot go past At Risk however long it sits.'
              : open.length === 2
                ? 'Neither carries an expected reply, so neither can go past At Risk however long it sits.'
                : 'None of them carries an expected reply, so none can go past At Risk however long they sit.'
            : noReply.length > 0
              ? `${noReply.length} of them ${noReply.length === 1 ? 'carries' : 'carry'} no expected reply, and cannot go past At Risk however long it sits.`
              : ''}
        </p>
      )}

      <p className="text-green-soft">
        {total === 0
          ? 'There are no tasks under this project yet, so nothing can be marked finished.'
          : done === 0
            ? `Nothing has been marked finished: 0 of ${total} tasks.`
            : `${done} of ${total} tasks ${done === 1 ? 'has' : 'have'} been marked finished.`}
        {entries.length === 0
          ? ' The log is empty, so this is all that can be said.'
          : entries.length < 5
            ? ` With ${entries.length} ${entries.length === 1 ? 'line' : 'lines'} in the whole log, this paragraph is as long as the record allows.`
            : ''}
      </p>
    </div>
  )
}
