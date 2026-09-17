import { OverviewMore, type MoreItem } from '@/components/overview-more'
import { closeAccount, deleteAccount, setAdmin } from '@/lib/admin-actions'
import type { Profile } from '@/lib/types'

/**
 * One account.
 *
 * The three things that can be done to it are all writes, so all three sit in
 * the overflow as posting items rather than links, and the two that cannot be
 * undone ask first. The refusals that matter are not here: an action that
 * would empty a project or remove the last administrator is refused by the
 * action itself, which can see every project and this page cannot.
 *
 * Stacked on a phone, `contents` at desk width, the same one stair every other
 * table here runs.
 */
export function AccountRow({
  profile,
  isMe,
  projects,
  lastAdmin,
}: {
  profile: Profile
  /** The account reading the page. It is not offered its own exit. */
  isMe: boolean
  /** How many projects the reader can see them on. */
  projects: number
  /** The only administrator left, who cannot be demoted. */
  lastAdmin: boolean
}) {
  const name = profile.full_name ?? profile.email

  /*
   * An account that has never chosen its own password still holds the one
   * whoever created it typed, which means two people can sign in as one and
   * every line written under that name was written by an account two people
   * can open. Rust, because it is the definition of requiring a human.
   */
  const unclaimed = profile.password_set_at === null

  /*
   * Built before the row so the overflow can be left off entirely when there
   * is nothing in it, which is the case for the only administrator looking at
   * their own line: they may not demote themselves, and they may not remove
   * or delete themselves either.
   */
  const items: MoreItem[] = [
    /*
      The last administrator is offered nothing here rather than an item that
      always fails. The action refuses it too, because a menu is not a gate,
      but a word you can click that never works is worse than an absent one.
    */
    ...(profile.is_admin
      ? lastAdmin
        ? []
        : [
            {
              label: 'Remove administrator',
              action: setAdmin,
              fields: { user_id: profile.id, is_admin: 'false' },
              confirm: `${name} will no longer be able to open this page or answer a request. Carry on?`,
            },
          ]
      : [
          {
            label: 'Make administrator',
            action: setAdmin,
            fields: { user_id: profile.id, is_admin: 'true' },
            confirm: `${name} will be able to invite people, delete accounts and make others administrators. Carry on?`,
          },
        ]),
    ...(isMe
      ? []
      : [
          {
            label: 'Take off every project',
            action: closeAccount,
            fields: { user_id: profile.id },
            confirm: `${name} keeps the account and everything they wrote, and signs in to an empty application. Carry on?`,
          },
          {
            label: 'Delete the account',
            danger: true,
            action: deleteAccount,
            fields: { user_id: profile.id },
            confirm: `Delete ${name}, their sparks and their access. The lines, blockers and decisions they wrote stay on the work. This cannot be undone.`,
          },
        ]),
  ]

  return (
    <div className="grid grid-cols-1 border-b border-line last:border-b-0 hover:bg-hover lg:grid-cols-[minmax(0,1fr)_150px_120px_44px]">
      <div className="min-w-0 px-[14px] py-2">
        <span className="font-medium">{name}</span>
        {isMe && <span className="lbl-tight ml-2.5 text-muted">you</span>}
        <div className="mt-[5px] text-[12px] leading-[1.45] text-muted">
          <span className="mono">{profile.email}</span>
          {unclaimed && (
            <span className="text-rust"> · has not chosen a password yet</span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-7 gap-y-2 px-[14px] pb-3 lg:contents">
        <div className="text-muted lg:px-[14px] lg:py-2">
          <span className="micro mr-3 lg:hidden">On projects</span>
          {projects === 0 ? 'None you can see' : projects}
        </div>

        <div className="lg:px-[14px] lg:py-2">
          <span className="micro mr-3 text-muted lg:hidden">Admin</span>
          {profile.is_admin ? <span className="tag">Administrator</span> : <span className="text-muted">No</span>}
        </div>

        <div className="lg:px-[9px] lg:py-2">
          {items.length > 0 && <OverviewMore label={name} items={items} />}
        </div>
      </div>
    </div>
  )
}
