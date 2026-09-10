import type { EntryKind, WaitingOnType } from '@/lib/types'

/**
 * The parser for quick entry. Pure function, no I/O. The overlay uses it to
 * show what will happen and the server action uses it to decide what actually
 * happens. One place, so the two can never disagree.
 *
 *   Chased IT again              -> log entry
 *   + Write test protocol        -> new task under the target
 *   ! Waiting for VLAN @ IT      -> blocker on the target
 *   ? Chose 130 kV // heavier seed needs it  -> decision with a rationale
 */

export type QuickIntent =
  | { kind: 'empty' }
  | { kind: 'entry'; body: string; entryKind: EntryKind }
  | { kind: 'task'; title: string }
  | { kind: 'blocker'; title: string; waitingOn: string }
  | { kind: 'decision'; decision: string; rationale: string | null }
  | { kind: 'invalid'; reason: string }

/**
 * `entryKind` defaults rather than being chosen.
 *
 * It used to be four buttons in the overlay - work, note, meeting, risk - with
 * keyboard shortcuts, offered at the moment somebody is trying to write one
 * sentence in a meeting. They changed nothing: `lib/report.ts` never read them,
 * and after months the database held two entries, both the same kind. A
 * question with no consequence, asked at the worst possible moment, is worse
 * than no question, so the kind now follows from WHERE the line was written -
 * `work` from quick entry, `meeting` from a stand-up - and nobody is asked.
 */
export function parseQuickAdd(raw: string, entryKind: EntryKind = 'work'): QuickIntent {
  const text = raw.trim()
  if (text === '') return { kind: 'empty' }

  if (text.startsWith('+')) {
    const title = text.slice(1).trim()
    if (title === '') return { kind: 'invalid', reason: 'Type a title after +' }
    return { kind: 'task', title }
  }

  if (text.startsWith('!')) {
    const rest = text.slice(1).trim()
    const at = rest.lastIndexOf('@')
    if (at === -1) {
      return { kind: 'invalid', reason: 'Add @ and who you are waiting on' }
    }
    const title = rest.slice(0, at).trim()
    const waitingOn = rest.slice(at + 1).trim()
    if (title === '') return { kind: 'invalid', reason: 'Type what is blocking' }
    if (waitingOn === '') return { kind: 'invalid', reason: 'Type who you are waiting on after @' }
    return { kind: 'blocker', title, waitingOn }
  }

  if (text.startsWith('?')) {
    const rest = text.slice(1).trim()
    if (rest === '') return { kind: 'invalid', reason: 'Type what was decided' }

    // «//» separates the decision from the rationale. The rationale is
    // optional, but it is what makes the log worth opening in six months.
    const split = rest.indexOf('//')
    if (split === -1) return { kind: 'decision', decision: rest, rationale: null }

    const decision = rest.slice(0, split).trim()
    const rationale = rest.slice(split + 2).trim()
    if (decision === '') return { kind: 'invalid', reason: 'Type the decision before //' }
    return { kind: 'decision', decision, rationale: rationale === '' ? null : rationale }
  }

  return { kind: 'entry', body: text, entryKind }
}

/**
 * Guess the blocker type from who is being waited on. Obvious words only.
 * Everything else becomes 'other', because a wrong guess is worse than no
 * guess when the figures are later grouped on /blockers.
 */
export function guessWaitingOnType(waitingOn: string): WaitingOnType {
  const w = waitingOn.trim().toLowerCase()
  if (w === 'it' || w === 'intern it' || w === 'internal it') return 'internal_it'
  if (w === 'ledelsen' || w === 'ledelse' || w === 'management') return 'management'
  if (w === 'leverandør' || w === 'leverandoer' || w === 'vendor') return 'vendor'
  return 'other'
}

/*
 * Kept for the two places that DISPLAY a kind, on Friday and in the project
 * rail. Nothing offers the choice any more: the four buttons that used to sit
 * in the overlay changed nothing, and after months the database held two
 * entries, both the same kind. The label survives because old rows wear one.
 */
export const ENTRY_KIND_ORDER: EntryKind[] = ['work', 'note', 'meeting', 'risk']

export const ENTRY_KIND_LABEL: Record<EntryKind, string> = {
  work: 'Work',
  note: 'Note',
  meeting: 'Meeting',
  risk: 'Risk',
}
