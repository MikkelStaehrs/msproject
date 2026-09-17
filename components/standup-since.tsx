import { buildStatusComment } from '@/lib/report'
import { daysBetween } from '@/lib/date'
import { formatDate, formatDateLong } from '@/components/ui'
import type { Movement } from '@/lib/standup'
import type { BlockerDays, Entry, Node } from '@/lib/types'

/**
 * Chapter one: what happened since the last one.
 *
 * It was cut down to a single line once, on the reasoning that a retrospective
 * is a read rather than a working surface and was spending a third of the
 * meeting deciding nothing. That was right about the old chapter, which listed
 * what moved and stopped there.
 *
 * This one earns its place by carrying the two things the room cannot work out
 * for itself. «What Friday will say» is the week's status comment assembled by
 * the same function the report uses, so the meeting sees on Monday what will be
 * copied into the company system on Friday, while there is still time to write
 * the missing line. And «Quiet for too long» names the parts nobody has written
 * about, which is the one failure the rest of the application cannot show: a
 * part with no lines looks identical to a part where nothing happened.
 */
export function StandupSince({
  since,
  moved,
  sparksCaught,
  blockers,
  entries,
  nodes,
  byId,
  childrenOf,
  today,
  titleOf,
  writeHref,
}: {
  since: string | null
  moved: Movement
  sparksCaught: number
  blockers: BlockerDays[]
  entries: Entry[]
  nodes: Node[]
  byId: Map<string, Node>
  childrenOf: Map<string, Node[]>
  today: string
  titleOf: (nodeId: string) => string
  writeHref: (nodeId: string) => string
}) {
  const open = blockers.filter((b) => b.is_active)
  const closed = blockers.filter((b) => !b.is_active)

  /* Everything in the period, or everything ever if this is the first one. */
  const shownEntries = (since === null
    ? entries
    : entries.filter((e) => e.entry_date >= since)
  ).slice(0, 20)
  const shownOpened = since === null ? open : open.filter((b) => b.opened_at >= since)
  const shownClosed = closed.filter(
    (b) => since === null || (b.resolved_at !== null && b.resolved_at >= since),
  )

  /*
   * How long each direct part of each project has been silent. Counted across
   * the part and everything under it, because a line written on a task is a
   * line about the subproject it sits in.
   */
  const lastLine = (nodeId: string): string | null => {
    const inside = new Set<string>()
    const walk = (id: string) => {
      inside.add(id)
      for (const k of childrenOf.get(id) ?? []) walk(k.id)
    }
    walk(nodeId)
    const dates = entries.filter((e) => inside.has(e.node_id)).map((e) => e.entry_date)
    return dates.length === 0 ? null : dates.sort().at(-1) ?? null
  }

  const quiet = nodes
    .filter((n) => n.parent_id !== null && byId.get(n.parent_id)?.parent_id === null)
    .map((n) => {
      const last = lastLine(n.id)
      return { n, days: last === null ? null : Math.abs(daysBetween(last, today)), last }
    })
    .sort((a, b) => (b.days ?? 1e9) - (a.days ?? 1e9))
    .slice(0, 6)

  const comment = buildStatusComment({ entries: shownEntries, blockers: open, today })

  return (
    <>
      <div className="grid grid-cols-2 border-b border-line-strong lg:grid-cols-5">
        <Fig value={moved.completed.length} label="Finished" />
        <Fig value={shownClosed.length} label="Came unstuck" />
        <Fig value={open.length} label="Still stuck" rust={open.length > 0} />
        <Fig value={moved.written} label="Lines written" />
        <Fig value={sparksCaught} label="Sparks caught" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 px-[var(--gut)] py-7">
          <div className="work">
            <h2 className="text-[17px] font-semibold tracking-[-0.025em]">What happened</h2>
            <p className="prose-measure grp-gap text-green-soft">
              {since === null
                ? 'Everything ever written, because this is the first stand-up. Nothing here was written for the meeting.'
                : `Everything written since ${formatDateLong(since)}. Nothing here was written for the meeting.`}
            </p>

            {shownClosed.length + shownOpened.length + shownEntries.length === 0 ? (
              <p className="grp-gap text-[13px] text-muted">
                Nothing was written in this period. Friday will have nothing to assemble.
              </p>
            ) : (
              <div className="panel grp-gap max-w-[1120px]">
                {shownClosed.map((b) => (
                  <Row
                    key={`c${b.id}`}
                    glyph="!"
                    line={b.title}
                    note={`${b.waiting_on} · closed after ${b.days_blocked} days${
                      b.resolution ? ` · ${b.resolution}` : ''
                    }`}
                    tag="Unstuck"
                    when={formatDate(b.resolved_at ?? b.opened_at)}
                  />
                ))}
                {shownOpened.map((b) => (
                  <Row
                    key={`o${b.id}`}
                    glyph="!"
                    rust
                    line={b.title}
                    note={`${b.waiting_on} · ${b.days_blocked} days · ${titleOf(b.node_id)}`}
                    tag="Stuck"
                    when={formatDate(b.opened_at)}
                  />
                ))}
                {shownEntries.map((e) => (
                  <Row
                    key={e.id}
                    glyph="·"
                    line={e.body}
                    note={titleOf(e.node_id)}
                    when={formatDate(e.entry_date)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="min-w-0 border-t border-line px-[var(--gut)] py-7 xl:border-l xl:border-t-0">
          <h2 className="text-[15px] font-semibold">What Friday will say</h2>
          <p className="grp-gap text-[12px] leading-relaxed text-muted">
            Assembled from the same lines by the same function the report uses, and never
            rewritten. If it reads thinly, the answer is a line on the work rather than an edit
            here.
          </p>
          <div className="panel grp-gap">
            <div className="panel-b">
              <p className="prose-measure text-[13px]">{comment}</p>
            </div>
          </div>

          <h2 className="sec-gap text-[15px] font-semibold">Quiet for too long</h2>
          <div className="panel grp-gap">
            <table className="tbl">
              <tbody>
                {quiet.length === 0 ? (
                  <tr>
                    <td className="grow text-muted">No parts yet.</td>
                  </tr>
                ) : (
                  quiet.map(({ n, days, last }) => (
                    <tr key={n.id}>
                      <td
                        className={`num mono ${days === null || days > 7 ? 'text-oxblood' : ''}`}
                      >
                        {days === null ? 'never' : days}
                      </td>
                      <td className="grow">
                        {n.title}
                        <div className="mt-1 text-[12px] text-muted">
                          {last === null
                            ? 'nothing has ever been written here'
                            : `days since the last line, ${formatDate(last)}`}
                        </div>
                      </td>
                      <td>
                        <a href={writeHref(n.id)} className="act">
                          Write a line
                        </a>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  )
}

function Fig({ value, label, rust = false }: { value: number; label: string; rust?: boolean }) {
  return (
    <div className="border-l border-line px-6 py-[18px] first:border-l-0 lg:[&:nth-child(3)]:border-l">
      <b className={`fig-num block ${rust ? 'text-oxblood' : ''}`}>{value}</b>
      <span className="mt-2 block text-[12px] text-muted">{label}</span>
    </div>
  )
}

function Row({
  glyph,
  line,
  note,
  tag,
  when,
  rust = false,
}: {
  glyph: string
  line: string
  note: string
  tag?: string
  when: string
  rust?: boolean
}) {
  return (
    <div className="flex items-start gap-3 border-b border-line px-3.5 py-3 last:border-b-0">
      <span className={`mono w-[1.1em] shrink-0 text-center ${rust ? 'text-oxblood' : 'text-muted'}`}>
        {glyph}
      </span>
      <div className="min-w-0 flex-1">
        <div className="leading-snug">{line}</div>
        <div className="mt-1 text-[12px] leading-snug text-muted">{note}</div>
      </div>
      {tag && <span className={`tag shrink-0 ${rust ? 'tag-rust' : ''}`}>{tag}</span>}
      <span className="mono shrink-0 pt-0.5 text-[9.5px] uppercase tracking-[0.1em] text-muted">
        {when}
      </span>
    </div>
  )
}
