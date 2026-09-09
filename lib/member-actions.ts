'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { back, required, text } from '@/lib/form'

/**
 * Who is on a project.
 *
 * Adding somebody is done by email, because that is the only thing you know
 * about a colleague without going and looking. The lookup goes through
 * `profile`, the mirrored half of auth.users, which exists precisely so this
 * can happen without exposing the auth schema.
 */
export async function addMember(fd: FormData) {
  const supabase = await createClient()

  const projectId = required(fd, 'project_id')
  const email = (text(fd, 'email') ?? '').trim().toLowerCase()
  if (!email) throw new Error('An email is needed.')

  const { data: profile, error: lookupError } = await supabase
    .from('profile')
    .select('id')
    .ilike('email', email)
    .maybeSingle()

  if (lookupError) throw new Error(`Could not look that up: ${lookupError.message}`)

  /*
   * No account, no membership. Inviting somebody who does not exist yet would
   * mean holding a pending row that grants access the moment an account with
   * that address appears, and that is a door left open on a guess.
   */
  if (!profile) {
    throw new Error(
      `No account here uses ${email}. Create the user in Supabase first, ` +
        `then add them.`,
    )
  }

  const { error } = await supabase
    .from('project_member')
    .insert({ project_id: projectId, user_id: profile.id })

  // Already a member is not a failure worth shouting about.
  if (error && error.code !== '23505') {
    throw new Error(`Could not add them: ${error.message}`)
  }

  revalidatePath('/', 'layout')
  back(fd)
}

/**
 * Removing the last member would make the project invisible to everyone,
 * including whoever is doing the removing, and nothing in the interface would
 * explain where it went. So it is refused rather than allowed and regretted.
 */
export async function removeMember(fd: FormData) {
  const supabase = await createClient()

  const projectId = required(fd, 'project_id')

  const { count, error: countError } = await supabase
    .from('project_member')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)

  if (countError) throw new Error(`Could not check: ${countError.message}`)
  if ((count ?? 0) <= 1) {
    throw new Error(
      'That is the only person on this project. Removing them would hide it ' +
        'from everyone, this account included. Add somebody else first.',
    )
  }

  const { error } = await supabase
    .from('project_member')
    .delete()
    .eq('id', required(fd, 'id'))

  if (error) throw new Error(`Could not remove them: ${error.message}`)

  revalidatePath('/', 'layout')
  back(fd)
}
