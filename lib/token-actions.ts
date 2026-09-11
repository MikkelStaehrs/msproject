'use server'

import { createHash, randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { back, required, text } from '@/lib/form'
import { TOKEN_SCOPES, type TokenScope } from '@/lib/types'

/**
 * Tokens: long lived credentials for the Claude app.
 *
 * A `capture` one may create a spark and nothing else, which is what all of
 * them meant before there was a choice. An `analyse` one may also READ the
 * structure of the projects its owner is on and the COGS reference, so an idea
 * can be argued with before it becomes work. Neither writes to anything but a
 * spark.
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

  /*
   * The scope is refused rather than coerced.
   *
   * Everywhere else in this codebase a form value is cast on the way in and the
   * enum catches a mistake at the database. That is the right trade for a
   * status or a kind. It is the wrong one for a capability: falling back to a
   * default here would mean a typo in a field name silently decides how much a
   * credential can read, and the person pressing the button would be told
   * nothing.
   */
  const asked = text(fd, 'scope') ?? 'capture'
  if (!(TOKEN_SCOPES as readonly string[]).includes(asked)) {
    return { error: `Unknown scope: ${asked}` }
  }
  const scope = asked as TokenScope

  const token = randomBytes(32).toString('base64url')
  const token_hash = createHash('sha256').update(token, 'utf8').digest('hex')

  const { error } = await supabase
    .from('spark_token')
    .insert({ name, token_hash, scope })

  if (error) return { error: `Could not make it: ${error.message}` }

  revalidatePath('/', 'layout')

  /*
   * Returned rather than redirected to, because this is the only moment it
   * exists in readable form. A redirect would show a fresh page with nothing
   * on it and the token gone for good.
   */
  return { token, name, scope }
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
