import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { QueryFailure, firstError } from '@/lib/failure'
import { readCloseState } from '@/lib/standup-close-data'
import { validate } from '@/lib/standup-close'
import { readPeople, nameOf } from '@/lib/person-data'
import { projectOf } from '@/lib/subtree'
import { formatDate, formatDateLong } from '@/components/ui'
import { StandupSteps, STEP_KEYS } from '@/components/standup-steps'
import { StepTimer } from '@/components/step-timer'
import type { Node, Standup, StandupAttendee, StandupItem } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Stand-up' }

/**
 * The stand-up, walked.
 *
 * Seven steps in the order a meeting actually runs, one screen each, because
 * what a facilitator needs is not an overview. It is to know what is being
 * talked about right now and what has to be answered before moving on. Three
 * chapters on tabs let the room wander; a stepper does not.
 *
 * THE MEETING EXISTS BEFORE IT HAPPENS. Exactly one stand-up is open at a time
 * and closing it creates the next, so there is no longer a gesture that says
 * «it happened» after the fact. That is what makes «since last time» a range on
 * a row rather than a comparison between two of them, and it is what stops a
 * skipped week being reported as a quiet one.
 *
 * Everything the room says is written as it is said. The close records that the
 * meeting did these things; it does not do them. The two exceptions are
 * decisions and sparks, which bring rows into existence and therefore wait.
 */
export default async function StandupPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  const [standupRes, nodeRes, profileRes, itemRes, attendeeRes] = await Promise.all([
    supabase.from('standup').select('*').eq('status', 'open').maybeSingle(),
    supabase.from('node').select('*').order('sort_order'),
    supabase.from('profile').select('id, full_name, email'),
    supabase.from('standup_item').select('*'),
    supabase.from('standup_attendee').select('*'),
  ])

  const failure = firstError([nodeRes, profileRes, itemRes, attendeeRes])
  if (failure) return <QueryFailure message={failure} />

  const standup = standupRes.data as Standup | null

  /*
   * No open meeting is a schema that has not caught up, not an empty state.
   * The migration creates one and every close creates the next, so the only
   * way to see this is a database behind the code.
   */
  if (!standup) {
    return (
      <main className="px-[var(--gut)] py-[26px]">
        <div className="work mx-auto">
          <h1 className="text-[34px] font-semibold leading-[1.08] tracking-[-0.03em] text-green">
            No stand-up is open
          </h1>
          <p className="prose-measure grp-gap text-green-soft">
            One is created when the last one closes, so this means the database is
            behind the code. Applying the migrations puts it right.
          </p>
          <Link href="/standup/arkiv" className="act grp-gap inline-block">
            The ones that have closed
          </Link>
        </div>
      </main>
    )
  }

  const state = await readCloseState(supabase, standup.id)
  const problems = validate(state)

  const nodes = (nodeRes.data ?? []) as Node[]
  const people = await readPeople(supabase)
  const peopleById = new Map(people.map((p) => [p.id, p.label]))
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const projectOfNode = projectOf(nodes)

  const items = ((itemRes.data ?? []) as StandupItem[]).filter(
    (i) => i.standup_id === standup.id,
  )
  const attendance = new Map(
    ((attendeeRes.data ?? []) as StandupAttendee[])
      .filter((a) => a.standup_id === standup.id)
      .map((a) => [a.person_id, a.present] as [string, boolean]),
  )

  const step = STEP_KEYS.includes(params.step ?? '') ? (params.step as string) : '1'

  /* Work the room can commit to: in flight, and small enough to name. */
  const hasChildren = new Set(
    nodes.map((n) => n.parent_id).filter((p): p is string => p !== null),
  )
  const live = nodes
    .filter(
      (n) =>
        n.parent_id !== null &&
        !hasChildren.has(n.id) &&
        (n.status === 'active' || n.status === 'planned'),
    )
    .map((n) => ({
      id: n.id,
      title: n.title,
      project: byId.get(projectOfNode.get(n.id) ?? n.id)?.title ?? '',
      driverId: n.driver_id,
      dueDate: n.due_date,
    }))

  const facilitator = standup.facilitator_id
    ? nameOf(peopleById, standup.facilitator_id)
    : null

  return (
    <main>
      {/* The band: which meeting, what period, and whether it can close */}
      <div className="grid grid-cols-1 border-b border-line-strong lg:grid-cols-[auto_1fr_auto]">
        <div className="lbl px-[var(--gut)] py-2.5 text-muted lg:pr-6">Stand-up</div>
        <div className="lbl border-t border-line px-[var(--gut)] py-2.5 text-muted lg:border-l lg:border-t-0 lg:px-6">
          <span className="text-ink">
            {standup.period_from
              ? `Since ${formatDate(standup.period_from.slice(0, 10))}`
              : 'The first one, so everything counts'}
          </span>
          {standup.scheduled_at &&
            ` · planned for ${formatDateLong(standup.scheduled_at.slice(0, 10))}`}
          {facilitator && ` · run by ${facilitator}`}
          {problems.length > 0 && (
            <span className="text-rust">
              {' '}
              · {problems.length} {problems.length === 1 ? 'thing' : 'things'} to answer
            </span>
          )}
        </div>
        <div className="flex items-center justify-end gap-6 border-t border-line px-[var(--gut)] py-2.5 lg:border-l lg:border-t-0">
          <StepTimer step={step} />
          <Link href="/standup/arkiv" className="act">
            Archive
          </Link>
        </div>
      </div>

      <StandupSteps
        step={step}
        standupId={standup.id}
        state={state}
        problems={problems}
        items={items}
        attendance={attendance}
        people={people}
        peopleById={peopleById}
        facilitatorId={standup.facilitator_id}
        live={live}
        byId={byId}
        projectOfNode={projectOfNode}
      />
    </main>
  )
}
