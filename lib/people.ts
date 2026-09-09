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
 *   - anyone with an account, by the name they gave when they set a password
 *   - every name already written into a role anywhere in the portfolio
 *
 * The second source is the one that earns its keep. It costs nothing, it covers
 * the colleagues who have no login, and it is what stops the same person being
 * entered as three slightly different people.
 */

/** Same person, different typing. Case and stray spacing do not make a new one. */
const fold = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase()

export type PeopleSource = {
  /** Names given by people with an account. */
  accounts: (string | null | undefined)[]
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
  const seen = new Map<string, { spellings: Map<string, number>; count: number; order: number }>()

  const note = (raw: unknown) => {
    if (typeof raw !== 'string') return
    // The comma separated fields hold several people in one string.
    for (const part of raw.split(',')) {
      const name = part.trim().replace(/\s+/g, ' ')
      if (name === '') continue
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

  for (const name of source.accounts) note(name)
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
