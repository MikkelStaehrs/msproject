# The access model, measured at last, and the audit's own blind half

## What happened

Section 6 of `npm run audit` has printed `----` since the day it was written. It
now runs, both halves, and passes. That is the first time the thing this
application most depends on has been measured rather than read.

It needed an account, so there is one: `audit-probe@msproject.invalid`, created
through the Supabase admin API, credentials in `.env.local`. It is a member of
`Digitalization of the Production Lines` and deliberately not of
`Seed Database`.

`past_verdicts` was also exercised with data rather than only down its empty
path, using a spark created already in `dropped` so it never appeared in the
inbox, then removed.

## Worth knowing next time

**The audit was doing the exact thing it exists to prevent.** The positive half
of section 6, «and they can still read the projects they ARE on», ran inside
`if (allowed.size > 0)`. The first probe account was a member of nothing, so
that block was skipped: no `ok`, no `FAIL`, and no `----` either. It simply was
not there, and the verdict read «The database and the code agree».

So the one check that measures the access model reported success while half of
it had never run, in a file whose own comment says a check that cannot run must
not print like a check that passed. The third state existed and was applied to
everything except the audit itself. It now says `----` and explains what the
account needs to be.

**A probe on no project cannot tell a working policy from a broken one.** With
zero memberships, every «comes back empty» is satisfied by a database that
refuses everybody. The account has to be on at least one project AND off at
least one, or one of the two halves is measuring nothing. The README said only
the second half of that requirement, which is how the first run came to be set
up wrong.

**The probe account is visible in the interface.** `profile` is mirrored from
`auth.users` by a trigger and read by `knownPeople`, so the address appears in
the role pickers alongside real colleagues. That is the cost of using a real
account, which is also the only thing that can measure anything here. It is
named so nobody mistakes it for a person. A real second colleague's account
would do the job without that cost, and would be better once there is one.

## Still open

- **Two public GitHub repos.** Unchanged from
  `2026-09-11-what-is-public-and-where.md`, and every commit today has gone into
  one of them.
- The probe account could be swapped for a colleague's once somebody else is
  actually using this, which removes the stray name from the pickers.
