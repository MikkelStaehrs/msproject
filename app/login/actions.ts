'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

/**
 * Signing in, and saying which thing went wrong.
 *
 * It used to answer every failure with «check your email and password», which
 * is the right thing to say to exactly one of them and actively wrong for the
 * commonest. An invited colleague who has not opened their invitation has an
 * account with no password and an unconfirmed address; told to check their
 * password, they will try it again, and again, because the screen has told
 * them the problem is something they can fix by typing more carefully.
 *
 * WHAT IS AND IS NOT WORTH HIDING. A wrong password stays vague on purpose:
 * distinguishing «no such account» from «wrong password» on a form anyone can
 * reach turns it into a way of asking which of your colleagues has a login.
 * «This account has not been opened yet» gives nothing away that the person
 * standing there does not already know, because they are the one holding the
 * invitation, and it is the difference between a two minute fix and a
 * fortnight of trying.
 */
export async function login(_prev: string | null, formData: FormData) {
  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get('email') ?? ''),
    password: String(formData.get('password') ?? ''),
  })

  if (error) {
    /*
     * The code is newer than the message and not on every version, so both are
     * read. Matching on the message alone breaks silently when Supabase
     * rewords it, which is the kind of break nobody notices for months.
     */
    const code = error.code ?? ''
    const said = error.message.toLowerCase()

    if (code === 'email_not_confirmed' || said.includes('not confirmed')) {
      return (
        'That account has not been opened yet. The invitation email carries ' +
        'the link that sets your password, and until it is followed there is ' +
        'no password to get right. Ask for a new link below if it has expired.'
      )
    }

    if (code === 'over_request_rate_limit' || error.status === 429) {
      return 'Too many attempts. Wait a minute and try once more.'
    }

    if (code === 'user_banned') {
      return 'That account has been closed. An administrator can reopen it.'
    }

    return 'That did not work. Check the address and the password.'
  }

  revalidatePath('/', 'layout')
  redirect('/')
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}
