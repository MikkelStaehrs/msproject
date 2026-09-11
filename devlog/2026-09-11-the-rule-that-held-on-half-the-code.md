# The rule that held on half the code

## What happened

A full read of the repo against MASTER, plus the three verifying commands and a
check the audit does not make: all 36 migrations in `supabase/migrations/` are
recorded in `schema_migration`, with no extras on either side. The schema and
the files agree.

Two things came out of it. One is fixed (`b2838c9`), one is a person's job.

**`firstError` was stated in MASTER and kept on nine surfaces out of eighteen.**
That is worse than never having written it down, because the rule is there to be
pointed at and half the code quietly did not follow it. The missing nine were
the portfolio, `/blockers`, the brief, identity, documents, reports, templates,
the project frame and the weekly report.

Three of those are not pages, and that is where it actually bites. They are read
on the way IN, so an empty answer is not a quiet screen, it is a silent write:

- `collectReports` is what `saveReport` writes from, not just what `/friday`
  renders. A failed `entry` read gives a status comment with no work in it,
  which gets copied into the company system by hand and stored with `submitted`
  set and a `context` snapshot of zeroes.
- `readRecipients` is what `settleRecipient` canonicalises against. Empty, it
  stores «project board» next to the «Project Board» that already exists, which
  splits the one number `/blockers` exists to produce.
- The `(app)` layout read `profile` and then ran the first-run gate on the
  result. No rows means `me` is undefined, `me &&` is false, and the gate does
  not fire.

## Worth knowing next time

**A green audit does not cover this, and cannot.** `npm run audit` proves the
schema and the code agree; it says nothing about what a page does when a query
that exists nonetheless fails. The two halves are `npm test` for the arithmetic
and the audit for the schema, and this was in neither.

**`.single()` on the project node is deliberately outside the check.** PostgREST
reports an absent row as an error, so folding it in answers «the database is not
answering as expected» to what is really a 404, and a project you are not a
member of is absent rather than broken. `cost` and `grundlag` already had it
inside their `firstError` before today, so those two still answer that way.
Left alone rather than changed: it is a separate decision about 404 semantics on
four pages, not part of closing this.

**Where a failure is caught decides its shape.** A page returns
`<QueryFailure/>`; a function whose caller might write throws a named error.
`ReportDataError` and `RecipientDataError` exist so a caller can tell a schema
that is behind the code from a genuine fault, and `/friday` catches only the
first kind.

## Still open

- **Two public GitHub repos, and the FY26 figures are in one of them.** Counted
  and located in its own entry, `2026-09-11-what-is-public-and-where.md`, which
  refers to the figures rather than repeating them. Short version: only
  `MikkelStaehrs/msproject` carries them, they are in nine files including the
  migration that seeds them, and three of the commits are already pushed.
  Making that repo private is a person's decision and the only step that
  changes anything.
- **The branch is still not pushed**, and now carries three commits. Same cause
  as yesterday: the stored credential is `MikkelStaehr`, the repo belongs to
  `MikkelStaehrs`.
- **Audit check 6 is still not measured.** `AUDIT_PROBE_EMAIL` and
  `AUDIT_PROBE_PASSWORD` need a real second account that is deliberately not a
  member of at least one project. Sections 1 to 5 would all pass with membership
  completely broken, so this is the only one that measures it.
- **Six em dashes in source** against the house rule, two of them in text rather
  than as a placeholder glyph: `app/api/mcp/route.ts` in a list sent to a model,
  and `components/assessment.tsx` in UI. Left alone, they were not what this was
  about.
- **`lib/date.ts` has no test.** It is the file that replaced four copies of the
  same arithmetic, and it is pure.
