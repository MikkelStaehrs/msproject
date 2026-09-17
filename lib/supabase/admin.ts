import 'server-only'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * The one client that is not the person using the application.
 *
 * Everything else in this codebase reaches Supabase through the session in the
 * cookie, so RLS decides what comes back and a mistake in a query is a page
 * that shows too little. This client holds the service role key, which is
 * exempt from every policy in the schema, so a mistake in a query here is a
 * page that shows somebody else's work. It is not a client to reach for
 * because it is convenient.
 *
 * It exists because two things cannot be done without it and both are the
 * point of the admin module:
 *
 *   - creating a user, which is what inviting somebody is
 *   - deleting one
 *
 * Both live in the Auth admin API, which the anon key cannot reach at all.
 * There is no policy that would grant it and no shape of migration that would
 * avoid it: auth.users is not exposed through PostgREST, deliberately.
 *
 * The rules this file exists to enforce, in order of how easily they are lost:
 *
 * 1. NOTHING IMPORTS THIS EXCEPT lib/admin-actions.ts. `server-only` stops it
 *    reaching a client bundle, which is the catastrophic version; the rest is
 *    a matter of keeping the import list short enough to read.
 * 2. EVERY CALLER CHECKS is_admin FIRST, through `requireAdmin` in that file,
 *    before this is ever constructed. A server action is a public HTTP
 *    endpoint with a hard-to-guess name and nothing more.
 * 3. IT NEVER RENDERS A SCREEN. The admin pages read through the ordinary
 *    session client under `is_admin()` policies, so they are subject to the
 *    same gate as every other page here. What this client touches is the
 *    short list of things no session can: auth.users, the one column no
 *    session may write (`is_admin`), and the one question no session can
 *    answer truthfully, which is whether taking somebody off a project would
 *    leave that project with no members at all. An administrator only sees
 *    the memberships of projects they are on themselves, so asking that
 *    through their session would answer «no» about a project they cannot see
 *    and hide it from everyone for good.
 *
 * The key is a Vercel environment variable now as well as a line in
 * .env.local. That is a change in what a compromise of this deployment would
 * cost, and it was made knowingly: before this file the application could not
 * create the accounts it spends all day talking about.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  /*
   * Named rather than asserted, like the other two clients, and for a sharper
   * reason here: this variable is not `NEXT_PUBLIC_`, so it is read at request
   * time rather than baked in at build. A deployment missing it builds and
   * serves perfectly and then fails on the one button that needs it, which
   * without this message reads as "inviting is broken".
   */
  if (!url || !key) {
    throw new Error(
      'Missing ' +
        [!url && 'NEXT_PUBLIC_SUPABASE_URL', !key && 'SUPABASE_SERVICE_ROLE_KEY']
          .filter(Boolean)
          .join(' and ') +
        '. The service role key is needed to create and delete accounts, and ' +
        'it must be set for the Production environment in Vercel, not only in ' +
        '.env.local.',
    )
  }

  return createSupabaseClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
