/**
 * Text you typed, shown the way you typed it.
 *
 * A description is written in a textarea, with paragraphs, and every page was
 * rendering it inside a single <p>. HTML collapses whitespace, so four
 * paragraphs of specification arrived as one unbroken slab and the structure
 * the author put there was silently thrown away.
 *
 * The separator is not always a truly empty line. Real descriptions in this
 * database are separated by a line holding a single space, because that is what
 * a textarea produces when you press return twice and the cursor drifts. A
 * paragraph break is therefore a line with nothing but whitespace on it, not
 * strictly "\n\n".
 *
 * A single newline inside a paragraph stays a line break. Someone listing three
 * sensors on three lines means three lines.
 */

/** The paragraphs of a written text, in order, with the blank ones dropped. */
export function paragraphs(text: string | null | undefined): string[] {
  if (!text) return []
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n[ \t]*\n/)
    // Trailing spaces before a newline are invisible in a textarea and would
    // otherwise widen the line by a character nobody typed on purpose.
    .map((p) => p.replace(/[ \t]+$/gm, '').trim())
    .filter((p) => p.length > 0)
}

/**
 * What to show before asking to see the rest.
 *
 * The break is a paragraph, never a character count: cutting mid-sentence and
 * appending an ellipsis reads as damage, while a first paragraph reads as an
 * opening. Where the whole text is one paragraph there is nothing to hide, and
 * showing it whole is the honest outcome rather than a truncation.
 */
export function opening(text: string | null | undefined): {
  first: string | null
  rest: string[]
} {
  const all = paragraphs(text)
  return { first: all[0] ?? null, rest: all.slice(1) }
}

/* -------------------------------------------------------------------------
 * Tables
 *
 * Some thoughts are a list of things with numbers against them: three cabinet
 * quotes, the parts for a mini rack, four options with lead times. Written as
 * running prose that is unreadable, and asking for a real table would mean the
 * note stops being text.
 *
 * So it stays text, and a table is recognised rather than stored. Pipe rows are
 * what a model writes unprompted and what a person can still type by hand, and
 * the raw note remains editable, greppable and printable. Nothing is parsed
 * into a structure the database has to know about.
 * ---------------------------------------------------------------------- */

export type Block =
  | { kind: 'text'; text: string }
  | { kind: 'table'; head: string[] | null; rows: string[][] }

/** `| a | b |` to ['a','b']. Leading and trailing pipes are optional. */
function cells(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  return trimmed.split('|').map((c) => c.trim())
}

/** `|---|:--:|` and friends: the line that makes the one above it a header. */
const isRule = (line: string) =>
  /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line)

/**
 * A paragraph is a table when it has at least two lines and every line carries
 * a pipe. Requiring all of them, rather than most, keeps a sentence that merely
 * mentions a pipe out of it.
 */
function asTable(paragraph: string): Block | null {
  const lines = paragraph.split(/\r?\n/).filter((l) => l.trim() !== '')
  if (lines.length < 2) return null
  if (!lines.every((l) => l.includes('|'))) return null

  const body = lines.filter((l) => !isRule(l))
  if (body.length === 0) return null

  const hasHeader = lines.length > 1 && isRule(lines[1])
  const head = hasHeader ? cells(body[0]) : null
  const rows = (hasHeader ? body.slice(1) : body).map(cells)
  if (rows.length === 0 && head === null) return null

  // A single column is a list, not a table, and reads better as one.
  const width = Math.max(head?.length ?? 0, ...rows.map((r) => r.length))
  if (width < 2) return null

  return { kind: 'table', head, rows }
}

/** The paragraphs of a text, with the ones that are tables marked as such. */
export function blocks(text: string | null | undefined): Block[] {
  return paragraphs(text).map((p) => asTable(p) ?? { kind: 'text', text: p })
}
