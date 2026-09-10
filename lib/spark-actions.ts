'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { back, number, required, text } from '@/lib/form'
import type { NodeType, SavingKind, SparkSource } from '@/lib/types'

/**
 * Capturing a thought, and deciding about it later.
 *
 * The capture path asks for nothing but the sentence. Everything that would
 * make you stop and think happens on triage, at a desk, when you have the tree
 * in front of you.
 */
export async function createSpark(fd: FormData) {
  const supabase = await createClient()

  const { error } = await supabase.from('spark').insert({
    body: required(fd, 'body'),
    note: text(fd, 'note'),
    source: (text(fd, 'source') ?? 'app') as SparkSource,
  })

  if (error) throw new Error(`Could not save it: ${error.message}`)
  revalidatePath('/', 'layout')
  back(fd)
}

export async function editSpark(fd: FormData) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('spark')
    .update({ body: required(fd, 'body'), note: text(fd, 'note') })
    .eq('id', required(fd, 'id'))

  if (error) throw new Error(`Could not save it: ${error.message}`)
  revalidatePath('/', 'layout')
  back(fd)
}

/**
 * The stress test: what it is worth, and what it would take.
 *
 * Two numbers and three scores. Everything a page shows about an idea - the
 * annual kroner, the euro per unit, the share of the year's target, the
 * priority, the quadrant - follows from these and is computed, so none of it
 * can be typed in and then quietly go stale.
 *
 * Every field is optional and clearing one is a real act. An assessment made
 * on Tuesday from a guess should be removable on Friday when the guess turns
 * out to be wrong, and a form that only ever accumulates numbers is a form
 * whose numbers stop meaning anything.
 */
export async function assessSpark(fd: FormData) {
  const supabase = await createClient()

  const kind = text(fd, 'saving_kind') as SavingKind | null
  const value = number(fd, 'saving_value')

  // A kind without a figure, or a figure without a kind, is half an answer.
  // The database refuses it too; this is so it is refused legibly.
  if (kind !== null && value === null) {
    throw new Error('That way of describing a saving needs a figure.')
  }
  if (kind === 'per_unit' && (text(fd, 'saving_stage') ?? '') === '') {
    throw new Error(
      'A saving per unit needs the stage those units pass through: the stages ' +
        'do not run the same quantities.',
    )
  }

  const score = (key: string) => {
    const n = number(fd, key)
    if (n === null) return null
    return Math.min(5, Math.max(1, Math.round(n)))
  }

  const { error } = await supabase
    .from('spark')
    .update({
      saving_kind: kind,
      saving_value: kind === null ? null : value,
      saving_stage: kind === 'per_unit' ? text(fd, 'saving_stage') : null,
      cost_score: score('cost_score'),
      benefit_score: score('benefit_score'),
      complexity_score: score('complexity_score'),
    })
    .eq('id', required(fd, 'id'))

  if (error) throw new Error(`Could not save the assessment: ${error.message}`)

  revalidatePath('/', 'layout')
  back(fd)
}

/**
 * Decided against.
 *
 * The row stays. A dropped spark with a reason on it is what stops the same
 * idea arriving again in three months and going round the loop a second time,
 * which is the whole reason these are not deleted.
 */
export async function dropSpark(fd: FormData) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('spark')
    .update({ state: 'dropped', verdict: text(fd, 'verdict') })
    .eq('id', required(fd, 'id'))

  if (error) throw new Error(`Could not drop it: ${error.message}`)
  revalidatePath('/', 'layout')
  back(fd)
}

/** Back into the inbox, for a spark dropped or kept by mistake. */
export async function reopenSpark(fd: FormData) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('spark')
    .update({ state: 'new', verdict: null, became_node_id: null })
    .eq('id', required(fd, 'id'))

  if (error) throw new Error(`Could not reopen it: ${error.message}`)
  revalidatePath('/', 'layout')
  back(fd)
}

/** Gone for good. For the ones that were never a thought, only a typo. */
export async function deleteSpark(fd: FormData) {
  const supabase = await createClient()

  const { error } = await supabase.from('spark').delete().eq('id', required(fd, 'id'))

  if (error) throw new Error(`Could not delete it: ${error.message}`)
  revalidatePath('/', 'layout')
  back(fd)
}

/**
 * It becomes work.
 *
 * The node is created where you say, with the spark's own words as its
 * description, and the spark is marked as having become it. Two rows written in one step,
 * because the alternative is creating the node on one page and remembering to
 * come back and tick the spark off on another, which nobody does.
 *
 * A project has no parent. Anything else gets one, and the form only offers
 * types that can actually sit under the parent you picked.
 */
export async function promoteSpark(fd: FormData) {
  const supabase = await createClient()

  const id = required(fd, 'id')
  const type = (text(fd, 'type') ?? 'project') as NodeType
  const parentId = text(fd, 'parent_id')
  const title = required(fd, 'title')

  if (type !== 'project' && parentId === null) {
    throw new Error(`A ${type} needs somewhere to sit. Pick a parent.`)
  }

  const { data: spark, error: readError } = await supabase
    .from('spark')
    .select('body, note, saving_kind, saving_value, saving_stage, cost_score, benefit_score, complexity_score')
    .eq('id', id)
    .single()

  if (readError) throw new Error(`Could not read it: ${readError.message}`)

  /*
   * The sentence becomes the description, not the title.
   *
   * A spark reads like "we should log the cleaning line stops automatically" and
   * that is a thought, not a name. You give it a title here; the original words
   * are kept underneath, because how you first put it is often clearer than the
   * name you settle on.
   */
  /*
   * The id is chosen here rather than read back. Promoting a spark to a
   * PROJECT creates a root, and a root is invisible until its creator is a
   * member of it, so `.select()` would return nothing on the one path that
   * matters most. Same reason as in createNode.
   */
  const nodeId = randomUUID()

  const { error: nodeError } = await supabase
    .from('node')
    .insert({
      id: nodeId,
      title,
      type,
      parent_id: type === 'project' ? null : parentId,
      status: 'idea',
      /*
       * Both halves travel. The sentence is what you said; the note is what
       * made it make sense, and the node is exactly where that is worth
       * keeping. Two paragraphs, because the description renders them as such.
       */
      description: spark.note ? `${spark.body}

${spark.note}` : spark.body,
    })

  if (nodeError) throw new Error(`Could not create the node: ${nodeError.message}`)

  // A new project needs you on it, or it vanishes the moment it is made.
  if (type === 'project') {
    const { error: memberError } = await supabase
      .from('project_member')
      .insert({ project_id: nodeId })

    if (memberError && memberError.code !== '23505') {
      throw new Error(
        `The project was created but you were not added to it: ${memberError.message}`,
      )
    }
  }

  /*
   * What was promised, copied onto the work.
   *
   * Not read back through `became_node_id` when the project is opened, and the
   * reason matters: sparks are private to their author, so a promise read that
   * way would be visible to exactly one person and silently absent for everyone
   * else. Copied, it belongs to the project and follows the project's own
   * membership.
   *
   * It is also a different fact from the spark, not a duplicate of one. The
   * spark holds what the idea says now and stays editable; this holds what was
   * claimed on the day it became work, which is what somebody decided on.
   *
   * The year is stamped alongside, because a saving cannot be read back
   * honestly without the yardstick it was weighed against.
   */
  const { data: yard } = await supabase
    .from('yardstick')
    .select('fiscal_year')
    .maybeSingle()

  const { error: originError } = await supabase.from('node_origin').insert({
    node_id: nodeId,
    spark_id: id,
    body: spark.body,
    note: spark.note,
    saving_kind: spark.saving_kind,
    saving_value: spark.saving_value,
    saving_stage: spark.saving_stage,
    cost_score: spark.cost_score,
    benefit_score: spark.benefit_score,
    complexity_score: spark.complexity_score,
    fiscal_year: yard?.fiscal_year ?? null,
  })

  // Not fatal. The work exists and that is the thing that mattered; losing the
  // origin is worth saying out loud but not worth undoing a project over.
  if (originError && originError.code !== '23505') {
    console.error(`node_origin not written for ${nodeId}: ${originError.message}`)
  }

  const { error } = await supabase
    .from('spark')
    .update({ state: 'kept', became_node_id: nodeId })
    .eq('id', id)

  if (error) throw new Error(`The node was created but the spark did not close: ${error.message}`)

  revalidatePath('/', 'layout')
  back(fd)
}
