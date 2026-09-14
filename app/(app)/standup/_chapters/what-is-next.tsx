import Link from 'next/link'
import { basisCoversTarget, type Reference } from '@/lib/cogs'
import type { Impact } from '@/lib/cogs'
import type { Quadrant } from '@/lib/priority'
import { formatDateLong } from '@/components/ui'
import type { Spark, Standup } from '@/lib/types'

/**
 * Chapter three: what is next.
 *
 * Everything in the spark inbox, the weighed ones first. It used to show only
 * the assessed and count the rest in a footnote, which produced an empty
 * chapter: nothing gets assessed until somebody sits down and does it, and
 * sitting down and doing it is what this chapter IS.
 *
 * Split out of `page.tsx` for reading rather than for speed. The page fetches
 * once for all three chapters and still does: the twelve queries run in one
 * `Promise.all`, so they cost one wait rather than twelve, and letting each
 * chapter fetch its own would buy a second round trip in exchange for nothing.
 * What it buys is a file somebody can hold in their head.
 */

/** One spark with everything worked out about it. Nothing here is stored. */
export type Weighed = {
  spark: Spark
  impact: Impact | null
  score: number | null
  where: Quadrant | null
}

const kr = (n: number) =>
  new Intl.NumberFormat('da-DK', { maximumFractionDigits: 0 }).format(n)

export function WhatIsNext({
  weighed,
  unweighed,
  reference,
  target,
  held,
  at,
  here,
}: {
  weighed: Weighed[]
  /** How many carry no figure at all, counted for the line at the bottom. */
  unweighed: number
  reference: Reference | null
  target: { eur: number; dkk: number } | null
  /** The stand-ups behind this one, newest first. */
  held: Standup[]
  at: (nodeId: string, extra?: string) => string
  here: (part: '1' | '2' | '3', extra?: string) => string
}) {
  return (
    <div className="frame [--frame-label:360px] [--frame-margin:330px] min-h-[60vh]">
      <div className="pl-5 lg:pl-16 py-8 pr-5">
        <h1 className="font-display text-[30px] font-medium leading-[1.06]">
          What is next
        </h1>
        <p className="mt-4 max-w-[26ch] text-[11px] leading-relaxed text-muted">
          Ranked by what each takes out of the year&rsquo;s target, so the
          last five minutes go on the biggest one rather than the newest.
        </p>
        {target && (
          <p className="mt-4 text-[11px] leading-relaxed text-rule-strong">
            The whole target is
            <br />
            <span className="num text-[17px] text-ink">{kr(target.dkk)} kr</span>
            <br />
            a year. A percentage here is a percentage of that.
          </p>
        )}
        {/*
          Two separate doubts, and this one is the broader. «A floor, not
          the figure» is about which population the denominator counts;
          this is about whether anybody has checked the denominator at all.
          Both can be true, and the second does not replace the first.
        */}
        {reference !== null && !reference.confirmed && (
          <p className="mt-3 max-w-[26ch] border-l-2 border-oxblood pl-2.5 text-[10.5px] leading-relaxed text-oxblood">
            And nobody has confirmed these figures against the dashboard
            they came from. Every percentage below inherits that.
          </p>
        )}
        {reference !== null && !basisCoversTarget(reference) ? (
          <p className="mt-3 max-w-[26ch] border-l-2 border-oxblood pl-2.5 text-[10.5px] leading-relaxed text-oxblood">
            A floor, not the figure. It is measured on{' '}
            <span className="font-medium">{reference.scope}</span> while the
            strategy covers{' '}
            <span className="font-medium">{reference.targetScope}</span>, so
            the target is too small and every percentage below is too large.
            <span className="mt-1.5 block text-rule-strong">
              Same dashboard, both brand codes selected, Type = Sugar: read
              Units and Unit Cost + IPC.
            </span>
          </p>
        ) : reference?.scope ? (
          <p className="mt-3 max-w-[26ch] text-[10.5px] leading-relaxed text-rule-strong">
            Measured on <span className="text-muted">{reference.scope}</span>,
            the slice the unit cost is computed over.
          </p>
        ) : null}
      </div>

      <div className="border-l border-rule px-5 lg:px-10 py-8">
        {weighed.length === 0 ? (
          <p className="text-[13px] text-muted">
            No idea has a figure on it yet.{' '}
            <Link href="/spark" className="text-green">
              Assess one
            </Link>{' '}
            and it will be ranked here.
          </p>
        ) : (
          weighed.map(({ spark, impact, score, where }) => (
            <div key={spark.id} className="border-t border-rule py-4 last:border-b">
              <div className="flex items-baseline gap-5">
                <span
                  className={`num min-w-[72px] shrink-0 text-[26px] leading-none ${
                    (impact?.shareOfTarget ?? 0) >= 0.1 ? 'text-green' : 'text-ink'
                  }`}
                >
                  {impact ? `${(impact.shareOfTarget * 100).toFixed(1)}%` : '—'}
                </span>
                <div className="flex-1">
                  <p className="max-w-prose text-[14px] leading-relaxed">{spark.body}</p>
                  <div className="lbl-tight mt-2 flex flex-wrap gap-x-4 gap-y-1 text-muted">
                    {impact && (
                      <span className="num">{kr(impact.annualDkk)} kr a year</span>
                    )}
                    {where && <span>{where}</span>}
                    {score !== null && (
                      <span className="num text-rule-strong">priority {score}</span>
                    )}
                    <Link href="/spark" className="text-rule-strong hover:text-ink">
                      Open the inbox
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}

        {unweighed > 0 && (
          <p className="mt-5 text-[11.5px] leading-relaxed text-rule-strong">
            {unweighed} more {unweighed === 1 ? 'spark has' : 'sparks have'} no
            figure yet and cannot be ranked. An empty assessment is not zero,
            it is not worked out.{' '}
            <Link href="/spark" className="text-green">
              Inbox
            </Link>
          </p>
        )}
      </div>

      <div className="border-l border-rule py-8 pl-5 lg:pl-8 pr-5 lg:pr-16">
        <h2 className="font-display text-[24px] font-medium">Held before</h2>
        {held.length === 0 ? (
          <p className="mt-3.5 text-[12.5px] text-muted">
            None yet. Until one is recorded, chapter one covers the whole
            history rather than a week.
          </p>
        ) : (
          <div className="mt-3.5">
            {held.map((h) => (
              <div key={h.id} className="border-t border-rule py-2.5 last:border-b">
                <div className="text-[11px] tabular-nums text-muted">
                  {formatDateLong(h.held_on)}
                </div>
                {h.note && (
                  <p className="mt-1 text-[12px] leading-relaxed">{h.note}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
