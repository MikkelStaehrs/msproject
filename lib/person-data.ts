import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Person } from '@/components/person-picker'
import type { Profile } from '@/lib/types'

/**
 * Everybody who can be put on work.
 *
 * One read, one shape, one ordering, so the same list appears in the same order
 * wherever a person is chosen. `profile` is readable by anyone signed in, on
 * purpose, because you cannot put a colleague on a project without being able
 * to name them.
 *
 * AN ACCOUNT WITH NO NAME IS STILL A PERSON. A colleague invited this morning
 * has no name here until they choose one, and leaving them out would mean the
 * one thing you just did, invite somebody, is the one thing the picker cannot
 * see. So they are offered by their address, which reads as unfinished because
 * it is.
 *
 * A failed read returns an empty list rather than throwing. The picker says out
 * loud that nobody can be chosen and points at Admin, which is the right thing
 * to show whether the cause is an empty portfolio or a query that did not
 * answer, and it is better than a form that will not render.
 */
export async function readPeople(supabase: SupabaseClient): Promise<Person[]> {
  const { data } = await supabase.from('profile').select('id, full_name, email')

  return ((data ?? []) as Pick<Profile, 'id' | 'full_name' | 'email'>[])
    .map((p) => ({ id: p.id, label: p.full_name?.trim() || p.email }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

/**
 * The same rows, as a lookup for showing a name.
 *
 * Separate from the list because reading and writing want different shapes, and
 * because an account that has since been deleted still has to render: an id
 * that answers nothing is «somebody who is gone», not a crash.
 */
export async function readPeopleById(
  supabase: SupabaseClient,
): Promise<Map<string, string>> {
  const people = await readPeople(supabase)
  return new Map(people.map((p) => [p.id, p.label]))
}

/** What to show for one id. Never blank, never an id. */
export function nameOf(byId: Map<string, string>, id: string | null | undefined): string {
  if (!id) return 'Nobody'
  return byId.get(id) ?? 'an account that is gone'
}

/** What to show for a role: everyone in it, or nothing at all. */
export function namesOf(byId: Map<string, string>, list: string[] | undefined): string {
  if (!list || list.length === 0) return ''
  return list.map((id) => nameOf(byId, id)).join(', ')
}
