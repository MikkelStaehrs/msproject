'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { required, text } from '@/lib/form'

/**
 * The admin module's writes.
 *
 * Every one of these begins with `requireAdmin`, and that is not a formality.
 * A server action is a public HTTP endpoint with an unguessable name; the
 * name is not the security. The check is, and it asks the database rather
 * than trusting anything that arrived with the request.
 *
 * The two dangerous ones, inviting and deleting, hold the service role key,
 * which is exempt from every policy in the schema. So each one is written to
 * do a single named thing to a single named row, and the refusals below are
 * as much a part of the feature as the writes.
 */

/**
 * The gate. Returns the session client and who is holding it, or throws.
 *
 * It reads `is_admin` from `profile` rather than from anything in the request,
 * so revoking somebody's admin takes effect on their next click and not on
 * their next sign in.
 */
async function requireAdmin() {
  const supabase = await createClient()

  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) throw new Error('You are not signed in.')

  const { data: me, error } = await supabase
    .from('profile')
    .select('id, is_admin, email')
    .eq('id', auth.user.id)
    .maybeSingle()

  if (error) throw new Error(`Could not check who you are: ${error.message}`)
  if (!me?.is_admin) throw new Error('That is for an administrator.')

  return { supabase, me: me as { id: string; is_admin: boolean; email: string } }
}

/**
 * Would taking this person off everything leave a project with nobody on it?
 *
 * A project with no members is invisible to every account including the one
 * that made it, and nothing in the interface explains where it went. It reads
 * exactly like data loss and is not, which is the worst kind. `removeMember`
 * refuses the same thing one project at a time; this is the same refusal
 * across all of them at once.
 *
 * Asked with the service role because it has to be asked about every project
 * and not only the ones the administrator can see. See lib/supabase/admin.ts.
 */
async function projectsLeftEmptyBy(userId: string): Promise<string[]> {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('project_member')
    .select('project_id, user_id')

  if (error) throw new Error(`Could not check the memberships: ${error.message}`)

  const members = new Map<string, Set<string>>()
  for (const row of (data ?? []) as { project_id: string; user_id: string }[]) {
    const set = members.get(row.project_id) ?? new Set<string>()
    set.add(row.user_id)
    members.set(row.project_id, set)
  }

  const orphaned: string[] = []
  for (const [projectId, set] of members) {
    if (set.size === 1 && set.has(userId)) orphaned.push(projectId)
  }
  if (orphaned.length === 0) return []

  /* Named, not counted. «2 projects» is not something anybody can act on. */
  const { data: nodes } = await admin
    .from('node')
    .select('id, title')
    .in('id', orphaned)

  return ((nodes ?? []) as { id: string; title: string }[]).map((n) => n.title)
}

/* ------------------------------------------------------------------------ */
/* Access requests                                                           */
/* ------------------------------------------------------------------------ */

/**
 * Yes: an invitation goes out and the account comes into being.
 *
 * The email lands at /auth/callback, which trades the token for a session and
 * sends them on to /auth/password, where they choose a password and give the
 * name colleagues will see. That route already existed for invitations sent
 * from the Supabase dashboard; this only means the application can send one
 * too.
 *
 * Inviting grants nothing. The new account signs in and sees an empty
 * application, because visibility is membership and they are on no project
 * yet. Putting them on one is done on the project's own page, where the
 * person deciding can see what they would be handing over.
 */
export async function inviteRequester(fd: FormData) {
  const { supabase, me } = await requireAdmin()

  const id = required(fd, 'id')

  const { data: request, error: readError } = await supabase
    .from('access_request')
    .select('id, email, full_name, state')
    .eq('id', id)
    .maybeSingle()

  if (readError) throw new Error(`Could not read that request: ${readError.message}`)
  if (!request) throw new Error('That request is no longer there.')
  if (request.state !== 'new') throw new Error('That request has already been answered.')

  const origin = (await headers()).get('origin') ?? ''
  const admin = createAdminClient()

  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(request.email, {
    redirectTo: `${origin}/auth/callback`,
  })

  /*
   * An address that already has an account is not a failure to hide from the
   * person doing the inviting: they are looking at a list of people who have
   * asked, and «this one is already in» is the answer they needed. The request
   * is not marked invited, because no invitation was sent; it is left for them
   * to decline with that as the note, so the list keeps saying what happened.
   */
  if (inviteError) {
    throw new Error(
      `No invitation was sent to ${request.email}: ${inviteError.message}. ` +
        `If the address already has an account, decline this request and say so.`,
    )
  }

  const { error } = await supabase
    .from('access_request')
    .update({
      state: 'invited',
      decided_at: new Date().toISOString(),
      decided_by: me.id,
      note: text(fd, 'note'),
    })
    .eq('id', id)

  /*
   * The invitation has gone. A failure here leaves a row saying «new» about an
   * account that now exists, which is wrong in the direction that can be seen
   * and fixed, rather than an account nobody knows was made.
   */
  if (error) {
    throw new Error(
      `${request.email} has been invited, but the request could not be marked as ` +
        `answered: ${error.message}`,
    )
  }

  revalidatePath('/admin')
}

/** No, with a reason. The row stays so the next ask has a history behind it. */
export async function declineRequest(fd: FormData) {
  const { supabase, me } = await requireAdmin()

  const { error } = await supabase
    .from('access_request')
    .update({
      state: 'declined',
      decided_at: new Date().toISOString(),
      decided_by: me.id,
      note: text(fd, 'note'),
    })
    .eq('id', required(fd, 'id'))
    .eq('state', 'new')

  if (error) throw new Error(`Could not answer that: ${error.message}`)

  revalidatePath('/admin')
}

/**
 * Removing an answered request for good.
 *
 * Only an answered one. A pending request is somebody waiting, and deleting it
 * is the one way to make them wait forever with nobody knowing.
 */
export async function forgetRequest(fd: FormData) {
  const { supabase } = await requireAdmin()

  const { error } = await supabase
    .from('access_request')
    .delete()
    .eq('id', required(fd, 'id'))
    .neq('state', 'new')

  if (error) throw new Error(`Could not remove that: ${error.message}`)

  revalidatePath('/admin')
}

/* ------------------------------------------------------------------------ */
/* Accounts                                                                  */
/* ------------------------------------------------------------------------ */

/**
 * Making somebody else an administrator, or taking it back.
 *
 * Written with the service role because no session may write this column: the
 * grant on `profile` covers the two columns a person sets about themselves and
 * nothing else, so there is no policy anywhere that could let a signed-in
 * account raise itself. The migration explains why that is a column privilege
 * and not a policy.
 *
 * The last administrator cannot be removed, including by themselves. An
 * application with no administrator has no way back in short of the Supabase
 * dashboard, and the person who would need that dashboard is the person who
 * just locked themselves out of the module that would have fixed it.
 */
export async function setAdmin(fd: FormData) {
  const { supabase } = await requireAdmin()

  const userId = required(fd, 'user_id')
  const on = required(fd, 'is_admin') === 'true'

  if (!on) {
    const { data, error } = await supabase
      .from('profile')
      .select('id')
      .eq('is_admin', true)

    if (error) throw new Error(`Could not check: ${error.message}`)

    const admins = (data ?? []) as { id: string }[]
    if (admins.length <= 1 && admins.some((a) => a.id === userId)) {
      throw new Error(
        'That is the only administrator. Removing it would leave nobody who ' +
          'can answer a request or open this page, this account included. ' +
          'Make somebody else an administrator first.',
      )
    }
  }

  const admin = createAdminClient()
  const { error } = await admin.from('profile').update({ is_admin: on }).eq('id', userId)

  if (error) throw new Error(`Could not change that: ${error.message}`)

  revalidatePath('/', 'layout')
}

/**
 * Taking somebody off everything without deleting them.
 *
 * The account stays, and so does everything they wrote: a line on a project is
 * a fact about that project and not a possession of whoever typed it. What
 * goes is the access. They can still sign in, and they see an application with
 * nothing in it, which is what a colleague who has moved on should see.
 *
 * This is the reversible one, and it is the one to reach for. Deleting is
 * below it and is not.
 */
export async function closeAccount(fd: FormData) {
  const { supabase, me } = await requireAdmin()

  const userId = required(fd, 'user_id')

  if (userId === me.id) {
    throw new Error(
      'That is your own account. Taking yourself off every project would hide ' +
        'the whole application from you, and nothing here would explain why.',
    )
  }

  const orphaned = await projectsLeftEmptyBy(userId)
  if (orphaned.length > 0) {
    throw new Error(
      `They are the only person on ${orphaned.join(', ')}. Taking them off ` +
        `would hide ${orphaned.length === 1 ? 'it' : 'those'} from everyone, ` +
        `this account included. Put somebody else on ` +
        `${orphaned.length === 1 ? 'it' : 'them'} first.`,
    )
  }

  const { error } = await supabase.from('project_member').delete().eq('user_id', userId)

  if (error) throw new Error(`Could not take them off: ${error.message}`)

  revalidatePath('/', 'layout')
}

/**
 * Deleting the account itself.
 *
 * The row in auth.users goes, and the cascade takes the profile, the
 * memberships and the sparks with it. Sparks are the one real loss, and they
 * are private to their author by design, so nobody else was going to read them
 * anyway.
 *
 * What does NOT go is the work. Lines, blockers, decisions and reports hang off
 * nodes rather than off people, and the names on them are text that was typed
 * rather than a key that points anywhere. A project does not lose its history
 * because somebody left the company, which is the whole reason those names are
 * text.
 */
export async function deleteAccount(fd: FormData) {
  const { me } = await requireAdmin()

  const userId = required(fd, 'user_id')

  if (userId === me.id) {
    throw new Error('You cannot delete the account you are signed in with.')
  }

  const orphaned = await projectsLeftEmptyBy(userId)
  if (orphaned.length > 0) {
    throw new Error(
      `They are the only person on ${orphaned.join(', ')}. Deleting them would ` +
        `hide ${orphaned.length === 1 ? 'that project' : 'those projects'} from ` +
        `everyone for good. Put somebody else on ` +
        `${orphaned.length === 1 ? 'it' : 'them'} first.`,
    )
  }

  const admin = createAdminClient()
  const { error } = await admin.auth.admin.deleteUser(userId)

  if (error) throw new Error(`Could not delete that account: ${error.message}`)

  revalidatePath('/', 'layout')
}
