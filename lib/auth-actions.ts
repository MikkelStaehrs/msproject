'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

/**
 * Choosing a password, and asking for the chance to.
 *
 * Both of these are reached by people who are, by definition, having a bad
 * moment: newly invited and locked out, or back from holiday having forgotten.
 * So every message here says what actually happened rather than the safest
 * possible nothing.
 */

/** Long enough to matter, short enough that nobody writes it on a note. */
const MINIMUM = 10

export async function setPassword(_prev: string | null, fd: FormData) {
  const password = String(fd.get('password') ?? '')
  const again = String(fd.get('again') ?? '')

  if (password.length < MINIMUM) {
    return `At least ${MINIMUM} characters. Length is the part that matters, so a sentence beats a symbol.`
  }
  if (password !== again) return 'The two do not match.'

  const supabase = await createClient()

  /*
   * This needs a session, which the link in the email created on its way
   * through /auth/callback. Arriving here without one means the link expired,
   * was already used, or the page was opened directly.
   */
  const { data } = await supabase.auth.getUser()
  if (!data.user) {
    return 'This page needs the link from your email. Ask for a new one below.'
  }

  const { error } = await supabase.auth.updateUser({ password })
  if (error) return error.message

  revalidatePath('/', 'layout')
  redirect('/')
}

/**
 * Sends the reset email.
 *
 * The reply is deliberately the same whether the address is known or not. This
 * form is on the public side of the login, and an answer that differs would
 * turn it into a way of asking which of your colleagues has an account.
 */
export async function requestReset(_prev: string | null, fd: FormData) {
  const email = String(fd.get('email') ?? '').trim()
  if (!email) return null

  const supabase = await createClient()
  const origin = (await headers()).get('origin') ?? ''

  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback`,
  })

  return 'sent'
}
