/**
 * Which of these am I writing?
 *
 * Five ways to record something and no stated rule, and the result was
 * measurable: two log lines in the whole database, both of the same kind, no
 * decisions at all and no cost lines. Faced with five buttons and no way to
 * tell them apart, the safe move is to write nothing, and writing nothing is
 * the one failure this application cannot survive.
 *
 * They do not overlap. Each is a different TENSE or a different SHAPE, and that
 * is the whole rule:
 *
 *   past          it happened                    a line in the log
 *   future        somebody will, by a date       agreed here
 *   suspended     we are waiting on someone      a blocker, counting days
 *   settled       we chose, and turned something down   a decision
 *   money         it costs something             a cost line
 *
 * One quiet line on the screens where all five are offered. It reads as
 * furniture after a week, which is exactly right: by then you know, and it has
 * stopped being in the way.
 */
export function WhichOne({ pricing = false }: { pricing?: boolean }) {
  const rules: [string, string][] = [
    ['It happened', 'write a line'],
    ['Somebody will, by a date', 'agreed here'],
    ['We are waiting on someone', 'new blocker'],
    ['We chose, and turned something down', 'record a decision'],
    ...(pricing ? ([['It costs money', 'price it']] as [string, string][]) : []),
  ]

  return (
    <p className="mt-2 text-[10.5px] leading-relaxed text-rule-strong">
      {rules.map(([when, then], i) => (
        <span key={when}>
          {i > 0 && <span className="mx-1.5">·</span>}
          <span className="text-muted">{when}</span> &rarr; {then}
        </span>
      ))}
    </p>
  )
}
