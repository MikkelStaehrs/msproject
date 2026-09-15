import Link from 'next/link'

/**
 * The overflow at the end of a spark row.
 *
 * §4: the row is the primary action, a named action is used only where it
 * differs from «open», and everything else sits behind a visible `⋯`. It is a
 * `<details>` rather than a client component because a list of links and
 * one-field forms needs no JavaScript to open, close or be reached from the
 * keyboard, and the page stays a Server Component.
 *
 * Two kinds of item. A link opens something in place through the URL, the way
 * every other in-place form on this page opens. A form posts to a server
 * action with the hidden fields it needs, and comes back to where it was.
 */
export type SparkMenuItem =
  | { label: string; href: string; danger?: boolean }
  | {
      label: string
      action: (fd: FormData) => Promise<void>
      fields: Record<string, string>
      danger?: boolean
    }

const ITEM =
  'block w-full border-b border-line px-[13px] py-[9px] text-left text-[13px] last:border-b-0 hover:bg-hover'

export function SparkMenu({ items, label }: { items: SparkMenuItem[]; label: string }) {
  return (
    <details className="relative inline-block">
      <summary
        aria-label={label}
        className="more list-none [&::-webkit-details-marker]:hidden"
      >
        &#8943;
      </summary>
      <div className="absolute right-0 z-40 mt-1 min-w-[200px] border border-line-strong bg-inset">
        {items.map((item) =>
          'href' in item ? (
            <Link
              key={item.label}
              href={item.href}
              className={`${ITEM} ${item.danger ? 'text-rust' : 'text-ink'}`}
            >
              {item.label}
            </Link>
          ) : (
            <form key={item.label} action={item.action}>
              {Object.entries(item.fields).map(([name, value]) => (
                <input key={name} type="hidden" name={name} value={value} />
              ))}
              <button
                className={`${ITEM} cursor-pointer bg-transparent ${
                  item.danger ? 'text-rust' : 'text-ink'
                }`}
              >
                {item.label}
              </button>
            </form>
          ),
        )}
      </div>
    </details>
  )
}
