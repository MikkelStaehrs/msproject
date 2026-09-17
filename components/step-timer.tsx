'use client'

import { useEffect, useState } from 'react'

/**
 * How long this step has taken, against how long it is meant to take.
 *
 * Advisory and nothing else. It does not stop you, it does not warn you, and
 * going over turns the figure rust and changes nothing: a meeting that needs
 * eight minutes on blockers should spend eight minutes on blockers, and a timer
 * that argued would be a timer somebody turns off in week two.
 *
 * It resets when the step changes, because what it measures is this step and
 * not the meeting. It keeps nothing: a reload starts the step again, which is
 * honest about what it knows and cheaper than storing a clock.
 */
const MINUTES: Record<string, number> = {
  '1': 3,
  '2': 5,
  '3': 2,
  '4': 4,
  '5': 2,
  '6': 1,
  '7': 2,
}

export function StepTimer({ step }: { step: string }) {
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    setSeconds(0)
    const tick = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(tick)
  }, [step])

  const budget = (MINUTES[step] ?? 0) * 60
  const over = budget > 0 && seconds > budget

  const mm = Math.floor(seconds / 60)
  const ss = String(seconds % 60).padStart(2, '0')

  return (
    <span
      className={`mono text-[12px] tabular-nums ${over ? 'text-rust' : 'text-muted'}`}
      title={budget > 0 ? `${MINUTES[step]} minutes suggested` : undefined}
    >
      {mm}:{ss}
      {budget > 0 && <span className="text-rule-strong"> / {MINUTES[step]}:00</span>}
    </span>
  )
}
