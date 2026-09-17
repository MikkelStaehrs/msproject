/**
 * Holding the roles against the access list.
 *
 * Roles and membership are two lists, and they always will be: naming somebody
 * product owner says what they are, membership says what they can open, and a
 * role that granted access would hand out a project by typing a name in a box.
 *
 * The cost of the separation lands on exactly one case. You put a colleague in
 * a role, and nothing anywhere says they still cannot see the project. It looks
 * like it worked. So this is the one place the two are compared, and it only
 * speaks up when both are true: in a role here, and not a member.
 *
 * It used to fold names to do it, because a role held a typed name. A role
 * holds an account id now, so this is a set difference and can no longer be
 * wrong about a spelling.
 */
export type Account = {
  id?: string
  /** What they chose to be called. Null until they have set one. */
  full_name?: string | null
  email?: string | null
}

export type LockedOut = {
  /** The account, ready to be added to the project. */
  id: string
  email: string
  /** What to call them: their name where they have given one. */
  label: string
  /** Which roles on this project name them, already labelled. */
  roles: string[]
}

/** Same person, different typing. Kept for the one field that is still text. */
export const foldName = (name: string) =>
  name.trim().replace(/\s+/g, ' ').toLowerCase()

export function namedButLockedOut(input: {
  /** The project's role fields: the label each is shown under, and its ids. */
  roles: { label: string; ids: string[] }[]
  accounts: Account[]
  /** user_id of everyone already on the project. */
  members: Set<string>
}): LockedOut[] {
  const known = new Map(
    input.accounts
      .filter((a) => typeof a.id === 'string' && a.id !== '')
      .map((a) => [a.id as string, a]),
  )

  const rolesFor = new Map<string, string[]>()
  for (const field of input.roles) {
    for (const id of field.ids) {
      if (input.members.has(id) || !known.has(id)) continue
      rolesFor.set(id, [...(rolesFor.get(id) ?? []), field.label])
    }
  }

  return [...rolesFor.entries()]
    .map(([id, roles]) => {
      const account = known.get(id) as Account
      const email = (account.email ?? '').trim()
      const name = (account.full_name ?? '').trim()
      return { id, email, label: name !== '' ? name : email, roles }
    })
    .sort((a, b) => (a.label < b.label ? -1 : 1))
}
