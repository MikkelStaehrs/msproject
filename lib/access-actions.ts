'use server'

import { createClient } from '@/lib/supabase/server'

/**
 * Asking for a way in.
 *
 * The only write in this application that happens without a session. It runs
 * through the ordinary anon client on purpose: the database decides what that
 * is allowed to do, the policy lets it put one unanswered row in and read
 * nothing back, and this file holds no key that could do more.
 *
 * It returns a message rather than redirecting, because the login screen is
 * the one page where being thrown somewhere else is the whole problem. The
 * person is already in the state of not knowing where they are.
 */
export async function requestAccess(
  _prev: string | null,
  fd: FormData,
): Promise<string | null> {
  const name = String(fd.get('full_name') ?? '').trim().replace(/\s+/g, ' ')
  const email = String(fd.get('email') ?? '').trim().toLowerCase()
  const reason = String(fd.get('reason') ?? '').trim()

  if (name === '') return 'A name, so whoever reads this knows who asked.'
  if (!email.includes('@')) return 'An email address that works, so a reply can reach you.'

  const supabase = await createClient()

  const { error } = await supabase.from('access_request').insert({
    full_name: name.slice(0, 120),
    email: email.slice(0, 320),
    reason: reason === '' ? null : reason.slice(0, 600),
  })

  if (error) {
    /*
     * 23505 is the one open ask per address. Saying «you have already asked»
     * is both true and the useful thing to say, and it gives nothing away:
     * this reply is about the address the person just typed, which they know,
     * and not about whether that address has an account, which they must not
     * learn from a form on the public side of a login.
     */
    if (error.code === '23505') {
      return 'That address has already asked and has not been answered yet. It is with somebody.'
    }
    /*
     * A check constraint means something was too long or the wrong shape, and
     * the fields above have already said so in words. Anything else is ours
     * rather than theirs, so it is not spelled out here: a person locked out
     * of an application cannot act on a Postgres error and the login screen is
     * reachable by anyone.
     */
    return 'That did not go through. Try again, and if it keeps failing the application is at fault rather than you.'
  }

  return 'sent'
}
