import Link from 'next/link'

/**
 * Choosing a person.
 *
 * Every place this application names somebody now names an ACCOUNT, so every
 * place is this: a list of who exists, and no way to type anybody else. It
 * replaced a text field with a datalist beside it, which suggested and then
 * accepted whatever was typed anyway, and that is how one person ended up in
 * this database under two spellings.
 *
 * A `select` and not a combobox. It needs no JavaScript, it is the control every
 * browser already knows how to open with a keyboard, and the list it draws from
 * is a handful of colleagues rather than a thousand rows.
 *
 * WHAT IT WILL NOT DO is offer somebody who has no login. That is the whole
 * point and it is also the cost, and the cost is real: the product owner of a
 * project is sometimes a person who will never sign in here. The answer is to
 * invite them, and `empty` says where.
 */
export type Person = {
  id: string
  /** What to call them: the name they gave, or their address until they do. */
  label: string
}

export function PersonPicker({
  name,
  people,
  /** Ids already chosen. One for a single field, several for a list. */
  value,
  many = false,
  /** What the empty option says. «Nobody» is a real answer everywhere here. */
  emptyLabel = 'Nobody',
  autoFocus = false,
  className = '',
}: {
  name: string
  people: Person[]
  value: string[]
  many?: boolean
  emptyLabel?: string
  autoFocus?: boolean
  className?: string
}) {
  if (people.length === 0) {
    return (
      <div className="border-b border-line py-[7px] text-[13px] text-rust">
        No account here can be picked.{' '}
        <Link href="/admin" className="act">
          Invite somebody
        </Link>
        .
      </div>
    )
  }

  /*
   * A list field is a `select multiple`, sized to the list up to a point. The
   * hint under it says how, because «hold ctrl» is the one thing about this
   * control that nobody discovers and everybody needs.
   */
  if (many) {
    return (
      <>
        <select
          name={name}
          multiple
          defaultValue={value}
          size={Math.min(Math.max(people.length, 3), 7)}
          autoFocus={autoFocus}
          className={`field h-auto py-1 ${className}`}
        >
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-[10.5px] leading-snug text-rule-strong">
          Several at once: hold ctrl, or cmd on a Mac.
        </span>
      </>
    )
  }

  return (
    <select
      name={name}
      defaultValue={value[0] ?? ''}
      autoFocus={autoFocus}
      className={`field ${className}`}
    >
      <option value="">{emptyLabel}</option>
      {people.map((p) => (
        <option key={p.id} value={p.id}>
          {p.label}
        </option>
      ))}
    </select>
  )
}

/**
 * A name that was typed before a role became an account and matched nobody.
 *
 * Rust, because it is the definition of requiring a human: somebody has to look
 * at it and decide whether that person should get a login, or whether the role
 * belongs to somebody else now. It disappears by being answered, which is what
 * every rust thing in this application does.
 */
export function WasNamed({ name }: { name: string | null | undefined }) {
  if (!name) return null
  return (
    <span className="mt-1 block text-[11px] leading-snug text-rust">
      Was {name}, who has no account here.
    </span>
  )
}
