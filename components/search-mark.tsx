/**
 * The hit, marked.
 *
 * A search result has to show why it is one, and the concept does that with a
 * single `<mark>` round the first place the query appears. The match is case
 * insensitive and the marking keeps the text's own case, so «Videometer» stays
 * «Videometer» with a line under the part that matched.
 *
 * The browser's own `mark` is yellow, which is not a colour in DESIGN_1 §1, so
 * the element carries its colours here: the hover tone under it and a hairline
 * beneath, which is how the concept draws it.
 */

/** Does the query appear in the text at all. Empty text never matches. */
export function hit(text: string | null | undefined, q: string): boolean {
  return (text ?? '').toLowerCase().includes(q)
}

/** Where the query first appears, or -1. The caller decides what to cut around it. */
export function hitAt(text: string | null | undefined, q: string): number {
  return (text ?? '').toLowerCase().indexOf(q)
}

/**
 * A window of the text around the first hit, so a paragraph that matches on
 * its fourth line still shows the word that matched. Cut on characters rather
 * than words: it is a table cell, and the mark says where to look.
 */
export function around(text: string, q: string, width: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  const i = hitAt(flat, q)
  if (i < 0 || flat.length <= width) return flat.length > width ? `${flat.slice(0, width)}…` : flat
  const start = Math.max(0, i - Math.floor(width / 3))
  const end = Math.min(flat.length, start + width)
  return `${start > 0 ? '…' : ''}${flat.slice(start, end)}${end < flat.length ? '…' : ''}`
}

export function Mark({ text, q }: { text: string; q: string }) {
  const i = hitAt(text, q)
  if (i < 0 || q === '') return <>{text}</>
  return (
    <>
      {text.slice(0, i)}
      <mark className="border-b border-line-strong bg-hover text-[inherit]">
        {text.slice(i, i + q.length)}
      </mark>
      {text.slice(i + q.length)}
    </>
  )
}
