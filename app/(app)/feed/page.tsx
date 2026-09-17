import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { QueryFailure, firstError } from '@/lib/failure'
import { markFeedSeen } from '@/lib/feed-actions'
import { feedItems, unseenCount, FEED_GLYPH, FEED_LABEL, type FeedItem } from '@/lib/feed'
import { projectOf } from '@/lib/subtree'
import { formatDate, formatDateLong } from '@/components/ui'
import type { Blocker, Decision, Entry, Node, Profile } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'What happened' }

/**
 * What happened, and which of it is about you.
 *
 * Two readings of one list rather than two lists. «For me» is the narrow one
 * the bell counts: work you drive, and blockers waiting on you by name, minus
 * anything you did yourself. «Everything» is the same assembly with the filter
 * off, and it is the honest companion to the first: a feed that only ever shows
 * you your own corner is a feed you cannot use to find out what the week was
 * like.
 *
 * Nothing here is stored. Every row is a line, a blocker, a decision or a piece
 * of work that already existed with a date on it, which is why this page has
 * history in it from the day it shipped. See lib/feed.ts for what that costs.
 */
export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) notFound()

  const [nodeRes, entryRes, blockerRes, decisionRes, profileRes] = await Promise.all([
    supabase.from('node').select('*').order('sort_order'),
    supabase.from('entry').select('*').order('created_at', { ascending: false }).limit(400),
    supabase.from('blocker').select('*'),
    supabase.from('decision').select('*'),
    supabase.from('profile').select('id, full_name, email, feed_seen_at'),
  ])

  const failure = firstError([nodeRes, entryRes, blockerRes, decisionRes, profileRes])
  if (failure) return <QueryFailure message={failure} />

  const nodes = (nodeRes.data ?? []) as Node[]
  const profiles = (profileRes.data ?? []) as Profile[]
  const me = profiles.find((p) => p.id === auth.user.id)

  /*
   * An account with no name shows as its address, the same fallback the role
   * picker uses. «somebody» is reserved for a row that genuinely records no
   * author, and the two must not be confused: one is an account that has not
   * finished setting itself up, the other is a row written before this was
   * recorded at all.
   */
  const nameOf = new Map(profiles.map((p) => [p.id, p.full_name?.trim() || p.email]))

  const items = feedItems({
    nodes,
    entries: (entryRes.data ?? []) as Entry[],
    blockers: (blockerRes.data ?? []) as Blocker[],
    decisions: (decisionRes.data ?? []) as Decision[],
    nameOf,
    me: { id: auth.user.id, name: me?.full_name ?? null },
  })

  const seenAt = me?.feed_seen_at ?? null
  const unseen = unseenCount(items, seenAt)

  const everything = params.show === 'all'
  const shown = (everything ? items : items.filter((i) => i.mine)).slice(0, 120)

  const projectOfNode = projectOf(nodes)
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const at = (nodeId: string) =>
    `/p/${projectOfNode.get(nodeId) ?? nodeId}?task=${nodeId}`
  const projectTitle = (nodeId: string) =>
    byId.get(projectOfNode.get(nodeId) ?? nodeId)?.title ?? ''

  const isNew = (i: FeedItem) => seenAt === null || i.sortKey > seenAt

  return (
    <main>
      {/* The band: what this is, and the one figure that is a person's */}
      <div className="grid grid-cols-1 border-b border-line-strong lg:grid-cols-[auto_1fr_auto]">
        <div className="lbl px-[var(--gut)] py-2.5 text-muted lg:pr-6">What happened</div>
        <div className="lbl border-t border-line px-[var(--gut)] py-2.5 text-muted lg:border-l lg:border-t-0 lg:px-6">
          {seenAt === null
            ? 'You have never marked this seen, so this is everything'
            : `Seen up to ${formatDateLong(seenAt.slice(0, 10))}`}
          {unseen > 0 && <span className="text-rust"> · {unseen} new for you</span>}
        </div>
        <div className="flex items-center justify-end gap-6 border-t border-line px-[var(--gut)] py-2.5 lg:border-l lg:border-t-0">
          {unseen > 0 ? (
            <form action={markFeedSeen}>
              <input
                type="hidden"
                name="redirectTo"
                value={everything ? '/feed?show=all' : '/feed'}
              />
              <button className="btn">Mark as seen</button>
            </form>
          ) : (
            <span className="lbl-tight text-green">Nothing new</span>
          )}
        </div>
      </div>

      <div className="px-[var(--gut)] py-[26px]">
        <div className="work mx-auto">
          <h1 className="text-[34px] font-semibold leading-[1.08] tracking-[-0.03em] text-green [text-wrap:balance]">
            What happened
          </h1>
          <p className="prose-measure grp-gap text-green-soft">
            Not a record kept beside the work. Every line here is the work itself,
            read back in the order it arrived, so it goes as far back as the
            projects do.
          </p>

          <div className="filterrow grp-gap gap-x-6">
            <Link
              href="/feed"
              aria-pressed={!everything}
              className={!everything ? 'text-green' : 'text-muted hover:text-ink'}
            >
              For me
              {unseen > 0 && <span className="ml-1.5 text-rust">{unseen}</span>}
            </Link>
            <Link
              href="/feed?show=all"
              aria-pressed={everything}
              className={everything ? 'text-green' : 'text-muted hover:text-ink'}
            >
              Everything
            </Link>
          </div>

          {shown.length === 0 ? (
            <p className="grp-gap text-[13px] text-muted">
              {everything
                ? 'Nothing has happened in any project you are on.'
                : 'Nothing names you. Work you drive and blockers waiting on you by name show up here, and nothing you did yourself ever does.'}
            </p>
          ) : (
            <div className="panel grp-gap max-w-[1120px]">
              {shown.map((i) => (
                <div
                  key={i.id}
                  className={`relative flex items-start gap-3 border-b border-line px-[14px] py-3 last:border-b-0 hover:bg-hover ${
                    isNew(i) ? '' : 'opacity-70'
                  }`}
                >
                  {/* An unseen row is marked at the edge, not by shouting. */}
                  {isNew(i) && (
                    <span
                      aria-label="New"
                      className="absolute left-0 top-0 h-full w-[2px] bg-rust"
                    />
                  )}
                  <span
                    className={`mono w-[1.1em] shrink-0 text-center ${
                      i.rust ? 'text-rust' : 'text-muted'
                    }`}
                    aria-hidden="true"
                  >
                    {FEED_GLYPH[i.kind]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={at(i.nodeId)}
                      className="block leading-snug after:absolute after:inset-0 after:content-['']"
                    >
                      {i.line}
                    </Link>
                    <div className="mt-1 text-[12px] leading-snug text-muted">
                      {i.who ?? 'somebody'} · {i.where}
                      {projectTitle(i.nodeId) !== i.where && ` · ${projectTitle(i.nodeId)}`}
                    </div>
                  </div>
                  {everything && i.mine && (
                    <span className="tag shrink-0">Yours</span>
                  )}
                  <span className={`tag shrink-0 ${i.rust ? 'tag-rust' : ''}`}>
                    {FEED_LABEL[i.kind]}
                  </span>
                  <span className="mono shrink-0 pt-0.5 text-[9.5px] uppercase tracking-[0.1em] text-muted">
                    {formatDate(i.at.slice(0, 10))}
                  </span>
                </div>
              ))}
            </div>
          )}

          <p className="prose-measure grp-gap text-[12px] leading-[1.5] text-muted">
            «For me» means work you are the driver of, and blockers waiting on you
            by name. It never includes what you did yourself. The match is on the
            name, because a driver is text and not an account: somebody whose
            profile is spelled differently from their tasks will not be found, and
            nothing here pretends otherwise. Who changed a status or handed a task
            over is not shown, because nothing in the database records it.
          </p>
        </div>
      </div>
    </main>
  )
}
