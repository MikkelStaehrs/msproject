# Working in this repo

[MASTER.md](MASTER.md) is the living spec: the data model and every decision with
the reason behind it. Read the section you are about to touch before touching it.
This file is only the part an agent needs before the first edit.

Work happens on several machines with several agents. Anything learned that the
next one would need goes in [devlog/](devlog/README.md), because an agent's own
memory does not travel between machines and this repo does.

## Verifying

Three commands, and all three have to pass before work is called done:

```bash
npm run build       # also type checks
npm run typecheck
npm run audit       # holds the live database up against the code
```

`npm run audit` is the one that matters most and the one that is easiest to
forget. It reads the live schema through PostgREST and checks that every select
the code makes still answers, that nothing is readable without a session, that
every view agrees with a recomputation from the raw tables, and that every closed
set is a real enum matching `lib/types.ts`. It only reads.

`npm run typecheck` reports invented errors when `.next` is missing, including
`next/font/google has no exported member 'Archivo'`, because Next generates the
font and route types into it. Run a build first, then believe it.

## Migrations are applied by hand

There is no database password, only an anon key and a personal access token, so
migrations are pasted into the Supabase SQL editor by a person. The files in
`supabase/migrations/` are a record of intent, not proof of state.

**Never assume a migration has been applied.** `schema_migration` records what has
actually reached the database, and every migration ends by inserting its own
version as its last statement. A missing table that exists in a migration file is
almost always an unapplied migration rather than a bug in the code.

Write migrations so they survive being run twice, or half. They are applied by
hand, and a hand slips.

## The UI is mobile first

Base styles are the phone; `sm:` and `lg:` layer the wider layouts on top. There
is one structural breakpoint, **`lg` (1024px)**, because the three column page
frame needs about a thousand pixels before its middle column is readable.

- **`.frame` and `.frame-pair`** in `app/globals.css` are the page frame, not a
  grid spelled out at the call site. One column below `lg`, and the rules
  separating the columns turn from vertical to horizontal at the same breakpoint.
  Override the right column per page with `[--frame-margin:340px]`.
- **Numeric grids run one stair:** `grid-cols-1 sm:grid-cols-2 lg:grid-cols-N`,
  and every `col-span-N` moves with its parent as
  `col-span-1 sm:col-span-2 lg:col-span-N`. A bare `col-span-4` in a one column
  grid invents implicit columns rather than clamping, so the two always change
  together.
- **Tables stack with `lg:contents`.** The row is `grid-cols-1` on a phone and the
  measures wrap onto a line of their own, each carrying an `lg:hidden` label
  repeating what the column header would have said; the wrapper becomes
  `contents` at `lg` so the original column grid lays them out untouched. The
  header row is `hidden ... lg:grid`. See the portfolio table in
  `app/(app)/projects/page.tsx`.
- **Touch sizing is keyed to the pointer, not the window.**
  `@media (pointer: coarse)` raises `.field` to 16px, because anything smaller
  makes Safari zoom on focus and never zoom back, and gives `.btn` a 44px target.
  A narrow window on a laptop is still a mouse and keeps the editorial 13px.
- Narrow fixed tracks are left alone on purpose. A 132px label fits a phone, and
  stacking a short label above its value only wastes a line.

## House rules

From MASTER.md, repeated here because they are the ones broken by accident:

- Server Components by default. `'use client'` only where there is interactivity
- No computed value is stored in a column. Progress, day counts and "since last"
  are views, and derived fields are never editable in the UI
- Keyboard first: quick entry must be completable without a mouse
- English UI text
- No em dashes. Use a comma, a colon or a full stop
- The data model must stay movable to MSSQL: no Postgres specifics beyond `jsonb`
  and recursive CTEs, no extensions, no array columns

## Keep the checkout out of synced folders

`node_modules` and `.next` must never sit inside OneDrive or any other syncing
folder. The sync client turns files into cloud placeholders, and webpack's asset
phase reads many at once and fails on them with
`UNKNOWN: unknown error, read` from `readFileSync`, naming only `node_modules`.
It reads exactly like a compile error and is not one.

Worse, a sync client that sees two machines touch the same file writes a conflict
copy beside it, leaves the original at its old content, and a session's work can
disappear without anything reporting an error. That has happened here once, and
`.gitignore` now carries `*-gfd-*.tsx` so the copies cannot be committed. That
does not save the edits.

The checkout lives at `C:\dev\MSProjects` on Mikkel's machine for this reason.
**Commit early and often.** Work is only safe once it is in git.
