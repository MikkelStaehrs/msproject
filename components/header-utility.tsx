import Link from 'next/link'
import { Search } from 'lucide-react'
import { HeaderQuickKey } from '@/components/header-quick-key'
import { logout } from '@/app/login/actions'

/**
 * The utility row at the right of the header: search, quick entry, who is
 * signed in, sign out. Four things, all of them tools rather than places,
 * which is why Guide and Templates are no longer here. They sit with the
 * account now, and the Overview and Projects pages link to them from where
 * they are used.
 *
 * The name is the only route to your own password and to the name colleagues
 * see on a role, so it links to /auth/password rather than being a label.
 *
 * Admin joins them for the one or two accounts that hold it, and it belongs
 * here rather than in the five destinations for the same reason Templates and
 * the Guide do: it is a tool that sits with the account, not a place the work
 * lives. An account without it is shown nothing, and /admin answers a 404 to
 * anyone else, so this is a shortcut and never the gate.
 */
export function HeaderUtility({
  firstName,
  isAdmin,
}: {
  firstName: string | null
  isAdmin: boolean
}) {
  return (
    <div className="flex shrink-0 items-baseline gap-4">
      <Link
        href="/search"
        aria-label="Search"
        title="Search"
        className="self-center leading-none text-muted hover:text-green"
      >
        <Search size={20} strokeWidth={1} aria-hidden="true" />
      </Link>
      <HeaderQuickKey />
      {isAdmin && (
        <Link href="/admin" className="micro text-muted hover:text-ink">
          Admin
        </Link>
      )}
      {/*
        An account with no profile row yet has no name to show; the link still
        has to exist, because that account is exactly the one that needs to
        reach the page where a name is given.
      */}
      <Link href="/auth/password" className="micro text-muted hover:text-ink">
        {firstName ?? 'Account'}
      </Link>
      <form action={logout}>
        <button className="micro cursor-pointer text-muted hover:text-ink">Sign out</button>
      </form>
    </div>
  )
}
