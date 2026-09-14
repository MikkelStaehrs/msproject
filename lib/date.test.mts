import { DAY, addDays, daysBetween, isoDate, isPast, today, utc } from './date.ts'

let failed = 0
function check(name: string, got: unknown, expected: unknown) {
  if (JSON.stringify(got) === JSON.stringify(expected)) console.log(`ok    ${name}`)
  else {
    failed++
    console.log(
      `FAIL  ${name}\n      expected: ${JSON.stringify(expected)}\n      got:      ${JSON.stringify(got)}`,
    )
  }
}

/*
 * This file had no test, which is worth saying out loud: it is the one that
 * replaced four copies of the same arithmetic, and every day count, every wait,
 * every «since last time» and every stand-up boundary is computed from it. It
 * is also pure, so there was never a reason.
 */

// --- The ordinary cases -----------------------------------------------------
check('a day is a day', DAY, 86_400_000)
check('two days apart', daysBetween('2026-09-01', '2026-09-03'), 2)
check('the same day is zero, not one', daysBetween('2026-09-03', '2026-09-03'), 0)
check('backwards is negative', daysBetween('2026-09-03', '2026-09-01'), -2)
check('across a month', daysBetween('2026-08-30', '2026-09-02'), 3)
check('across a year', daysBetween('2025-12-30', '2026-01-02'), 3)

check('forward', addDays('2026-09-01', 3), '2026-09-04')
check('backward', addDays('2026-09-01', -3), '2026-08-29')
check('nowhere', addDays('2026-09-01', 0), '2026-09-01')
check('over the end of a month', addDays('2026-08-31', 1), '2026-09-01')
check('over the end of a year', addDays('2026-12-31', 1), '2027-01-01')

// --- February, because it is the one that catches a hand rolled calendar ----
check('a leap year has the 29th', addDays('2028-02-28', 1), '2028-02-29')
check('and an ordinary one does not', addDays('2026-02-28', 1), '2026-03-01')
check('counting over a leap day', daysBetween('2028-02-28', '2028-03-01'), 2)

/*
 * THE CASE THE WHOLE FILE IS SHAPED AROUND. Denmark puts the clocks forward on
 * 29 March 2026 and back on 25 October. Read in local time, one of those days
 * is 23 hours long and the other 25, so adding a day in milliseconds lands at
 * 23:00 the previous evening or 01:00 the next: an off by one that appears
 * twice a year, in one direction each time, and never on the developer's
 * machine in the week it is written.
 *
 * `utc()` parses at 00:00Z and `isoDate()` reads back in UTC, so no offset ever
 * enters the arithmetic. These four checks are what stops somebody
 * «simplifying» that into `new Date(y, m, d)`.
 */
check('over the spring change', addDays('2026-03-28', 2), '2026-03-30')
check('counting over the spring change', daysBetween('2026-03-28', '2026-03-30'), 2)
check('over the autumn change', addDays('2026-10-24', 2), '2026-10-26')
check('counting over the autumn change', daysBetween('2026-10-24', '2026-10-26'), 2)

// --- The two halves agree ---------------------------------------------------
check('a day survives the round trip', isoDate(utc('2026-09-03')), '2026-09-03')
check('and so does one in the other half of the year', isoDate(utc('2026-01-31')), '2026-01-31')

/*
 * `today()` cannot be checked against a value without freezing the clock, so
 * check the shape and the one relation that has to hold: yesterday is past and
 * tomorrow is not. A file that returned a timestamp rather than a day would
 * fail the first of these, and every comparison in the application is a string
 * comparison against exactly this shape.
 */
check('today is a plain ISO day', /^\d{4}-\d{2}-\d{2}$/.test(today()), true)
check('yesterday is past', isPast(addDays(today(), -1)), true)
check('today is not past', isPast(today()), false)
check('tomorrow is not past', isPast(addDays(today(), 1)), false)

console.log(failed === 0 ? '\nAll tests passed.' : `\n${failed} test(s) failed.`)
process.exitCode = failed === 0 ? 0 : 1
