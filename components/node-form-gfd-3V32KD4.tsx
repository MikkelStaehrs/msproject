import Link from 'next/link'
import { createNode, updateNode } from '@/lib/node-actions'
import { DeleteNodeButton } from '@/components/delete-node-button'
import { PEOPLE_FIELDS } from '@/lib/identity'
import { Hint } from '@/components/ui'
import {
  CATEGORY_LABEL,
  STATUS_LABEL,
  TYPE_HINT,
  TYPE_LABEL,
  type Node,
  type NodeCategory,
  type NodeStatus,
  type NodeType,
} from '@/lib/types'

export type ParentOption = { id: string; title: string; depth: number }

function Field({
  label,
  children,
  span = 1,
}: {
  label: string
  children: React.ReactNode
  span?: number
}) {
  return (
    <label className="block" style={{ gridColumn: `span ${span}` }}>
      <span className="lbl text-muted">{label}</span>
      {children}
    </label>
  )
}

/**
 * One form for both create and edit. Derived fields, progress, day counts and
 * next date, do not appear here and therefore cannot be edited.
 */
export function NodeForm({
  node,
  parentId,
  parentOptions,
  redirectTo,
  cancelHref,
  descendantCount = 0,
}: {
  node?: Node
  parentId?: string | null
  parentOptions?: ParentOption[]
  redirectTo: string
  cancelHref: string
  descendantCount?: number
}) {
  const editing = node !== undefined
  const defaultType: NodeType = editing ? node.type : parentId ? 'task' : 'project'
  const formId = `node-form-${node?.id ?? 'ny'}`

  // Master data, project number, account string, goal, people and economics,
  // belongs on the identity page. Only what applies to any node is here.
  const isRoot = editing ? node.parent_id === null : (parentId ?? null) === null
  const people = (node?.reporting?.people ?? {}) as Record<string, string | undefined>
  const reporting = (node?.reporting ?? {}) as Record<string, string | undefined>
  const filledRoles = PEOPLE_FIELDS.filter((f) => people[f.key]).length

  return (
    <div className="border-y border-rule-strong bg-sheet px-6 py-5">
      <div className="lbl mb-4 text-muted">
        {editing ? 'Edit node' : parentId ? 'New child node' : 'New project'}
      </div>

      <form
        id={formId}
        action={editing ? updateNode : createNode}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-4"
      >
        {editing && <input type="hidden" name="id" value={node.id} />}
        {!editing && <input type="hidden" name="parent_id" value={parentId ?? ''} />}
        <input type="hidden" name="redirectTo" value={redirectTo} />
        <Field label="Title" span={4}>
          <input
            name="title"
            required
            autoFocus
            defaultValue={node?.title ?? ''}
            className="field text-base"
          />
        </Field>

        <Field label="Type">
          <select name="type" defaultValue={defaultType} className="field">
            {(Object.keys(TYPE_LABEL) as NodeType[]).map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]} · {TYPE_HINT[t]}
              </option>
            ))}
          </select>
          <span className="mt-1.5 block text-[10.5px] leading-snug text-rule-strong">
            Only a task without children counts as work. A container that never
            gets one holds nothing.
          </span>
        </Field>

        <Field label="Status">
          <select
            name="status"
            defaultValue={node?.status ?? 'planned'}
            className="field"
          >
            {(Object.keys(STATUS_LABEL) as NodeStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Category">
          <select
            name="category"
            defaultValue={node?.category ?? ''}
            className="field"
          >
            <option value="">-</option>
            {(Object.keys(CATEGORY_LABEL) as NodeCategory[]).map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Owner">
          <input
            name="owner"
            defaultValue={node?.owner ?? ''}
            placeholder="IT, Vendor, Management..."
            className="field"
          />
        </Field>

        <Field label="Start">
          <input
            type="date"
            name="start_date"
            defaultValue={node?.start_date ?? ''}
            className="field"
          />
        </Field>

        <Field label="Due">
          <input
            type="date"
            name="due_date"
            defaultValue={node?.due_date ?? ''}
            className="field"
          />
        </Field>

        <Field label="Estimate, days">
          <div className="flex items-baseline gap-2">
            <input
              type="number"
              min="0"
              step="1"
              name="estimate_low_days"
              defaultValue={node?.estimate_low_days ?? ''}
              placeholder="3"
              className="field"
            />
            <span className="shrink-0 text-[11px] text-muted">to</span>
            <input
              type="number"
              min="0"
              step="1"
              name="estimate_high_days"
              defaultValue={node?.estimate_high_days ?? ''}
              placeholder="5"
              className="field"
            />
          </div>
        </Field>

        {editing && parentOptions && (
          <Field label="Parent" span={2}>
            <select
              name="parent_id"
              defaultValue={node.parent_id ?? ''}
              className="field"
            >
              <option value="">Top level</option>
              {parentOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {'  '.repeat(p.depth)}
                  {p.title}
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field label="Location" span={2}>
          <input
            name="reporting_location"
            defaultValue={reporting.location ?? ''}
            placeholder="Hall 3, packing line 2"
            className="field"
          />
        </Field>

        <Field label="Description" span={4}>
          <textarea
            name="description"
            rows={2}
            defaultValue={node?.description ?? ''}
            className="field resize-y"
          />
        </Field>

        {isRoot && editing && (
          <p className="col-span-1 sm:col-span-2 lg:col-span-4 text-[11px] text-muted">
            Project no., account string, goal, people and economics live on{' '}
            <Link href={`/p/${node.id}/identitet`} className="text-green">
              Identity
            </Link>
            .
          </p>
        )}

        {!isRoot && (
          <details open={filledRoles > 0} className="col-span-1 sm:col-span-2 lg:col-span-4 border-t border-rule pt-3">
            <summary className="lbl cursor-pointer text-muted marker:text-rule-strong">
              Roles
              {filledRoles > 0 && (
                <span className="ml-2 text-rule-strong">{filledRoles} filled</span>
              )}
            </summary>
            <p className="mt-2 max-w-[70ch] text-[11px] leading-relaxed text-muted">
              Only fill these in when this part is run by someone other than the
              project. A hardware installation is often led by a different profile
              than the programme around it.
            </p>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-4">
              {PEOPLE_FIELDS.map((f) => (
                <label
                  key={f.key}
                  className="block"
                  style={{
                    gridColumn:
                      f.key === 'steering' || f.key === 'members' || f.key === 'stakeholders'
                        ? 'span 4'
                        : 'span 1',
                  }}
                >
                  <span className="lbl block text-muted">
                    {f.hint ? <Hint text={f.hint}>{f.label}</Hint> : f.label}
                  </span>
                  <input
                    name={`people_${f.key}`}
                    defaultValue={people[f.key] ?? ''}
                    className="field"
                  />
                </label>
              ))}
            </div>
          </details>
        )}

        <label className="col-span-1 sm:col-span-2 lg:col-span-4 flex items-center gap-2.5 text-xs">
          <input
            type="checkbox"
            name="is_milestone"
            defaultChecked={node?.is_milestone ?? false}
            className="size-3.5 accent-[#1e4a34]"
          />
          Mark as milestone
        </label>
      </form>

      <div className="mt-6 flex items-center gap-3">
        <button type="submit" form={formId} className="btn">
          {editing ? 'Save' : 'Create'}
        </button>
        <Link href={cancelHref} className="btn btn-ghost">
          Cancel
        </Link>
        {editing && (
          <div className="ml-auto">
            <DeleteNodeButton
              id={node.id}
              title={node.title}
              descendants={descendantCount}
              redirectTo={redirectTo}
            />
          </div>
        )}
      </div>
    </div>
  )
}
