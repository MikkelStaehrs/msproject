import Link from 'next/link'
import { Bell, Search } from 'lucide-react'
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
  unseen,
}: {
  firstName: string | null
  isAdmin: boolean
  /** How much names you that you have not marked seen. Zero draws no count. */
  unseen: number
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
      {/*
        The bell.

        A link and not a popover, which is the whole design decision here. A
        panel hanging off this row would be a second, shorter copy of /feed
        that has to be kept saying the same thing, and it would need
        JavaScript to open. The count is the notification; the page is the
        feed. One press, no state.

        It counts only what NAMES you, so it can be zero and usually is.
        A bell that always shows a number is a bell nobody reads.
      */}
      <Link
        href="/feed"
        aria-label={unseen === 0 ? 'What happened' : `What happened, ${unseen} new for you`}
        title="What happened"
        className="relative self-center leading-none text-muted hover:text-green"
      >
        <Bell size={19} strokeWidth={1} aria-hidden="true" />
        {unseen > 0 && (
          <span
            aria-hidden="true"
            className="mono absolute -right-2 -top-1.5 min-w-[15px] rounded-full bg-rust px-[3px] text-center text-[9px] leading-[15px] text-inset"
          >
            {unseen > 9 ? '9+' : unseen}
          </span>
        )}
      </Link>
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
