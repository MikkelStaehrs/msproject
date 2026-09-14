# The audit goes fully green, and the repo goes private

## What happened

**`MikkelStaehrs/msproject` is private.** Confirmed rather than assumed: an
unauthenticated call to the GitHub API returns 404 where it returned 200 this
morning. That closes the item four devlogs had raised, starting with
`2026-09-11-what-is-public-and-where.md`.

No special access was needed afterwards. The remote is HTTPS with a credential
already stored on the machine, and `git push --dry-run` answers as before.

**`MikkelStaehrs/MSProjects`, the stale duplicate, is still public and is
harmless.** Checked file by file rather than reasoned about: `MASTER.md` and
`README.md` return 200 with zero occurrences of the FY26 figures, and
`lib/cogs.ts` and the yardstick migration return 404 there. It holds the schema
and the design as they stood in early September and none of the cost material.
Worth deleting because two copies are two things to track, not because it is
exposing anything.

**Audit check 6 is measured, and the whole run is green for the first time.**
No "with N checks not measured" at the bottom.

## Worth knowing next time

**The missing credential was not missing, it was empty.** `.env.local` on this
machine had `AUDIT_PROBE_PASSWORD=` with nothing after it, and every summary
including my own had been reporting it as "missing". Those look identical in a
listing of key names and are different problems: one needs copying, the other
needs a password to exist at all. Print the length, not the presence.

**The env file was edited in the wrong checkout.** The move to `C:\dev` happened
this morning and the IDE still had the OneDrive copy open, so a freshly created
`SUPABASE_TOKEN` went into the folder nothing reads any more. Worth expecting
for a while: two checkouts of the same repo is exactly the situation
`2026-09-11-out-of-onedrive-and-mobile-first.md` warned about, and it is not
over until the OneDrive folder is deleted.

**A password was set on the existing probe rather than creating a second one.**
The offer on the table was to create a new account. `audit-probe@msproject.invalid`
already existed with the right shape - member of one project out of two, which
is the only shape that can measure anything - and a third account would have put
a second non-person into the role pickers for nothing. Setting a password on it
is a write to auth and it is recorded here as one: 32 random bytes, written
straight to `.env.local`, never printed.

**A probe that is a member of everything proves nothing**, and the audit says so
itself rather than passing. Whoever swaps this account for a colleague's later
has to keep that property.

## Still open

- **`MikkelStaehrs/MSProjects`** is still public. Stale, no figures, nothing
  unique in it. Deleting it is a person's job.
- **The OneDrive checkout still exists** and now differs from `C:\dev`: its
  `.env.local` is the one the IDE had open. Deleting it is the only thing that
  stops the next edit going to the wrong place.
- **The denominator is still the narrow one.** Unchanged, and now blocked rather
  than pending: the filtered figure needs a dashboard Mikkel does not have
  access to yet. The pages say «a floor, not the figure» in the meantime, and
  both errors flatter, so any percentage quoted from the screen is too high.
