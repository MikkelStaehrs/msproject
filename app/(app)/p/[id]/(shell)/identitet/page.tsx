import Link from 'next/link'
import {
  costPicture,
  formatMoney,
  payback as paybackOf,
  unpricedShare,
} from '@/lib/cost'
import { ProjectFrame } from '@/components/project-frame'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { QueryFailure, firstError } from '@/lib/failure'
import { addMember, removeMember } from '@/lib/member-actions'
import { knownPeople, namedButLockedOut } from '@/lib/people'
import { PeopleHint } from '@/components/people-list'
import { PersonField } from '@/components/person-field'
import { subtreeSet } from '@/lib/subtree'
import { saveIdentity } from '@/lib/identity-actions'
import { addDependency, removeDependency } from '@/lib/dependency-actions'
import {
  APPROVAL_STATES,
  EDITABLE_ADMIN_FIELDS,
  approvalVariance,
  PEOPLE_FIELDS,
  GOAL_FIELD,
  NARRATIVE_FIELDS,
  formatAmount,
  formatYears,
  readIdentity,
  splitList,
} from '@/lib/identity'
import { readStage } from '@/lib/report'
import { Hint, formatDate, formatDateLong } from '@/components/ui'
import {
  type Blocker,
  type Decision,
  type ProjectMember,
  type Node,
  type NodeDependency,
  type NodeCost,
} from '@/lib/types'

export const dynamic = 'force-dynamic'

function Section({
  title,
  note,
  children,
}: {
  title: string
  note?: string
  children: React.ReactNode
}) {
  return (
    <section className="border-t border-rule-strong pt-6">
      <div className="flex items-baseline gap-4">
        <h3 className="font-display text-[22px] font-medium">{title}</h3>
        {note && <span className="text-[11px] text-muted">{note}</span>}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  )
}

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

/** What is derived is shown but cannot be written. The rule everywhere. */
function Derived({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[150px_1fr] border-t border-rule py-3">
      <div className="lbl-tight text-muted">{label}</div>
      <div className="text-[12.5px] leading-relaxed">{children}</div>
    </div>
  )
}

export default async function IdentityPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  /*
   * One round trip. Asking which nodes sit underneath and only then filtering
   * by the answer costs a second wait for nothing at this size.
   */
  const [
    projectRes,
    milestoneRes,
    blockerRes,
    decisionRes,
    projectsRes,
    dependsRes,
    dependedRes,
    costRollRes,
    treeRes,
    memberRes,
    profileRes,
    reportingRes,
  ] = await Promise.all([
    supabase.from('node').select('*').eq('id', id).single(),
    supabase
      .from('node')
      .select('id, title, due_date, status')
      
      .eq('is_milestone', true)
      .order('due_date'),
    supabase.from('blocker').select('*'),
    supabase
      .from('decision')
      .select('*')
      
      .order('decided_on', { ascending: false }),
    supabase.from('node').select('id, title').is('parent_id', null).order('sort_order'),
    supabase.from('node_dependency').select('*').eq('node_id', id),
    supabase.from('node_dependency').select('*').eq('depends_on_id', id),
    supabase.from('v_node_cost').select('*').eq('node_id', id).maybeSingle(),
    supabase.from('node').select('id, parent_id'),
    supabase.from('project_member').select('*').eq('project_id', id),
    supabase.from('profile').select('id, email, full_name'),
    supabase.from('node').select('reporting'),
  ])

  /*
   * The project is left to notFound() below: `.single()` reports an absent row
   * as an error, and a project you are not a member of is absent rather than
   * broken. Everything else here is load bearing, and the costliest one is
   * silent: a failed member or profile read renders «nobody has access» on a
   * project that has a team.
   */
  const failure = firstError([
    milestoneRes,
    blockerRes,
    decisionRes,
    projectsRes,
    dependsRes,
    dependedRes,
    treeRes,
    memberRes,
    profileRes,
    reportingRes,
  ])
  if (failure) return <QueryFailure message={failure} />

  const project = projectRes.data as Node | null
  if (!project) notFound()

  const members = (memberRes.data ?? []) as ProjectMember[]
  const accounts = (profileRes.data ?? []) as {
    id: string
    email: string
    full_name: string | null
  }[]
  const emailOf = new Map(accounts.map((p) => [p.id, p.email]))

  // The same names the picker offers, written out for the fields that hold
  // several people, where a suggestion would replace the list rather than
  // extend it.
  const knownHere = knownPeople({
    // This said `accounts: []`, which meant the one hint under the fields that
    // hold several people could see every name already typed and not a single
    // colleague with a login. Adding a user was the one thing it could not see.
    accounts,
    roles: ((reportingRes.data ?? []) as { reporting: Record<string, unknown> }[]).map(
      (n) => (n.reporting?.people ?? {}) as Record<string, unknown>,
    ),
  })

  const identity = readIdentity(project.reporting)

  /*
   * Named in a role here, has a login, and still cannot open the project.
   *
   * Roles and access stay two lists, deliberately, because most people named on
   * a project will never sign in. But the separation has one sharp edge: name a
   * colleague who DOES have an account and nothing says they still cannot see
   * anything. It looks like it worked. This is the only place the two lists are
   * held against each other, and it is silent unless all three are true.
   */
  const lockedOut = namedButLockedOut({
    roles: PEOPLE_FIELDS.map((f) => ({
      label: f.label,
      value: identity.people[f.key],
    })),
    accounts,
    members: new Set(members.map((m) => m.user_id)),
  })
  const stage = readStage(project.reporting)
  // Fetched whole, cut here. See lib/subtree.
  const inProject = subtreeSet(
    (treeRes.data ?? []) as { id: string; parent_id: string | null }[],
    id,
  )
  const milestones = ((milestoneRes.data ?? []) as Pick<
    Node,
    'id' | 'title' | 'due_date' | 'status'
  >[]).filter((m) => inProject.has(m.id))
  const blockers = ((blockerRes.data ?? []) as Blocker[]).filter((b) =>
    inProject.has(b.node_id),
  )
  const decisions = ((decisionRes.data ?? []) as Decision[]).filter((d) =>
    inProject.has(d.node_id),
  )
  const projects = (projectsRes.data ?? []) as { id: string; title: string }[]
  const dependsOn = (dependsRes.data ?? []) as NodeDependency[]
  const dependedOnBy = (dependedRes.data ?? []) as NodeDependency[]
  const projectTitle = new Map(projects.map((p) => [p.id, p.title]))

  /*
   * Payback, with the running cost taken off the saving.
   *
   * It used to be cost divided by benefit, which quietly assumed the thing
   * costs nothing to keep. A licence of 9 600 a year against a saving of
   * 10 000 a year is not a saving of 10 000.
   */
  const costRoll = costRollRes.data as NodeCost | null
  const money: NodeCost = costRoll ?? {
    node_id: id,
    once_estimated: 0, once_quoted: 0, once_ordered: 0, once_invoiced: 0,
    once_committed: 0, once_priced: 0, once_with_paper: 0,
    annual_committed: 0, annual_priced: 0,
    capex_once_priced: 0, capex_once_committed: 0, capex_annual_priced: 0,
    opex_once_priced: 0, opex_once_committed: 0,
    opex_annual_priced: 0, opex_annual_committed: 0,
    once_items: 0, annual_items: 0, items: 0,
  }
  const picture = costPicture({
    roll: money,
    approved: identity.approval.amount,
    planned: identity.economics.cost,
  })
  const share = unpricedShare(picture)

  const payback = paybackOf({
    investment: identity.economics.cost,
    annualBenefit: identity.economics.benefit,
    annualRunning: Number(costRoll?.opex_annual_priced ?? 0),
  })
  const variance = approvalVariance(identity.approval, identity.economics)
  const base = `/p/${id}/identitet`

  // Projects this one can wait on: every other project, minus the ones
  // already listed.
  const alreadyLinked = new Set(dependsOn.map((d) => d.depends_on_id))
  const linkable = projects.filter((p) => p.id !== id && !alreadyLinked.has(p.id))
  const dependencies = [
    ...new Set([
      ...blockers.map((b) => b.waiting_on),
      ...(project.owner ? [project.owner] : []),
      ...splitList(identity.people.stakeholders),
    ]),
  ]

  return (
    <ProjectFrame projectId={id} frameNodeId={id}>
    <div className="max-w-4xl px-5 lg:px-10 py-7">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-[26px] font-medium">Project identity</h2>
        <span className="text-[11px] text-muted">
          Everything that frames the project. One place, once.
        </span>
      </div>

      <form id="identity" action={saveIdentity} className="mt-6 flex flex-col gap-8">
        <input type="hidden" name="id" value={project.id} />

        <Section title="Identification">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-4">
            <Field label="Project title" span={4}>
              <input
                name="title"
                required
                defaultValue={project.title}
                className="field text-base"
              />
            </Field>
            <Field label="Description" span={4}>
              <textarea
                name="description"
                rows={2}
                defaultValue={project.description ?? ''}
                className="field resize-y"
              />
            </Field>
            {/*
              «Project no.» used to be rendered here a second time, above the
              list, as a read-only line carrying its own hardcoded hint:
              «assigned by the system from category and year, it cannot be
              edited». Every word of that stopped being true when the number
              moved to UBS Projects and `assign-project-no.ts` was deleted, and
              the field below it had been editable all along. So the page showed
              the same field twice, once correctly and once saying it could not
              be changed.

              That is what the rule «the field lists live in lib/identity.ts and
              nowhere else» exists to stop. A copy made at the call site does not
              follow the source when the source changes, and this one contradicted
              it in the reader's face on the same screen.
            */}
            {/*
              The goal sits with the description rather than at the bottom of
              the narrative, because it is the one field down there with a
              consequence: an ordinary project cannot be created from an idea
              without it. It was the first of eight paragraphs nobody had filled
              in, which is a good way to lose the one that matters.
            */}
            <Field label={GOAL_FIELD.label} hint={GOAL_FIELD.hint} span={4}>
              <textarea
                name={`pid_${GOAL_FIELD.key}`}
                rows={2}
                defaultValue={identity.pid[GOAL_FIELD.key] ?? ''}
                className="field resize-y"
              />
            </Field>
            {EDITABLE_ADMIN_FIELDS.map((f) => (
              <Field key={f.key} label={f.label} hint={f.hint}>
                <input
                  name={`admin_${f.key}`}
                  defaultValue={identity.admin[f.key] ?? ''}
                  className="field"
                />
              </Field>
            ))}
          </div>
        </Section>

        <Section
          title="Economics"
          note="The annual benefit is what a strategy adds up, and the grant is what committed money is measured against"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-4">
            <Field label="Benefit per year">
              <input
                name="benefit"
                inputMode="decimal"
                defaultValue={identity.economics.benefit ?? ''}
                className="field tabular-nums"
              />
            </Field>
            <Field label="Cost">
              <input
                name="cost"
                inputMode="decimal"
                defaultValue={identity.economics.cost ?? ''}
                className="field tabular-nums"
              />
            </Field>
            <div className="flex flex-col justify-end pb-1.5">
              <span className="lbl text-muted">Unit</span>
              <span className="num text-[20px]">EUR</span>
              <span className="mt-0.5 text-[10px] leading-snug text-rule-strong">
                Always. A cost line keeps the currency of its quote
              </span>
            </div>
            <div className="flex flex-col justify-end pb-1.5">
              <span className="lbl text-muted">Payback</span>
              <span
                className={`num text-[20px] ${payback === null ? 'text-rule-strong' : ''}`}
              >
                {payback === null ? '-' : formatYears(payback)}
              </span>
              {money.annual_priced > 0 && (
                <span className="mt-0.5 text-[10px] leading-snug text-rule-strong">
                  after {formatMoney(Number(money.annual_priced), identity.economics.currency)} a
                  year to run
                </span>
              )}
            </div>
          </div>

          {/*
            * What the lines add up to, beside what was typed above. The fields
            * are a plan; this is the plan being replaced by real prices, and
            * seeing them apart is the whole reason both exist.
            */}
          {money.items > 0 && (
            <div className="mt-5 border-t border-rule pt-4">
              <div className="flex items-baseline justify-between">
                <span className="lbl text-muted">From the cost lines</span>
                <Link href={`/p/${id}/cost`} className="lbl-tight text-green hover:text-oxblood">
                  Open cost
                </Link>
              </div>
              <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8">
                <div>
                  <div className="lbl-tight text-muted">Priced</div>
                  <div className="num mt-1 text-[17px]">
                    {formatMoney(Number(money.once_priced), identity.economics.currency)}
                  </div>
                  <div className="mt-0.5 text-[10px] text-rule-strong">
                    {money.once_items} one off {money.once_items === 1 ? 'line' : 'lines'}
                  </div>
                </div>
                <div>
                  <div className="lbl-tight text-muted">Committed</div>
                  <div className="num mt-1 text-[17px]">
                    {formatMoney(Number(money.once_committed), identity.economics.currency)}
                  </div>
                  <div className="mt-0.5 text-[10px] text-rule-strong">
                    ordered or invoiced
                  </div>
                </div>
                <div>
                  <div className="lbl-tight text-muted">With paper</div>
                  <div className="num mt-1 text-[17px]">
                    {formatMoney(Number(money.once_with_paper), identity.economics.currency)}
                  </div>
                  <div className="mt-0.5 text-[10px] text-rule-strong">
                    a document behind it
                  </div>
                </div>
                <div>
                  <div className="lbl-tight text-muted">
                    {picture.over !== null ? 'Over the plan' : 'Not priced'}
                  </div>
                  <div
                    className={`num mt-1 text-[17px] ${
                      picture.over !== null ? 'text-oxblood' : ''
                    }`}
                  >
                    {picture.over !== null
                      ? formatMoney(picture.over, identity.economics.currency)
                      : picture.unpriced === null
                        ? '-'
                        : formatMoney(picture.unpriced, identity.economics.currency)}
                  </div>
                  <div className="mt-0.5 text-[10px] text-rule-strong">
                    {picture.over !== null
                      ? 'the plan is behind the lines'
                      : share === null
                        ? 'no plan to measure against'
                        : `${share} per cent still a guess`}
                  </div>
                </div>
              </div>
              {money.annual_items > 0 && (
                <div className="mt-4 border-t border-rule pt-3 text-[11.5px] leading-relaxed text-muted">
                  Plus{' '}
                  <span className="text-ink">
                    {formatMoney(Number(money.annual_priced), identity.economics.currency)} a year
                  </span>{' '}
                  to run, across {money.annual_items} recurring{' '}
                  {money.annual_items === 1 ? 'line' : 'lines'}. Never added to the figures
                  above: one is an amount, the other is a rate.
                </div>
              )}
            </div>
          )}

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-4 border-t border-rule pt-5">
            <Field label="Grant">
              <select
                name="approval_state"
                defaultValue={identity.approval.state}
                className="field"
              >
                {APPROVAL_STATES.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Decided">
              <input
                type="date"
                name="approval_decided_on"
                defaultValue={identity.approval.decided_on ?? ''}
                className="field"
              />
            </Field>
            <Field label="Granted amount">
              <input
                name="approval_amount"
                inputMode="decimal"
                defaultValue={identity.approval.amount ?? ''}
                className="field tabular-nums"
              />
            </Field>
            <Field label="By whom">
              <input
                name="approval_by"
                defaultValue={identity.approval.by ?? ''}
                placeholder="Management"
                className="field"
              />
            </Field>
            {variance !== null && (
              <p
                className={`col-span-1 sm:col-span-2 lg:col-span-4 text-[11px] ${
                  variance < 0 ? 'text-oxblood' : 'text-muted'
                }`}
              >
                {variance < 0
                  ? `The estimate is ${formatAmount(-variance, identity.economics.currency)} above the grant.`
                  : variance > 0
                    ? `Der er ${formatAmount(variance, identity.economics.currency)} of room between grant and estimate.`
                    : 'Grant and estimate are equal.'}
              </p>
            )}
          </div>
        </Section>

        <Section
          title="People"
          note="Also set on any node in the tree. A role naming somebody with no access is flagged below"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-4">
            {PEOPLE_FIELDS.map((f) => (
              <Field
                key={f.key}
                label={f.label}
                hint={f.hint}
                span={f.key === 'steering' || f.key === 'members' || f.key === 'stakeholders' ? 4 : 1}
              >
                {f.one ? (
                  <PersonField
                    name={`people_${f.key}`}
                    defaultValue={identity.people[f.key] ?? ''}
                  />
                ) : (
                  <>
                    <input
                      name={`people_${f.key}`}
                      defaultValue={identity.people[f.key] ?? ''}
                      className="field"
                    />
                    <PeopleHint names={knownHere} />
                  </>
                )}
              </Field>
            ))}
          </div>
        </Section>

        <Section title="Framing" note="This deadline belongs to the parent project and controls nothing in the tree">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-4">
            <Field label="Start">
              <input
                type="date"
                name="start_date"
                defaultValue={project.start_date ?? ''}
                className="field"
              />
            </Field>
            <Field label="Deadline">
              <input
                type="date"
                name="due_date"
                defaultValue={project.due_date ?? ''}
                className="field"
              />
            </Field>
            {/*
              «Priority» was a typed High/Medium/Low that fed nothing. It sat
              beside priorityScore, which is 2 x benefit - cost - complexity and
              is what the stand-up actually ranks by, what the assessment shows
              and what the origin keeps. Two words for one meaning, and the inert
              one was the one that looked official on the brief.
              
              A project's priority now comes from the judgement made when the
              idea became work, which is a figure somebody can argue with rather
              than a label somebody chose.
            */}
            <Field label="Responsible" hint="Who is responsible for the project. The same field as owner on the nodes in the tree, so it is also used when a task is waiting on someone.">
              <input
                name="owner"
                defaultValue={project.owner ?? ''}
                className="field"
              />
            </Field>
            <Field label="Location" hint="Where it physically happens: hall, line or plant. It decides who is affected and which shutdown window you need." span={4}>
              <input
                name="location"
                defaultValue={identity.location ?? ''}
                placeholder="Hall 3, packing line 2"
                className="field"
              />
            </Field>
          </div>
        </Section>

        <Section
          title="For the company document"
          note="Narrative the PID asks for. Nothing here is read by anything in this tool"
        >
          <div className="flex flex-col gap-4">
            {NARRATIVE_FIELDS.map((f) => (
              <Field key={f.key} label={f.label} hint={f.hint}>
                <textarea
                  name={`pid_${f.key}`}
                  rows={2}
                  defaultValue={identity.pid[f.key] ?? ''}
                  className="field resize-y"
                />
              </Field>
            ))}
          </div>
        </Section>
      </form>

      <div className="mt-8 flex items-center gap-3">
        <button type="submit" form="identity" className="btn">
          Save identity
        </button>
        <span className="text-[11px] text-muted">
          All fields are saved at once.
        </span>
      </div>


      {/* Who may see any of this. Membership is the whole access model. */}
      <div className="mt-12 border-t border-rule-strong pt-6">
        <div className="flex items-baseline gap-4">
          <h3 className="font-display text-[22px] font-medium">Access</h3>
          <span className="text-[11px] text-muted">
            Being here means seeing everything under this project, and being able
            to change it
          </span>
        </div>

        <div className="mt-4 max-w-2xl">
          {members.length === 0 ? (
            <p className="border-t border-rule pt-2.5 text-[12.5px] text-oxblood">
              Nobody. A project with no members is invisible to everyone, this
              account included.
            </p>
          ) : (
            <div className="divide-y divide-rule border-y border-rule">
              {members.map((m) => (
                <div key={m.id} className="flex items-baseline gap-4 py-2.5">
                  <span className="min-w-0 flex-1 text-[13px]">
                    {emailOf.get(m.user_id) ?? (
                      <span className="text-muted">
                        an account with no profile row
                      </span>
                    )}
                  </span>
                  <span className="num text-[10px] text-rule-strong">
                    {formatDate(m.added_at.slice(0, 10))}
                  </span>
                  <form action={removeMember}>
                    <input type="hidden" name="id" value={m.id} />
                    <input type="hidden" name="project_id" value={id} />
                    <input type="hidden" name="redirectTo" value={`/p/${id}/identitet`} />
                    <button className="lbl-tight text-rule-strong hover:text-oxblood">
                      Remove
                    </button>
                  </form>
                </div>
              ))}
            </div>
          )}

          {lockedOut.length > 0 && (
            <div className="mt-4 border-l-2 border-oxblood pl-3">
              <div className="lbl-tight text-oxblood">
                Named here, cannot open it
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-muted">
                They have a login, so this is one click from being true. Somebody
                without an account is not listed: that is a different decision.
              </p>
              <div className="mt-2.5">
                {lockedOut.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-baseline gap-4 border-t border-rule py-2 last:border-b"
                  >
                    <span className="min-w-0 flex-1 text-[12.5px]">
                      {p.label}
                      <span className="text-muted"> · {p.roles.join(', ')}</span>
                    </span>
                    <form action={addMember}>
                      <input type="hidden" name="project_id" value={id} />
                      <input type="hidden" name="email" value={p.email} />
                      <input
                        type="hidden"
                        name="redirectTo"
                        value={`/p/${id}/identitet`}
                      />
                      <button className="lbl-tight shrink-0 text-rule-strong hover:text-green">
                        Give access
                      </button>
                    </form>
                  </div>
                ))}
              </div>
            </div>
          )}

          <form action={addMember} className="mt-4 flex items-end gap-3">
            <input type="hidden" name="project_id" value={id} />
            <input type="hidden" name="redirectTo" value={`/p/${id}/identitet`} />
            <label className="block flex-1">
              <span className="lbl text-muted">
                <Hint text="They need an account here already. Create the user in Supabase first: a pending invitation would be a door left open on a guess about who ends up with that address.">
                  Add somebody by email
                </Hint>
              </span>
              <input
                name="email"
                type="email"
                required
                placeholder="colleague@unitedbeetseeds.com"
                className="field"
              />
            </label>
            <button className="btn">Add</button>
          </form>

          <p className="mt-3 text-[11px] leading-relaxed text-rule-strong">
            Names under <span className="text-ink">Roles</span> above are text on
            a report. This is the list that decides what anyone can actually
            open.
          </p>
        </div>
      </div>

      {/* Dependencies between projects. Own form, own action. */}
      <div className="mt-12 border-t border-rule-strong pt-6">
        <div className="flex items-baseline gap-4">
          <h3 className="font-display text-[22px] font-medium">Other projects</h3>
          <span className="text-[11px] text-muted">
            Sibling projects waiting on each other, which is not the same as the tree
          </span>
        </div>

        <div className="mt-4">
          <div className="lbl text-muted">This project waits on</div>
          {dependsOn.length === 0 ? (
            <p className="mt-2 border-t border-rule pt-2.5 text-[12.5px] text-muted">
              None. This project can run independently of the others.
            </p>
          ) : (
            <div className="mt-2">
              {dependsOn.map((d) => (
                <div
                  key={d.id}
                  className="flex items-baseline gap-4 border-t border-rule py-2.5 last:border-b"
                >
                  <Link
                    href={`/p/${d.depends_on_id}/identitet`}
                    className="text-[13px] hover:text-green"
                  >
                    {projectTitle.get(d.depends_on_id) ?? 'Ukendt projekt'}
                  </Link>
                  {d.note && <span className="flex-1 text-[11.5px] text-muted">{d.note}</span>}
                  <form action={removeDependency} className="ml-auto shrink-0">
                    <input type="hidden" name="id" value={d.id} />
                    <input type="hidden" name="redirectTo" value={base} />
                    <button className="lbl-tight text-rule-strong hover:text-oxblood">
                      Remove
                    </button>
                  </form>
                </div>
              ))}
            </div>
          )}

          {linkable.length > 0 && (
            <form
              action={addDependency}
              className="mt-4 flex items-end gap-4 border-t border-rule pt-3.5"
            >
              <input type="hidden" name="node_id" value={project.id} />
              <input type="hidden" name="redirectTo" value={base} />
              <label className="block w-full sm:w-[240px]">
                <span className="lbl text-muted">Waiting on</span>
                <select name="depends_on_id" required className="field">
                  {linkable.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block flex-1">
                <span className="lbl text-muted">Why</span>
                <input
                  name="note"
                  placeholder="Data cannot be stored until the platform is up"
                  className="field"
                />
              </label>
              <button type="submit" className="lbl shrink-0 pb-2 text-green hover:text-oxblood">
                Add
              </button>
            </form>
          )}

          <div className="mt-7">
            <div className="lbl text-muted">Others wait on this</div>
            {dependedOnBy.length === 0 ? (
              <p className="mt-2 border-t border-rule pt-2.5 text-[12.5px] text-muted">
                No other project depends on this one.
              </p>
            ) : (
              <div className="mt-2">
                {dependedOnBy.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-baseline gap-4 border-t border-rule py-2.5 last:border-b"
                  >
                    <Link
                      href={`/p/${d.node_id}/identitet`}
                      className="text-[13px] hover:text-green"
                    >
                      {projectTitle.get(d.node_id) ?? 'Ukendt projekt'}
                    </Link>
                    {d.note && (
                      <span className="flex-1 text-[11.5px] text-muted">{d.note}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Den halvdel af PID'en der ikke skrives */}
      <div className="mt-12 border-t border-rule-strong pt-6">
        <div className="flex items-baseline gap-4">
          <h3 className="font-display text-[22px] font-medium">Derived</h3>
          <span className="text-[11px] text-muted">
            The rest of the PID. It is not written here because it already exists.
          </span>
        </div>

        <div className="mt-4">
          <Derived label="Phase">
            {stage ?? (
              <Link href="/friday" className="text-oxblood">
                Not chosen. Set it on Friday.
              </Link>
            )}
          </Derived>

          <Derived label="Milestones">
            {milestones.length === 0 ? (
              <span className="text-muted">
                No nodes are marked as milestones.
              </span>
            ) : (
              <div className="flex flex-col gap-1">
                {milestones.map((m) => (
                  <div key={m.id} className="flex gap-3">
                    <span className="min-w-[110px] tabular-nums text-muted">
                      {m.due_date ? formatDateLong(m.due_date) : 'uden dato'}
                    </span>
                    <span className={m.status === 'done' ? 'text-muted line-through' : ''}>
                      {m.title}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Derived>

          <Derived label="Waiting on">
            {dependencies.length === 0 ? (
              <span className="text-muted">None recorded.</span>
            ) : (
              dependencies.join(' · ')
            )}
          </Derived>

          <Derived label="Rejected">
            {decisions.filter((d) => d.alternatives).length === 0 ? (
              <span className="text-muted">
                No decision has recorded what was rejected.
              </span>
            ) : (
              <div className="flex flex-col gap-2">
                {decisions
                  .filter((d) => d.alternatives)
                  .map((d) => (
                    <div key={d.id}>
                      <span className="font-medium">{d.decision}</span>
                      <span className="text-muted">: {d.alternatives}</span>
                    </div>
                  ))}
              </div>
            )}
          </Derived>

          <Derived label="Trail">
            <span className="tabular-nums text-muted">
              Created {formatDateLong(project.created_at.slice(0, 10))} · last touched{' '}
              {formatDate(project.updated_at.slice(0, 10))}
            </span>
          </Derived>

          <Derived label="Key figures">
            {identity.economics.benefit !== null || identity.economics.cost !== null ? (
              <span className="tabular-nums">
                {identity.economics.cost !== null && (
                  <>
                    Cost{' '}
                    {formatAmount(identity.economics.cost, identity.economics.currency)}
                  </>
                )}
                {identity.economics.benefit !== null && (
                  <>
                    {identity.economics.cost !== null && ' · '}
                    Gevinst{' '}
                    {formatAmount(identity.economics.benefit, identity.economics.currency)}
                    /yr
                  </>
                )}
                {payback !== null && <> · paid back in {formatYears(payback)}</>}
              </span>
            ) : (
              <span className="text-muted">No amounts filled in.</span>
            )}
          </Derived>
        </div>
      </div>
    </div>
    </ProjectFrame>
  )
}
