'use server'

import { revalidatePath } from 'next/cache'
import { addDays, daysBetween, today } from '@/lib/date'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  DEFAULT_FOLDERS,
  deriveTemplate,
  planNodes,
  readBody,
  type TemplateBody,
  type TemplateRisk,
} from '@/lib/template'
import type { NodeCategory, NodeType, WaitingOnType } from '@/lib/types'
import { required, text } from '@/lib/form'

/**
 * Derive a template from a project that already exists. It is the only way to
 * create one: writing a tree into a form would be building a worse version of
 * the project page.
 */
/**
 * Capture a subtree as a template.
 *
 * Any node, not only a project. deriveTemplate always took a plain rootId; it
 * was the form that insisted on a top level project, which meant the four tasks
 * you write under every development container could not be captured at all.
 */
export async function templateFromNode(fd: FormData) {
  const supabase = await createClient()
  const projectId = required(fd, 'node_id')

  const { data: subtree } = await supabase
    .from('v_node_descendant')
    .select('node_id')
    .eq('root_id', projectId)

  const ids = (subtree ?? []).map((d) => d.node_id)

  const [{ data: nodes }, { data: blockers }] = await Promise.all([
    supabase
      .from('node')
      .select('id, parent_id, title, type, due_date, is_milestone, sort_order, start_date, category, description')
      .in('id', ids),
    supabase.from('blocker').select('title, waiting_on, waiting_on_type, opened_at, expected_by').in('node_id', ids),
  ])

  const root = (nodes ?? []).find((n) => n.id === projectId)
  if (!root) throw new Error('The node does not exist.')

  // Without a start date there is no zero point to measure due dates from.
  const start: string =
    root.start_date ??
    (nodes ?? [])
      .map((n) => n.due_date)
      .filter((d): d is string => d !== null)
      .sort()[0] ??
    today()

  const risks: TemplateRisk[] = (blockers ?? []).map((b) => ({
    title: b.title,
    waiting_on: b.waiting_on,
    waiting_on_type: b.waiting_on_type as WaitingOnType,
    expected_days:
      b.expected_by === null
        ? null
        : daysBetween(start, b.expected_by),
  }))

  // The folder set is inherited from the project's own folders, else the default.
  const { data: usedFolders } = await supabase
    .from('document')
    .select('folder')
    .in('node_id', ids)
    .not('folder', 'is', null)

  const folders = [...new Set((usedFolders ?? []).map((f) => f.folder as string))].sort()

  const body: TemplateBody = {
    folders: folders.length > 0 ? folders : [...DEFAULT_FOLDERS],
    nodes: deriveTemplate(
      (nodes ?? []).map((n) => ({
        id: n.id,
        parent_id: n.parent_id,
        title: n.title,
        type: n.type as NodeType,
        due_date: n.due_date,
        is_milestone: n.is_milestone,
        sort_order: n.sort_order,
      })),
      projectId,
      start,
    ),
    risks,
  }

  const { error } = await supabase.from('template').insert({
    name: text(fd, 'name') ?? `Skabelon fra ${root.title}`,
    description: root.description,
    category: root.category as NodeCategory | null,
    body,
  })

  if (error) throw new Error(`Could not save the template: ${error.message}`)
  revalidatePath('/', 'layout')
  redirect('/templates')
}

export async function updateTemplate(fd: FormData) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('template')
    .update({
      name: required(fd, 'name'),
      description: text(fd, 'description'),
      category: text(fd, 'category') as NodeCategory | null,
    })
    .eq('id', required(fd, 'id'))

  if (error) throw new Error(`Could not save the template: ${error.message}`)
  revalidatePath('/', 'layout')
  redirect('/templates')
}

export async function deleteTemplate(fd: FormData) {
  const supabase = await createClient()

  const { error } = await supabase.from('template').delete().eq('id', required(fd, 'id'))

  if (error) throw new Error(`Could not delete the template: ${error.message}`)
  revalidatePath('/', 'layout')
  redirect('/templates')
}

/**
 * Deploy the template as a new project tree. Due dates are computed from the
 * start date chosen now; the template knows only distances.
 */
export async function deployTemplate(fd: FormData) {
  const supabase = await createClient()
  const templateId = required(fd, 'template_id')
  const title = required(fd, 'title')
  const start = required(fd, 'start_date')

  const { data: template } = await supabase
    .from('template')
    .select('*')
    .eq('id', templateId)
    .single()

  if (!template) throw new Error('The template does not exist.')
  const body = readBody(template.body)

  const reporting: Record<string, unknown> = {}
  for (const key of ['account', 'portfolio'] as const) {
    const value = text(fd, `reporting_${key}`)
    if (value !== null) reporting[key] = value
  }
  // The document skeleton travels with the project, so the panel knows which
  // folders exist even before the first file is uploaded.
  if (body.folders.length > 0) reporting.folders = body.folders

  /*
   * Two targets. Without a parent this makes a new project with its own
   * reporting. With one, the tree simply hangs underneath and none of the
   * project furniture applies: no account string, no folders.
   *
   * No number is assigned either way. It comes from UBS Projects, and a
   * project applied from a template has not been registered there yet.
   */
  const parentId = text(fd, 'parent_id')

  const category = (text(fd, 'category') ?? template.category) as NodeCategory | null

  let rootId: string
  let sortBase: number

  if (parentId === null) {
    const { data: lastRoot } = await supabase
      .from('node')
      .select('sort_order')
      .is('parent_id', null)
      .order('sort_order', { ascending: false })
      .limit(1)

    const { data: root, error: rootError } = await supabase
      .from('node')
      .insert({
        parent_id: null,
        type: 'project' as NodeType,
        title,
        description: text(fd, 'description') ?? template.description,
        category,
        status: 'planned',
        start_date: start,
        reporting,
        sort_order: (lastRoot?.[0]?.sort_order ?? 0) + 10,
      })
      .select('id')
      .single()

    if (rootError || !root) {
      throw new Error(`Could not create the project: ${rootError?.message}`)
    }
    rootId = root.id
    sortBase = 0
  } else {
    // Land after whatever is already under the target, so an existing tree is
    // never reordered by adding to it.
    const { data: last } = await supabase
      .from('node')
      .select('sort_order')
      .eq('parent_id', parentId)
      .order('sort_order', { ascending: false })
      .limit(1)

    rootId = parentId
    sortBase = last?.[0]?.sort_order ?? 0
  }

  // Level by level, so every node has its parent before it is inserted.
  const planned = planNodes(body.nodes, start)
  const idByIndex = new Map<number, string>()

  for (const p of planned) {
    const parentOf = p.parentIndex === null ? rootId : idByIndex.get(p.parentIndex)
    if (!parentOf) throw new Error('The template tree does not hang together.')

    const { data: inserted, error } = await supabase
      .from('node')
      .insert({
        parent_id: parentOf,
        type: p.type,
        title: p.title,
        status: 'planned',
        category: (text(fd, 'category') ?? template.category) as NodeCategory | null,
        due_date: p.due_date,
        is_milestone: p.is_milestone,
        sort_order: p.parentIndex === null ? sortBase + p.sort_order : p.sort_order,
      })
      .select('id')
      .single()

    if (error || !inserted) {
      throw new Error(`Could not deploy «${p.title}»: ${error?.message}`)
    }
    idByIndex.set(p.index, inserted.id)
  }

  // Known risks are opened only when they are ticked.
  if (fd.get('include_risks') === 'on' && body.risks.length > 0) {
    const { error } = await supabase.from('blocker').insert(
      body.risks.map((r) => ({
        node_id: rootId,
        title: r.title,
        waiting_on: r.waiting_on,
        waiting_on_type: r.waiting_on_type,
        opened_at: start,
        expected_by: r.expected_days === null ? null : addDays(start, r.expected_days),
      })),
    )
    if (error) throw new Error(`Could not open the known risks: ${error.message}`)
  }

  revalidatePath('/', 'layout')
  // A new project wants its identity filled in. A subtree added to something
  // that already exists wants you back where you were looking.
  redirect(
    parentId === null
      ? `/p/${rootId}/identitet`
      : (text(fd, 'redirectTo') ?? `/p/${rootId}`),
  )
}

