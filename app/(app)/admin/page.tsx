import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { QueryFailure, firstError } from '@/lib/failure'
import { AccessRequestRow } from '@/components/admin-request'
import { AccountRow } from '@/components/admin-account'
import type { AccessRequest, Profile } from '@/lib/types'

export const metadata = { title: 'Admin' }

/**
 * Who gets in, and who is already in.
 *
 * Two lists and nothing else. Everything on this page is about an ACCOUNT:
 * whether one should exist, whether it may open this page, and whether it
 * should go. What an account may SEE is not here, because that is membership
 * of a project and it is decided on the project, where whoever decides can
 * see what they are handing over. A screen that grants access to work it does
 * not show you is a screen that gets clicked through.
 *
 * The gate is the first thing on it. `notFound` rather than a message,
 * because an account that is not an administrator has no business learning
 * that this address answers.
 */
export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) notFound()

  const [profileRes, requestRes, memberRes] = await Promise.all([
    supabase.from('profile').select('*').order('email'),
    supabase.from('access_request').select('*').order('requested_at', { ascending: false }),
    supabase.from('project_member').select('project_id, user_id'),
  ])

  const profiles = (profileRes.data ?? []) as Profile[]
  const me = profiles.find((p) => p.id === auth.user.id)
  if (!me?.is_admin) notFound()

  /*
   * Checked after the gate, not before. A failed read would leave `me`
   * undefined and send an administrator to a 404, which is the wrong thing to
   * say; past the gate, a failure is a failure and says so.
   */
  const failure = firstError([profileRes, requestRes, memberRes])
  if (failure) return <QueryFailure message={failure} />

  const requests = (requestRes.data ?? []) as AccessRequest[]
  const waiting = requests.filter((r) => r.state === 'new')
  const answered = requests.filter((r) => r.state !== 'new')

  /*
   * How many projects each account is on. Counted through this session, so it
   * counts only the projects the administrator reading the page can see
   * themselves, and the figure says so rather than claiming to be the whole
   * truth. The refusals that protect a project from being emptied do not rely
   * on this number; they are worked out in the action with the key that can
   * see every project. See lib/admin-actions.ts.
   */
  const onProjects = new Map<string, number>()
  for (const m of (memberRes.data ?? []) as { user_id: string }[]) {
    onProjects.set(m.user_id, (onProjects.get(m.user_id) ?? 0) + 1)
  }

  const admins = profiles.filter((p) => p.is_admin)
  const showAnswered = params.show === 'answered'

  return (
    <main>
      {/* The band: where you are, and the one figure that needs a person */}
      <div className="grid grid-cols-1 border-b border-line-strong lg:grid-cols-[auto_1fr_auto]">
        <div className="lbl px-[var(--gut)] py-2.5 text-muted lg:pr-6">Admin</div>
        <div className="lbl border-t border-line px-[var(--gut)] py-2.5 text-muted lg:border-l lg:border-t-0 lg:px-6">
          {profiles.length} {profiles.length === 1 ? 'account' : 'accounts'} ·{' '}
          {admins.length} {admins.length === 1 ? 'administrator' : 'administrators'}
          {waiting.length > 0 && (
            <span className="text-rust">
              {' '}
              · {waiting.length} waiting for an answer
            </span>
          )}
        </div>
        <div className="flex items-center justify-end gap-6 border-t border-line px-[var(--gut)] py-2.5 lg:border-l lg:border-t-0">
          <Link href="/projects" className="act">
            Projects
          </Link>
        </div>
      </div>

      <div className="px-[var(--gut)] py-[26px]">
        <div className="work mx-auto">
          <h1 className="text-[34px] font-semibold leading-[1.08] tracking-[-0.03em] text-green [text-wrap:balance]">
            Who gets in
          </h1>
          <p className="prose-measure grp-gap text-green-soft">
            Inviting somebody creates their account and nothing more. They sign
            in to an empty application until they are put on a project, which
            happens on the project itself.
          </p>

          {/* ================= Waiting ================= */}
          <h2 className="sec-gap text-[17px] font-semibold tracking-[-0.025em]">
            Asked to come in
          </h2>

          {waiting.length === 0 ? (
            <p className="grp-gap text-[13px] text-muted">
              Nobody is waiting. Requests arrive from the login screen.
            </p>
          ) : (
            <div className="panel grp-gap max-w-[1120px]">
              {waiting.map((r) => (
                <AccessRequestRow key={r.id} request={r} />
              ))}
            </div>
          )}

          {answered.length > 0 && (
            <div className="grp-gap">
              {showAnswered ? (
                <>
                  <div className="panel max-w-[1120px]">
                    {answered.map((r) => (
                      <AccessRequestRow
                        key={r.id}
                        request={r}
                        decidedBy={
                          profiles.find((p) => p.id === r.decided_by)?.full_name ?? null
                        }
                      />
                    ))}
                  </div>
                  <Link href="/admin" className="act mt-[var(--grp)] inline-block">
                    Hide what has been answered
                  </Link>
                </>
              ) : (
                <Link href="/admin?show=answered" className="act">
                  {answered.length} already answered
                </Link>
              )}
            </div>
          )}

          {/* ================= Accounts ================= */}
          <h2 className="sec-gap text-[17px] font-semibold tracking-[-0.025em]">
            Accounts
          </h2>
          <p className="prose-measure grp-gap text-[13px] text-muted">
            Taking somebody off every project leaves the account and everything
            they wrote. Deleting removes the account, their sparks and their
            memberships; the lines, blockers and decisions stay, because those
            belong to the work and not to whoever typed them.
          </p>

          <div className="panel grp-gap max-w-[1120px]">
            {/* The heads are gone below lg, where each value carries its own. */}
            <div className="hidden border-b border-line-strong lg:grid lg:grid-cols-[minmax(0,1fr)_150px_120px_44px]">
              {['Person', 'On projects', 'Admin', ''].map((h, i) => (
                <div key={h || 'more'} className="micro px-[14px] py-2 text-muted">
                  {i === 3 ? '' : h}
                </div>
              ))}
            </div>

            {profiles.map((p) => (
              <AccountRow
                key={p.id}
                profile={p}
                isMe={p.id === me.id}
                projects={onProjects.get(p.id) ?? 0}
                lastAdmin={p.is_admin && admins.length === 1}
              />
            ))}
          </div>

          <p className="prose-measure grp-gap text-[12px] leading-[1.5] text-muted">
            «On projects» counts the projects you can see yourself, so it reads
            low for an account on work you are not on. Nothing here decides
            anything by that number: an account that is the only person on any
            project, visible to you or not, cannot be taken off or deleted
            until somebody else is put on it.
          </p>

          {me.password_set_at === null && (
            <p className="prose-measure grp-gap text-[13px] text-rust">
              Your own password is still the one this account was created with.{' '}
              <Link href="/auth/password" className="act">
                Choose one
              </Link>
              .
            </p>
          )}

          <p className="grp-gap max-w-[64ch] text-[12px] leading-[1.5] text-muted">
            Signed in as {me.full_name ?? me.email}.{' '}
            {admins.length === 1
              ? 'You are the only administrator, so nobody can let you back in if you lose this account. Making a second one is the cheapest insurance here.'
              : `There ${admins.length === 2 ? 'is one other' : `are ${admins.length - 1} others`} who can open this page.`}
          </p>
        </div>
      </div>
    </main>
  )
}
