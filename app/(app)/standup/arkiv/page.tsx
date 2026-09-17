import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { QueryFailure, firstError } from '@/lib/failure'
import { readPeopleById, nameOf } from '@/lib/person-data'
import { formatDate, formatDateLong } from '@/components/ui'
import type { Summary } from '@/lib/standup-close'
import type { Standup } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Stand-ups' }

/**
 * Every meeting that has closed.
 *
 * Each row is read from its own stored snapshot, so the list is a list of what
 * those meetings said rather than a recomputation over today's work. The figure
 * worth scanning down the page is «still stuck»: a column of ones is a portfolio
 * that unsticks itself, and a column that climbs is the argument for doing
 * something about it.
 */
export default async function StandupArchivePage() {
  const supabase = await createClient()

  const [closedRes, openRes] = await Promise.all([
    supabase
      .from('standup')
      .select('*')
      .eq('status', 'closed')
      .order('closed_at', { ascending: false })
      .limit(60),
    supabase.from('standup').select('scheduled_at').eq('status', 'open').maybeSingle(),
  ])

  const failure = firstError([closedRes])
  if (failure) return <QueryFailure message={failure} />

  const held = (closedRes.data ?? []) as Standup[]
  const peopleById = await readPeopleById(supabase)
  const nextOn = (openRes.data as { scheduled_at: string | null } | null)?.scheduled_at

  return (
    <main>
      <div className="grid grid-cols-1 border-b border-line-strong lg:grid-cols-[auto_1fr_auto]">
        <div className="lbl px-[var(--gut)] py-2.5 text-muted lg:pr-6">Stand-ups</div>
        <div className="lbl border-t border-line px-[var(--gut)] py-2.5 text-muted lg:border-l lg:border-t-0 lg:px-6">
          {held.length} {held.length === 1 ? 'meeting' : 'meetings'} closed
          {nextOn && ` · next on ${formatDateLong(nextOn.slice(0, 10))}`}
        </div>
        <div className="flex items-center justify-end gap-6 border-t border-line px-[var(--gut)] py-2.5 lg:border-l lg:border-t-0">
          <Link href="/standup" className="btn">
            The one running
          </Link>
        </div>
      </div>

      <div className="px-[var(--gut)] py-[26px]">
        <div className="work mx-auto">
          <h1 className="text-[34px] font-semibold leading-[1.08] tracking-[-0.03em] text-green [text-wrap:balance]">
            Every stand-up
          </h1>
          <p className="prose-measure grp-gap text-green-soft">
            Each one as it was written when it closed. The column to read down is
            «still stuck»: a run of ones is a portfolio that unsticks itself, and
            one that climbs is the argument for doing something about it.
          </p>

          {held.length === 0 ? (
            <p className="grp-gap text-[13px] text-muted">
              None has closed yet. The one running is the first.
            </p>
          ) : (
            <div className="panel grp-gap max-w-[1120px] text-[13px]">
              <div className="hidden border-b border-line-strong lg:grid lg:grid-cols-[minmax(0,1fr)_120px_110px_110px_110px]">
                {['Meeting', 'Finished', 'Unstuck', 'Still stuck', 'Agreed'].map((h, i) => (
                  <div
                    key={h}
                    className={`micro px-[14px] py-2 text-muted ${i > 0 ? 'text-right' : ''}`}
                  >
                    {h}
                  </div>
                ))}
              </div>

              {held.map((s) => {
                const sum = (s.summary ?? null) as Summary | null
                const stuck = sum?.blockers.carried.length ?? 0
                return (
                  <div
                    key={s.id}
                    className="relative grid grid-cols-1 border-b border-line last:border-b-0 hover:bg-hover lg:grid-cols-[minmax(0,1fr)_120px_110px_110px_110px]"
                  >
                    <div className="min-w-0 px-[14px] py-2">
                      <Link
                        href={`/standup/${s.id}`}
                        className="font-medium after:absolute after:inset-0 after:content-['']"
                      >
                        {s.closed_at ? formatDateLong(s.closed_at.slice(0, 10)) : 'Undated'}
                      </Link>
                      <div className="mt-[5px] text-[12px] leading-[1.45] text-muted">
                        {s.period_from
                          ? `since ${formatDate(s.period_from.slice(0, 10))}`
                          : 'the first one'}
                        {s.facilitator_id && ` · ${nameOf(peopleById, s.facilitator_id)}`}
                        {sum && sum.present.length > 0 && ` · ${sum.present.length} in the room`}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-baseline gap-x-7 gap-y-2 px-[14px] pb-3 lg:contents">
                      <Cell label="Finished" value={sum?.finished.length ?? 0} />
                      <Cell label="Unstuck" value={sum?.blockers.resolved.length ?? 0} />
                      <Cell label="Still stuck" value={stuck} rust={stuck > 0} />
                      <Cell label="Agreed" value={sum?.commitments.length ?? 0} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}

function Cell({ label, value, rust = false }: { label: string; value: number; rust?: boolean }) {
  return (
    <div className={`mono lg:px-[14px] lg:py-2 lg:text-right ${rust ? 'text-rust' : 'text-muted'}`}>
      <span className="micro mr-3 text-muted lg:hidden">{label}</span>
      {value}
    </div>
  )
}
