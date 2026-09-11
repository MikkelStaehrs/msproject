import Link from 'next/link'
import { Nav } from '@/components/nav'
import { QuickAdd, type QuickTarget } from '@/components/quick-add'
import { createClient } from '@/lib/supabase/server'
import { QueryFailure, firstError } from '@/lib/failure'
import { readRecipients } from '@/lib/recipient-data'
import { redirect } from 'next/navigation'
import { knownPeople } from '@/lib/people'
import type { Profile } from '@/lib/types'
import { PeopleList } from '@/components/people-list'
import { logout } from '../login/actions'

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
  const walk = (key: string, prefix: string) => {
    for (const n of children.get(key) ?? []) {
      const path = prefix === '' ? n.title : `${prefix} › ${n.title}`
      out.push({ id: n.id, title: n.title, path })
      walk(n.id, path)
    }
  }
  walk('__root__', '')
  return out
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  const [treeRes, peopleRes, profileRes, authRes] = await Promise.all([
    supabase.from('node').select('id, parent_id, title, sort_order').order('sort_order'),
    supabase.from('node').select('reporting'),
    supabase.from('profile').select('id, full_name, email, password_set_at'),
    supabase.auth.getUser(),
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
      <header className="no-print flex flex-wrap items-end justify-between px-5 pb-[18px] pt-6 lg:flex-nowrap lg:px-16 lg:pt-[34px]">
        <Link
          href="/"
          className="font-display text-[32px] font-medium leading-none tracking-[-0.02em] lg:text-[40px]"
        >
          Task Studio
        </Link>
        {/*
          A line of its own on a phone, because the title and seven links do not
          share 390 pixels. On a wide screen it is the same baseline aligned
          group at the right of the title that it always was.
        */}
        <div className="mt-3.5 flex w-full items-baseline gap-7 lg:mt-0 lg:w-auto">
          {/*
            The links scroll sideways rather than wrap into two ragged lines.
            Sign out stays put beside them instead of scrolling away with them.
          */}
          <div className="min-w-0 flex-1 overflow-x-auto lg:flex-none lg:overflow-visible">
            <Nav />
          </div>
          {/*
            The only route to your own password and to the name colleagues see.
            It was reachable solely through an invitation link, which left the
            first account here unable to give itself a name at all.
          */}
          <Link
            href="/auth/password"
            className="shrink-0 text-[10px] uppercase tracking-[0.16em] text-rule-strong hover:text-muted"
          >
            Account
          </Link>
          <form action={logout} className="shrink-0">
            <button className="text-[10px] uppercase tracking-[0.16em] text-rule-strong hover:text-muted">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <div className="no-print h-0.5 bg-ink" />
      {children}
      <QuickAdd targets={targets} recipients={recipients} />
      <PeopleList names={people} />
    </>
  )
}
