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

/* -------------------------------------------------------------------------
 * Bold, and only bold
 *
 * A model writes `**Fase 1**` without being asked, and inside a note that
 * carries two tables and their sums it is doing real work: it marks the
 * headings and the totals. Left unrendered it shows as literal asterisks,
 * which is worse than either extreme.
 *
 * So the line is drawn here and nowhere further. Not italics, not links, not
 * headings, not lists. Bold is the one inline mark that arrives unprompted and
 * means something in this context, and every mark added after it is another
 * thing the raw text stops being.
 * ---------------------------------------------------------------------- */

export type Span = { text: string; bold: boolean }

/** `a **b** c` to three spans. Unmatched asterisks are left as they are. */
export function spans(text: string): Span[] {
  const out: Span[] = []
  let rest = text

  while (rest.length > 0) {
    const open = rest.indexOf('**')
    if (open === -1) break

    const close = rest.indexOf('**', open + 2)
    // A lone `**` is not a mark. It stays on the page as typed.
    if (close === -1) break

    const inner = rest.slice(open + 2, close)
    // `****` marks nothing, and treating it as a mark would swallow it.
    if (inner.trim() === '') {
      out.push({ text: rest.slice(0, close + 2), bold: false })
      rest = rest.slice(close + 2)
      continue
    }

    if (open > 0) out.push({ text: rest.slice(0, open), bold: false })
    out.push({ text: inner, bold: true })
    rest = rest.slice(close + 2)
  }

  if (rest.length > 0) out.push({ text: rest, bold: false })
  return out.length === 0 ? [{ text, bold: false }] : out
}

/* -------------------------------------------------------------------------
 * What is in there, when it is folded away
 *
 * A note holding two price tables should not push the thought it belongs to
 * off the screen, but folded to nothing it looks like there is nothing there.
 * So the fold says what it is hiding, in the terms that matter: how many
 * tables, how many rows.
 * ---------------------------------------------------------------------- */

export function describe(text: string | null | undefined): string | null {
  const parts = blocks(text)
  if (parts.length === 0) return null

  const tables = parts.filter((b) => b.kind === 'table')
  const rows = tables.reduce((n, b) => n + (b.kind === 'table' ? b.rows.length : 0), 0)
  const paragraphs = parts.length - tables.length

  const said: string[] = []
  if (tables.length > 0) {
    said.push(`${tables.length} ${tables.length === 1 ? 'table' : 'tables'}`)
    said.push(`${rows} ${rows === 1 ? 'row' : 'rows'}`)
  }
  if (paragraphs > 0) {
    said.push(`${paragraphs} ${paragraphs === 1 ? 'paragraph' : 'paragraphs'}`)
  }

  return said.join(', ')
}
