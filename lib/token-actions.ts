'use server'

import { createHash, randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { back, required, text } from '@/lib/form'

/**
 * Capture tokens: long lived credentials that may create a spark and nothing
 * else.
 *
 * Shown once. Only the hash is kept, so nobody, this application included, can
 * read an existing token back out. That is the point of hashing it: a table
 * that can be turned back into a working credential is a table that eventually
 * leaks one.
 */

/**
 * 32 bytes from the system's own generator.
 *
 * Base64url so it survives being pasted into a header field without escaping.
 * The length is what makes guessing it pointless: there is no rate limiting in
 * front of the function it unlocks, so the token itself has to be the wall.
 */
export async function createToken(_prev: unknown, fd: FormData) {
  const supabase = await createClient()

  const name = (text(fd, 'name') ?? '').trim() || 'Claude'
  const token = randomBytes(32).toString('base64url')
  const token_hash = createHash('sha256').update(token, 'utf8').digest('hex')

  const { error } = await supabase.from('spark_token').insert({ name, token_hash })

  if (error) return { error: `Could not make it: ${error.message}` }

  revalidatePath('/', 'layout')

  /*
   * Returned rather than redirected to, because this is the only moment it
   * exists in readable form. A redirect would show a fresh page with nothing
   * on it and the token gone for good.
   */
  return { token, name }
}

export async function revokeToken(fd: FormData) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('spark_token')
    .delete()
    .eq('id', required(fd, 'id'))

  if (error) throw new Error(`Could not revoke it: ${error.message}`)

  revalidatePath('/', 'layout')
  back(fd)
}
