import Link from 'next/link'
import { Nav } from '@/components/nav'
import { QuickAdd, type QuickTarget } from '@/components/quick-add'
import { createClient } from '@/lib/supabase/server'
import { QueryFailure, firstError } from '@/lib/failure'
import { readRecipients } from '@/lib/recipient-data'
import { redirect } from 'next/navigation'
import { knownPeople } from '@/lib/people'
import { feedItems, unseenCount } from '@/lib/feed'
import type { Blocker, Decision, Entry, Node, Profile } from '@/lib/types'
import { PeopleList } from '@/components/people-list'
import { HeaderUtility } from '@/components/header-utility'

type Flat = { id: string; parent_id: string | null; title: string; sort_order: number }

/**
 * Targets for quick entry: the whole tree flattened with its path, so
 * «data serv» finds «Data platform › Server access and VLAN». The list is
 * small enough to travel with the header rather than be fetched on the
 * client when the overlay opens.
 */
function buildTargets(nodes: Flat[]): QuickTarget[] {
  const children = new Map<string, Flat[]>()
  for (const n of nodes) {
    const key = n.parent_id ?? '__root__'
    children.set(key, [...(children.get(key) ?? []), n])
  }
  for (const list of children.values()) {
    list.sort((a, b) => a.sort_order - b.sort_order)
  }

  const out: QuickTarget[] = []
  /*
   * The project travels down with the walk, because the picker can now open a
   * node as well as write on it and a node's address is its project plus
   * itself. Worked out here, where the descent already knows which root it came
   * from, rather than climbing back up per row later.
   */
  const walk = (key: string, prefix: string, projectId: string | null) => {
    for (const n of children.get(key) ?? []) {
      const path = prefix === '' ? n.title : `${prefix} › ${n.title}`
      const root = projectId ?? n.id
      out.push({ id: n.id, title: n.title, path, projectId: root })
      walk(n.id, path, root)
    }
  }
  walk('__root__', '', null)
  return out
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  const [treeRes, peopleRes, profileRes, authRes, feedNodeRes, entryRes, blockerRes, decisionRes] =
    await Promise.all([
      supabase.from('node').select('id, parent_id, title, sort_order').order('sort_order'),
      supabase.from('node').select('reporting'),
      supabase
        .from('profile')
        .select('id, full_name, email, password_set_at, is_admin, feed_seen_at'),
      supabase.auth.getUser(),
      /*
       * The bell's count.
       *
       * Four more reads on every page in the application, which is the price of
       * a derived feed and was paid knowingly: the alternative is a stored
       * counter, and a counter is a number that can be wrong while everything
       * around it is right. These run inside the Promise.all that was already
       * here, so they cost one wait rather than four, and the portfolio is
       * small enough to fetch whole.
       *
       * Entries are capped. The count only has to be right about what is new,
       * and four hundred lines reaches a long way past anybody's last look.
       */
      supabase.from('node').select('*'),
      supabase.from('entry').select('*').order('created_at', { ascending: false }).limit(400),
      supabase.from('blocker').select('*'),
      supabase.from('decision').select('*'),
    ])

  /*
   * Read before anything is used, and on this page one of the three is not
   * cosmetic: the gate below fires on a row from `profile`. A failed read gives
   * no rows, `me` is then undefined, `me &&` is false, and the gate does not
   * fire, so an account whose password was typed by somebody else is waved
   * straight through with nothing anywhere saying why. Middleware already
   * applies this reasoning one layer up: a session that could not be checked
   * has not been checked, and neither has a first run.
   *
   * The other two are ordinary, and are checked here because this layout
   * renders on every page in the app. A fault in either would otherwise show as
   * quick entry and the name suggestions quietly offering nothing, everywhere
   * at once.
   */
  const failure = firstError([treeRes, peopleRes, profileRes])
  if (failure) return <QueryFailure message={failure} />

  /*
   * The first-run gate.
   *
   * An account created in the Supabase dashboard arrives with two things
   * missing, and one of them matters more than it looks: the password was typed
   * by whoever created the account, so until it is replaced two people can sign
   * in as one, and every line written under that name was written by an account
   * two people can open. The other is the name colleagues see on a role.
   *
   * There is no skip, and no "seen it" flag behind this. Both conditions are
   * facts about the account rather than about a dialog, so the gate disappears
   * by being answered: give a name, choose a password, and it is gone for good.
   * A dismissible version of this would be dismissed on day one by exactly the
   * people it exists for.
   *
   * It sits in the layout because the layout already reads `profile` and
   * already runs on every page in the app. /auth/password is outside this
   * layout, so there is no loop.
   */
  const me = ((profileRes.data ?? []) as Profile[]).find(
    (p) => p.id === authRes.data.user?.id,
  )
  if (me && (me.full_name === null || me.password_set_at === null)) {
    redirect('/auth/password')
  }

  /*
   * The header shows a first name, not a full one: it is a signature on a
   * utility row, not a heading. The gate above guarantees a name exists for
   * anyone with a profile row, so an empty first name only means there is no
   * row yet.
   */
  const firstName = me?.full_name?.trim().split(/\s+/)[0] || null

  /*
   * How much names you that you have not marked seen.
   *
   * Worked out here because the bell is in the header and the header is this
   * layout. It is deliberately NOT checked for a read failure: a feed that
   * cannot be counted should show no count, and a whole-page error because the
   * bell could not be drawn would take out every screen in the application to
   * report a number. The three reads above it are checked, because the page
   * depends on them.
   */
  const unseen =
    me === undefined
      ? 0
      : unseenCount(
          feedItems({
            nodes: (feedNodeRes.data ?? []) as Node[],
            entries: (entryRes.data ?? []) as Entry[],
            blockers: (blockerRes.data ?? []) as Blocker[],
            decisions: (decisionRes.data ?? []) as Decision[],
            nameOf: new Map(
              ((profileRes.data ?? []) as Profile[]).map((p) => [
                p.id,
                p.full_name?.trim() || p.email,
              ]),
            ),
            me: { id: me.id, name: me.full_name },
          }),
          me.feed_seen_at,
        )

  const targets = buildTargets((treeRes.data ?? []) as Flat[])

  /*
   * Everyone this portfolio already knows about, rendered once here as a
   * datalist the role fields on every page point at. It sits in the layout
   * rather than being handed down through five components, and it is cheap:
   * these are rows already being read to build the quick entry targets.
   *
   * The names TYPED INTO ROLES are cut by RLS without being asked, so a
   * colleague never sees who is named on work they have no access to. The
   * ACCOUNTS are not: `profile` is readable by anyone signed in, on purpose,
   * because you cannot add a colleague to a project without being able to name
   * them. Which is to say the picker knows every account here and only the
   * roles you may see, and that asymmetry is deliberate rather than an
   * oversight.
   */
  const people = knownPeople({
    accounts: (profileRes.data ?? []) as Profile[],
    roles: ((peopleRes.data ?? []) as { reporting: Record<string, unknown> }[]).map(
      (n) => (n.reporting?.people ?? {}) as Record<string, unknown>,
    ),
  })

  // Travels with the header for the same reason the targets do: the overlay
  // needs it the instant it opens, and the list is tiny.
  const recipients = (await readRecipients(supabase)).map((r) => r.name)

  return (
    <>
      {/*
        The concept's appbar: wordmark, the five destinations, and the
        utility row, on one baseline with the gutter on both sides. Below
        `lg` the nav takes a line of its own under the wordmark and utilities
        and scrolls sideways rather than wrap into two ragged lines; the page
        itself never scrolls sideways.
      */}
      <header className="no-print flex flex-wrap items-baseline justify-between gap-x-7 gap-y-3 px-[var(--gut)] py-[18px]">
        <Link
          href="/"
          className="font-display text-[24px] font-semibold leading-none tracking-[-0.03em] text-green"
        >
          Task Studio
        </Link>
        <div className="order-3 w-full min-w-0 overflow-x-auto lg:order-none lg:w-auto lg:overflow-visible">
          <Nav />
        </div>
        <HeaderUtility
          firstName={firstName}
          isAdmin={me?.is_admin ?? false}
          unseen={unseen}
        />
      </header>
      <div className="no-print h-px bg-line-strong" />
      {children}
      <QuickAdd targets={targets} recipients={recipients} />
      <PeopleList names={people} />
    </>
  )
}
