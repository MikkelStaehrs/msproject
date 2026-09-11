import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { QueryFailure, firstError } from '@/lib/failure'
import { formatMoney } from '@/lib/cost'
import { notStartedShare, strategyPicture, type Marking } from '@/lib/strategy'
import { createStrategy, deleteStrategy, updateStrategy } from '@/lib/strategy-actions'
import { Hint, Rule, formatDate } from '@/components/ui'
import type { Node, NodeCost, Strategy, StrategyNode } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Strategy' }

/**
 * What the work is FOR, one level above the projects.
 *
 * A company strategy is fed by pieces of several unrelated projects, so it can
 * never be read off one of them. This is the only page that cuts the tree that
 * way, and the question it answers is the one a strategy owner is actually
 * asked: how much of it have you got, and how much of that is real yet.
 */
export default async function StrategyPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; new?: string }>
}) {
  const { edit: editId, new: creating } = await searchParams
  const supabase = await createClient()

  const [strategyRes, markRes, nodeRes, costRes] = await Promise.all([
    supabase.from('strategy').select('*').order('sort_order').order('name'),
    supabase.from('v_strategy_node').select('*'),
    supabase.from('node').select('*').order('sort_order'),
    supabase.from('v_node_cost').select('*'),
  ])

  const failure = firstError([strategyRes, markRes, nodeRes, costRes])
  if (failure) return <QueryFailure message={failure} />

  const strategies = (strategyRes.data ?? []) as Strategy[]
  const marks = (markRes.data ?? []) as StrategyNode[]
  const nodes = (nodeRes.data ?? []) as Node[]
  const rolls = new Map(((costRes.data ?? []) as NodeCost[]).map((r) => [r.node_id, r]))
  const byId = new Map(nodes.map((n) => [n.id, n]))

  /**
   * The expected annual benefit is typed on the PROJECT under Identity, so only
   * a marked project has one of its own. A marked subproject has to carry a
   * figure on the marking, and where it does not, the contribution is unknown.
   */
  const markingFor = (m: StrategyNode): Marking => {
    const node = byId.get(m.node_id)
    const roll = rolls.get(m.node_id)
    return {
      nodeId: m.node_id,
      isTop: m.is_top,
      annualEur: m.annual_eur === null ? null : Number(m.annual_eur),
      ownBenefit: m.benefit_eur === null ? null : Number(m.benefit_eur),
      status: m.node_status,
      blocked: m.node_blocked,
      investedEur: Number(roll?.once_committed ?? 0),
    }
  }

  const editing = editId ? strategies.find((s) => s.id === editId) : undefined

  return (
    <main>
      <div className="frame [--frame-margin:340px] items-baseline">
        <div className="lbl pl-5 lg:pl-16 py-3 pr-5 text-muted">Strategy</div>
        <div className="lbl border-l border-rule px-5 lg:px-10 py-3 text-muted">
          What the work is for, across the projects
        </div>
        <div className="border-l border-rule py-3 pl-5 lg:pl-8 pr-5 lg:pr-16 text-right">
          {!creating && !editing && (
            <Link href="/strategy?new=1" className="lbl text-muted hover:text-ink">
              New strategy
            </Link>
          )}
        </div>
      </div>
      <Rule strong />

      <div className="px-5 lg:px-16 py-8">
        {(creating || editing) && (
          <div className="mb-10 max-w-3xl border border-rule bg-sheet px-6 py-5">
            <div className="lbl mb-4 text-muted">
              {editing ? 'Edit strategy' : 'New strategy'}
            </div>
            <form
              action={editing ? updateStrategy : createStrategy}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-4"
            >
              {editing && <input type="hidden" name="id" value={editing.id} />}
              <input type="hidden" name="redirectTo" value="/strategy" />

              <label className="col-span-1 sm:col-span-2 block">
                <span className="lbl text-muted">Name</span>
                <input
                  name="name"
                  required
                  autoFocus
                  defaultValue={editing?.name ?? ''}
                  placeholder="COGS saving"
                  className="field text-base"
                />
              </label>

              <label className="block">
                <span className="lbl text-muted">
                  <Hint text="What the strategy is measured against, per year, in euro. Leave it empty where the strategy carries no number: an invented target is worse than none.">
                    Target a year
                  </Hint>
                </span>
                <input
                  name="target_annual"
                  inputMode="decimal"
                  defaultValue={editing?.target_annual ?? ''}
                  placeholder="250000"
                  className="field tabular-nums"
                />
              </label>

              <label className="block">
                <span className="lbl text-muted">Owner</span>
                <input
                  name="owner"
                  defaultValue={editing?.owner ?? ''}
                  className="field"
                />
              </label>

              <label className="block">
                <span className="lbl text-muted">Started</span>
                <input
                  type="date"
                  name="started_on"
                  defaultValue={editing?.started_on ?? ''}
                  className="field"
                />
              </label>

              <label className="block">
                <span className="lbl text-muted">
                  <Hint text="Leave empty while it runs. A finished strategy stays on the page: what it delivered is the evidence for the next one.">
                    Ended
                  </Hint>
                </span>
                <input
                  type="date"
                  name="ended_on"
                  defaultValue={editing?.ended_on ?? ''}
                  className="field"
                />
              </label>

              <label className="col-span-1 sm:col-span-2 lg:col-span-4 block">
                <span className="lbl text-muted">What it is</span>
                <textarea
                  name="description"
                  rows={2}
                  defaultValue={editing?.description ?? ''}
                  className="field resize-y"
                />
              </label>

              <div className="col-span-1 sm:col-span-2 lg:col-span-4 mt-1 flex items-center gap-3">
                <button className="btn">{editing ? 'Save' : 'Create'}</button>
                <Link href="/strategy" className="btn btn-ghost">
                  Cancel
                </Link>
                {editing && (
                  <form action={deleteStrategy} className="ml-auto">
                    <input type="hidden" name="id" value={editing.id} />
                    <input type="hidden" name="redirectTo" value="/strategy" />
                    <button className="btn btn-danger">Delete</button>
                  </form>
                )}
              </div>
            </form>
          </div>
        )}

        {strategies.length === 0 ? (
          <p className="max-w-prose text-[13px] leading-relaxed text-muted">
            No strategies yet. A strategy is what several unrelated projects are
            all for: cost of goods, uptime, a compliance deadline. Mark the part
            of the tree that actually delivers it, which is not always the whole
            project.
          </p>
        ) : (
          <div className="flex flex-col gap-12">
            {strategies.map((s) => {
              const mine = marks.filter((m) => m.strategy_id === s.id).map(markingFor)
              const p = strategyPicture(
                mine,
                s.target_annual === null ? null : Number(s.target_annual),
              )
              const ahead = notStartedShare(mine)
              const counted = marks.filter((m) => m.strategy_id === s.id && m.is_top)

              return (
                <section key={s.id}>
                  <div className="flex items-baseline gap-4">
                    <h2 className="font-display text-[26px] leading-tight">
                      <Link href={`/strategy/${s.id}`} className="hover:text-green">
                        {s.name}
                      </Link>
                    </h2>
                    {s.ended_on && (
                      <span className="lbl-tight text-rule-strong">
                        ended {formatDate(s.ended_on)}
                      </span>
                    )}
                    {s.owner && <span className="lbl-tight text-muted">{s.owner}</span>}
                    <Link
                      href={`/strategy?edit=${s.id}`}
                      className="lbl-tight ml-auto text-rule-strong hover:text-ink"
                    >
                      Edit
                    </Link>
                  </div>

                  {s.description && (
                    <p className="mt-2 max-w-prose text-[13px] leading-relaxed text-muted">
                      {s.description}
                    </p>
                  )}

                  <div className="mt-5 grid max-w-4xl grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 border-y border-rule py-4">
                    <Figure
                      label="Promised a year"
                      value={formatMoney(Math.round(p.promised), 'EUR')}
                      note={
                        p.unquantified > 0
                          ? `${p.unquantified} of ${p.counted} carry no figure`
                          : `from ${p.counted} ${p.counted === 1 ? 'part' : 'parts'}`
                      }
                      warn={p.unquantified > 0}
                    />
                    <Figure
                      label="Of that, delivered"
                      value={formatMoney(Math.round(p.delivered), 'EUR')}
                      note={
                        p.promised > 0
                          ? `${Math.round((p.delivered / p.promised) * 100)}% of what is promised`
                          : 'nothing finished yet'
                      }
                    />
                    {/*
                      The one figure here that is still what YOU can see.
                      Promised and delivered are computed over the whole tree so
                      the strategy reports the same number to everyone; spend is
                      left per-viewer, and says so, rather than repeating the
                      currency conversion in a third place to make it whole.
                    */}
                    <Figure
                      label="Invested so far"
                      value={formatMoney(Math.round(p.invested), 'EUR')}
                      note="ordered or invoiced, in projects you can open"
                    />
                    <Figure
                      label={p.target === null ? 'No target' : 'Still to find'}
                      value={
                        p.target === null
                          ? '—'
                          : p.shortfall === null
                            ? '—'
                            : formatMoney(Math.round(p.shortfall), 'EUR')
                      }
                      note={
                        p.target === null
                          ? 'the strategy carries no number'
                          : p.shortfall === null
                            ? 'not while something counted has no figure'
                            : p.shortfall <= 0
                              ? `target of ${formatMoney(Math.round(p.target), 'EUR')} covered`
                              : `against ${formatMoney(Math.round(p.target), 'EUR')}`
                      }
                      warn={p.shortfall !== null && p.shortfall > 0}
                    />
                  </div>

                  <div className="mt-3 flex flex-wrap items-baseline gap-x-8 gap-y-1 text-[11px] text-rule-strong">
                    {p.stalled > 0 && (
                      <span className="text-oxblood">
                        {p.stalled} {p.stalled === 1 ? 'part is' : 'parts are'} blocked
                        or on hold
                      </span>
                    )}
                    {ahead !== null && ahead > 0 && (
                      <span>
                        {Math.round(ahead * 100)}% of the promise rests on work not
                        started
                      </span>
                    )}
                    <Link href={`/strategy/${s.id}`} className="ml-auto hover:text-ink">
                      The {counted.length} {counted.length === 1 ? 'part' : 'parts'} &rsaquo;
                    </Link>
                  </div>
                </section>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}

function Figure({
  label,
  value,
  note,
  warn = false,
}: {
  label: string
  value: string
  note: string
  warn?: boolean
}) {
  return (
    <div>
      <div className="lbl text-muted">{label}</div>
      <div className="num mt-1 text-[19px] leading-none">{value}</div>
      <div className={`mt-1.5 text-[10.5px] leading-snug ${warn ? 'text-oxblood' : 'text-rule-strong'}`}>
        {note}
      </div>
    </div>
  )
}
