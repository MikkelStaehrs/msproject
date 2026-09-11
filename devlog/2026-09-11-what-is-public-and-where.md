# What is public, and where

An inventory, so the decision about the two GitHub repos can be made against
facts rather than against yesterday's summary, which was right to raise this and
wrong about the size of it in both directions.

No code was changed. This is the part a person has to do, and it needs `gh` or
the GitHub web interface; neither is available to an agent here.

## The corrected picture

**Only one of the two repos carries the FY26 figures.**

| Repo | State | Carries the figures |
|---|---|---|
| `MikkelStaehrs/msproject` | the live `origin`, matches local history | **yes** |
| `MikkelStaehrs/MSProjects` | a stale snapshot, roughly 4 to 8 September | no |

Both answer 200 to an unauthenticated request, and `MASTER.md` is readable in
both. The second one predates the yardstick work: `lib/cogs.ts`,
`app/api/mcp/route.ts` and every migration from `20260909000001_membership`
onwards return 404 there. So it holds the schema and the design as they stood in
early September and none of the cost of goods material.

That also means it carries the schema from before membership, when every policy
was `auth.uid() is not null`. Not a live weakness, since the running database
has membership applied, but it is a public copy of the app from before
visibility existed.

## Where the figures sit in `msproject`

Seven tracked files at `HEAD` carry the figures, plus one that carries only the
euro rate. The values are not repeated here on purpose: this file should not
become the ninth.

| File | Occurrences | What it is |
|---|---|---|
| `supabase/migrations/20260910000001_yardstick.sql` | 9 | **The source.** Seeds the `yardstick` row and fourteen `stage_volume` rows: every process stage for FY25 and FY26, plus the unit cost, the IPC component, the hour rate and the euro rate |
| `app/(app)/guide/page.tsx` | 11 | The in-app guide, teaching the arithmetic with the real numbers |
| `MASTER.md` | 10 | The reasoning about the denominator, quoting the figures it reasons about |
| `supabase/migrations/20260910000007_cost_basis.sql` | 7 | The correction to `sold_units`, in comments |
| `lib/cogs.test.mts` | 5 | Test fixtures, labelled as the real dashboard figures |
| `supabase/migrations/20260910000008_target_scope.sql` | 5 | Scope comments |
| `lib/cogs.ts` | 4 | Comments explaining the two populations |
| `app/(app)/p/[id]/(shell)/cost/page.tsx` | 3 | The euro rate only, as a form default. Not company specific, and listed so a later sweep does not stop on it |

The migration is the awkward one. It is not a restatement, it is the insert that
puts the numbers in the database, and a migration that cannot be run is not a
record of intent. Emptying it means the yardstick row is typed into the SQL
editor by hand and the file carries a template, which is a real design change
rather than a redaction.

## Three commits, already pushed

`efc24cf`, `1d06bd3` and `5d14d4e` are all ancestors of `origin/main`. The
fourth, `31ce001`, is local only.

So editing the working tree does not undo this. The figures are in the published
history of a public repo, and only a history rewrite removes them from it, which
still cannot un-publish what may already have been cloned or indexed. **Making
the repo private is the only step that changes the exposure**, and it is the
reason this was left rather than patched.

## What to do, in order

1. **Make `MikkelStaehrs/msproject` private.** This is the one that matters.
2. **Decide what `MikkelStaehrs/MSProjects` is for.** It is a stale duplicate
   with no unique work in it. If nothing depends on it, deleting it removes a
   second thing to keep track of; if something does, it should be private too.
3. Only then is it worth deciding whether the repo should carry the figures at
   all going forward. The argument for moving them out is not secrecy once the
   repo is private, it is that `yardstick` and `stage_volume` are already the
   one place those numbers live, and the guide, the spec and the tests are three
   more copies that can come to disagree with the database. That is the project's
   own rule, and it is a better reason than this one.

## Worth knowing next time

**Yesterday's entry overstated it and understated it at once.** It said both
repos held near identical copies, which sent the concern at the wrong target,
and it named `MASTER.md` alone when the figures were in nine files including the
migration that seeds them. Checking what a remote actually serves takes one
`curl` per file and settles it; reasoning from the local checkout does not.

**An inventory should not restate what it inventories.** Yesterday's entry
quoted the figures while flagging them as exposed, which added a file carrying
them. It now refers to them by location instead.
