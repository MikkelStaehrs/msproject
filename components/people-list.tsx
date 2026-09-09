/**
 * The names the role fields offer.
 *
 * A plain `<datalist>`, which is the honest shape for this: the field still
 * accepts anything typed into it. That matters, because the product owner and
 * the process owner on a real project are often people who will never have a
 * login here, and a picker that refused them would have deleted two of the
 * three people already named in this database.
 *
 * Rendered once per form and pointed at by every single-person field. The comma
 * separated fields are left alone: suggesting one whole value into a list of
 * three would replace the list rather than add to it.
 */
export function PeopleList({ names, id = 'known-people' }: { names: string[]; id?: string }) {
  if (names.length === 0) return null

  return (
    <datalist id={id}>
      {names.map((name) => (
        <option key={name} value={name} />
      ))}
    </datalist>
  )
}

/**
 * The same names, written out, for the fields that hold several people.
 *
 * No picker here on purpose. What it gives you instead is the exact spelling to
 * copy, which is the actual problem: the real database holds "Mikkel Stæhr"
 * five times and "MIkkel Stæhr" once, and the second one came from typing a
 * name into a comma separated list from memory.
 */
export function PeopleHint({ names }: { names: string[] }) {
  if (names.length === 0) return null

  return (
    <span className="mt-1 block text-[10.5px] leading-snug text-rule-strong">
      Known here: {names.join(' · ')}
    </span>
  )
}
