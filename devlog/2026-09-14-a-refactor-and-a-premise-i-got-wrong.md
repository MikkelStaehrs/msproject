# A refactor, and a premise I got wrong before starting

## What happened

Surveyed first, changed second. Build, typecheck, seventeen test files and the
audit were green at the start and are green at the end, so everything here is
shape rather than repair.

**The checkout moved to `C:\dev\MSProjects`.** It did not exist on this machine
and work was happening in the OneDrive copy, with a `tsconfig-gfd-3V32KD4.tsbuildinfo`
already sitting in its root: the same conflict pattern that once got nine files
committed. Cloned fresh from `origin` rather than copied, so nothing stale came
along, and the OneDrive folder is deliberately left for a person to delete.

**`projectOf()` in `lib/subtree.ts`** (`ba460bd`). Five places built the node to
project map by hand and each paid a round trip to `v_node_descendant` for it.
That is the exact thing the top of `lib/subtree.ts` says is the wrong answer,
and the file had been written to prevent it. The audit counts 70 distinct
selects where it counted 71.

**The stand-up split into three chapter files** (`e539fd6`), and `Moved` deleted
with it: it rendered the three columns of chapter one before that chapter became
one line, and had been dead since.

**One `kroner()` formatter** and a test for `lib/date.ts` (`e58f3e2`).

## Worth knowing next time

**I proposed the stand-up split on a wrong premise, and checked it before
moving 1200 lines.** The pitch was that each chapter should fetch its own data
so chapter one stops paying for chapter three's sparks. But the twelve queries
run in one `Promise.all`: they cost ONE wait, not twelve. Splitting the fetch
would have added a second round trip, since the shell must fetch before it can
decide what to render, and the chapter nav shows counts from all three chapters
anyway, so the shell would still have fetched almost everything. The readability
problem was real and the performance problem was invented. The split happened;
the fetch stayed where it was.

Total lines went UP by about 200, which is the honest price: props have to be
named where they used to be in scope. The rendered bundle is unchanged.

**A sweep for dead code that only looks at `export` misses local components.**
`Moved` had been dead for days and an earlier sweep reported none, because it
only asked which exports nothing imports. Local functions need a second pass,
and the obvious version of that pass has false positives: a plain function is
called as `name(`, a component as `<Name`. Checking for the wrong one reports
five healthy helpers as dead.

**Four copies of a one line formatter had already disagreed.** Three left the
«kr» to the call site and one put it inside. Same rendered output, so nothing
looked wrong; the next edit picks up whichever convention it reads first. This
is `lib/date.ts`'s rationale happening again, which is why the fix went to the
same kind of place.

**`lib/date.ts` now has the DST cases.** They are the reason the file reads UTC
end to end, and they are the ones that never fail on the machine the code is
written on: twice a year, one direction each time.

## Still open

- **Two public GitHub repos, one carrying the FY26 figures.** Unchanged from
  `2026-09-11-what-is-public-and-where.md`, which has the inventory and the
  order to do it in. Four devlogs have now raised it. It is a person's decision
  and nothing an agent does changes it.
- **This machine's `.env.local` has three keys.** `SUPABASE_TOKEN`,
  `AUDIT_PROBE_EMAIL` and `AUDIT_PROBE_PASSWORD` are missing, so `npm run
  migrate` cannot run here and audit check 6 reports as not measured. They exist
  on the other machine.
- **The denominator is still the narrow one**, and the euro rate is still
  accepted rather than verified. Both unchanged from
  `2026-09-11-narrowing-the-thing-and-three-times-i-was-wrong.md`.
- **Nine non-null assertions** in `app/` and `components/`. All of them are
  guarded by a `.filter()` or a correlation TypeScript cannot narrow through, so
  none is a bug. A type predicate would remove the assertion and the doubt at
  the same time, and nothing was broken enough to justify touching it today.
- **`app/(app)/guide/page.tsx` is 1950 lines.** It is a document rather than
  logic, and splitting a document by section mostly moves the problem. Left.
