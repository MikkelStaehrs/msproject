import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { QueryFailure, firstError } from '@/lib/failure'
import { readPeopleById, nameOf } from '@/lib/person-data'
import { projectOf } from '@/lib/subtree'
import { sponsorNote } from '@/lib/standup-summary'
import { CopyField } from '@/components/copy-field'
import { formatDate, formatDateLong } from '@/components/ui'
import type { Summary } from '@/lib/standup-close'
import type { Node, Standup } from '@/lib/types'

export const dynamic = 'force-dynamic'

/**
 * A stand-up that has closed.
 *
 * Read only, and read only in the strong sense: the database refuses to change
 * a closed meeting at all. The whole value of a retrospective is that it says
 * what was true then, and a record you can edit afterwards is a record of what
 * you wish had been true.
 *
 * Everything on this page comes out of `standup.summary`, which was written
 * once and is never recomputed. So a task renamed in November does not rewrite
 * what October's meeting agreed, and a blocker closed since still reads here as
 * the thing that was stuck.
 */
export default async function ClosedStandupPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const [standupRes, nodeRes, nextRes] = await Promise.all([
    supabase.from('standup').select('*').eq('id', id).maybeSingle(),
    supabase.from('node').select('id, parent_id, title'),
    supabase.from('standup').select('scheduled_at').eq('status', 'open').maybeSingle(),
  ])

  const standup = standupRes.data as Standup | null
  if (!standup) notFound()

  const failure = firstError([nodeRes])
  if (failure) return <QueryFailure message={failure} />

  /* An open meeting is walked, not read. */
  if (standup.status === 'open') {
    return (
      <main className="px-[var(--gut)] py-[26px]">
        <div className="work mx-auto">
          <h1 className="text-[34px] font-semibold leading-[1.08] tracking-[-0.03em] text-green">
            That stand-up has not closed
          </h1>
          <p className="prose-measure grp-gap text-green-soft">
            It is the one running now, and it is walked rather than read.
          </p>
          <Link href="/standup" className="btn grp-gap inline-block">
            Open it
          </Link>
        </div>
      </main>
    )
  }

  const summary = (standup.summary ?? null) as Summary | null
  const peopleById = await readPeopleById(supabase)
  const nodes = (nodeRes.data ?? []) as Pick<Node, 'id' | 'parent_id' | 'title'>[]
  const projectOfNode = projectOf(nodes as Node[])
  const at = (nodeId: string) => `/p/${projectOfNode.get(nodeId) ?? nodeId}?task=${nodeId}`
  const who = (personId: string) => nameOf(peopleById, personId)

  const closedOn = standup.closed_at ? formatDateLong(standup.closed_at.slice(0, 10)) : ''
  const nextOn = (nextRes.data as { scheduled_at: string | null } | null)?.scheduled_at

  return (
    <main>
      <div className="grid grid-cols-1 border-b border-line-strong lg:grid-cols-[auto_1fr_auto]">
        <div className="lbl px-[var(--gut)] py-2.5 text-muted lg:pr-6">Stand-up</div>
        <div className="lbl border-t border-line px-[var(--gut)] py-2.5 text-muted lg:border-l lg:border-t-0 lg:px-6">
          <span className="text-ink">Closed {closedOn}</span>
          {summary?.period.from &&
            ` · covering from ${formatDate(summary.period.from.slice(0, 10))}`}
          {standup.facilitator_id && ` · run by ${who(standup.facilitator_id)}`}
        </div>
        <div className="flex items-center justify-end gap-6 border-t border-line px-[var(--gut)] py-2.5 lg:border-l lg:border-t-0">
          <Link href="/standup/arkiv" className="act">
            Archive
          </Link>
          <Link href="/standup" className="act">
            The one running
          </Link>
        </div>
      </div>

      <div className="px-[var(--gut)] py-[26px]">
        <div className="work mx-auto">
          <h1 className="text-[34px] font-semibold leading-[1.08] tracking-[-0.03em] text-green [text-wrap:balance]">
            {closedOn}
          </h1>
          <p className="prose-measure grp-gap text-green-soft">
            What this meeting came to, as it was written when it closed. Nothing
            here is recomputed, so it says what was true then rather than what is
            true now.
          </p>
          {nextOn && (
            <p className="grp-gap text-[13px] text-muted">
              Next stand-up: <span className="text-ink">{formatDateLong(nextOn.slice(0, 10))}</span>
            </p>
          )}

          {summary === null ? (
            <p className="grp-gap text-[13px] text-rust">
              This meeting closed without a summary, which should not be possible.
              The rows it wrote are still on the work.
            </p>
          ) : (
            <>
              <div className="sec-gap grid grid-cols-2 border-y border-line-strong lg:grid-cols-3 xl:grid-cols-6">
                <Fig value={summary.present.length} label="In the room" />
                <Fig value={summary.finished.length} label="Finished" />
                <Fig value={summary.blockers.resolved.length} label="Came unstuck" />
                <Fig
                  value={summary.blockers.carried.length}
                  label="Still stuck"
                  rust={summary.blockers.carried.length > 0}
                />
                <Fig value={summary.commitments.length} label="Agreed ahead" />
                <Fig value={summary.lines} label="Lines written" />
              </div>

              {summary.present.length + summary.absent.length > 0 && (
                <p className="prose-measure grp-gap text-[13px] text-muted">
                  <span className="text-ink">
                    {summary.present.map(who).join(', ') || 'Nobody recorded as present'}
                  </span>
                  {summary.absent.length > 0 && ` · away: ${summary.absent.map(who).join(', ')}`}
                </p>
              )}

              <List
                title="Finished"
                rows={summary.finished.map((f) => ({
                  key: f.nodeId,
                  href: at(f.nodeId),
                  title: f.title,
                }))}
              />
              <List
                title="Came unstuck"
                rows={summary.blockers.resolved.map((b, i) => ({
                  key: `r${i}`,
                  title: b.title,
                  note: b.resolution,
                }))}
              />
              <List
                title="Still stuck"
                rust
                rows={summary.blockers.carried.map((b, i) => ({
                  key: `c${i}`,
                  title: b.title,
                  note: `waiting on ${b.waitingOn} · ${b.standups} ${
                    b.standups === 1 ? 'stand-up' : 'stand-ups'
                  }${b.nextStep ? ` · ${b.nextStep}` : ''}`,
                }))}
              />
              <List
                title="Agreed before next time"
                rows={summary.commitments.map((c) => ({
                  key: c.nodeId,
                  href: at(c.nodeId),
                  title: c.title,
                  note: [
                    c.driverId ? who(c.driverId) : 'nobody named',
                    c.dueDate ? `by ${formatDate(c.dueDate)}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · '),
                }))}
              />
              <List
                title="Given a driver"
                rows={summary.assigned.map((a) => ({
                  key: a.nodeId,
                  href: at(a.nodeId),
                  title: a.title,
                  note: who(a.driverId),
                }))}
              />
              <List
                title="Put off on purpose"
                rows={summary.parked.map((p) => ({
                  key: p.nodeId,
                  href: at(p.nodeId),
                  title: p.title,
                  note: `until ${formatDate(p.until)}`,
                }))}
              />
              <List
                title="Decided"
                rows={summary.decisions.map((d, i) => ({
                  key: `d${i}`,
                  href: at(d.nodeId),
                  title: d.decision,
                }))}
              />
              <List
                title="Not done from the time before"
                rust
                rows={summary.missed.map((m) => ({
                  key: m.nodeId,
                  href: at(m.nodeId),
                  title: m.title,
                }))}
              />

              {summary.sparks > 0 && (
                <p className="prose-measure sec-gap text-[13px] text-muted">
                  {summary.sparks} {summary.sparks === 1 ? 'spark was' : 'sparks were'}
                  {' '}caught and went to the inbox of whoever closed the meeting. They
                  are private to their author, so they are counted here and not
                  repeated.
                </p>
              )}

              {/*
                For the sponsor, built from the snapshot and from nothing else:
                somebody pasting this three days later is quoting a meeting, and
                a paragraph that had quietly updated itself would be a quote of
                something nobody said.
              */}
              <h2 className="sec-gap text-[17px] font-semibold tracking-[-0.025em]">
                For the sponsor
              </h2>
              <p className="prose-measure grp-gap text-[13px] text-muted">
                Markdown, assembled from what this meeting recorded. No mail is
                sent from here.
              </p>
              <div className="grp-gap">
                <CopyField
                  label="Copy"
                  source="the stand-up summary"
                  value={sponsorNote(summary, who, `Stand-up ${closedOn}`)}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  )
}

function Fig({ value, label, rust = false }: { value: number; label: string; rust?: boolean }) {
  return (
    <div className="border-l border-line px-5 py-[18px] first:border-l-0">
      <b className={`fig-num block ${rust ? 'text-rust' : ''}`}>{value}</b>
      <span className="mt-2 block text-[12px] leading-snug text-muted">{label}</span>
    </div>
  )
}

function List({
  title,
  rows,
  rust = false,
}: {
  title: string
  rows: { key: string; href?: string; title: string; note?: string | null }[]
  rust?: boolean
}) {
  if (rows.length === 0) return null

  return (
    <>
      <h2 className={`sec-gap text-[15px] font-semibold ${rust ? 'text-rust' : ''}`}>
        {title}
      </h2>
      <div className="panel grp-gap max-w-[900px]">
        {rows.map((r) => (
          <div key={r.key} className="border-b border-line px-[14px] py-2.5 last:border-b-0">
            {r.href ? (
              <Link href={r.href} className="text-[13px] leading-snug hover:text-green">
                {r.title}
              </Link>
            ) : (
              <span className="text-[13px] leading-snug">{r.title}</span>
            )}
            {r.note && (
              <div className="mt-0.5 text-[12px] leading-snug text-muted">{r.note}</div>
            )}
          </div>
        ))}
      </div>
    </>
  )
}
