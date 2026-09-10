'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { back, required, text } from '@/lib/form'
import { today } from '@/lib/date'

/**
 * Today's stand-up, made if it is not there yet.
 *
 * A stand-up row means «the room met on this day», and writing down what the
 * room agreed is proof it met. So recording something from the stand-up screen
 * opens the meeting rather than failing for want of a button having been
 * pressed first.
 *
 * The unique index on the day makes this safe to call as often as it likes:
 * two people closing the same meeting, or one person recording four things, is
 * still one meeting.
 */
async function todaysStandup(
  supabase: SupabaseClient,
  note: string | null = null,
): Promise<string | null> {
  const { error } = await supabase.from('standup').insert({ note })
  if (error && error.code !== '23505') {
    throw new Error(`Could not open the stand-up: ${error.message}`)
  }

  // Read back by the day rather than by «the latest». They are the same row
  // today, and asking for the day says what is meant.
  const { data } = await supabase
    .from('standup')
    .select('id')
    .eq('held_on', today())
    .maybeSingle()

  return data?.id ?? null
}

/**
 * Closing a stand-up by hand.
 *
 * Still worth having even though recording something opens one: a week where
 * nothing needed writing down is a week the room still met, and without this
 * the next stand-up would report a fortnight of movement as though no meeting
 * had happened in between.
 */
export async function holdStandup(fd: FormData) {
  const supabase = await createClient()
  await todaysStandup(supabase, text(fd, 'note'))

  revalidatePath('/', 'layout')
  back(fd)
}

/**
 * Undoing it.
 *
 * Worth having because closing the wrong day silently moves the boundary, and
 * then a week of movement is reported under the wrong meeting with nothing on
 * screen to suggest anything went wrong.
 *
 * The stamps on entries, decisions and tasks fall to null rather than taking
 * the rows with them: the line was still written and the task still exists,
 * only the claim about which meeting produced them goes away.
 */
export async function reopenStandup(fd: FormData) {
  const supabase = await createClient()

  const id = String(fd.get('id') ?? '')
  const { error } = await supabase.from('standup').delete().eq('id', id)
  if (error) throw new Error(`Could not reopen it: ${error.message}`)

  revalidatePath('/', 'layout')
  back(fd)
}

/**
 * What the room agreed about the piece on screen.
 *
 * One form, and every effect it has lands on something that already existed.
 * There is no minutes table, on purpose: minutes would say «Jan takes the
 * firewall quote by the 17th» in prose beside a task saying the same thing in
 * columns, and the two would disagree the first time the date moved. Here the
 * agreement IS the task, and its progress is the task's own status. Nobody has
 * to come back and update the minutes to say it got done.
 *
 * Two shapes, because a stand-up produces both:
 *
 *   on the piece    somebody takes the thing under discussion, by a date
 *   a new task      the thing under discussion needs something else done first
 *
 * Either way a line goes in the log, stamped with the meeting, because that is
 * what makes «what did we agree last Thursday» answerable at all.
 */
export async function agreeHere(fd: FormData) {
  const supabase = await createClient()

  const nodeId = required(fd, 'node_id')
  const body = required(fd, 'body')
  const owner = text(fd, 'owner')
  const due = text(fd, 'due_date')
  const asNewTask = text(fd, 'shape') === 'new'

  const standupId = await todaysStandup(supabase)

  if (asNewTask) {
    /*
     * The id is chosen here rather than read back, the same reason as in
     * createNode: a select after an insert is a second round trip that can
     * come back empty for reasons that have nothing to do with the insert.
     */
    const { error } = await supabase.from('node').insert({
      id: randomUUID(),
      parent_id: nodeId,
      type: 'task',
      // The sentence is the task. In a stand-up what gets said IS the name of
      // the thing, and asking for a title as well would be asking twice.
      title: body,
      status: 'planned',
      owner,
      due_date: due,
      standup_id: standupId,
    })
    if (error) throw new Error(`Could not add the task: ${error.message}`)
  } else {
    const patch: Record<string, unknown> = {}
    // Blank leaves what is there. Agreeing a date must not wipe a name nobody
    // discussed.
    if (owner !== null) patch.owner = owner
    if (due !== null) patch.due_date = due

    if (Object.keys(patch).length > 0) {
      const { error } = await supabase.from('node').update(patch).eq('id', nodeId)
      if (error) throw new Error(`Could not assign it: ${error.message}`)
    }
  }

  const { error: entryError } = await supabase.from('entry').insert({
    node_id: nodeId,
    kind: 'meeting',
    body,
    standup_id: standupId,
  })
  if (entryError) throw new Error(`Could not write the line: ${entryError.message}`)

  revalidatePath('/', 'layout')
  back(fd)
}
