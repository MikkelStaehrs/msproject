'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { back, required, text } from '@/lib/form'
import type { NodeType, SparkSource } from '@/lib/types'

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
    .select('body, note')
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

  const { error } = await supabase
    .from('spark')
    .update({ state: 'kept', became_node_id: nodeId })
    .eq('id', id)

  if (error) throw new Error(`The node was created but the spark did not close: ${error.message}`)

  revalidatePath('/', 'layout')
  back(fd)
}
