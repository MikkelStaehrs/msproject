'use client'

import { useEffect, useState } from 'react'

/**
 * The masthead. The one centred component in the whole application.
 *
 * A clock on a server page is a lie twice over: the server's hour is UTC and
 * the page is read for longer than a minute. So the first paint carries the
 * wall clock of the place the page is read in, handed down from the server as
 * one string, and the browser takes over the moment it mounts and corrects it
 * every twenty seconds after that. The server and the first client render draw
 * the same string, which is what keeps hydration quiet.
 *
 * `wall` is a local time with no zone: `2026-09-15T14:32`. Parsed as local on
 * both sides, its fields read the same whatever zone either side sits in.
 */

const MONTH = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** ISO 8601: the week holding the year's first Thursday is week one. */
function isoWeek(d: Date) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7))
  const jan1 = Date.UTC(t.getUTCFullYear(), 0, 1)
  return Math.ceil(((t.getTime() - jan1) / 86_400_000 + 1) / 7)
}

/** Monday 15 September. The long form, because the masthead has the room. */
function longDate(d: Date) {
  return `${WEEKDAY[d.getDay()]} ${d.getDate()} ${MONTH[d.getMonth()]}`
}

function greeting(hour: number) {
  if (hour < 5) return 'Still up'
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

/** The wall clock the page was rendered with, ticking after mount. */
function useNow(wall: string) {
  const [now, setNow] = useState(() => new Date(wall))
  useEffect(() => {
    const tick = () => setNow(new Date())
    tick()
    const t = setInterval(tick, 20_000)
    return () => clearInterval(t)
  }, [])
  return now
}

export function OverviewMasthead({
  first,
  wall,
  children,
}: {
  /** The signed-in first name. */
  first: string
  wall: string
  /** The line under the greeting, derived on the server from the day's list. */
  children?: React.ReactNode
}) {
  const now = useNow(wall)
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')

  return (
    <div className="flex flex-col items-center px-[var(--gut)] pb-8 pt-9 text-center md:pb-[52px] md:pt-14">
      <h1 className="m-0 text-[34px] font-semibold leading-[1.1] tracking-[-0.03em] text-green [text-wrap:balance]">
        {greeting(now.getHours())}, {first}
      </h1>
      {children}
      <div className="mt-7 md:mt-[42px]">
        <b className="mono block text-[56px] font-medium leading-[0.82] tracking-[-0.045em] text-green md:text-[88px]">
          {hh}:{mm}
        </b>
        <div className="mt-[18px] flex flex-wrap items-baseline justify-center gap-4">
          <span className="lbl text-muted">{longDate(now)}</span>
          <span className="lbl text-muted">Week {isoWeek(now)}</span>
        </div>
      </div>
    </div>
  )
}

/** The same day, written small, wherever a section needs to say which day it is about. */
export function OverviewDate({ wall }: { wall: string }) {
  const now = useNow(wall)
  return <>{longDate(now)}</>
}
