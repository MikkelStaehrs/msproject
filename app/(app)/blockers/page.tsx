import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { QueryFailure, firstError } from '@/lib/failure'
import { addDays, daysBetween, today as todayIso } from '@/lib/date'
import { medianWait } from '@/lib/recipient'
import { readRecipients } from '@/lib/recipient-data'
import { BlockerForm, ReopenBlockerButton, ResolveBlockerForm } from '@/components/blocker-form'
import { QuickAddTrigger } from '@/components/quick-add-trigger'
import { Rule, formatDate } from '@/components/ui'
import {
  WAITING_ON_TYPE_LABEL,
  type BlockerDays,
  type WaitingOnType,
} from '@/lib/types'

export const dynamic = 'force-dynamic'


type Filter = 'all' | 'open' | 'resolved'

export default async function BlockersPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: Filter; edit?: string; resolve?: string }>
}) {
  const { filter = 'all', edit: editId, resolve: resolveId } = await searchParams
  const supabase = await createClient()

  const [blockerRes, nodeRes, descendantRes] = await Promise.all([
    supabase.from('v_blocker_days').select('*').order('opened_at'),
    supabase.from('node').select('id, parent_id, title'),
    supabase.from('v_node_descendant').select('root_id, node_id'),
  ])

  /*
   * Every figure on this page is a count of waiting days, and a count assembled
   * from an empty list is a number rather than a blank: «0 days waited» reads
   * as nobody holding anything up, which is the one thing this page exists to
   * refuse to say.
   */
  const failure = firstError([blockerRes, nodeRes, descendantRes])
  if (failure) return <QueryFailure message={failure} />

  const all = (blockerRes.data ?? []) as BlockerDays[]
  const nodes = (nodeRes.data ?? []) as {
    id: string
    parent_id: string | null
    title: string
  }[]
  const descendants = (descendantRes.data ?? []) as {
    root_id: string
    node_id: string
  }[]

  const titleById = new Map(nodes.map((n) => [n.id, n.title]))
  const rootIds = new Set(nodes.filter((n) => n.parent_id === null).map((n) => n.id))
  const projectOfNode = new Map<string, string>()
  for (const d of descendants) {
    if (rootIds.has(d.root_id)) projectOfNode.set(d.node_id, d.root_id)
  }

  const shown =
    filter === 'open'
      ? all.filter((b) => b.is_active)
      : filter === 'resolved'
        ? all.filter((b) => !b.is_active)
        : all

  const today = todayIso()
  const editing = editId ? all.find((b) => b.id === editId) : undefined
  const resolving = resolveId ? all.find((b) => b.id === resolveId) : undefined

  // --- Graf 1: ventedage pr. modtager -------------------------------------
  const perRecipient = [...
    all.reduce((map, b) => {
      const cur = map.get(b.waiting_on) ?? { days: 0, count: 0, open: 0 }
      map.set(b.waiting_on, {
        days: cur.days + b.days_blocked,
        count: cur.count + 1,
        open: cur.open + (b.is_active ? 1 : 0),
      })
      return map
    }, new Map<string, { days: number; count: number; open: number }>())
  ]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.days - a.days)

  const scaleMax = Math.max(10, ...perRecipient.map((r) => r.days))
  const axisTop = Math.ceil(scaleMax / 20) * 20

  // --- Graf 2: levetid -----------------------------------------------------
  const starts = all.map((b) => b.opened_at)
  const ends = all.map((b) => b.resolved_at ?? today)
  const axisStart = starts.length ? starts.reduce((a, b) => (a < b ? a : b)) : today
  const lastEnd = ends.length ? ends.reduce((a, b) => (a > b ? a : b)) : today
  const axisEnd = addDays(lastEnd > today ? lastEnd : today, 5)
  const span = Math.max(1, daysBetween(axisStart, axisEnd))
  const pos = (d: string) => (daysBetween(axisStart, d) / span) * 100

  // --- Key figures ---------------------------------------------------------
  const open = all.filter((b) => b.is_active)
  const resolved = all.filter((b) => !b.is_active)
  // One definition of «median», shared with the expectation that drives
  // expected_by. This page used to carry its own, unrounded, so the key figure
  // and the date a blocker was given could disagree by half a day.
  const median = medianWait(resolved.map((b) => b.days_blocked))
  const overdue = open.filter((b) => b.expected_by !== null && b.expected_by < today)
  const affected = new Set(
    open.map((b) => projectOfNode.get(b.node_id)).filter(Boolean) as string[],
  )

  /*
   * Grouped by the type the RECIPIENT is known by, not the one guessed for each
   * blocker as it was written. The guess only recognises IT, management and
   * vendors, so every governance body fell into «other» and this chart showed a
   * single bar. Correcting the type on one blocker now moves all of that
   * recipient's days, the closed ones included.
   */
  const recipients = await readRecipients(supabase)
  const typeOf = new Map(recipients.map((r) => [r.name.toLowerCase(), r.type]))

  const perType = [...
    all.reduce((map, b) => {
      const t = typeOf.get((b.waiting_on ?? '').trim().toLowerCase()) ?? b.waiting_on_type
      map.set(t, (map.get(t) ?? 0) + b.days_blocked)
      return map
    }, new Map<WaitingOnType, number>())
  ]
    .map(([type, d]) => ({ type, days: d }))
    .sort((a, b) => b.days - a.days)
  const typeMax = Math.max(1, ...perType.map((t) => t.days))

  const base = '/blockers'
  const href = (f: Filter) => (f === 'all' ? base : `${base}?filter=${f}`)

  return (
    <main>
      {/* Context band */}
      <div className="frame">
        <div className="lbl pl-5 lg:pl-16 py-3 pr-5 text-muted">All projects</div>
        <div className="flex items-center gap-3.5 border-l border-rule px-5 lg:px-10 py-3">
          {(
            [
              ['all', 'ALL'],
              ['open', 'OPEN'],
              ['resolved', 'RESOLVED'],
            ] as const
          ).map(([key, label], i) => (
            <span key={key} className="flex items-center gap-3.5">
              {i > 0 && <span className="text-rule">|</span>}
              <Link
                href={href(key)}
                className={`lbl ${filter === key ? 'text-ink' : 'text-muted hover:text-ink'}`}
              >
                {label}
              </Link>
            </span>
          ))}
        </div>
        <div className="flex items-center justify-end border-l border-rule py-3 pl-5 lg:pl-8 pr-5 lg:pr-16">
          <QuickAddTrigger />
        </div>
      </div>
      <Rule strong />

      {editing && (
        <BlockerForm blocker={editing} redirectTo={base} cancelHref={href(filter)} />
      )}
      {resolving && (
        <ResolveBlockerForm
          blocker={resolving}
          redirectTo={base}
          cancelHref={href(filter)}
        />
      )}

      <div className="frame min-h-[60vh]">
        {/* Left label column */}
        <div className="pl-5 lg:pl-16 py-8 pr-5">
          <h1 className="font-display text-[30px] font-medium leading-[1.06] tracking-[-0.01em]">
            Block&shy;ers
          </h1>
          <div className="mt-4 text-[11px] leading-relaxed text-muted">
            {all.length} recorded
            <br />
            {open.length} still open
            <br />
            {all.reduce((s, b) => s + b.days_blocked, 0)} waiting days in total
          </div>
        </div>

        {/* Charts */}
        <div className="border-l border-rule px-5 lg:px-10 py-8">
          {all.length === 0 ? (
            <p className="text-sm text-muted">
              No blockers recorded. Open the first one with{' '}
              <span className="text-ink">! what is blocking @ who</span> in quick
              entry.
            </p>
          ) : (
            <>
              <div className="flex items-baseline justify-between gap-5">
                <h2 className="font-display text-[26px] font-medium">
                  Waiting days per recipient
                </h2>
                <span className="text-[11px] text-muted">Open and resolved combined</span>
              </div>

              <div className="mt-5">
                {perRecipient.map((r, i) => (
                  <div
                    key={r.name}
                    className={`grid grid-cols-[132px_1fr_74px] items-center border-t border-rule py-3 ${
                      i === perRecipient.length - 1 ? 'border-b border-b-rule-strong' : ''
                    }`}
                  >
                    <div className="text-[13px] font-medium">{r.name}</div>
                    <div className="pr-4">
                      <div
                        className="h-5 bg-green"
                        style={{ width: `${(r.days / axisTop) * 100}%` }}
                        title={`${r.days} days across ${r.count} cases`}
                      />
                    </div>
                    <div className="num text-right text-[22px]">{r.days}</div>
                  </div>
                ))}
                <div className="grid grid-cols-[132px_1fr_74px] pt-2">
                  <div />
                  <div className="flex justify-between pr-4 text-[10px] tabular-nums text-muted">
                    <span>0</span>
                    <span>{Math.round(axisTop / 3)}</span>
                    <span>{Math.round((axisTop / 3) * 2)}</span>
                    <span>{axisTop} days</span>
                  </div>
                  <div />
                </div>
              </div>

              <div className="mt-8">
                <Rule />
              </div>

              <div className="pt-7">
                <div className="flex items-baseline justify-between gap-5">
                  <h2 className="font-display text-[26px] font-medium">Lifetime</h2>
                  <div className="flex items-center gap-4.5">
                    <span className="flex items-center gap-2">
                      <span className="block h-2 w-3.5 bg-green" />
                      <span className="lbl-tight">Open</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="block h-2 w-3.5 bg-rule-strong" />
                      <span className="lbl-tight">Resolved</span>
                    </span>
                  </div>
                </div>

                <div className="relative mt-5">
                  <div
                    className="absolute bottom-6 top-0 w-px bg-oxblood"
                    style={{ left: `calc(240px + (100% - 240px) * ${pos(today) / 100})` }}
                  />

                  {all.map((b) => (
                    <div
                      key={b.id}
                      className="grid grid-cols-1 lg:grid-cols-[240px_1fr] items-center border-t border-rule py-2.5"
                    >
                      <div className="pr-4">
                        <div className="text-[12.5px] leading-snug">{b.title}</div>
                        <div className="mt-0.5 text-[10px] text-muted">
                          {b.waiting_on} ·{' '}
                          {b.is_active
                            ? `open on day ${b.days_blocked}`
                            : `resolved after ${b.days_blocked} days`}
                        </div>
                      </div>
                      <div className="relative h-3.5">
                        <div
                          className={`absolute h-3.5 ${b.is_active ? 'bg-green' : 'bg-rule-strong'}`}
                          style={{
                            left: `${pos(b.opened_at)}%`,
                            width: `${Math.max(
                              0.8,
                              pos(b.resolved_at ?? today) - pos(b.opened_at),
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}

                  <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] border-t border-rule-strong pt-2">
                    <div />
                    <div className="relative h-4 text-[10px] tabular-nums text-muted">
                      <span className="absolute left-0">{formatDate(axisStart)}</span>
                      <span
                        className="absolute -translate-x-1/2 text-oxblood"
                        style={{ left: `${pos(today)}%` }}
                      >
                        today
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-8">
                <Rule />
              </div>

              {/* Tabellen med handlinger */}
              <div className="pt-7">
                <h2 className="font-display text-[26px] font-medium">
                  {filter === 'open' ? 'Open' : filter === 'resolved' ? 'Resolved' : 'All'}{' '}
                  blockers
                </h2>
                <div className="mt-4">
                  {shown.length === 0 && (
                    <p className="border-t border-rule py-4 text-[13px] text-muted">
                      None in this selection.
                    </p>
                  )}
                  {[...shown]
                    .sort((a, b) => b.days_blocked - a.days_blocked)
                    .map((b) => (
                      <div
                        key={b.id}
                        className="flex items-baseline gap-4 border-t border-rule py-3 last:border-b"
                      >
                        <div
                          className={`num min-w-[42px] text-[24px] leading-none ${
                            b.is_active &&
                            b.expected_by !== null &&
                            b.expected_by < today
                              ? 'text-oxblood'
                              : 'text-ink'
                          }`}
                        >
                          {b.days_blocked}
                        </div>
                        <div className="flex-1">
                          <div className="text-[13px] leading-snug">{b.title}</div>
                          <div className="mt-0.5 text-[11px] text-muted">
                            {b.waiting_on} · {titleById.get(b.node_id)}
                            {b.expected_by && <> · expected {formatDate(b.expected_by)}</>}
                            {b.resolution && <> · {b.resolution}</>}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-baseline gap-4">
                          {b.is_active ? (
                            <Link
                              href={`${base}?resolve=${b.id}${filter === 'all' ? '' : `&filter=${filter}`}`}
                              className="lbl-tight text-green hover:text-oxblood"
                            >
                              Close
                            </Link>
                          ) : (
                            <ReopenBlockerButton id={b.id} redirectTo={href(filter)} />
                          )}
                          <Link
                            href={`${base}?edit=${b.id}${filter === 'all' ? '' : `&filter=${filter}`}`}
                            className="lbl-tight text-muted hover:text-ink"
                          >
                            Rediger
                          </Link>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Right column */}
        <div className="border-l border-rule">
          <section className="py-8 pl-5 lg:pl-8 pr-5 lg:pr-16">
            <div className="lbl text-muted">Key figures</div>
            <div className="mt-4">
              {[
                {
                  label: 'Longest open case',
                  value: open.length
                    ? Math.max(...open.map((b) => b.days_blocked))
                    : '-',
                  alarm: true,
                },
                {
                  label: 'Median time to resolve',
                  value: median === null ? '-' : String(median),
                  alarm: false,
                },
                {
                  label: 'Past expected reply',
                  value: overdue.length,
                  alarm: overdue.length > 0,
                },
                { label: 'Projects affected', value: affected.size, alarm: false },
              ].map((row) => (
                <div
                  key={row.label}
                  className="flex items-baseline justify-between border-t border-rule py-3 last:border-b"
                >
                  <div className="text-[12.5px]">{row.label}</div>
                  <div
                    className={`num text-[22px] ${
                      row.alarm && row.value !== 0 && row.value !== '-'
                        ? 'text-oxblood'
                        : 'text-ink'
                    }`}
                  >
                    {row.value}
                  </div>
                </div>
              ))}
            </div>
          </section>
          <Rule />

          <section className="py-7 pb-8 pl-5 lg:pl-8 pr-5 lg:pr-16">
            <div className="lbl text-muted">Split by type</div>
            <div className="mt-4">
              {perType.map((t) => (
                <div
                  key={t.type}
                  className="grid grid-cols-[92px_1fr_34px] items-center border-t border-rule py-2.5 last:border-b"
                >
                  <div className="text-[11.5px]">{WAITING_ON_TYPE_LABEL[t.type]}</div>
                  <div className="pr-3">
                    <div
                      className="h-3 bg-green"
                      style={{ width: `${(t.days / typeMax) * 100}%` }}
                    />
                  </div>
                  <div className="text-right text-[11px] tabular-nums text-muted">
                    {t.days}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
