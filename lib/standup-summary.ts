import type { Summary } from '@/lib/standup-close'

/**
 * The sponsor's copy of a meeting, in markdown.
 *
 * Assembled from the stored snapshot and from nothing else, so it says what the
 * meeting said rather than what is true now. That is the point of it: somebody
 * pasting this into an email three days later is quoting a meeting, and a
 * paragraph that had quietly updated itself in between would be a quote of
 * something nobody said.
 *
 * It is the same shape as the status comment the Friday report builds, and for
 * the same reason: what happened first, what is waiting second, with the party
 * waited on named. Not the same function, because that one reads log entries
 * and this one reads a snapshot, and forcing one to do both would mean the
 * report started depending on meetings having been held.
 *
 * NAMES, NOT IDS. The snapshot stores ids so its rows can be opened; a person
 * reading this cannot open anything, so `nameOf` is handed in.
 */
export function sponsorNote(
  summary: Summary,
  nameOf: (id: string) => string,
  heading: string,
): string {
  const lines: string[] = [`# ${heading}`, '']

  if (summary.present.length > 0) {
    lines.push(`**In the room:** ${summary.present.map(nameOf).join(', ')}`, '')
  }

  const say = (title: string, rows: string[]) => {
    if (rows.length === 0) return
    lines.push(`## ${title}`, '')
    for (const r of rows) lines.push(`- ${r}`)
    lines.push('')
  }

  say(
    'Done',
    summary.finished.map((f) => f.title),
  )

  say(
    'Came unstuck',
    summary.blockers.resolved.map((b) => `${b.title} — ${b.resolution}`),
  )

  /*
   * How many meetings a thing has been read out in is the one figure in here
   * that argues for something. It is why it is quoted rather than summarised:
   * «four stand-ups» is an escalation, «still waiting» is a shrug.
   */
  say(
    'Still waiting',
    summary.blockers.carried.map(
      (b) =>
        `${b.title} — waiting on ${b.waitingOn}, ${b.standups} ${
          b.standups === 1 ? 'stand-up' : 'stand-ups'
        }${b.nextStep ? `. Next: ${b.nextStep}` : ''}`,
    ),
  )

  say(
    'Agreed before next time',
    summary.commitments.map(
      (c) =>
        `${c.title}${c.driverId ? ` — ${nameOf(c.driverId)}` : ''}${
          c.dueDate ? `, by ${c.dueDate}` : ''
        }`,
    ),
  )

  say(
    'Decided',
    summary.decisions.map((d) => d.decision),
  )

  say(
    'Not done from last time',
    summary.missed.map((m) => m.title),
  )

  /*
   * Parked work is in here and sparks are not. A parked task is a commitment to
   * come back on a date, which a sponsor may want to hold you to; a spark is a
   * half thought belonging to one person, and counting them says nothing worth
   * reading.
   */
  say(
    'Put off on purpose',
    summary.parked.map((p) => `${p.title} — until ${p.until}`),
  )

  if (summary.lines > 0) {
    lines.push(`${summary.lines} lines were written on the work in this period.`, '')
  }

  return lines.join('\n').trimEnd() + '\n'
}
