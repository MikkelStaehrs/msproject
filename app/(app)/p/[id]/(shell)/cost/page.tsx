import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ProjectFrame } from '@/components/project-frame'
import { QueryFailure, firstError } from '@/lib/failure'
import { createClient } from '@/lib/supabase/server'
import { subtreeSet } from '@/lib/subtree'
import { formatDate, Hint, Rule } from '@/components/ui'
import { costPicture, formatMoney, lineAmount, lineEur, unpricedShare } from '@/lib/cost'
import { readIdentity } from '@/lib/identity'
import { createCost, deleteCost, setCostState, updateCost } from '@/lib/cost-actions'
import { today } from '@/lib/date'
import { pathTo } from '@/lib/wbs'
import {
  COST_BUDGETS,
  COST_CURRENCIES,
  COST_BUDGET_HINT,
  COST_BUDGET_LABEL,
  COST_KINDS,
  COST_KIND_LABEL,
  COST_RECURRENCES,
  COST_RECURRENCE_HINT,
  COST_RECURRENCE_LABEL,
  COST_STATES,
  COST_STATE_HINT,
  COST_STATE_LABEL,
  type Cost,
  type CostState,
  type Node,
  type NodeCost,
} from '@/lib/types'

export const dynamic = 'force-dynamic'

/**
 * The money, one line at a time.
 *
 * reporting.economics holds what was planned, once, early. This holds what the
 * project is actually adding up to, and the gap between them is the number
 * worth looking at: how much of the budget has not been priced yet is the part
 * still capable of surprising you.
 */
export default async function CostPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ edit?: string; on?: string; focus?: string }>
}) {
  const { id } = await params
  const { edit: editId, on: onNode, focus: focusId } = await searchParams
  const supabase = await createClient()

  /*
   * One round trip. Asking which nodes sit underneath and only then filtering
   * by the answer costs a second wait for nothing at this size.
   */
  const [projectRes, nodesRes, costRes, rollRes, docRes, yardstickRes] = await Promise.all([
    supabase.from('node').select('*').eq('id', id).single(),
    supabase.from('node').select('id, parent_id, title, type').order('sort_order'),
    supabase.from('cost').select('*').order('dated', { ascending: false }),
    supabase.from('v_node_cost').select('*'),
    supabase.from('document').select('id, node_id, name').order('created_at', { ascending: false }),
    supabase.from('yardstick').select('eur_rate').maybeSingle(),
  ])

  /*
   * The yardstick is deliberately absent from this check.
   *
   * Everywhere else a failed query is an error rather than an empty state,
   * because a missing view rendering as nothing is how a fault hides. This one
   * is different in kind: it supplies the default value of one form field, and
   * nothing the page reports depends on it. Taking the whole cost page down
   * because a default could not be read would be the wrong trade, so it falls
   * back and says so where the fallback is written.
   */
  const failure = firstError([projectRes, nodesRes, costRes, rollRes, docRes])
  if (failure) return <QueryFailure message={failure} />

  const project = projectRes.data as Node | null
  if (!project) notFound()

  const everyNode = (nodesRes.data ?? []) as {
    id: string
    parent_id: string | null
    title: string
    type: string
  }[]
  // Fetched whole, cut here. See lib/subtree.
  const inProject = subtreeSet(everyNode, id)
  const nodes = everyNode.filter((n) => inProject.has(n.id))
  const allLines = ((costRes.data ?? []) as Cost[]).filter((l) => inProject.has(l.node_id))
  const rolls = new Map(((rollRes.data ?? []) as NodeCost[]).map((r) => [r.node_id, r]))

  const EMPTY: NodeCost = {
    node_id: id,
    once_estimated: 0, once_quoted: 0, once_ordered: 0, once_invoiced: 0,
    once_committed: 0, once_priced: 0, once_with_paper: 0,
    annual_committed: 0, annual_priced: 0,
    capex_once_priced: 0, capex_once_committed: 0, capex_annual_priced: 0,
    opex_once_priced: 0, opex_once_committed: 0,
    opex_annual_priced: 0, opex_annual_committed: 0,
    once_items: 0, annual_items: 0, items: 0,
  }

  /*
   * The page follows the focus, the way the tree does.
   *
   * A cost belongs to the part it is for, and the first version defaulted every
   * new line to the project and showed only the project's total. That is the
   * shape that pushes everything to the top: the affordance was in the way of
   * the model. Standing on a subproject now prices that subproject, and the
   * mother project still sums all of it, because the roll-up never cared where
   * a line was written.
   */
  const focusNode = focusId ? nodes.find((n) => n.id === focusId) : undefined
  const scopeId = focusNode?.id ?? id
  const inScope = subtreeSet(nodes, scopeId)
  const lines = allLines.filter((l) => inScope.has(l.node_id))
  const roll = rolls.get(scopeId) ?? EMPTY

  const identity = readIdentity(project.reporting)
  // Everything rolled up is euro. A line keeps whatever the quote said.
  const currency = identity.economics.currency
  /*
   * From the yardstick, not from a literal in this file. It sat here as
   * `defaultRate = 7.46` and was about to be typed into a second page, which is
   * how a number ends up meaning two things. Changing it never touches a line
   * already written: each one keeps the rate that applied when its price
   * landed.
   */
  const defaultRate = Number(yardstickRes.data?.eur_rate ?? 7.46)
  /*
   * Approved and planned belong to the project and only to the project. A part
   * has no grant of its own, so comparing its lines against the project's
   * budget would invent an overrun that nobody claimed.
   */
  const atProject = scopeId === id
  const picture = costPicture({
    roll,
    approved: atProject ? identity.approval.amount : null,
    planned: atProject ? identity.economics.cost : null,
  })
  const share = unpricedShare(picture)

  const base = `/p/${id}`
  const here = focusNode ? `${base}/cost?focus=${focusNode.id}` : `${base}/cost`
  const keep = (extra: string) =>
    focusNode ? `${base}/cost?focus=${focusNode.id}&${extra}` : `${base}/cost?${extra}`
  const titleOf = new Map(nodes.map((n) => [n.id, n.title]))
  const pathLabel = (nodeId: string) =>
    pathTo(nodes, id, nodeId)
      .slice(1)
      .map((n) => titleOf.get(n) ?? '')
      .join(' › ') || project.title

  const docs = ((docRes.data ?? []) as { id: string; node_id: string; name: string }[]).filter(
    (d) => inProject.has(d.node_id),
  )
  const docById = new Map(docs.map((d) => [d.id, d]))
  const parts = nodes.filter((n) => n.parent_id === scopeId)
  const editing = editId ? allLines.find((l) => l.id === editId) : undefined
  const byNode = new Map<string, Cost[]>()
  for (const l of lines) byNode.set(l.node_id, [...(byNode.get(l.node_id) ?? []), l])

  return (
    <ProjectFrame projectId={id} frameNodeId={scopeId} focusId={focusNode?.id}>
      <div className="px-5 lg:px-10 py-7">
        <div className="flex items-baseline justify-between gap-5">
          <div className="min-w-0">
            {focusNode && (
              <div className="lbl mb-1 text-muted">
                <Link href={`${base}/cost`} className="text-ink hover:text-green">
                  Whole project
                </Link>
                <span className="mx-2 text-rule-strong">&rsaquo;</span>
                {pathLabel(focusNode.id)}
              </div>
            )}
            <h2 className="font-display text-[26px] font-medium">Cost</h2>
          </div>
          <span className="lbl-tight text-rule-strong">
            {roll.items} {roll.items === 1 ? 'line' : 'lines'}
          </span>
        </div>

        {/* The numbers that claim to be the cost, and what they leave open */}
        <div className="mt-5 grid max-w-[760px] grid-cols-[132px_1fr_120px]">
          {atProject && (
            <>
              <Figure
                label="Approved"
                note="Granted, with a date on it"
                value={
                  picture.approved === null ? null : formatMoney(picture.approved, currency)
                }
              />
              <Figure
                label="Planned"
                note="What you said it would be, on Identity"
                value={
                  picture.planned === null ? null : formatMoney(picture.planned, currency)
                }
              />
            </>
          )}
          <Figure
            label="Priced, one off"
            note={`${roll.once_items} one off ${roll.once_items === 1 ? 'line' : 'lines'}, of which ${formatMoney(Number(roll.once_committed), currency)} committed`}
            value={formatMoney(Number(roll.once_priced), currency)}
            strong={!atProject}
          />
          {atProject && (
            <Figure
              label="Not priced"
              note={
                share === null
                  ? 'No plan to measure against. Fill in the cost on Identity'
                  : `${share} per cent of the plan is still a guess`
              }
              value={picture.unpriced === null ? null : formatMoney(picture.unpriced, currency)}
              strong
            />
          )}
        </div>

        {roll.annual_items > 0 && (
          <div className="mt-5 grid max-w-[760px] grid-cols-[132px_1fr_120px]">
            <Figure
              label="Every year"
              note={`${roll.annual_items} recurring ${roll.annual_items === 1 ? 'line' : 'lines'}, of which ${formatMoney(Number(roll.annual_committed), currency)} committed. Never added to the figures above: one is an amount, the other is a rate`}
              value={formatMoney(Number(roll.annual_priced), currency)}
            />
          </div>
        )}

        {!atProject && (
          <p className="mt-2.5 max-w-[760px] text-[11px] leading-relaxed text-rule-strong">
            The grant and the plan belong to the project, not to a part of it. Everything
            written here counts towards them.
          </p>
        )}

        {(picture.over !== null || picture.overApproved !== null) && (
          <div className="mt-4 max-w-[760px] border-t border-oxblood pt-3 text-[12.5px] leading-relaxed text-oxblood">
            {picture.over !== null && (
              <div>
                The lines add up to {formatMoney(picture.over, currency)} more than the plan.
              </div>
            )}
            {picture.overApproved !== null && (
              <div>
                Committed money is {formatMoney(picture.overApproved, currency)} past what was
                approved.
              </div>
            )}
          </div>
        )}

        {parts.length > 0 && (
          <section className="mt-7 max-w-[760px]">
            <div className="lbl text-muted">Where it sits</div>
            <div className="mt-2">
              {parts.map((c) => {
                const r = rolls.get(c.id) ?? EMPTY
                return (
                  <div
                    key={c.id}
                    className="grid grid-cols-[1fr_92px_120px_120px] items-baseline gap-4 border-t border-rule py-2.5 last:border-b"
                  >
                    <Link
                      href={`${base}/cost?focus=${c.id}`}
                      className="truncate text-[13px] hover:text-green"
                    >
                      {c.title}
                    </Link>
                    <span className="text-[10.5px] tabular-nums text-muted">
                      {r.items} {r.items === 1 ? 'line' : 'lines'}
                    </span>
                    <span className="text-right text-[10.5px] tabular-nums text-muted">
                      {r.annual_priced > 0
                        ? `${formatMoney(Number(r.annual_priced), currency)} a year`
                        : `${formatMoney(Number(r.once_committed), currency)} committed`}
                    </span>
                    <span className="num text-right text-[15px]">
                      {formatMoney(Number(r.once_priced), currency)}
                    </span>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        <div className="mt-6 max-w-[760px]">
          <Rule />
        </div>

        {/* By certainty */}
        <div className="lbl mt-7 text-muted">Capitalised against expensed</div>
        <p className="mt-1 max-w-[760px] text-[11px] leading-relaxed text-rule-strong">
          A different cut of the same money. Recurrence separates an amount from a rate;
          this separates what creates an asset from what keeps things running. Neither
          answers the other.
        </p>
        <div className="mt-2 grid max-w-[760px] grid-cols-3 gap-4">
          <div className="border-t border-rule-strong pt-2.5">
            <div className="lbl-tight text-muted">CAPEX, the investment</div>
            <div className="num mt-1 text-[19px]">
              {formatMoney(Number(roll.capex_once_priced), currency)}
            </div>
            <div className="mt-1 text-[10px] leading-snug text-rule-strong">
              {formatMoney(Number(roll.capex_once_committed), currency)} committed
              {Number(roll.capex_annual_priced) > 0 && (
                <>
                  {' '}
                  · plus {formatMoney(Number(roll.capex_annual_priced), currency)} a year
                  capitalised
                </>
              )}
            </div>
          </div>
          <div className="border-t border-rule pt-2.5">
            <div className="lbl-tight text-muted">OPEX, one off</div>
            <div className="num mt-1 text-[19px]">
              {formatMoney(Number(roll.opex_once_priced), currency)}
            </div>
            <div className="mt-1 text-[10px] leading-snug text-rule-strong">
              {formatMoney(Number(roll.opex_once_committed), currency)} committed.
              Consultancy, training, anything that does not become an asset
            </div>
          </div>
          <div className="border-t border-rule pt-2.5">
            <div className="lbl-tight text-muted">OPEX, every year</div>
            <div className="num mt-1 text-[19px]">
              {formatMoney(Number(roll.opex_annual_priced), currency)}
            </div>
            <div className="mt-1 text-[10px] leading-snug text-rule-strong">
              {formatMoney(Number(roll.opex_annual_committed), currency)} committed. What
              it costs to keep, and what comes off the payback
            </div>
          </div>
        </div>

        <div className="lbl mt-7 text-muted">One off, by certainty</div>
        <div className="mt-2 grid max-w-[760px] grid-cols-4 gap-4">
          {COST_STATES.map((s) => (
            <div key={s} className="border-t border-rule pt-2.5">
              <div className="lbl-tight text-muted">{COST_STATE_LABEL[s]}</div>
              <div className="num mt-1 text-[17px]">
                {formatMoney(
                  Number(
                    s === 'estimate'
                      ? roll.once_estimated
                      : s === 'quoted'
                        ? roll.once_quoted
                        : s === 'ordered'
                          ? roll.once_ordered
                          : roll.once_invoiced,
                  ),
                  currency,
                )}
              </div>
              <div className="mt-1 text-[10px] leading-snug text-rule-strong">
                {COST_STATE_HINT[s]}
              </div>
            </div>
          ))}
        </div>

        {/* Add, or edit */}
        <div className="mt-8 border border-rule bg-sheet px-5 py-4">
          <div className="lbl text-muted">{editing ? 'Edit line' : 'New line'}</div>
          <form
            action={editing ? updateCost : createCost}
            encType="multipart/form-data"
            className="mt-3 grid grid-cols-6 gap-x-5 gap-y-3"
          >
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <input type="hidden" name="redirectTo" value={here} />

            <label className="col-span-3 block">
              <span className="lbl text-muted">What</span>
              <input
                name="description"
                required
                defaultValue={editing?.description ?? ''}
                placeholder="DIM cabinet, Rittal"
                className="field"
              />
            </label>

            <label className="block">
              <span className="lbl text-muted">
                <Hint text="What sort of thing this is. It is what lets the line stand as a part on Basis as well as a price here, so neither has to be typed twice.">
                  Kind
                </Hint>
              </span>
              <select name="kind" defaultValue={editing?.kind ?? 'other'} className="field">
                {COST_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {COST_KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="lbl text-muted">Quantity</span>
              <input
                name="quantity"
                inputMode="decimal"
                defaultValue={editing?.quantity ?? 1}
                placeholder="1"
                className="field tabular-nums"
              />
            </label>

            <label className="block">
              <span className="lbl text-muted">
                <Hint text="The price of ONE. Two masters at 180 are entered as quantity 2 and 180, not as a single 360 nobody can check.">
                  Unit price
                </Hint>
              </span>
              <input
                name="amount"
                required
                inputMode="decimal"
                defaultValue={editing?.amount ?? ''}
                placeholder="38000"
                className="field tabular-nums"
              />
            </label>

            <label className="block">
              <span className="lbl text-muted">Currency</span>
              <select
                name="currency"
                defaultValue={editing?.currency ?? 'DKK'}
                className="field"
              >
                {COST_CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="lbl text-muted">
                Rate <span className="ml-1.5 text-rule-strong">per euro</span>
              </span>
              <input
                name="eur_rate"
                inputMode="decimal"
                defaultValue={editing?.eur_rate ?? defaultRate}
                placeholder="7.46"
                className="field tabular-nums"
              />
              <span className="mt-1 block text-[10px] leading-snug text-rule-strong">
                Kept on the line. Changing it later never rewrites a total already
                reported. Ignored for a euro line.
              </span>
            </label>

            <label className="block">
              <span className="lbl text-muted">How often</span>
              <select
                name="recurrence"
                defaultValue={editing?.recurrence ?? 'once'}
                className="field"
              >
                {COST_RECURRENCES.map((r) => (
                  <option key={r} value={r}>
                    {COST_RECURRENCE_LABEL[r]} &middot; {COST_RECURRENCE_HINT[r]}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="lbl text-muted">Budget</span>
              <select
                name="budget"
                defaultValue={editing?.budget ?? 'capex'}
                className="field"
              >
                {COST_BUDGETS.map((b) => (
                  <option key={b} value={b}>
                    {COST_BUDGET_LABEL[b]} &middot; {COST_BUDGET_HINT[b]}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="lbl text-muted">Certainty</span>
              <select
                name="state"
                defaultValue={editing?.state ?? 'estimate'}
                className="field"
              >
                {COST_STATES.map((s) => (
                  <option key={s} value={s}>
                    {COST_STATE_LABEL[s]} &middot; {COST_STATE_HINT[s]}
                  </option>
                ))}
              </select>
            </label>

            {!editing && (
              <label className="col-span-2 block">
                <span className="lbl text-muted">
                  On{!atProject && <span className="ml-2 text-rule-strong">this part</span>}
                </span>
                <select
                  name="node_id"
                  defaultValue={onNode ?? scopeId}
                  className="field"
                  required
                >
                  {nodes
                    .filter((n) => inScope.has(n.id))
                    .map((n) => (
                      <option key={n.id} value={n.id}>
                        {pathLabel(n.id)}
                      </option>
                    ))}
                </select>
              </label>
            )}

            <label className="block">
              <span className="lbl text-muted">Vendor</span>
              <input
                name="vendor"
                defaultValue={editing?.vendor ?? ''}
                placeholder="Rittal DK"
                className="field"
              />
            </label>

            <label className="block">
              <span className="lbl text-muted">Reference</span>
              <input
                name="reference"
                defaultValue={editing?.reference ?? ''}
                placeholder="Quote, PO or invoice no."
                className="field"
              />
            </label>

            <label className="block">
              <span className="lbl text-muted">Dated</span>
              <input
                type="date"
                name="dated"
                defaultValue={editing?.dated ?? today()}
                className="field"
              />
            </label>

            <label className="col-span-2 block">
              <span className="lbl text-muted">
                Paper <span className="ml-2 text-rule-strong">the quote itself</span>
              </span>
              <input
                type="file"
                name="file"
                className="field text-[11px] file:mr-3 file:border-0 file:bg-transparent file:p-0 file:text-[10px] file:uppercase file:tracking-[0.16em] file:text-green"
              />
              {/*
                This one field still travels with the form, so it is bound by
                the 4.5 MB a server action can receive. A quotation is almost
                always well under that; a scanned drawing is not, and the
                Documents panel uploads straight to storage without the limit.
              */}
              <span className="mt-1 block text-[10px] leading-snug text-rule-strong">
                Up to 4.5 MB here. Anything larger goes on{' '}
                <Link
                  href={`${base}/dokumenter`}
                  className="text-ink underline decoration-rule-strong underline-offset-2"
                >
                  Documents
                </Link>
                , then pick it below.
              </span>
            </label>

            {docs.length > 0 && (
              <label className="col-span-2 block">
                <span className="lbl text-muted">
                  Or one already here
                </span>
                <select
                  name="document_id"
                  defaultValue={editing?.document_id ?? ''}
                  className="field"
                >
                  <option value="">None</option>
                  {docs.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="col-span-4 block">
              <span className="lbl text-muted">Note</span>
              <input
                name="note"
                defaultValue={editing?.note ?? ''}
                placeholder="What it covers, or what is still open"
                className="field"
              />
            </label>

            <div className="col-span-6 mt-1 flex items-center gap-3">
              <button className="btn">{editing ? 'Save' : 'Add'}</button>
              {editing && (
                <Link href={here} className="btn btn-ghost">
                  Cancel
                </Link>
              )}
            </div>
          </form>
        </div>

        {/* The lines, grouped by what they belong to */}
        {lines.length === 0 ? (
          <p className="mt-8 border-t border-rule py-4 text-[13px] text-muted">
            Nothing priced yet. Every quote you collect belongs here, on the part it is for.
          </p>
        ) : (
          <div className="mt-8">
            {[...byNode.entries()].map(([nodeId, group]) => (
              <section key={nodeId} className="mt-7 first:mt-0">
                <div className="flex items-baseline justify-between gap-4 border-b border-rule-strong pb-1.5">
                  <span className="lbl">{pathLabel(nodeId)}</span>
                  <span className="num text-[15px]">
                    {formatMoney(
                      Math.round(
                        group
                          .filter((l) => l.recurrence === 'once')
                          .reduce(
                            (sum, l) => sum + lineEur(l),
                            0,
                          ) * 100,
                      ) / 100,
                      currency,
                    )}
                  </span>
                </div>

                {group.map((l) => (
                  <div
                    key={l.id}
                    className="grid grid-cols-[1fr_120px_150px_120px] items-baseline gap-4 border-b border-rule py-3"
                  >
                    <div className="min-w-0">
                      <div className="text-[13px]">{l.description}</div>
                      <div className="mt-0.5 flex flex-wrap items-baseline gap-x-3 text-[10px] text-muted">
                        <span
                          className={l.budget === 'capex' ? 'text-muted' : 'text-ink'}
                        >
                          {COST_BUDGET_LABEL[l.budget]}
                        </span>
                        {l.recurrence !== 'once' && (
                          <span className="text-ink">
                            {COST_RECURRENCE_LABEL[l.recurrence].toLowerCase()}
                          </span>
                        )}
                        <span className="tabular-nums">{formatDate(l.dated)}</span>
                        {l.vendor && <span>{l.vendor}</span>}
                        {l.reference && <span className="tabular-nums">{l.reference}</span>}
                        {l.document_id && docById.has(l.document_id) && (
                          <a
                            href={`/api/document/${l.document_id}`}
                            className="text-green hover:text-oxblood"
                          >
                            {docById.get(l.document_id)!.name}
                          </a>
                        )}
                        {l.note && <span className="text-rule-strong">{l.note}</span>}
                        {l.document_id === null && l.state !== 'estimate' && (
                          <span
                            className="text-rule-strong"
                            title="Quoted, ordered or invoiced, with nothing attached to show where the figure comes from"
                          >
                            no paper
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="num text-right text-[15px]">
                      {/*
                        The unit price only shown where it is not the whole
                        story. One of something reads as its price, and «1 x»
                        in front of every line is noise.
                      */}
                      {Number(l.quantity) !== 1 && (
                        <span className="mr-1.5 text-[11px] tabular-nums text-muted">
                          {Number(l.quantity)} x {formatMoney(Number(l.amount), '').trim()}
                        </span>
                      )}
                      {formatMoney(lineAmount(l), l.currency)}
                      {l.recurrence !== 'once' && (
                        <span className="ml-1 text-[10px] text-muted">
                          {l.recurrence === 'monthly'
                            ? ' a month'
                            : l.recurrence === 'quarterly'
                              ? ' a quarter'
                              : ' a year'}
                        </span>
                      )}
                      {l.currency !== 'EUR' && (
                        <span className="block text-[10px] tabular-nums text-rule-strong">
                          {formatMoney(
                            Math.round(lineEur(l) * 100) / 100,
                            'EUR',
                          )}{' '}
                          at {l.eur_rate}
                        </span>
                      )}
                    </div>

                    {/* The action that happens most: a quote becomes an order */}
                    <div className="flex items-baseline gap-2.5">
                      {COST_STATES.map((s) => (
                        <form key={s} action={setCostState}>
                          <input type="hidden" name="id" value={l.id} />
                          <input type="hidden" name="state" value={s} />
                          <input type="hidden" name="redirectTo" value={here} />
                          <button
                            className={`lbl-tight ${
                              l.state === s
                                ? stateColour(s)
                                : 'text-rule-strong hover:text-ink'
                            }`}
                          >
                            {COST_STATE_LABEL[s].slice(0, 3)}
                          </button>
                        </form>
                      ))}
                    </div>

                    <div className="flex items-baseline justify-end gap-3">
                      <Link
                        href={keep(`edit=${l.id}`)}
                        className="lbl-tight text-rule-strong hover:text-ink"
                      >
                        Edit
                      </Link>
                      <form action={deleteCost}>
                        <input type="hidden" name="id" value={l.id} />
                        <input type="hidden" name="redirectTo" value={here} />
                        <button className="lbl-tight text-rule-strong hover:text-oxblood">
                          Delete
                        </button>
                      </form>
                    </div>
                  </div>
                ))}
              </section>
            ))}
          </div>
        )}
      </div>
    </ProjectFrame>
  )
}

function stateColour(s: CostState) {
  if (s === 'invoiced') return 'text-ink'
  if (s === 'ordered') return 'text-green'
  if (s === 'quoted') return 'text-muted'
  return 'text-rule-strong'
}

function Figure({
  label,
  note,
  value,
  strong = false,
}: {
  label: string
  note: string
  value: string | null
  strong?: boolean
}) {
  return (
    <>
      <div
        className={`lbl-tight border-t py-3 ${
          strong ? 'border-rule-strong text-ink' : 'border-rule text-muted'
        }`}
      >
        {label}
      </div>
      <div
        className={`border-t py-3 text-[11px] leading-relaxed text-muted ${
          strong ? 'border-rule-strong' : 'border-rule'
        }`}
      >
        {note}
      </div>
      <div
        className={`num border-t py-2.5 text-right text-[19px] ${
          strong ? 'border-rule-strong' : 'border-rule'
        }`}
      >
        {value ?? <span className="text-rule-strong">not set</span>}
      </div>
    </>
  )
}
