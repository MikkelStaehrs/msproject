'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { back, text } from '@/lib/form'

/**
 * Closing a stand-up.
 *
 * The only write the whole screen makes, and it writes one date. Everything
 * else on it is derived and stays derived: nothing is marked handled, nothing
 * is carried forward, no item is ticked. What was discussed and not fixed is
 * still there next week, still counting days, which is the entire mechanism.
 */
export async function holdStandup(fd: FormData) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('standup')
    .insert({ note: text(fd, 'note') })

  /*
   * 23505 is the unique index on the day. Two people closing the same meeting,
   * or one person pressing twice, is not a failure: the meeting happened, which
   * is exactly what the row says.
   */
  if (error && error.code !== '23505') {
    throw new Error(`Could not close the stand-up: ${error.message}`)
  }

  revalidatePath('/', 'layout')
  back(fd)
}

/**
 * Undoing it.
 *
 * Worth having because closing the wrong day silently moves the boundary, and
 * then a week of movement is reported under the wrong meeting with nothing on
 * screen to suggest anything went wrong. Deleting the row puts the boundary
 * back where it was; nothing else was ever stored, so nothing else can be lost.
 */
export async function reopenStandup(fd: FormData) {
  const supabase = await createClient()

  const id = String(fd.get('id') ?? '')
  const { error } = await supabase.from('standup').delete().eq('id', id)
  if (error) throw new Error(`Could not reopen it: ${error.message}`)

  revalidatePath('/', 'layout')
  back(fd)
}
