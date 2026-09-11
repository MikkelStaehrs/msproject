import Link from 'next/link'
import { today as todayIso } from '@/lib/date'
import { createClient } from '@/lib/supabase/server'
import { ReportDataError, collectReports } from '@/lib/report-data'
import { QueryFailure } from '@/lib/failure'
import { saveReport, unsubmitReport } from '@/lib/report-actions'
import { CopyField } from '@/components/copy-field'
import { StageSelect } from '@/components/stage-select'
import { QuickAddTrigger } from '@/components/quick-add-trigger'
import { ProgressScale, Rule, formatDate, formatDateLong } from '@/components/ui'

export const dynamic = 'force-dynamic'

const KIND_LABEL: Record<string, string> = {
  work: 'Work',
  note: 'Note',
  meeting: 'Meeting',
  risk: 'Risk',
}

export default async function FridayPage() {
  const supabase = await createClient()
  const today = todayIso()
  /*
   * collectReports throws rather than reporting an empty week, because the
   * same function is what `saveReport` writes from. Here that is caught and
   * shown; the action deliberately does not catch it, so nothing is stored.
   */
  let reports
  try {
    reports = await collectReports(supabase, today)
  } catch (error) {
    if (error instanceof ReportDataError) return <QueryFailure message={error.message} />
    throw error
  }

  const week = reports[0]?.week ?? null

  return (
    <main>
      {/* Context band */}
      <div className="frame">
        <div className="lbl pl-5 lg:pl-16 py-3 pr-5 text-muted">
          {week ? `Week ${week.number}` : 'Weekly report'}
        </div>
        <div className="lbl border-l border-rule px-5 lg:px-10 py-3 text-muted">
          {reports.length} running{' '}
          {reports.length === 1 ? 'project' : 'projects'} ·{' '}
          {reports.filter((r) => r.saved?.submitted).length} reported
        </div>
        <div className="flex items-center justify-end gap-6 border-l border-rule py-3 pl-5 lg:pl-8 pr-5 lg:pr-16">
          {week && (
            <span className="lbl tabular-nums text-muted">
              {formatDate(week.start)} – {formatDate(week.end)}
            </span>
          )}
          <QuickAddTrigger />
        </div>
      </div>
      <Rule strong />

      {/*
        What this page is FOR, said before anything else.
        
        It used to say it in one line halfway down, and that line assumed you
        already knew what «the Power App» was. Somebody who does not read the
        page as four fields and some buttons, with no idea why those four.
      */}
      <div className="px-5 lg:px-16 pt-7">
        <p className="max-w-[640px] text-[13px] leading-relaxed">
          Every week UBS Projects wants{' '}
          <strong className="font-medium">four fields per running project</strong>,
          no more and no fewer. This writes them out of what is already here:
          what you logged, who you are waiting on, and where the dates stand.
          Copy each one across and mark it reported.
        </p>
        <p className="mt-2 max-w-[640px] text-[11.5px] leading-relaxed text-muted">
          Nothing is sent anywhere. The text is assembled from your log entries
          and never rewritten, so what comes out is as good as what went in. If a
          field reads thinly, the answer is a line on the project rather than an
          edit here.
        </p>
      </div>

      {reports.length === 0 && (
        <p className="px-5 lg:px-16 py-12 text-sm text-muted">
          No running projects to report on.
        </p>
      )}

      {reports.map((r, i) => (
        <section key={r.project.id}>
          {i > 0 && <Rule strong />}
          <div className="frame">
            {/* Left label column */}
            <div className="pl-5 lg:pl-16 py-8 pr-5">
              <div className="flex items-center gap-2">
                <span
                  className={`block size-[7px] shrink-0 ${
                    r.saved?.submitted ? 'bg-green' : 'border border-rule-strong'
                  }`}
                />
                <span className="lbl-tight">
                  {r.saved?.submitted ? 'Reported' : 'Not reported'}
                </span>
              </div>
              <p className="mt-2.5 text-[11px] leading-relaxed text-muted">
                {r.saved?.submitted
                  ? 'This week\u2019s report is saved here and marked as entered in the company system.'
                  : 'Copy the four fields into the Power App, then mark it below.'}
              </p>

              <div className="mt-4 text-[11px] leading-relaxed text-muted">
                Progress
                <br />
                <span className="num text-[20px] text-ink">{r.context.progressPct} %</span>
                <br />
                <span className="tabular-nums">
                  {r.context.leafDone} of {r.context.leafTotal} tasks
                </span>
              </div>

              <div className="mt-4 w-full">
                <ProgressScale done={r.context.leafDone} total={r.context.leafTotal} />
              </div>

              <div className="mt-5 text-[11px] leading-relaxed text-muted">
                Next date
                <br />
                {r.context.next ? (
                  <span className="text-ink">
                    {formatDate(r.context.next.due_date)}
                    <br />
                    <span
                      className={
                        r.context.next.days_until < 0 ? 'text-oxblood' : 'text-muted'
                      }
                    >
                      {r.context.next.days_until < 0
                        ? `${Math.abs(r.context.next.days_until)} days over`
                        : `in ${r.context.next.days_until} days`}
                    </span>
                  </span>
                ) : (
                  <span className="text-rule-strong">none</span>
                )}
              </div>

              <div className="mt-6 flex flex-col gap-2">
                <form action={saveReport}>
                  <input type="hidden" name="node_id" value={r.project.id} />
                  <input type="hidden" name="submitted" value="true" />
                  <button
                    type="submit"
                    disabled={r.fields.stage === null}
                    className="btn w-full"
                  >
                    {r.saved?.submitted ? 'Save again' : 'Mark reported'}
                  </button>
                </form>
                {r.fields.stage === null && (
                  <p className="text-[11px] leading-snug text-oxblood">
                    Choose a phase in the Stage field first. It cannot be derived.
                  </p>
                )}
                {r.saved?.submitted && (
                  <form action={unsubmitReport}>
                    <input type="hidden" name="id" value={r.saved.id} />
                    <button type="submit" className="btn btn-ghost w-full">
                      Undo
                    </button>
                  </form>
                )}
              </div>
            </div>

            {/* The fields, in the order the Power App asks for them */}
            <div className="border-l border-rule px-5 lg:px-10 py-8">
              <h2 className="font-display text-[30px] font-medium leading-tight tracking-[-0.01em]">
                <Link href={`/p/${r.project.id}`} className="hover:text-green">
                  {r.project.title}
                </Link>
              </h2>
              <p className="mt-2 text-[11px] text-muted">
                {r.since
                  ? `Since the last report on ${formatDateLong(r.since)}.`
                  : 'First report, so the whole history is included.'}{' '}
                {r.context.entries.length}{' '}
                {r.context.entries.length === 1 ? 'log entry' : 'log entries'} in the basis.
              </p>

              <div className="mt-6 flex flex-col gap-3.5">
                <CopyField label="Status" source="From the project's own status" value={r.fields.status}>
                  {r.fields.status}
                </CopyField>

                <CopyField
                  label="Stage"
                  source="The one field you choose"
                  value={r.fields.stage ?? ''}
                >
                  <StageSelect nodeId={r.project.id} stage={r.fields.stage} />
                </CopyField>

                <CopyField
                  label="Progress"
                  source="From open blockers and the next date"
                  value={r.fields.progress}
                >
                  <div className="flex items-baseline gap-3">
                    <span
                      className={
                        r.fields.progress === 'Off Track'
                          ? 'text-oxblood'
                          : r.fields.progress === 'At Risk'
                            ? 'text-ink'
                            : 'text-green'
                      }
                    >
                      {r.fields.progress}
                    </span>
                    <span className="text-[11px] text-muted">
                      {r.context.progressReason}
                    </span>
                  </div>
                </CopyField>

                <CopyField
                  label="Status comment"
                  source="From your log since the last report"
                  value={r.fields.comment}
                >
                  {r.fields.comment}
                </CopyField>
              </div>

              <p className="mt-5 max-w-2xl border-t border-rule pt-3.5 text-[11px] leading-relaxed text-muted">
                The text is assembled from your log entries and is not rewritten. If it should
                read differently, edit the entry on the{' '}
                <Link href={`/p/${r.project.id}`} className="text-green">
                  project page
                </Link>
                , not the report.
              </p>
            </div>

            {/* The basis */}
            <div className="border-l border-rule">
              <section className="py-8 pl-5 lg:pl-8 pr-5 lg:pr-16">
                <div className="lbl text-muted">What the text came from</div>
                {r.context.entries.length === 0 ? (
                  <p className="mt-3 text-[12.5px] text-muted">
                    No log entries in this period. Write a line with Ctrl+K so the report has
                    something to assemble.
                  </p>
                ) : (
                  <div className="mt-3.5">
                    {r.context.entries.map((e) => (
                      <div key={e.id} className="border-t border-rule py-2.5 last:border-b">
                        <div className="text-[10px] tabular-nums text-muted">
                          {formatDate(e.entry_date)} · {KIND_LABEL[e.kind] ?? e.kind}
                        </div>
                        <p className="mt-1 text-[12px] leading-relaxed">{e.body}</p>
                      </div>
                    ))}
                  </div>
                )}

                {r.context.blockers.length > 0 && (
                  <div className="mt-5">
                    <div className="lbl text-muted">And from the blockers</div>
                    <div className="mt-3">
                      {r.context.blockers.map((b) => (
                        <div
                          key={b.id}
                          className="flex items-baseline gap-3 border-t border-rule py-2.5 last:border-b"
                        >
                          <span
                            className={`num min-w-[34px] text-[20px] leading-none ${
                              b.overdue ? 'text-oxblood' : 'text-ink'
                            }`}
                          >
                            {b.days_blocked}
                          </span>
                          <span className="flex-1 text-[12px] leading-snug">
                            {b.title}
                            <span className="text-muted"> · {b.waiting_on}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>
              <Rule />

              <section className="py-7 pb-8 pl-5 lg:pl-8 pr-5 lg:pr-16">
                <div className="lbl text-muted">Previous report</div>
                {r.previous ? (
                  <div className="mt-3.5 border-t border-rule pt-3">
                    <div className="flex items-baseline justify-between">
                      <span className="text-[10px] tabular-nums text-muted">
                        {formatDate(r.previous.period_start)} –{' '}
                        {formatDateLong(r.previous.period_end)}
                      </span>
                      <span className="lbl-tight text-green">Reported</span>
                    </div>
                    <p className="mt-2 text-[12px] leading-relaxed text-muted">
                      {r.previous.body_markdown ??
                        String(r.previous.fields?.comment ?? '-')}
                    </p>
                  </div>
                ) : (
                  <p className="mt-3 text-[12.5px] text-muted">
                    No earlier report for this project.
                  </p>
                )}
              </section>
            </div>
          </div>
        </section>
      ))}
    </main>
  )
}
