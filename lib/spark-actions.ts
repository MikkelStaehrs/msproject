'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { back, number, required, text } from '@/lib/form'
import {
  WORTH_BASES,
  type NodeType,
  type SavingKind,
  type SparkSource,
  type WorthBasis,
} from '@/lib/types'

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
 * What a thought claims, refused rather than half stored.
 *
 * Three answers and only silence rejected. The reasoning is in
 * 20260911000003: a required AMOUNT is worse than an empty field, because not
 * everything has a saving and forcing one produces a fiction that outlives
 * whoever typed it.
 *
 * The three scores are required together or not at all. `priorityScore` returns
 * null unless all three are set, deliberately, so two out of three buy nothing:
 * either the candidate has a place in the benefit-against-complexity matrix or
 * it does not.
 *
 * Read here and checked again by the database. The constraint is what a second
 * caller cannot forget.
 */
function claimFrom(fd: FormData): {
  worth_basis: WorthBasis
  worth_note: string | null
  saving_kind: SavingKind | null
  saving_value: number | null
  saving_stage: string | null
  cost_score: number
  benefit_score: number
  complexity_score: number
} {
  const asked = text(fd, 'worth_basis')
  if (asked === null) {
    throw new Error(
      'Say what this is worth before it becomes work. A saving, or no direct ' +
        'saving with a reason, or not worked out yet. Any of the three is a ' +
        'real answer; leaving it blank is not.',
    )
  }
  if (!(WORTH_BASES as readonly string[]).includes(asked)) {
    throw new Error(`Unknown basis: ${asked}`)
  }
  const basis = asked as WorthBasis

  const kind = text(fd, 'saving_kind') as SavingKind | null
  const value = number(fd, 'saving_value')
  const note = text(fd, 'worth_note')

  if (basis === 'saving') {
    if (kind === null || value === null) {
      throw new Error('A saving needs both a way of describing it and a figure.')
    }
    if (kind === 'per_unit' && text(fd, 'saving_stage') === null) {
      throw new Error(
        'A saving per unit needs the stage those units pass through: the ' +
          'stages do not run the same quantities.',
      )
    }
  }
  if (basis === 'enabling' && note === null) {
    throw new Error(
      'Say in a sentence why it is worth doing. That sentence is the whole ' +
        'answer when there is no figure, and it is what somebody reads in six ' +
        'months.',
    )
  }

  const score = (key: string, human: string) => {
    const n = number(fd, key)
    if (n === null) {
      throw new Error(
        `${human} is missing. All three are needed or none of them count: two ` +
          'out of three make a score that looks comparable to a complete one ' +
          'and is not.',
      )
    }
    return Math.min(5, Math.max(1, Math.round(n)))
  }

  return {
    worth_basis: basis,
    worth_note: basis === 'enabling' ? note : null,
    saving_kind: basis === 'saving' ? kind : null,
    saving_value: basis === 'saving' ? value : null,
    saving_stage: basis === 'saving' && kind === 'per_unit' ? text(fd, 'saving_stage') : null,
    cost_score: score('cost_score', 'Cost'),
    benefit_score: score('benefit_score', 'Benefit'),
    complexity_score: score('complexity_score', 'Complexity'),
  }
}

/**
 * It becomes work.
 *
 * The node is created where you say, with the spark's own words as its
 * description, and the spark is marked as having become it. Two rows written in one step,
 * because the alternative is creating the node on one page and remembering to
 * come back and tick the spark off on another, which nobody does.
 *
 * A project has no parent. Anything else needs one, and that is checked HERE
 * rather than prevented in the form.
 *
 * An earlier version of this comment claimed the form only offered types that
 * could sit under the parent you had picked. It never did, and saying so was
 * worse than the gap itself: the next person to read it takes the constraint
 * for granted and stops looking. The form offers all four types and every
 * container, the two fields can be set to contradict each other, and this
 * refuses the one combination that cannot be stored. Picking «project» with a
 * parent is not refused, it is resolved: a project is a root, so the parent is
 * dropped on the line below.
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

  /*
   * The claim is settled BEFORE the node exists.
   *
   * It is written onto the spark rather than only into node_origin, because the
   * spark is what a person goes back and edits, and an origin holding a figure
   * the thought itself never carried would be a claim with no author. The copy
   * into node_origin below then freezes what was true at this moment, which is
   * the whole point of that table.
   */
  const claim = claimFrom(fd)

  /*
   * Which rules this piece of work is signing up to.
   *
   * A strategy marking used to be something you added afterwards on a page
   * nobody visited, which is why there were none at all. Asked here it becomes
   * a commitment made at the moment the commitment is actually made.
   *
   * And it decides which of the three answers above is good enough. The COGS
   * strategy is «take a euro out of every unit, every year»: work that claims
   * to serve it and carries no figure is not serving it, it is hoping to, and a
   * total that adds up hopes is one nobody can report upwards. So a marking
   * demands a saving.
   *
   * The way out is not to argue the figure down, it is to promote it unmarked
   * and mark it the day the figure exists. The total stays true the whole way
   * rather than carrying a placeholder.
   */
  const strategyId = text(fd, 'strategy_id')
  if (strategyId !== null && claim.worth_basis !== 'saving') {
    throw new Error(
      'Work marked as serving a strategy has to carry a saving. If the figure ' +
        'is not worked out yet, create it without the marking and add the ' +
        'marking the day it is: a strategy total that adds up intentions is ' +
        'one nobody can report upwards.',
    )
  }

  /*
   * And what an ordinary project is for.
   *
   * Not everything saves money, and demanding a figure of the work that does
   * not is how you get a fiction in a column. But a project nobody can say the
   * point of is a project nobody can ever close, so the one thing asked instead
   * is the goal, which is the field `reporting.pid.goal` has always had and
   * which nothing has ever required.
   */
  const goal = text(fd, 'goal')
  if (strategyId === null && goal === null) {
    throw new Error(
      'Say what this should achieve, and how you will be able to tell whether ' +
        'it worked. A goal without the second half is a wish.',
    )
  }

  const { error: claimError } = await supabase
    .from('spark')
    .update(claim)
    .eq('id', id)

  if (claimError) {
    throw new Error(`Could not record what it is worth: ${claimError.message}`)
  }

  const { data: spark, error: readError } = await supabase
    .from('spark')
    .select('body, note, saving_kind, saving_value, saving_stage, cost_score, benefit_score, complexity_score, worth_basis, worth_note')
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
      /*
       * The goal lands where the identity page already reads it from, so it is
       * one field in one place rather than a second copy that drifts. Written
       * only when there is one: a marked piece of work answered the question a
       * different way.
       */
      reporting: goal === null ? {} : { pid: { goal } },
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
   * The marking, now that there is something to mark.
   *
   * Not fatal if it fails, for the same reason the origin below is not: the
   * work exists and that is what mattered. But it is said out loud, because a
   * piece of work that was meant to serve a strategy and silently does not is
   * a figure missing from a total somebody will report.
   */
  if (strategyId !== null) {
    const { error: markError } = await supabase
      .from('node_strategy')
      .insert({ node_id: nodeId, strategy_id: strategyId })

    if (markError && markError.code !== '23505') {
      console.error(`node_strategy not written for ${nodeId}: ${markError.message}`)
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
    worth_basis: spark.worth_basis,
    worth_note: spark.worth_note,
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

/**
 * The third way out: it was never work.
 *
 * Some thoughts are an observation about work that is ALREADY running. «The CT
 * scan has been moved out of the analytics room» is not a task, and until now
 * the only thing a spark could become was a node, so it had to be forced into
 * being one or thrown away. Both are wrong, and the second is worse, because
 * the thought was true.
 *
 * So it becomes a line in the log on the node it concerns. That is also the
 * only route this application has ever had from «I thought of something» to
 * `entry`, which is the table the entire weekly report is assembled from and
 * which held two rows when this was written.
 *
 * NO GATE HERE, and that is deliberate rather than an omission. The claim is
 * demanded of a thought that becomes WORK, because work is what gets ranked,
 * funded and reported. An observation about work already underway owes nobody a
 * business case, and asking for one is how you teach somebody not to write the
 * line at all.
 *
 * The kind is `work` rather than `note`, matching quick entry: the kind follows
 * from WHERE a line was written, and this is the same act as typing it into the
 * overlay, arriving by a different door.
 */
export async function logSpark(fd: FormData) {
  const supabase = await createClient()

  const id = required(fd, 'id')
  const nodeId = required(fd, 'node_id')

  const { data: spark, error: readError } = await supabase
    .from('spark')
    .select('body, note')
    .eq('id', id)
    .single()

  if (readError) throw new Error(`Could not read it: ${readError.message}`)

  /*
   * Both halves travel, as they do on promotion. The sentence is what was said;
   * the note is what made it make sense, and a log line is exactly where that
   * context is worth having. Two paragraphs, because prose renders them as such.
   */
  const body = spark.note ? `${spark.body}\n\n${spark.note}` : spark.body

  const entryId = randomUUID()

  const { error: entryError } = await supabase
    .from('entry')
    .insert({ id: entryId, node_id: nodeId, body, kind: 'work' })

  if (entryError) throw new Error(`Could not write the log line: ${entryError.message}`)

  /*
   * `became_entry_id` beside `became_node_id`, never instead of it. «Became this
   * node» and «was written onto this node» are different facts, and six months
   * later nobody should have to work out which happened from the shape of the
   * data.
   */
  const { error } = await supabase
    .from('spark')
    .update({ state: 'kept', became_node_id: nodeId, became_entry_id: entryId })
    .eq('id', id)

  if (error) {
    throw new Error(`The line was written but the spark did not close: ${error.message}`)
  }

  revalidatePath('/', 'layout')
  back(fd)
}
