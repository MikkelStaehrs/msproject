/**
 * A query that fails must say so.
 *
 * Every page here binds with `data ?? []`, which turns a missing view into an
 * empty list and renders a page that looks fine and shows nothing. That is how
 * v_node_ready went unnoticed: the migration had rolled back, the tree drew no
 * sequence marks at all, and nothing anywhere said why.
 *
 * So the results are checked before they are used. A schema that is behind the
 * code is an error, not an empty state.
 *
 * EVERY read surface checks, not most of them. That is the point of writing it
 * down: the rule held on nine pages and was quietly missing from nine others,
 * and the ones it was missing from were not the harmless ones. The portfolio,
 * /blockers, the brief and the project frame all render «nothing here» from a
 * failed query, and the frame does it on every sub page at once.
 *
 * Two places deliberately do something else, and both say so where they do it:
 *
 * - `collectReports` THROWS instead, because its caller is not only a page. A
 *   report assembled from a failed read gets copied into the company system and
 *   stored as submitted, and a returned empty list cannot be told from a quiet
 *   week by the code that writes it.
 * - A project fetched with `.single()` is left to `notFound()`. PostgREST
 *   reports an absent row as an error, and a project you are not a member of is
 *   absent rather than broken.
 */
export function firstError(
  results: { error: { message: string } | null }[],
): string | null {
  return results.map((r) => r.error).find(Boolean)?.message ?? null
}

export function QueryFailure({ message }: { message: string }) {
  return (
    <main className="px-5 py-12 lg:px-16">
      <h1 className="font-display text-3xl">
        The database is not answering as expected
      </h1>
      <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-muted">
        Usually a migration in supabase/migrations that has not been applied yet.
      </p>
      <pre className="mt-4 overflow-x-auto border border-rule bg-sheet p-4 text-xs">
        {message}
      </pre>
    </main>
  )
}
