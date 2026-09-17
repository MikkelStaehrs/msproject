'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { back, required, text } from '@/lib/form'
import { carryForward, snapshot, validate } from '@/lib/standup-close'
import { readCloseState } from '@/lib/standup-close-data'

/**
 * What the room says, written as it is said.
 *
 * None of these waits for the close. An item leaves the agenda by being
 * answered, which is the rule the whole application already runs on, and it is
 * also the only way a meeting survives somebody reloading the page halfway
 * through. The close records that the meeting did these things; it does not do
 * them.
 *
 * The two exceptions are at the bottom: a decision and a spark CREATE rows, so
 * they are held as drafts and written once, when the meeting closes. Written on
 * the way through, a meeting walked twice would leave two of each.
 */

/** The meeting that is running. There is exactly one; the database says so. */
async function openStandup() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('standup')
    .select('id, status, scheduled_at, period_from')
    .eq('status', 'open')
    .maybeSingle()

  if (error) throw new Error(`Could not find the stand-up: ${error.message}`)
  if (!data) throw new Error('No stand-up is open. One is created when the last one closes.')

  return { supabase, standup: data as { id: string; status: string } }
}

/* ------------------------------------------------------------------------ */
/* Step 1: who is here                                                       */
/* ------------------------------------------------------------------------ */

export async function setPresence(fd: FormData) {
  const { supabase, standup } = await openStandup()

  const { error } = await supabase.from('standup_attendee').upsert(
    {
      standup_id: standup.id,
      person_id: required(fd, 'person_id'),
      present: fd.get('present') === 'yes',
    },
    { onConflict: 'standup_id,person_id' },
  )

  if (error) throw new Error(`Could not record that: ${error.message}`)

  revalidatePath('/standup')
  back(fd)
}

/** Whoever is running it, which the summary names and the sponsor note quotes. */
export async function setFacilitator(fd: FormData) {
  const { supabase, standup } = await openStandup()

  const { error } = await supabase
    .from('standup')
    .update({ facilitator_id: text(fd, 'facilitator_id') })
    .eq('id', standup.id)

  if (error) throw new Error(`Could not set that: ${error.message}`)

  revalidatePath('/standup')
  back(fd)
}

/* ------------------------------------------------------------------------ */
/* Step 2: blockers                                                          */
/* ------------------------------------------------------------------------ */

/**
 * Who is chasing it and what they will do.
 *
 * Both or neither is not enforced here: the validator on the last step refuses
 * the close while either is missing, and refusing a half-typed answer in the
 * middle of a meeting is how people stop typing.
 */
export async function answerBlocker(fd: FormData) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('blocker')
    .update({
      driver_id: text(fd, 'driver_id'),
      next_step: text(fd, 'next_step'),
    })
    .eq('id', required(fd, 'id'))

  if (error) throw new Error(`Could not save that: ${error.message}`)

  revalidatePath('/standup')
  back(fd)
}

/** The room closed it. `resolution` is what happened, and it is required. */
export async function settleBlocker(fd: FormData) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('blocker')
    .update({
      resolved_at: new Date().toISOString().slice(0, 10),
      resolution: required(fd, 'resolution'),
    })
    .eq('id', required(fd, 'id'))

  if (error) throw new Error(`Could not close it: ${error.message}`)

  revalidatePath('/', 'layout')
  back(fd)
}

/* ------------------------------------------------------------------------ */
/* Steps 3 and 4: who is driving what                                        */
/* ------------------------------------------------------------------------ */

/**
 * A name, or a date to come back to, and never both.
 *
 * «Nobody, on purpose, until October» is an answer. «Nobody» is not, and the
 * close refuses to happen while any task in flight is still saying it.
 */
export async function driveOrPark(fd: FormData) {
  const supabase = await createClient()

  const driver = text(fd, 'driver_id')
  const until = text(fd, 'parked_until')

  const { error } = await supabase
    .from('node')
    .update(
      driver !== null
        ? { driver_id: driver, driver_name: null, parked_until: null }
        : { driver_id: null, parked_until: until },
    )
    .eq('id', required(fd, 'id'))

  if (error) throw new Error(`Could not save that: ${error.message}`)

  revalidatePath('/', 'layout')
  back(fd)
}

/**
 * A commitment: this task, this person, by this date.
 *
 * It writes the driver and the date onto the work rather than into minutes,
 * for the reason the old stand-up already gave: a minutes table saying «Jan
 * takes the firewall quote by the 17th» beside a task saying the same thing in
 * columns is two records that disagree the first time somebody moves the date.
 */
export async function commit(fd: FormData) {
  const { supabase, standup } = await openStandup()

  const nodeId = required(fd, 'node_id')
  const driver = text(fd, 'driver_id')
  const due = text(fd, 'due_date')

  const patch: Record<string, unknown> = { standup_id: standup.id }
  if (driver !== null) {
    patch.driver_id = driver
    patch.driver_name = null
    patch.parked_until = null
  }
  if (due !== null) patch.due_date = due

  const { error } = await supabase.from('node').update(patch).eq('id', nodeId)
  if (error) throw new Error(`Could not save that: ${error.message}`)

  /* The draft row, so step seven and the summary know it was agreed here. */
  const { error: itemError } = await supabase.from('standup_item').insert({
    standup_id: standup.id,
    node_id: nodeId,
    kind: 'commitment',
    action: 'logged',
    driver_id: driver,
    due_date: due,
  })
  if (itemError) throw new Error(`Could not record it: ${itemError.message}`)

  revalidatePath('/', 'layout')
  back(fd)
}

/* ------------------------------------------------------------------------ */
/* Steps 5 and 6: the two that create rows                                   */
/* ------------------------------------------------------------------------ */

/**
 * A decision, and a spark, held as drafts until the meeting closes.
 *
 * These are the only two things here that bring something into existence. If
 * they were written on the way through, a meeting somebody walked twice would
 * leave two of each, and a decision recorded twice on a node is worse than one
 * recorded late.
 */
export async function draftDecision(fd: FormData) {
  const { supabase, standup } = await openStandup()

  const { error } = await supabase.from('standup_item').insert({
    standup_id: standup.id,
    node_id: required(fd, 'node_id'),
    kind: 'decision',
    action: 'logged',
    note: required(fd, 'decision'),
    next_step: text(fd, 'rationale'),
  })

  if (error) throw new Error(`Could not record it: ${error.message}`)

  revalidatePath('/standup')
  back(fd)
}

export async function draftSpark(fd: FormData) {
  const { supabase, standup } = await openStandup()

  const { error } = await supabase.from('standup_item').insert({
    standup_id: standup.id,
    kind: 'spark',
    action: 'logged',
    note: required(fd, 'body'),
  })

  if (error) throw new Error(`Could not catch it: ${error.message}`)

  revalidatePath('/standup')
  back(fd)
}

/** Taking one back, while the meeting is still open. */
export async function dropDraft(fd: FormData) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('standup_item')
    .delete()
    .eq('id', required(fd, 'id'))

  if (error) throw new Error(`Could not remove it: ${error.message}`)

  revalidatePath('/standup')
  back(fd)
}

/* ------------------------------------------------------------------------ */
/* Step 7: closing                                                           */
/* ------------------------------------------------------------------------ */

/**
 * Closing the meeting.
 *
 * Reads the state, lets the pure functions decide, and hands the result to one
 * database call that applies all of it or none of it. The validator runs here
 * as well as on the screen: the button being disabled is a courtesy, not a
 * gate, and a server action is a public endpoint with an unguessable name.
 */
export async function closeStandup(fd: FormData) {
  const supabase = await createClient()
  const standupId = required(fd, 'id')

  const state = await readCloseState(supabase, standupId)

  const problems = validate(state)
  if (problems.length > 0) {
    throw new Error(
      `The stand-up cannot close yet. ${problems.join(' ')}`,
    )
  }

  const { error } = await supabase.rpc('close_standup', {
    p_standup_id: standupId,
    p_summary: snapshot(state),
    p_writes: carryForward(state),
  })

  if (error) throw new Error(`Could not close the stand-up: ${error.message}`)

  revalidatePath('/', 'layout')
  redirect(`/standup/${standupId}`)
}
