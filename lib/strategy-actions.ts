'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { back, number, required, text } from '@/lib/form'

/**
 * Strategies, and what serves them.
 *
 * Nothing here is derived. Which work counts towards a strategy is a judgement
 * only you can make, and everything the page says about it is computed from
 * these two facts: the marking, and the figure on it.
 */

function strategyFields(fd: FormData) {
  return {
    name: required(fd, 'name'),
    description: text(fd, 'description'),
    /*
     * Absent from the form when the target is the yardstick's, and `number()`
     * turns an absent field into null, which is exactly what the constraint
     * wants. Left explicit rather than conditional: a strategy that stops
     * deriving its target has nothing stale to clear out.
     */
    target_annual: number(fd, 'target_annual'),
    owner: text(fd, 'owner'),
    started_on: text(fd, 'started_on'),
    ended_on: text(fd, 'ended_on'),
  }
}

export async function createStrategy(fd: FormData) {
  const supabase = await createClient()

  const { error } = await supabase.from('strategy').insert(strategyFields(fd))

  if (error) throw new Error(`Could not save the strategy: ${error.message}`)
  revalidatePath('/', 'layout')
  back(fd)
}

export async function updateStrategy(fd: FormData) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('strategy')
    .update(strategyFields(fd))
    .eq('id', required(fd, 'id'))

  if (error) throw new Error(`Could not save the strategy: ${error.message}`)
  revalidatePath('/', 'layout')
  back(fd)
}

/**
 * Deleting a strategy removes every marking with it, by the cascade. The work
 * itself is untouched: a strategy is a lens on the tree, never a container for
 * it.
 */
export async function deleteStrategy(fd: FormData) {
  const supabase = await createClient()

  const { error } = await supabase.from('strategy').delete().eq('id', required(fd, 'id'))

  if (error) throw new Error(`Could not delete the strategy: ${error.message}`)
  revalidatePath('/', 'layout')
  back(fd)
}

/**
 * Mark a node, or unmark it. One button, because that is how it is used: the
 * question is always whether this piece of work serves the strategy, and the
 * answer flips.
 */
export async function toggleNodeStrategy(fd: FormData) {
  const supabase = await createClient()

  const nodeId = required(fd, 'node_id')
  const strategyId = required(fd, 'strategy_id')

  const { data: existing, error: readError } = await supabase
    .from('node_strategy')
    .select('id')
    .eq('node_id', nodeId)
    .eq('strategy_id', strategyId)
    .maybeSingle()

  if (readError) throw new Error(`Could not read the marking: ${readError.message}`)

  const { error } = existing
    ? await supabase.from('node_strategy').delete().eq('id', existing.id)
    : await supabase.from('node_strategy').insert({
        node_id: nodeId,
        strategy_id: strategyId,
      })

  if (error) throw new Error(`Could not change the marking: ${error.message}`)
  revalidatePath('/', 'layout')
  back(fd)
}

/**
 * What this node promises this strategy.
 *
 * A blank field means: fall back to the node's own expected annual benefit.
 * That is why it is cleared to null rather than stored as zero. Zero and blank
 * are different answers, and only one of them is a promise.
 */
export async function setContribution(fd: FormData) {
  const supabase = await createClient()

  const typed = number(fd, 'annual_eur')

  const { error } = await supabase
    .from('node_strategy')
    .update({
      annual_eur: typed === null ? null : Math.max(0, typed),
      note: text(fd, 'note'),
    })
    .eq('id', required(fd, 'id'))

  if (error) throw new Error(`Could not save the contribution: ${error.message}`)
  revalidatePath('/', 'layout')
  back(fd)
}
