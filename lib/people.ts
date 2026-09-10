/**
 * Everyone this portfolio already knows about.
 *
 * Roles are names, not accounts, and that is on purpose: the product owner and
 * the process owner on a real project are often people who will never log in
 * here. Turning the role fields into a reference to a user would have quietly
 * deleted two of the three people already named in this database.
 *
 * So the picker suggests rather than constrains. It draws from two places:
 *
 *   - anyone with an account
 *   - every name already written into a role anywhere in the portfolio
 *
 * The second source is the one that earns its keep. It costs nothing, it covers
 * the colleagues who have no login, and it is what stops the same person being
 * entered as three slightly different people.
 *
 * AN ACCOUNT WITH NO NAME IS STILL A PERSON. A new colleague is created in
 * Supabase and has no name here until they set one, and dropping them from the
 * list meant the one thing you had just done - add a user - was the one thing
 * the picker could not see. So an account with no name is offered by its email
 * address: it reads as unfinished, which it is, and that is better than
 * reading as absent.
 *
 * And when they do set a name, the email they were picked by folds into it, so
 * a role field holding `test@testesen.dk` and one holding `Test Testesen` are
 * one person rather than two. That fold is the whole reason the accounts carry
 * both halves here rather than being flattened to a string by the caller.
 */

/** Same person, different typing. Case and stray spacing do not make a new one. */
const fold = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase()

const clean = (value: unknown) =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''

export type Account = {
  id?: string
  /** What they chose to be called. Null until they have set one. */
  full_name?: string | null
  email?: string | null
}

export type PeopleSource = {
  accounts: Account[]
  /** `reporting.people` from every node that has any. */
  roles: Record<string, unknown>[]
}

/**
 * The names to offer, in the order they should be offered: the ones you use
 * most first, because the list exists to be picked from quickly.
 *
 * Where the same person has been typed several ways, the spelling used most
 * often wins, and ties go to the one seen first. That is what turns
 * "MIkkel Stæhr" back into "Mikkel Stæhr" rather than adding a second person to
 * the list who is really the same one.
 */
export function knownPeople(source: PeopleSource): string[] {
  /*
   * An email address that belongs to somebody who has since given a name. Any
   * mention of the address counts towards the name, and is shown as the name.
   */
  const alias = new Map<string, string>()
  for (const account of source.accounts) {
    const email = clean(account.email)
    const name = clean(account.full_name)
    if (email !== '' && name !== '') alias.set(fold(email), name)
  }

  const seen = new Map<string, { spellings: Map<string, number>; count: number; order: number }>()

  const note = (raw: unknown) => {
    if (typeof raw !== 'string') return
    // The comma separated fields hold several people in one string.
    for (const part of raw.split(',')) {
      const written = clean(part)
      if (written === '') continue
      const name = alias.get(fold(written)) ?? written
      const key = fold(name)
      const entry = seen.get(key) ?? {
        spellings: new Map<string, number>(),
        count: 0,
        order: seen.size,
      }
      entry.spellings.set(name, (entry.spellings.get(name) ?? 0) + 1)
      entry.count += 1
      seen.set(key, entry)
    }
  }

  // Accounts first, so a tie in usage puts a colleague who can log in above a
  // name that was only ever typed into a field.
  for (const account of source.accounts) {
    const name = clean(account.full_name)
    note(name !== '' ? name : clean(account.email))
  }
  for (const people of source.roles) {
    for (const value of Object.values(people ?? {})) note(value)
  }

  return [...seen.values()]
    .sort((a, b) => (b.count !== a.count ? b.count - a.count : a.order - b.order))
    .map((entry) => {
      let best = ''
      let bestCount = -1
      for (const [spelling, n] of entry.spellings) {
        if (n > bestCount) {
          best = spelling
          bestCount = n
        }
      }
      return best
    })
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

/**
 * People named in a role on this project who have an account here and cannot
 * open it.
 *
 * Roles and access are separate lists on purpose - the product owner is often
 * somebody who will never sign in, and turning a role into a reference to a
 * user would have deleted two of the three people already named in this
 * database. But the separation has a cost, and it lands on exactly one case:
 * you name a colleague who DOES have a login, and nothing anywhere says they
 * still cannot see the project. It looks like it worked.
 *
 * So this is the one place the two lists are held against each other, and it
 * only ever speaks up when all three things are true: named here, has an
 * account, is not a member. Somebody with no account is silent, because
 * inviting them is a different decision made somewhere else.
 *
 * Derived, and it disappears by being answered rather than dismissed.
 */
export function namedButLockedOut(input: {
  /** The project's own role fields, with the label each one is shown under. */
  roles: { label: string; value: unknown }[]
  accounts: Account[]
  /** user_id of everyone already on the project. */
  members: Set<string>
}): LockedOut[] {
  const found = new Map<string, LockedOut>()

  for (const account of input.accounts) {
    const id = clean(account.id)
    const email = clean(account.email)
    const name = clean(account.full_name)
    if (id === '' || email === '' || input.members.has(id)) continue

    // Either spelling counts: the picker offers the email until they set a
    // name, so a role written before that holds the address.
    const answersTo = new Set([fold(email)])
    if (name !== '') answersTo.add(fold(name))

    const roles: string[] = []
    for (const field of input.roles) {
      if (typeof field.value !== 'string') continue
      for (const part of field.value.split(',')) {
        const written = clean(part)
        if (written !== '' && answersTo.has(fold(written))) {
          roles.push(field.label)
          break
        }
      }
    }

    if (roles.length > 0) {
      found.set(id, { id, email, label: name !== '' ? name : email, roles })
    }
  }

  return [...found.values()].sort((a, b) => (a.label < b.label ? -1 : 1))
}
