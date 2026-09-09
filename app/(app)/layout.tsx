import Link from 'next/link'
import { Nav } from '@/components/nav'
import { QuickAdd, type QuickTarget } from '@/components/quick-add'
import { createClient } from '@/lib/supabase/server'
import { readRecipients } from '@/lib/recipient-data'
import { knownPeople } from '@/lib/people'
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

  const [treeRes, peopleRes, profileRes] = await Promise.all([
    supabase.from('node').select('id, parent_id, title, sort_order').order('sort_order'),
    supabase.from('node').select('reporting'),
    supabase.from('profile').select('full_name'),
  ])

  const targets = buildTargets((treeRes.data ?? []) as Flat[])

  /*
   * Everyone this portfolio already knows about, rendered once here as a
   * datalist the role fields on every page point at. It sits in the layout
   * rather than being handed down through five components, and it is cheap:
   * these are rows already being read to build the quick entry targets.
   *
   * RLS does the right thing without being asked. The names offered come from
   * projects you are on, so a colleague never sees who is named on work they
   * have no access to.
   */
  const people = knownPeople({
    accounts: ((profileRes.data ?? []) as { full_name: string | null }[]).map(
      (p) => p.full_name,
    ),
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
