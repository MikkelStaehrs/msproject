'use server'

import { randomUUID } from 'node:crypto'

import { revalidatePath } from 'next/cache'
import { today } from '@/lib/date'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { purgeDocumentsForSubtree } from '@/lib/document-actions'
import { assignProjectNo } from '@/lib/assign-project-no'
import { PEOPLE_FIELDS } from '@/lib/identity'
import { reorder, type Sortable } from '@/lib/reorder'
import type { NodeCategory, NodeStatus, NodeType } from '@/lib/types'
import { required, text, number } from '@/lib/form'

/**
 * The fields the company system requires that cannot be derived. They belong
 * to a project, not to a task, and the form only shows them at top level.
 * Values that are not submitted are left standing in the jsonb.
 *
 * project_no is not here: the system assigns it and it cannot be edited.
 */
const REPORTING_KEYS = ['account', 'portfolio', 'location'] as const

function mergeReporting(
  fd: FormData,
  current: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...current }
  for (const key of REPORTING_KEYS) {
    if (!fd.has(`reporting_${key}`)) continue
    const value = text(fd, `reporting_${key}`)
    if (value === null) delete next[key]
    else next[key] = value
  }

  // Roles can sit on any node, not only on the project. A hardware
  // subproject is rarely led by whoever leads the digitalisation around it.
  // Fields that are not submitted are left standing.
  const people = { ...((current.people ?? {}) as Record<string, unknown>) }
  let touched = false
  for (const f of PEOPLE_FIELDS) {
    const name = `people_${f.key}`
    if (!fd.has(name)) continue
    touched = true
    const value = text(fd, name)
    if (value === null) delete people[f.key]
    else people[f.key] = value
  }
  if (touched) next.people = people

  return next
}

const wholeDays = (fd: FormData, key: string) => {
  const n = number(fd, key)
  return n === null ? null : Math.max(0, Math.round(n))
}

/** Fields shared by create and edit. */
function nodeFields(fd: FormData) {
  return {
    type: required(fd, 'type') as NodeType,
    title: required(fd, 'title'),
    description: text(fd, 'description'),
    category: text(fd, 'category') as NodeCategory | null,
    status: required(fd, 'status') as NodeStatus,
    owner: text(fd, 'owner'),
    start_date: text(fd, 'start_date'),
    due_date: text(fd, 'due_date'),
    // Whole days only, and never negative. Nothing reads these yet; they are
    // captured because the gap between the guess and the outcome cannot be
    // reconstructed once the work is done.
    estimate_low_days: wholeDays(fd, 'estimate_low_days'),
    estimate_high_days: wholeDays(fd, 'estimate_high_days'),
    is_milestone: fd.get('is_milestone') === 'on',
  }
}

/**
 * completed_at follows status. It is not a derived value we cache. It is the
 * timestamp for when status became done, and v_next_date leans on it.
 */
function completedAt(status: NodeStatus, current: string | null): string | null {
  if (status !== 'done') return null
  return current ?? new Date().toISOString()
}

// ---------------------------------------------------------------------------

export async function createNode(fd: FormData) {
  const supabase = await createClient()
  const parent_id = text(fd, 'parent_id')
  const fields = nodeFields(fd)

  // A new node goes last among its siblings.
  const base = supabase.from('node').select('sort_order')
  const { data: last } = await (parent_id === null
    ? base.is('parent_id', null)
    : base.eq('parent_id', parent_id)
  )
    .order('sort_order', { ascending: false })
    .limit(1)

  const reporting = await assignProjectNo(
    supabase,
    mergeReporting(fd, {}),
    fields.category,
    parent_id === null,
    today(),
  )

  /*
   * The id is decided here rather than read back.
   *
   * `.insert().select()` returns the new row through the SELECT policy, and a
   * project is only visible once its creator is a member of it. That membership
   * is added by a trigger, and whether the trigger has fired by the time
   * RETURNING is evaluated is not something worth betting a broken "New
   * project" button on. Choosing the id up front removes the question.
   */
  const id = randomUUID()

  const { error } = await supabase.from('node').insert({
    id,
    parent_id,
    ...fields,
    reporting,
    completed_at: completedAt(fields.status, null),
    sort_order: (last?.[0]?.sort_order ?? 0) + 10,
  })

  if (error) {
    throw new Error(`Could not create node: ${error.message}`)
  }

  /*
   * Join the project you just made. The database does this too, in a trigger,
   * so a project created in the SQL editor is not orphaned either. Doing it
   * here as well is deliberate: this is the path that matters, and it fails
   * loudly if it fails at all.
   */
  if (parent_id === null) {
    const { error: memberError } = await supabase
      .from('project_member')
      .insert({ project_id: id })
      .select('id')
      .maybeSingle()

    if (memberError && memberError.code !== '23505') {
      throw new Error(
        `The project was created but you were not added to it: ${memberError.message}`,
      )
    }
  }

  revalidatePath('/', 'layout')

  // A new project has none of its master data yet. Landing on the front page
  // would leave the user without knowing where the rest is written.
  if (parent_id === null) redirect(`/p/${id}/identitet`)
  redirect(String(fd.get('redirectTo') ?? '/'))
}

export async function updateNode(fd: FormData) {
  const supabase = await createClient()
  const id = required(fd, 'id')
  const parent_id = text(fd, 'parent_id')
  const fields = nodeFields(fd)

  if (parent_id === id) {
    throw new Error('A node cannot be its own parent.')
  }

  // A node must not be moved under itself. The picker rules it out already,
  // but the model should not trust the UI.
  if (parent_id !== null) {
    const { data: subtree } = await supabase
      .from('v_node_descendant')
      .select('node_id')
      .eq('root_id', id)

    if (subtree?.some((d) => d.node_id === parent_id)) {
      throw new Error('A node cannot be moved under its own descendant.')
    }
  }

  const { data: existing } = await supabase
    .from('node')
    .select('completed_at, reporting')
    .eq('id', id)
    .single()

  // If the node gets a category for the first time as a top level project,
  // the number is assigned here. Otherwise a project created without a
  // category would never get one.
  const reporting = await assignProjectNo(
    supabase,
    mergeReporting(fd, (existing?.reporting ?? {}) as Record<string, unknown>),
    fields.category,
    parent_id === null,
    today(),
  )

  const { error } = await supabase
    .from('node')
    .update({
      parent_id,
      ...fields,
      reporting,
      completed_at: completedAt(fields.status, existing?.completed_at ?? null),
    })
    .eq('id', id)

  if (error) throw new Error(`Could not save node: ${error.message}`)

  revalidatePath('/', 'layout')
  redirect(String(fd.get('redirectTo') ?? '/'))
}

export async function setNodeStatus(fd: FormData) {
  const supabase = await createClient()
  const id = required(fd, 'id')
  const status = required(fd, 'status') as NodeStatus

  const { data: existing } = await supabase
    .from('node')
    .select('completed_at')
    .eq('id', id)
    .single()

  const { error } = await supabase
    .from('node')
    .update({
      status,
      completed_at: completedAt(status, existing?.completed_at ?? null),
    })
    .eq('id', id)

  if (error) throw new Error(`Could not change status: ${error.message}`)

  revalidatePath('/', 'layout')
}

export async function deleteNode(fd: FormData) {
  const supabase = await createClient()
  const id = required(fd, 'id')

  // Files in storage do not follow the cascade. They have to go first, or
  // they stay forever with no row pointing at them.
  await purgeDocumentsForSubtree(id)

  // on delete cascade takes the whole subtree, plus its log entries,
  // blockers, decisions, reports and document rows.
  const { error } = await supabase.from('node').delete().eq('id', id)

  if (error) throw new Error(`Could not delete node: ${error.message}`)

  revalidatePath('/', 'layout')
  redirect(String(fd.get('redirectTo') ?? '/'))
}

/**
 * Move a node one step among its siblings. Order drives both the tree and the
 * WBS codes, so this is the only way to correct a node created out of turn.
 */
export async function moveNodeInOrder(fd: FormData) {
  const supabase = await createClient()
  const id = required(fd, 'id')
  const direction = required(fd, 'direction') === 'up' ? 'up' : 'down'

  const { data: node } = await supabase
    .from('node')
    .select('parent_id')
    .eq('id', id)
    .single()
  if (!node) throw new Error('The node does not exist.')

  const query = supabase.from('node').select('id, sort_order')
  const { data: siblings } = await (node.parent_id === null
    ? query.is('parent_id', null)
    : query.eq('parent_id', node.parent_id))

  for (const change of reorder((siblings ?? []) as Sortable[], id, direction)) {
    const { error } = await supabase
      .from('node')
      .update({ sort_order: change.sort_order })
      .eq('id', change.id)
    if (error) throw new Error(`Could not reorder: ${error.message}`)
  }

  revalidatePath('/', 'layout')
  redirect(String(fd.get('redirectTo') ?? '/'))
}
