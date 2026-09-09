import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Refreshes the Supabase session on every request and sends unauthenticated
 * users to /login. Single user app: everything sits behind the login.
 *
 * This runs before every page, so anything that throws in here takes the whole
 * site down rather than one route. It used to do exactly that. The two
 * environment variables were read with a non-null assertion, which is a promise
 * to the compiler and not a fact: on the first deployment they were not in the
 * build, `createServerClient` threw, and every URL answered
 * MIDDLEWARE_INVOCATION_FAILED with a blank page that said nothing about which
 * variable was missing.
 *
 * So the two ways this can fail are now separated and both say what happened.
 * Neither of them lets anyone in: a request that cannot be checked is refused,
 * not waved through.
 */

function plainly(status: number, heading: string, detail: string) {
  return new NextResponse(
    `<!doctype html><meta charset="utf-8">` +
      `<title>${heading}</title>` +
      `<style>body{font:15px/1.6 system-ui,sans-serif;margin:12vh auto;max-width:34rem;` +
      `padding:0 1.5rem;color:#1a1a1a}h1{font-size:1.15rem;margin:0 0 .75rem}` +
      `code{background:#f0efec;padding:.1rem .3rem}p{margin:.75rem 0}</style>` +
      `<h1>${heading}</h1>${detail}`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8' } },
  )
}

export async function updateSession(request: NextRequest) {
  /*
   * A deployment problem, not a runtime one. Worth saying out loud, because the
   * cause is almost always the same and is not guessable from a 500: the values
   * are baked in when the site is built, so setting them in the dashboard does
   * nothing to the build already running.
   */
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Names only. A message from here is public, so no value ever goes in it.
  const missing = [
    !url && 'NEXT_PUBLIC_SUPABASE_URL',
    !key && 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  ].filter((m): m is string => typeof m === 'string')

  if (!url || !key) {
    return plainly(
      500,
      'This deployment has no database configuration',
      `<p>Missing: ${missing.map((m) => `<code>${m}</code>`).join(', ')}</p>` +
        `<p>These are read when the site is <strong>built</strong>, not when it ` +
        `runs. Setting them after a build leaves that build with nothing, so ` +
        `set them for the Production environment and then redeploy.</p>`,
    )
  }

  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    url,
    key,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value)
          }
          response = NextResponse.next({ request })
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }
        },
      },
    },
  )

  /*
   * Cannot reach the auth service: no network, Supabase down, a paused project.
   *
   * This deliberately does NOT redirect to /login. Being sent to a login form
   * that then also fails reads as "you are logged out", which is both wrong and
   * the most confusing thing the app could say five minutes before a meeting.
   * It also does not let the request through: a session that cannot be checked
   * has not been checked.
   */
  let user = null
  try {
    const { data } = await supabase.auth.getUser()
    user = data.user
  } catch {
    return plainly(
      503,
      'Cannot reach the sign-in service',
      `<p>The application is running, but it could not check your session. ` +
        `That is a connection or a Supabase problem, not a wrong password.</p>` +
        `<p>Nothing has been lost. Try again in a moment.</p>`,
    )
  }

  /*
   * /auth/callback has to run without a session, because creating one is its
   * whole job: it trades the code in an invitation or reset link for it. Sent
   * to /login instead, an invited colleague would arrive at a password prompt
   * for a password they have never been given.
   */
  const open =
    request.nextUrl.pathname.startsWith('/login') ||
    request.nextUrl.pathname.startsWith('/auth/')

  if (!user && !open) {
    const login = request.nextUrl.clone()
    login.pathname = '/login'
    return NextResponse.redirect(login)
  }

  return response
}
