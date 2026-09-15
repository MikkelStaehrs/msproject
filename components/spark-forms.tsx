import Link from 'next/link'
import {
  createSpark,
  dropSpark,
  editSpark,
  logSpark,
  promoteSpark,
} from '@/lib/spark-actions'
import { Hint } from '@/components/ui'
import { count } from '@/lib/cost'
import {
  SAVING_KINDS,
  SAVING_KIND_HINT,
  SAVING_KIND_LABEL,
  WORTH_BASES,
  WORTH_BASIS_HINT,
  WORTH_BASIS_LABEL,
  TYPE_HINT,
  TYPE_LABEL,
  type NodeType,
  type Spark,
} from '@/lib/types'

/**
 * The forms a thought can open, in place.
 *
 * Every one of them is reached through a URL parameter and rendered under the
 * row it belongs to, so the table stays where it was and the page stays a
 * Server Component. They are the same forms the old page carried, in the
 * concept's shape: one panel, labels in mono, fields as rules, one primary
 * button and a Cancel that is a link back to the list.
 */

type NodeOption = { id: string; label: string; type: NodeType }

function Actions({ label, cancelHref }: { label: string; cancelHref: string }) {
  return (
    <div className="grp-gap flex items-center gap-3">
      <button className="btn">{label}</button>
      <Link href={cancelHref} className="btn btn-ghost">
        Cancel
      </Link>
    </div>
  )
}

/**
 * Capture. One field and nothing else that is required.
 *
 * The good ideas arrive in a car park, and anything that asks which project
 * this is under before it will accept the sentence is a thing you will not
 * open at eleven at night. Deciding where it goes is a different job, done
 * here later with the tree in front of you.
 */
export function SparkCapture({ redirectTo, cancelHref }: { redirectTo: string; cancelHref: string }) {
  return (
    <form action={createSpark} className="panel panel-b max-w-[760px]">
      <input type="hidden" name="redirectTo" value={redirectTo} />
      <label className="block">
        <span className="lbl text-muted">
          <Hint text="No type, no project, no date. Write the sentence and go back to sleep.">
            What was the thought
          </Hint>
        </span>
        <textarea
          name="body"
          required
          autoFocus
          rows={2}
          placeholder="We should be logging the cleaning line stops automatically"
          className="field resize-y"
        />
      </label>
      <label className="grp-gap block">
        <span className="lbl text-muted">
          <Hint text="Optional, and skip it at eleven at night. It is what makes the thought still readable in three weeks.">
            What was around it
          </Hint>
        </span>
        <textarea
          name="note"
          rows={2}
          placeholder="Came up while looking at the stop log on line 3"
          className="field resize-y"
        />
      </label>
      <Actions label="Capture" cancelHref={cancelHref} />
    </form>
  )
}

export function SparkEdit({
  spark,
  redirectTo,
  cancelHref,
}: {
  spark: Spark
  redirectTo: string
  cancelHref: string
}) {
  return (
    <form action={editSpark} className="panel panel-b max-w-[760px]">
      <input type="hidden" name="id" value={spark.id} />
      <input type="hidden" name="redirectTo" value={redirectTo} />
      <label className="block">
        <span className="lbl text-muted">The thought</span>
        <textarea
          name="body"
          required
          autoFocus
          rows={2}
          defaultValue={spark.body}
          className="field resize-y"
        />
      </label>
      <label className="grp-gap block">
        <span className="lbl text-muted">
          <Hint text="What made the thought make sense at the time. Claude fills this in when it captures one; you can change it or empty it.">
            What was around it
          </Hint>
        </span>
        <textarea
          name="note"
          rows={2}
          defaultValue={spark.note ?? ''}
          className="field resize-y"
        />
      </label>
      <Actions label="Save" cancelHref={cancelHref} />
    </form>
  )
}

/**
 * Decided against.
 *
 * The row stays and the reason goes with it. It is what stops the same idea
 * arriving again in three months and going round the loop a second time,
 * which is why a dropped spark is kept and not deleted.
 */
export function SparkDrop({
  spark,
  redirectTo,
  cancelHref,
}: {
  spark: Spark
  redirectTo: string
  cancelHref: string
}) {
  return (
    <form action={dropSpark} className="panel panel-b max-w-[760px]">
      <input type="hidden" name="id" value={spark.id} />
      <input type="hidden" name="redirectTo" value={redirectTo} />
      <label className="block">
        <span className="lbl text-muted">
          <Hint text="Worth a line. Without it the verdict is a date, and a date does not stop the idea coming back.">
            Why not
          </Hint>
        </span>
        <input
          name="verdict"
          autoFocus
          placeholder="The PLC cannot expose it without a licence we are not buying"
          className="field"
        />
      </label>
      <Actions label="Drop it" cancelHref={cancelHref} />
    </form>
  )
}

/**
 * It was never work: a line in the log on work already running.
 *
 * No gate here, deliberately. The claim is demanded of a thought that becomes
 * WORK, because work is what gets ranked, funded and reported upwards. An
 * observation about something already underway owes nobody a business case,
 * and asking for one is how you teach somebody not to write the line at all.
 */
export function SparkLogOn({
  spark,
  nodes,
  redirectTo,
  cancelHref,
}: {
  spark: Spark
  nodes: NodeOption[]
  redirectTo: string
  cancelHref: string
}) {
  return (
    <form action={logSpark} className="panel panel-b max-w-[760px]">
      <input type="hidden" name="id" value={spark.id} />
      <input type="hidden" name="redirectTo" value={redirectTo} />
      <label className="block">
        <span className="lbl text-muted">
          <Hint text="Every node, tasks included. A line belongs on the work it happened on, not on the box above it.">
            Which work is this about
          </Hint>
        </span>
        <select name="node_id" required defaultValue="" autoFocus className="field">
          <option value="" disabled>
            Choose the node
          </option>
          {nodes.map((n) => (
            <option key={n.id} value={n.id}>
              {n.label}
            </option>
          ))}
        </select>
      </label>
      <p className="grp-gap max-w-[64ch] text-[12px] leading-relaxed text-muted">
        The thought becomes a log entry, word for word, with whatever was noted
        around it. No task is created, and the spark closes pointing at the line
        it became.
      </p>
      <Actions label="Write it in the log" cancelHref={cancelHref} />
    </form>
  )
}

/**
 * It becomes work.
 *
 * The node is created where you say, with the spark's own words as its
 * description. The gate in the middle is the reason the form is longer than
 * it looks like it should be: seven thoughts were captured and none assessed,
 * because assessing was a separate act you could always do later. Optional
 * means never, and that is not a claim about discipline, it is what the table
 * said after a fortnight. So a claim is asked for HERE, at the moment the
 * commitment is made, and it asks for an ANSWER and never for an amount.
 */
export function SparkPromote({
  spark,
  nodes,
  strategies,
  stages,
  redirectTo,
  cancelHref,
}: {
  spark: Spark
  nodes: NodeOption[]
  strategies: { id: string; name: string }[]
  stages: { stage: string; units: number }[]
  redirectTo: string
  cancelHref: string
}) {
  return (
    <form action={promoteSpark} className="panel panel-b max-w-[960px]">
      <input type="hidden" name="id" value={spark.id} />
      <input type="hidden" name="redirectTo" value={redirectTo} />

      <div className="grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="col-span-1 block sm:col-span-2">
          <span className="lbl text-muted">
            <Hint text="The thought becomes the description. Give it a name here: how you first put it is often clearer than the name, so both are kept.">
              Call it
            </Hint>
          </span>
          <input
            name="title"
            required
            autoFocus
            defaultValue={spark.body.split('\n')[0].slice(0, 70)}
            className="field"
          />
        </label>

        {/*
          Defaults to «project», because the field beside it defaults to
          «nowhere, it is a project» and the two have to agree. The hint sits
          INSIDE each option: this is a server component and the select is
          uncontrolled, so a hint outside it could only describe one of the four.
        */}
        <label className="block">
          <span className="lbl text-muted">As a</span>
          <select name="type" defaultValue="project" className="field">
            {(Object.keys(TYPE_LABEL) as NodeType[]).map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]} · {TYPE_HINT[t]}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="lbl text-muted">
            <Hint text="Leave empty only for a project. Everything else has to sit somewhere.">
              Under
            </Hint>
          </span>
          <select name="parent_id" defaultValue="" className="field">
            <option value="">nowhere, it is a project</option>
            {nodes
              .filter((n) => n.type !== 'task')
              .map((n) => (
                <option key={n.id} value={n.id}>
                  {n.label}
                </option>
              ))}
          </select>
        </label>
      </div>

      <div className="grp-gap border-t border-line pt-4">
        <div className="lbl text-muted">Before it becomes work</div>

        {/*
          Which rules it signs up to, and that decides which answer below is
          good enough. Marked, it has to carry a saving: «take a euro out of
          every unit» is not served by work with no figure, it is only hoped
          at. Unmarked, the question is the goal instead, because a project
          nobody can state the point of is one nobody can ever close.
        */}
        <div className="mt-3 grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2">
          <label className="block">
            <span className="lbl text-muted">
              <Hint text="Marked work has to carry a saving. If the figure is not worked out yet, leave it unmarked and mark it the day it is.">
                Does it serve a strategy
              </Hint>
            </span>
            <select name="strategy_id" defaultValue="" className="field">
              <option value="">no, an ordinary project</option>
              {strategies.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.name} · needs a figure
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="lbl text-muted">
              <Hint text="Required for an ordinary project. What it must achieve, and how you can tell whether it worked. A goal without the second half is a wish.">
                Goal, if it is ordinary
              </Hint>
            </span>
            <input
              name="goal"
              placeholder="operators see line stops without asking IT for a report"
              className="field"
            />
          </label>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="col-span-1 block sm:col-span-2">
            <span className="lbl text-muted">
              <Hint text="Any of the three is a real answer. Leaving it blank is not, which is the only thing this refuses.">
                What is it worth
              </Hint>
            </span>
            <select name="worth_basis" defaultValue={spark.worth_basis ?? 'unknown'} className="field">
              {WORTH_BASES.map((w) => (
                <option key={w} value={w}>
                  {WORTH_BASIS_LABEL[w]} · {WORTH_BASIS_HINT[w]}
                </option>
              ))}
            </select>
          </label>

          {/*
            Both conditional fields are always rendered. There is no client
            state to hide one behind, so the server refuses the combinations
            that do not hold together, and says which. Prefilled from an
            assessment already made, so the figure is not typed twice.
          */}
          <label className="block">
            <span className="lbl text-muted">If it saves</span>
            <select name="saving_kind" defaultValue={spark.saving_kind ?? ''} className="field">
              <option value="">not a saving</option>
              {SAVING_KINDS.map((k) => (
                <option key={k} value={k}>
                  {SAVING_KIND_LABEL[k]} · {SAVING_KIND_HINT[k]}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="lbl text-muted">How much</span>
            <input
              name="saving_value"
              inputMode="decimal"
              defaultValue={spark.saving_value ?? ''}
              className="field tabular-nums"
            />
          </label>

          <label className="col-span-1 block sm:col-span-2">
            <span className="lbl text-muted">
              <Hint text="Only for a saving per unit: the stages do not run the same quantities, so the same figure is worth more on one line than another.">
                Through which stage
              </Hint>
            </span>
            <select name="saving_stage" defaultValue={spark.saving_stage ?? ''} className="field">
              <option value="">not per unit</option>
              {stages.map((v) => (
                <option key={v.stage} value={v.stage}>
                  {v.stage} · {count(v.units)} units
                </option>
              ))}
            </select>
          </label>

          <label className="col-span-1 block sm:col-span-2">
            <span className="lbl text-muted">
              <Hint text="Required when there is no direct saving. It is the whole answer in that case, and the thing somebody reads in six months.">
                Why it is worth doing anyway
              </Hint>
            </span>
            <input
              name="worth_note"
              defaultValue={spark.worth_note ?? ''}
              placeholder="it lets the data platform start, and removes the manual step"
              className="field"
            />
          </label>
        </div>

        {/*
          All three or none. priorityScore returns null unless every one is
          set, because two out of three make a number that looks comparable to
          a complete one and is not.
        */}
        <div className="mt-4 grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-3">
          {(
            [
              ['benefit_score', 'Benefit', spark.benefit_score, '1 marginal, 5 large'],
              ['cost_score', 'Cost', spark.cost_score, '1 cheap, 5 expensive'],
              ['complexity_score', 'Complexity', spark.complexity_score, '1 simple, 5 hairy'],
            ] as const
          ).map(([name, label, value, hint]) => (
            <label key={name} className="block">
              <span className="lbl text-muted">
                <Hint text={hint}>{label}</Hint>
              </span>
              <select name={name} defaultValue={value ?? 3} className="field">
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </div>

      <Actions label="Create it" cancelHref={cancelHref} />
    </form>
  )
}
