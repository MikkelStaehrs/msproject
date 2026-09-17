'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

/**
 * Marking the feed seen.
 *
 * One timestamp, written to your own profile row. It is the whole of the read
 * state in this application: there is no per item flag, because the feed is
 * assembled from rows rather than stored, so its items have no identity to hang
 * one on.
 *
 * `now()` is taken here rather than passed in the form. A hidden field carrying
 * a timestamp is a hidden field somebody can change, and the change would be
 * invisible: a boundary set into the future silently hides everything up to it.
 *
 * The column is writable because the migration granted it. `profile` has UPDATE
 * revoked at table level and granted back on exactly the columns a person sets
 * about themselves, so a missing grant here would fail with «permission denied
 * for table profile», which reads as RLS and is not.
 */
export async function markFeedSeen(fd?: FormData) {
  const supabase = await createClient()

  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) throw new Error('You are not signed in.')

  const { error } = await supabase
    .from('profile')
    .update({ feed_seen_at: new Date().toISOString() })
    .eq('id', auth.user.id)

  if (error) throw new Error(`Could not mark it seen: ${error.message}`)

  revalidatePath('/', 'layout')

  /*
   * Called two ways, and only one of them goes anywhere. The panel under the
   * bell calls this directly and stays where it is; the button on /feed posts
   * a form and comes back to the page it was pressed on.
   */
  const to = fd?.get('redirectTo')
  if (typeof to === 'string' && to !== '') redirect(to)
}
