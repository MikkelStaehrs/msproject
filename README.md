# Task Studio

A shared workspace for the projects a small team is running, built around one
idea: **nobody fills in a status report. You work, and the report writes
itself.**

It exists because the weekly status that has to be typed into a company system
is, in practice, a re-description of things already known — what moved, who you
are waiting on, what it will cost, where it stands. Anything derivable is
derived. If the same thing has to be written twice, that is treated as a design
fault rather than a chore.

You see the projects you are a member of and nothing else; that is enforced in
the database rather than in the interface, so a page that forgets to filter
still cannot leak.

[MASTER.md](MASTER.md) is the living spec: the data model, every decision and
the reason behind it. Read that before changing anything.

## Running it

```bash
npm install
npm run dev          # development
npm run build        # production build
npm start            # serve the build
```

`.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

A third variable, `SUPABASE_SERVICE_ROLE_KEY`, is used **only** by
`npm run audit`. The application itself never reads it. It bypasses row level
security, so it belongs in a local file and nowhere else — never with a
`NEXT_PUBLIC_` prefix, and never in a deployment's environment.

## Checking it

```bash
npm test             # the pure functions: dates, rollups, derivations
npm run typecheck    # tsc --noEmit
npm run audit        # the running database against the code that talks to it
```

`npm test` proves the arithmetic. `npm run audit` proves the other half: that
every column the code asks for exists, that nothing at all is readable without
logging in, that no row points at something deleted, and that every derived view
still agrees with an independent recomputation from the raw tables. It only
reads.

Run the audit after every migration. The schema is applied by hand, so the
migration files are a record of intent, not proof of state.

**Measuring isolation needs a second account.** Everything else the audit does
would still pass with the access model completely broken: proving a signed-OUT
request gets nothing says nothing about whether one colleague can read another
one's project. So set `AUDIT_PROBE_EMAIL` and `AUDIT_PROBE_PASSWORD` in
`.env.local` to a real account that is deliberately NOT a member of at least one
project, and the audit signs in as them and asks for what they must not have -
every node in the subtree, every blocker, entry, decision, cost line, document
and report hanging off it, and everyone else's sparks. It also checks the other
direction, that they can still read the projects they are on, because an audit
that only looks for leaks passes happily on a database nobody can read at all.

Without those two variables the section prints `----` and the verdict says how
many checks were not measured. A green line for a check that never ran is worse
than a missing one.

## The database

Migrations live in `supabase/migrations/`, applied in filename order through the
SQL editor in the Supabase dashboard. Each one ends by recording itself in
`schema_migration`, so that table is the answer to "what actually landed".

Every migration is written to survive being run twice.

> ### `supabase/seed.sql` deletes everything
>
> Its first statement is `delete from node`, and every other table cascades from
> it: the work log, blockers, decisions, cost lines, documents and reports all
> go with it. Files already in storage are left behind as orphans.
>
> It exists to fill an empty database with invented projects. **Never run it
> against a database that holds anything you want to keep.** There is no undo.

## Layout

| | |
|---|---|
| `app/(app)/` | the pages. `p/[id]/` is one project |
| `components/` | shared UI. Server components unless they need state |
| `lib/` | the logic worth testing, plus the server actions |
| `lib/*.test.mts` | run by `npm test` under Node's own TypeScript stripping |
| `scripts/audit.mts` | `npm run audit` |
| `supabase/migrations/` | the schema, in order |

One rule is worth stating on its own, because breaking it has caused more bugs
here than anything else: **a word that means one thing is computed in one
place.** Progress, blocked, waiting days, readiness, WBS codes and every total
in euro are derived, never stored. A column you can forget to set is not a
measurement.
