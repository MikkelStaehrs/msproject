import Link from 'next/link'

/**
 * The overflow on a project row.
 *
 * §4: the row itself opens the project, and the one visible affordance beside
 * it is the ⋯, in full colour and never dimmed. What it opens is a list of
 * words on inset paper behind one hairline: no shadow, no radius.
 *
 * It is a `details` rather than a client component because a menu of links
 * needs no state: the browser opens and closes it, Escape and a click
 * elsewhere are the browser's own, and it works with JavaScript off. Delete
 * is not a word in this list on purpose. It lives on the edit form, behind
 * the confirmation that names what goes with it.
 */
export function ProjectsMenu({
  id,
  editHref,
}: {
  id: string
  /** Where the edit form opens in place, with the filters kept. */
  editHref: string
}) {
  const items: { label: string; href: string }[] = [
    { label: 'Open', href: `/p/${id}/identitet` },
    { label: 'Work', href: `/p/${id}` },
    { label: 'Edit', href: editHref },
    { label: 'Add a part', href: `/p/${id}?new=${id}` },
    { label: 'Record a decision', href: `/p/${id}?dnew=${id}` },
    { label: 'New blocker', href: `/p/${id}?bnew=${id}` },
    { label: 'Files', href: `/p/${id}/dokumenter` },
  ]

  return (
    <details className="relative z-10 inline-block text-left">
      <summary
        aria-label="More"
        className="more cursor-pointer list-none [&::-webkit-details-marker]:hidden"
      >
        ⋯
      </summary>
      <div className="absolute right-0 top-full z-30 mt-1 min-w-[200px] border border-line-strong bg-inset">
        {items.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className="block border-b border-line px-3.5 py-2.5 text-[13px] font-normal normal-case tracking-normal text-ink last:border-b-0 hover:bg-hover"
          >
            {item.label}
          </Link>
        ))}
      </div>
    </details>
  )
}
