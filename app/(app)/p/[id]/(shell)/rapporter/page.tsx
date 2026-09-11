import Link from 'next/link'
import { ProjectFrame } from '@/components/project-frame'
import { createClient } from '@/lib/supabase/server'
import { QueryFailure, firstError } from '@/lib/failure'
import { formatDate, formatDateLong } from '@/components/ui'
import type { Report } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function ReportsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const res = await supabase
    .from('report')
    .select('*')
    .eq('node_id', id)
    .order('period_end', { ascending: false })

  /*
   * An archive that cannot be read renders as «no saved reports yet», which is
   * the same sentence a project genuinely gets in its first week. One of those
   * invites you to go and write one; the other is a fault.
   */
  const failure = firstError([res])
  if (failure) return <QueryFailure message={failure} />

  const reports = (res.data ?? []) as Report[]

  return (
    <ProjectFrame projectId={id} frameNodeId={id}>
    <div className="px-5 lg:px-10 py-7">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-[26px] font-medium">Reports</h2>
        <Link href="/friday" className="lbl text-green hover:text-oxblood">
          This week
        </Link>
      </div>

      {reports.length === 0 ? (
        <p className="mt-4 border-t border-rule py-4 text-[13px] text-muted">
          No saved reports yet. Go to Friday, choose a phase and mark it
          reported, and it will land here.
        </p>
      ) : (
        <div className="mt-5 max-w-3xl">
          {reports.map((r) => (
            <article key={r.id} className="border-t border-rule py-5 last:border-b">
              <div className="flex items-baseline justify-between gap-5">
                <div className="lbl tabular-nums text-muted">
                  {formatDate(r.period_start)} – {formatDateLong(r.period_end)}
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`block size-[7px] ${
                      r.submitted ? 'bg-green' : 'border border-rule-strong'
                    }`}
                  />
                  <span className="lbl-tight">
                    {r.submitted ? 'Reported' : 'Draft'}
                  </span>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-[110px_1fr] gap-y-2 text-[12.5px]">
                <div className="lbl-tight text-muted">Status</div>
                <div>{String(r.fields?.status ?? '-')}</div>
                <div className="lbl-tight text-muted">Stage</div>
                <div>{String(r.fields?.stage ?? '-')}</div>
                <div className="lbl-tight text-muted">Progress</div>
                <div
                  className={
                    r.fields?.progress === 'Off Track' ? 'text-oxblood' : undefined
                  }
                >
                  {String(r.fields?.progress ?? '-')}
                </div>
                <div className="lbl-tight text-muted">Comment</div>
                <div className="leading-relaxed">
                  {r.body_markdown ?? String(r.fields?.comment ?? '-')}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
    </ProjectFrame>
  )
}
