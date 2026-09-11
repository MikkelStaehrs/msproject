import { addDays, daysBetween } from './date.ts'
import type { NodeType, WaitingOnType } from '@/lib/types'

/**
 * The shape of a template. Pure types and pure functions, so a deployment can
 * be checked without a database.
 */

export type TemplateNode = {
  title: string
  type: NodeType
  /** Dage fra projektets startdato til nodens frist. null = ingen frist. */
  offset_days: number | null
  is_milestone: boolean
  children: TemplateNode[]
}

export type TemplateRisk = {
  title: string
  waiting_on: string
  waiting_on_type: WaitingOnType
  /** Dage fra start til forventet svar. null = ingen forventning. */
  expected_days: number | null
}

export type TemplateBody = {
  nodes: TemplateNode[]
  risks: TemplateRisk[]
  /** Dokumentskelettet. Nummereringen er en del af navnet. */
  folders: string[]
}

export type Template = {
  id: string
  name: string
  description: string | null
  body: TemplateBody
  created_at: string
  updated_at: string
}

/** An empty template must not bring the page down. */
export function readBody(value: unknown): TemplateBody {
  const b = (value ?? {}) as Partial<TemplateBody>
  return {
    nodes: Array.isArray(b.nodes) ? b.nodes : [],
    risks: Array.isArray(b.risks) ? b.risks : [],
    folders: Array.isArray(b.folders) ? b.folders.filter((f) => typeof f === 'string') : [],
  }
}

/**
 * The default skeleton. Numbered so the folders sort themselves, and short
 * enough that people actually use it. Can be changed per template.
 */
export const DEFAULT_FOLDERS = [
  '01 Start here',
  '02 Contracts and legal',
  '03 Quotes and pricing',
  '04 Drawings and data',
  '05 Documentation',
] as const

/** «03 Quotes and pricing» -> «03». Used as the folder number in the display. */
export function folderNumber(name: string): string | null {
  const m = name.match(/^\s*(\d{1,2})\b/)
  return m ? m[1] : null
}

export function folderLabel(name: string): string {
  return name.replace(/^\s*\d{1,2}[\s._-]*/, '').trim() || name
}

export function countNodes(nodes: TemplateNode[]): number {
  return nodes.reduce((sum, n) => sum + 1 + countNodes(n.children), 0)
}

export function countMilestones(nodes: TemplateNode[]): number {
  return nodes.reduce(
    (sum, n) => sum + (n.is_milestone ? 1 : 0) + countMilestones(n.children),
    0,
  )
}

/** The longest offset in the tree: the template's span in days. */
export function spanDays(nodes: TemplateNode[]): number | null {
  let max: number | null = null
  const walk = (list: TemplateNode[]) => {
    for (const n of list) {
      if (n.offset_days !== null && (max === null || n.offset_days > max)) max = n.offset_days
      walk(n.children)
    }
  }
  walk(nodes)
  return max
}

/**
 * Derive a template from an existing project tree. Dates become distances
 * from the project start, so the tree can be laid down anywhere in the
 * calendar again.
 */
export function deriveTemplate(
  rows: {
    id: string
    parent_id: string | null
    title: string
    type: NodeType
    due_date: string | null
    is_milestone: boolean
    sort_order: number
  }[],
  rootId: string,
  start: string,
): TemplateNode[] {
  const children = new Map<string, typeof rows>()
  for (const r of rows) {
    if (r.parent_id === null) continue
    children.set(r.parent_id, [...(children.get(r.parent_id) ?? []), r])
  }
  for (const list of children.values()) list.sort((a, b) => a.sort_order - b.sort_order)

  const build = (parentId: string): TemplateNode[] =>
    (children.get(parentId) ?? []).map((r) => ({
      title: r.title,
      type: r.type,
      offset_days: r.due_date === null ? null : daysBetween(start, r.due_date),
      is_milestone: r.is_milestone,
      children: build(r.id),
    }))

  return build(rootId)
}

/** Flat output for insertion: the parent is pointed at by index. */
export type PlannedNode = {
  index: number
  parentIndex: number | null
  title: string
  type: NodeType
  due_date: string | null
  is_milestone: boolean
  sort_order: number
}

export function planNodes(nodes: TemplateNode[], start: string): PlannedNode[] {
  const out: PlannedNode[] = []

  const walk = (list: TemplateNode[], parentIndex: number | null) => {
    list.forEach((n, i) => {
      const index = out.length
      out.push({
        index,
        parentIndex,
        title: n.title,
        type: n.type,
        due_date: n.offset_days === null ? null : addDays(start, n.offset_days),
        is_milestone: n.is_milestone,
        sort_order: (i + 1) * 10,
      })
      walk(n.children, index)
    })
  }

  walk(nodes, null)
  return out
}
