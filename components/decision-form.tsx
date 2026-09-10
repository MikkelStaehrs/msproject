import Link from 'next/link'
import { today } from '@/lib/date'
import { createDecision, deleteDecision, updateDecision } from '@/lib/decision-actions'
import { Hint } from '@/components/ui'
import {
  DECISION_TOPICS,
  DECISION_TOPIC_LABEL,
  type Decision,
  type DecisionTopic,
} from '@/lib/types'

function Field({
  label,
  hint,
  children,
  span = 1,
}: {
  label: string
  hint?: string
  children: React.ReactNode
  span?: number
}) {
  return (
    <label className="block" style={{ gridColumn: `span ${span}` }}>
      <span className="lbl block text-muted">
        {hint ? <Hint text={hint}>{label}</Hint> : label}
      </span>
      {children}
    </label>
  )
}

/**
 * A decision without the rejected option is a note. That is why «Rejected»
 * stands as an equal field and not a footnote: it is the half you are missing
 * when someone asks why, six months later.
 */
export function DecisionForm({
  decision,
  nodeId,
  redirectTo,
  cancelHref,
  defaultTopic,
}: {
  decision?: Decision
  nodeId?: string
  redirectTo: string
  cancelHref: string
  /** Preselected where the page already knows the heading, as on Basis. */
  defaultTopic?: DecisionTopic
}) {
  const editing = decision !== undefined
  const formId = `decision-form-${decision?.id ?? 'ny'}`

  return (
    <div className="border-y border-rule-strong bg-sheet px-6 py-5">
      <div className="lbl mb-4 text-muted">
        {editing ? 'Edit decision' : 'New decision'}
      </div>

      <form
        id={formId}
        action={editing ? updateDecision : createDecision}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-4"
      >
        {editing ? (
          <input type="hidden" name="id" value={decision.id} />
        ) : (
          <input type="hidden" name="node_id" value={nodeId ?? ''} />
        )}
        <input type="hidden" name="redirectTo" value={redirectTo} />

        <Field label="Decision" span={2}>
          <input
            name="decision"
            required
            autoFocus
            defaultValue={decision?.decision ?? ''}
            placeholder="Chose the 130 kV source over 90 kV"
            className="field text-base"
          />
        </Field>

        <Field
          label="Topic"
          hint="What the choice was about. This is what turns a list of decisions into a specification."
        >
          <select
            name="topic"
            defaultValue={decision?.topic ?? defaultTopic ?? ''}
            required
            className="field"
          >
            {/*
              No preselected topic on a new decision. A default would file
              hardware choices under whatever happened to be first, and a wrong
              heading is worse than an empty one.
            */}
            <option value="" disabled>
              Pick one
            </option>
            {DECISION_TOPICS.map((t) => (
              <option key={t} value={t}>
                {DECISION_TOPIC_LABEL[t]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Decided">
          <input
            type="date"
            name="decided_on"
            required={editing}
            defaultValue={decision?.decided_on ?? today()}
            className="field"
          />
        </Field>

        <Field label="Rationale" span={4}>
          <textarea
            name="rationale"
            rows={2}
            defaultValue={decision?.rationale ?? ''}
            placeholder="Why this way?"
            className="field resize-y"
          />
        </Field>

        <Field label="Rejected" hint="What was turned down, and what it cost to leave it." span={4}>
          <textarea
            name="alternatives"
            rows={2}
            defaultValue={decision?.alternatives ?? ''}
            placeholder="What it did not become, and what leaving it cost."
            className="field resize-y"
          />
        </Field>
      </form>

      <div className="mt-6 flex items-center gap-3">
        <button type="submit" form={formId} className="btn">
          {editing ? 'Save' : 'Record'}
        </button>
        <Link href={cancelHref} className="btn btn-ghost">
          Cancel
        </Link>
        {editing && (
          <form action={deleteDecision} className="ml-auto">
            <input type="hidden" name="id" value={decision.id} />
            <input type="hidden" name="redirectTo" value={redirectTo} />
            <button type="submit" className="btn btn-danger">
              Delete
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
