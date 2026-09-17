import Link from 'next/link'
import { costPicture, formatMoney, payback as paybackOf, unpricedShare } from '@/lib/cost'
import { addMember, removeMember } from '@/lib/member-actions'
import { knownPeople, namedButLockedOut } from '@/lib/people'
import { PeopleHint } from '@/components/people-list'
import { PersonField } from '@/components/person-field'
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
import { Hint, formatDate } from '@/components/ui'
import type { Node, NodeCost, NodeDependency, ProjectMember } from '@/lib/types'

/**
 * The identity form, behind «Edit identity».
 *
 * Read is a page you read; this is the page you write it on. It is the same
 * form the old identity page was, moved out so the reading view can be prose
 * and figures, and it takes the left column's place when it is open so the
 * figures and the summary on the right stay in view while you type.
 *
 * Everything here is typed. What can be derived from the tree, the log or the
 * cost lines is not a field, and is shown on the reading side instead.
 */

type Account = { id: string; email: string; full_name: string | null }

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
    <section className="sec-gap">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="text-[17px] font-semibold tracking-[-0.025em]">{title}</h2>
        {note && <span className="text-[12px] text-muted">{note}</span>}
      </div>
      <div className="grp-gap">{children}</div>
    </section>
  )
}

function Field({
  label,
  hint,
  children,
  wide = false,
}: {
  label: string
  hint?: string
  children: React.ReactNode
  wide?: boolean
}) {
  // The column count moves with the grid: a wide field spans both columns
  // from sm and the single column below it.
  return (
    <label className={`block ${wide ? 'col-span-1 sm:col-span-2' : ''}`}>
      <span className="lbl block text-muted">
        {hint ? <Hint text={hint}>{label}</Hint> : label}
      </span>
      {children}
    </label>
  )
}

export function ReadEdit({
  project,
  everyNode,
  members,
  accounts,
  dependsOn,
  dependedOnBy,
  costRoll,
  readHref,
}: {
  project: Node
  everyNode: Node[]
  members: ProjectMember[]
  accounts: Account[]
  dependsOn: NodeDependency[]
  dependedOnBy: NodeDependency[]
  costRoll: NodeCost | null
  /** Where Cancel goes, and where every form returns to. */
  readHref: string
}) {
  const id = project.id
  const identity = readIdentity(project.reporting)
  const emailOf = new Map(accounts.map((p) => [p.id, p.email]))

  // The same names the picker offers, written out for the fields that hold
  // several people, where a suggestion would replace the list rather than
  // extend it.
  const knownHere = knownPeople({
    accounts,
    roles: everyNode.map((n) => (n.reporting?.people ?? {}) as Record<string, unknown>),
  })

  /*
   * Named in a role here, has a login, and still cannot open the project.
   * Roles and access are two lists on purpose, and this is the only place they
   * are held against each other.
   */
  const memberIds = new Set(members.map((m) => m.user_id))

  const lockedOut = namedButLockedOut({
    roles: PEOPLE_FIELDS.map((f) => ({ label: f.label, value: identity.people[f.key] })),
    accounts,
    members: memberIds,
  })

  /*
   * Everyone with a login who is not already on this project.
   *
   * The field below takes an email because an email is what `addMember`
   * resolves, and typing one from memory is how a colleague gets added as
   * nobody. So it suggests, in the same shape the role fields do: a datalist,
   * which leaves the field free text. A new account appears here the moment it
   * exists, by address until they have chosen a name.
   *
   * Members are left out rather than shown greyed. Adding somebody twice is
   * already harmless, and a list of people you cannot pick is a list you have
   * to read past.
   */
  const addable = accounts
    .filter((a) => a.id !== undefined && a.email && !memberIds.has(a.id))
    .map((a) => ({ email: a.email as string, label: a.full_name?.trim() || null }))
    .sort((a, b) => (a.label ?? a.email).localeCompare(b.label ?? b.email))

  const projects = everyNode.filter((n) => n.parent_id === null)
  const projectTitle = new Map(projects.map((p) => [p.id, p.title]))
  const alreadyLinked = new Set(dependsOn.map((d) => d.depends_on_id))
  const linkable = projects.filter((p) => p.id !== id && !alreadyLinked.has(p.id))

  /*
   * Payback with the running cost taken off the saving. A licence of 9 600 a
   * year against a saving of 10 000 a year is not a saving of 10 000.
   */
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
  const currency = identity.economics.currency

  const grid = 'grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4'

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div className="lbl text-muted">Editing the identity</div>
        <Link href={readHref} className="act">
          Back to reading
        </Link>
      </div>
      <h1 className="mt-2 text-[34px] font-semibold leading-[1.08] tracking-[-0.03em] text-green text-balance">
        {project.title}
      </h1>

      <form id="identity" action={saveIdentity}>
        <input type="hidden" name="id" value={project.id} />
        <input type="hidden" name="redirectTo" value={readHref} />

        <Section title="Identification">
          <div className={grid}>
            <Field label="Project title" wide>
              <input name="title" required defaultValue={project.title} className="field" />
            </Field>
            <Field label="Description" wide>
              <textarea
                name="description"
                rows={3}
                defaultValue={project.description ?? ''}
                className="field resize-y"
              />
            </Field>
            {/*
              The goal sits with the description rather than at the bottom of
              the narrative, because it is the one field down there with a
              consequence: an ordinary project cannot be created from an idea
              without it.
            */}
            <Field label={GOAL_FIELD.label} hint={GOAL_FIELD.hint} wide>
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
          <div className={grid}>
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
            <div>
              <span className="lbl block text-muted">Unit</span>
              <span className="mono block pt-[7px] text-[13px]">EUR</span>
              <span className="block text-[12px] text-muted">
                Always. A cost line keeps the currency of its quote
              </span>
            </div>
            <div>
              <span className="lbl block text-muted">Payback</span>
              <span className={`mono block pt-[7px] text-[13px] ${payback === null ? 'text-muted' : ''}`}>
                {payback === null ? 'Not worked out' : formatYears(payback)}
              </span>
              {money.annual_priced > 0 && (
                <span className="block text-[12px] text-muted">
                  after {formatMoney(Number(money.annual_priced), currency)} a year to run
                </span>
              )}
            </div>
          </div>

          {/*
            What the lines add up to, beside what was typed above. The fields
            are a plan; this is the plan being replaced by real prices.
          */}
          {money.items > 0 && (
            <div className="grp-gap border-t border-line pt-4">
              <div className="flex items-baseline justify-between">
                <span className="lbl text-muted">From the cost lines</span>
                <Link href={`/p/${id}/cost`} className="act">
                  Open economics
                </Link>
              </div>
              <table className="tbl mt-2">
                <tbody>
                  <tr>
                    <td className="lbl text-muted">Priced</td>
                    <td className="grow mono">{formatMoney(Number(money.once_priced), currency)}</td>
                    <td className="text-muted">
                      {money.once_items} one off {money.once_items === 1 ? 'line' : 'lines'}
                    </td>
                  </tr>
                  <tr>
                    <td className="lbl text-muted">Committed</td>
                    <td className="grow mono">{formatMoney(Number(money.once_committed), currency)}</td>
                    <td className="text-muted">ordered or invoiced</td>
                  </tr>
                  <tr>
                    <td className="lbl text-muted">With paper</td>
                    <td className="grow mono">{formatMoney(Number(money.once_with_paper), currency)}</td>
                    <td className="text-muted">a document behind it</td>
                  </tr>
                  <tr>
                    <td className="lbl text-muted">
                      {picture.over !== null ? 'Over the plan' : 'Not priced'}
                    </td>
                    <td className={`grow mono ${picture.over !== null ? 'text-rust' : ''}`}>
                      {picture.over !== null
                        ? formatMoney(picture.over, currency)
                        : picture.unpriced === null
                          ? '-'
                          : formatMoney(picture.unpriced, currency)}
                    </td>
                    <td className="text-muted">
                      {picture.over !== null
                        ? 'the plan is behind the lines'
                        : share === null
                          ? 'no plan to measure against'
                          : `${share} per cent still a guess`}
                    </td>
                  </tr>
                </tbody>
              </table>
              {money.annual_items > 0 && (
                <p className="mt-3 text-[12px] leading-relaxed text-muted">
                  Plus{' '}
                  <span className="text-ink">
                    {formatMoney(Number(money.annual_priced), currency)} a year
                  </span>{' '}
                  to run, across {money.annual_items} recurring{' '}
                  {money.annual_items === 1 ? 'line' : 'lines'}. Never added to the figures
                  above: one is an amount, the other is a rate.
                </p>
              )}
            </div>
          )}

          <div className={`grp-gap border-t border-line pt-4 ${grid}`}>
            <Field label="Grant">
              <select name="approval_state" defaultValue={identity.approval.state} className="field">
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
                className={`col-span-1 sm:col-span-2 text-[12px] ${
                  variance < 0 ? 'text-rust' : 'text-muted'
                }`}
              >
                {variance < 0
                  ? `The estimate is ${formatAmount(-variance, currency)} above the grant.`
                  : variance > 0
                    ? `There is ${formatAmount(variance, currency)} of room between grant and estimate.`
                    : 'Grant and estimate are equal.'}
              </p>
            )}
          </div>
        </Section>

        <Section
          title="People"
          note="Also set on any node in the tree. A role naming somebody with no access is flagged under Access"
        >
          <div className={grid}>
            {PEOPLE_FIELDS.map((f) => (
              <Field key={f.key} label={f.label} hint={f.hint} wide={!f.one}>
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

        <Section
          title="Framing"
          note="This deadline belongs to the project and controls nothing in the tree"
        >
          <div className={grid}>
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
            <Field
              label="Driver"
              hint="Who drives this forward. The same field as the driver on every node in the tree, so it is also used when a task is waiting on someone."
            >
              <input name="owner" defaultValue={project.owner ?? ''} className="field" />
            </Field>
            <Field
              label="Location"
              hint="Where it physically happens: hall, line or plant. It decides who is affected and which shutdown window you need."
            >
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

      <div className="grp-gap flex flex-wrap items-center gap-3">
        <button type="submit" form="identity" className="btn">
          Save identity
        </button>
        <Link href={readHref} className="btn btn-ghost">
          Cancel
        </Link>
        <span className="text-[12px] text-muted">All fields are saved at once.</span>
      </div>

      {/* Who may see any of this. Membership is the whole access model. */}
      <Section
        title="Access"
        note="Being here means seeing everything under this project, and being able to change it"
      >
        {members.length === 0 ? (
          <p className="text-[13px] text-rust">
            Nobody. A project with no members is invisible to everyone, this account included.
          </p>
        ) : (
          <div className="panel panel-list text-[13px]">
            {members.map((m) => (
              <div key={m.id} className="flex items-baseline gap-4">
                <span className="min-w-0 flex-1">
                  {emailOf.get(m.user_id) ?? (
                    <span className="text-muted">an account with no profile row</span>
                  )}
                </span>
                <span className="mono text-[12px] text-muted">
                  {formatDate(m.added_at.slice(0, 10))}
                </span>
                <form action={removeMember}>
                  <input type="hidden" name="id" value={m.id} />
                  <input type="hidden" name="project_id" value={id} />
                  <input type="hidden" name="redirectTo" value={readHref} />
                  <button className="act text-rust">Remove</button>
                </form>
              </div>
            ))}
          </div>
        )}

        {lockedOut.length > 0 && (
          <div className="grp-gap">
            <div className="lbl text-rust">Named here, cannot open it</div>
            <p className="mt-1 text-[12px] leading-relaxed text-muted">
              They have a login, so this is one click from being true. Somebody without an
              account is not listed: that is a different decision.
            </p>
            <div className="panel panel-list mt-2.5 text-[13px]">
              {lockedOut.map((p) => (
                <div key={p.id} className="flex items-baseline gap-4">
                  <span className="min-w-0 flex-1">
                    {p.label}
                    <span className="text-muted"> · {p.roles.join(', ')}</span>
                  </span>
                  <form action={addMember}>
                    <input type="hidden" name="project_id" value={id} />
                    <input type="hidden" name="email" value={p.email} />
                    <input type="hidden" name="redirectTo" value={readHref} />
                    <button className="act">Give access</button>
                  </form>
                </div>
              ))}
            </div>
          </div>
        )}

        <form action={addMember} className="grp-gap flex flex-wrap items-end gap-3">
          <input type="hidden" name="project_id" value={id} />
          <input type="hidden" name="redirectTo" value={readHref} />
          <label className="block min-w-[240px] flex-1">
            <span className="lbl text-muted">
              <Hint text="They need an account here already. Somebody with no login asks for one on the sign-in screen, and an administrator invites them from Admin; a membership waiting for an address to exist would be a door left open on a guess about who ends up with it.">
                Add somebody by email
              </Hint>
            </span>
            <input
              name="email"
              type="email"
              required
              list="addable-accounts"
              placeholder={addable[0]?.email ?? 'colleague@unitedbeetseeds.com'}
              className="field"
            />
            {/*
              The suggestions. A datalist rather than a select, for the same
              reason the role fields use one: the field keeps accepting
              anything typed into it, and the list is a shortcut rather than a
              gate.
            */}
            <datalist id="addable-accounts">
              {addable.map((a) => (
                <option key={a.email} value={a.email}>
                  {a.label ?? 'has not chosen a name yet'}
                </option>
              ))}
            </datalist>
          </label>
          <button className="btn btn-ghost">Add</button>
        </form>

        <p className="mt-3 text-[12px] leading-relaxed text-muted">
          Names under People are text on a report. This is the list that decides what anyone
          can actually open.
          {addable.length === 0 && members.length > 0 && (
            <span className="block">
              Everyone with a login here is already on this project.
            </span>
          )}
        </p>
      </Section>

      {/* Dependencies between projects. Own form, own action. */}
      <Section
        title="Other projects"
        note="Sibling projects waiting on each other, which is not the same as the tree"
      >
        <div className="lbl text-muted">This project waits on</div>
        {dependsOn.length === 0 ? (
          <p className="mt-2 text-[13px] text-muted">
            None. This project can run independently of the others.
          </p>
        ) : (
          <div className="panel panel-list mt-2 text-[13px]">
            {dependsOn.map((d) => (
              <div key={d.id} className="flex items-baseline gap-4">
                <Link href={`/p/${d.depends_on_id}/identitet`} className="hover:text-green">
                  {projectTitle.get(d.depends_on_id) ?? 'A project you cannot see'}
                </Link>
                {d.note && <span className="flex-1 text-[12px] text-muted">{d.note}</span>}
                <form action={removeDependency} className="ml-auto shrink-0">
                  <input type="hidden" name="id" value={d.id} />
                  <input type="hidden" name="redirectTo" value={readHref} />
                  <button className="act text-rust">Remove</button>
                </form>
              </div>
            ))}
          </div>
        )}

        {linkable.length > 0 && (
          <form action={addDependency} className="grp-gap flex flex-wrap items-end gap-4">
            <input type="hidden" name="node_id" value={project.id} />
            <input type="hidden" name="redirectTo" value={readHref} />
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
            <label className="block min-w-[200px] flex-1">
              <span className="lbl text-muted">Why</span>
              <input
                name="note"
                placeholder="Data cannot be stored until the platform is up"
                className="field"
              />
            </label>
            <button type="submit" className="btn btn-ghost">
              Add
            </button>
          </form>
        )}

        <div className="grp-gap">
          <div className="lbl text-muted">Others wait on this</div>
          {dependedOnBy.length === 0 ? (
            <p className="mt-2 text-[13px] text-muted">No other project depends on this one.</p>
          ) : (
            <div className="panel panel-list mt-2 text-[13px]">
              {dependedOnBy.map((d) => (
                <div key={d.id} className="flex items-baseline gap-4">
                  <Link href={`/p/${d.node_id}/identitet`} className="hover:text-green">
                    {projectTitle.get(d.node_id) ?? 'A project you cannot see'}
                  </Link>
                  {d.note && <span className="flex-1 text-[12px] text-muted">{d.note}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </Section>

      {/*
        The stakeholders named above, plus whoever the blockers wait on, used
        to be listed here as «Waiting on». The blockers now speak for
        themselves under «Where it stands», and the names are in People.
      */}
      {splitList(identity.people.stakeholders).length > 0 && (
        <p className="grp-gap text-[12px] text-muted">
          Other stakeholders: {splitList(identity.people.stakeholders).join(', ')}.
        </p>
      )}
    </div>
  )
}
