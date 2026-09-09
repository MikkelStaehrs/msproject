import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { EmailOtpType } from '@supabase/supabase-js'

/**
 * Where every link in an email lands.
 *
 * An invitation, a password reset and an email confirmation are all the same
 * shape: a one-time credential in a URL that has to be traded for a session
 * before anything else can happen. Without this route those links go nowhere,
 * which is exactly what they did until now: a colleague could be invited from
 * the Supabase dashboard, would click the link, and would arrive at a login
 * form asking for a password nobody had given them.
 *
 * Two forms arrive here, and which one depends on the email template rather
 * than on anything decided in this codebase, so both are handled.
 *
 *   ?code=...                     the PKCE flow
 *   ?token_hash=...&type=invite   the default Supabase templates
 *
 * An invitation and a recovery both mean the same thing to a person: they are
 * about to choose a password. So both end at /auth/password rather than at the
 * front page, where they would be signed in and none the wiser.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl

  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null

  const supabase = await createClient()

  let failed: string | null = null

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    failed = error?.message ?? null
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
    failed = error?.message ?? null
  } else {
    failed = 'That link carried nothing to sign in with.'
  }

  if (failed) {
    /*
     * These links expire, and they are single use. Landing on the login form
     * with no explanation is the worst version of that, because the honest
     * cause is "this link has already been used or has timed out" and not
     * "you got your password wrong".
     */
    const url = new URL('/login', origin)
    url.searchParams.set('link', failed)
    return NextResponse.redirect(url)
  }

  // A password link means choosing a password. Anything else is just a sign in.
  const choosing = type === 'invite' || type === 'recovery' || code !== null
  return NextResponse.redirect(new URL(choosing ? '/auth/password' : '/', origin))
}
