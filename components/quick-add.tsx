'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { quickAdd } from '@/lib/quick-add-actions'
import {
  parseQuickAdd,
} from '@/lib/quick-add'
import { isKnownRecipient } from '@/lib/recipient'
import type { EntryKind } from '@/lib/types'

export type QuickTarget = {
  id: string
  title: string
  path: string
  /**
   * The project this node sits under, so the picker can open it.
   *
   * Carried rather than looked up: the overlay has no tree of its own, only
   * this flat list, and a node's address is /p/<project>?focus=<node>. Without
   * it the search could find a node and not say where it lives.
   */
  projectId: string
}

const LAST_TARGET_KEY = 'msp:last-target'

/** Every word in the query must appear in the path. Simple beats clever. */
function matches(target: QuickTarget, query: string) {
  const hay = target.path.toLowerCase()
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => hay.includes(token))
}

export function QuickAdd({
  targets,
  recipients,
}: {
  targets: QuickTarget[]
  recipients: string[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const search = useSearchParams()

  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'write' | 'pick'>('write')
  const [raw, setRaw] = useState('')
  const [targetId, setTargetId] = useState<string | null>(null)
  const [pickQuery, setPickQuery] = useState('')
  const [pickIndex, setPickIndex] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const inputRef = useRef<HTMLInputElement>(null)
  const pickRef = useRef<HTMLInputElement>(null)

  const target = targets.find((t) => t.id === targetId) ?? null
  const intent = parseQuickAdd(raw)

  /**
   * Where the line belongs, in order: the part you have opened, the project
   * page you are on, the node you last wrote on, then the first target.
   */
  const guessTarget = useCallback(() => {
    const focused = search.get('focus')
    if (focused && targets.some((t) => t.id === focused)) return focused

    const onProject = pathname.match(/^\/p\/([0-9a-f-]+)/i)?.[1]
    if (onProject && targets.some((t) => t.id === onProject)) return onProject

    try {
      const saved = window.localStorage.getItem(LAST_TARGET_KEY)
      if (saved && targets.some((t) => t.id === saved)) return saved
    } catch {
      // Private window or blocked storage. We just fall back.
    }
    return targets[0]?.id ?? null
  }, [pathname, search, targets])

  const openOverlay = useCallback(
    (preset?: string | null) => {
      if (preset && targets.some((t) => t.id === preset)) setTargetId(preset)
      else setTargetId((current) => current ?? guessTarget())
      setError(null)
      setMode('write')
      setOpen(true)
    },
    [guessTarget, targets],
  )

  // Ctrl+K or Cmd+K anywhere, plus the button in the context band.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        openOverlay()
      }
    }
    const onOpen = (e: Event) =>
      openOverlay((e as CustomEvent<{ nodeId?: string }>).detail?.nodeId ?? null)

    window.addEventListener('keydown', onKey)
    window.addEventListener('quickadd:open', onOpen)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('quickadd:open', onOpen)
    }
  }, [openOverlay])

  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => {
      if (mode === 'write') inputRef.current?.focus()
      else pickRef.current?.focus()
    }, 0)
    return () => clearTimeout(t)
  }, [open, mode])

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 2600)
    return () => clearTimeout(t)
  }, [flash])

  function close() {
    setOpen(false)
    setMode('write')
    setPickQuery('')
    setError(null)
  }

  function submit() {
    if (!targetId || pending) return
    if (intent.kind === 'empty' || intent.kind === 'invalid') return

    const id = targetId
    startTransition(async () => {
      const result = await quickAdd({ nodeId: id, raw })
      if (!result.ok) {
        setError(result.error)
        return
      }
      try {
        window.localStorage.setItem(LAST_TARGET_KEY, id)
      } catch {
        // Does not matter. The guess falls back to the page you are on.
      }
      setRaw('')
      setFlash(result.message)
      close()
      router.refresh()
    })
  }

  const filtered =
    pickQuery.trim() === ''
      ? targets
      : targets.filter((t) => matches(t, pickQuery))

  function onWriteKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      submit()
    } else if (e.key === 'Tab') {
      e.preventDefault()
      setPickQuery('')
      setPickIndex(0)
      setMode('pick')
    }
  }

  /**
   * Go to the node instead of writing on it.
   *
   * The search was already here and could only be used one way: find the right
   * node, then write a line on it. There was no way to simply GO there, so the
   * one place in the application that can find anything across every project
   * could not be used to look at anything.
   *
   * Reusing this picker rather than building a second search is the point. Two
   * searches over the same tree would eventually rank differently, and the one
   * you were not looking at would be the one that was right.
   */
  function goTo(t: QuickTarget) {
    close()
    router.push(
      t.id === t.projectId ? `/p/${t.projectId}` : `/p/${t.projectId}?focus=${t.id}`,
    )
  }

  function onPickKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault()
      setMode('write')
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setPickIndex((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setPickIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const chosen = filtered[pickIndex]
      if (!chosen) return
      /*
       * Enter still does what it always did. Opening is the modifier, because
       * the overlay's whole reason for existing is writing a line in five
       * seconds, and the habit that already exists must not become the one that
       * needs a second thought.
       */
      if (e.ctrlKey || e.metaKey) goTo(chosen)
      else {
        setTargetId(chosen.id)
        setMode('write')
      }
    }
  }

  const preview = (() => {
    if (!target) return 'No nodes to write on yet.'
    switch (intent.kind) {
      case 'empty':
        return `Log entry on ${target.title}`
      case 'entry':
        return `Log entry on ${target.title}`
      case 'task':
        return `New task under ${target.title}`
      case 'blocker':
        // Saying so here is what catches a typo, at the one moment it can still
        // be fixed for free. A misspelling opens a second recipient and quietly
        // halves the waiting days the chart can argue with.
        return isKnownRecipient(intent.waitingOn, recipients)
          ? `Blocker on ${target.title}, waiting on ${intent.waitingOn}`
          : `Blocker on ${target.title}, waiting on ${intent.waitingOn}, a recipient you have not used before`
      case 'decision':
        return intent.rationale
          ? `Decision on ${target.title}, with rationale`
          : `Decision on ${target.title}, type // for a rationale`
      case 'invalid':
        return intent.reason
    }
  })()

  const ready = intent.kind !== 'empty' && intent.kind !== 'invalid'


  /*
   * Recipients offered while the blocker is being written.
   *
   * A blocker line starts with «!», so the moment it does we can show who you
   * usually wait on. Matching runs on whatever follows the last @, which is
   * where the parser reads the recipient from too. Clicking one rewrites that
   * part of the line rather than opening a mode of its own: Enter still saves
   * and Tab still changes the target, so nothing already learned changes.
   */
  const writingBlocker = raw.trimStart().startsWith('!')
  const atIndex = raw.lastIndexOf('@')
  const typedRecipient = atIndex === -1 ? '' : raw.slice(atIndex + 1).trim()

  const suggestions = !writingBlocker
    ? []
    : recipients
        .filter((r) =>
          typedRecipient === ''
            ? true
            : r.toLowerCase().includes(typedRecipient.toLowerCase()),
        )
        .filter((r) => r.toLowerCase() !== typedRecipient.toLowerCase())
        .slice(0, 5)

  function useRecipient(name: string) {
    const line = atIndex === -1 ? `${raw.trimEnd()} @ ${name}` : `${raw.slice(0, atIndex + 1)} ${name}`
    setRaw(line)
    setError(null)
    inputRef.current?.focus()
  }

  return (
    <>
      {flash && (
        <div className="fixed bottom-6 left-5 lg:left-16 z-50 border border-green bg-sheet px-4 py-2.5 text-[12px] text-green">
          {flash}
        </div>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-ink/15 px-4 pt-[6vh] lg:px-0 lg:pt-[14vh]"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close()
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Quick entry"
            className="w-full max-w-[680px] border border-ink bg-sheet"
          >
            {mode === 'write' ? (
              <>
                <input
                  ref={inputRef}
                  value={raw}
                  onChange={(e) => {
                    setRaw(e.target.value)
                    setError(null)
                  }}
                  onKeyDown={onWriteKey}
                  placeholder="Write a line. + task. ! blocker @ who. ? decision."
                  className="w-full border-0 bg-transparent px-6 py-5 text-[17px] outline-none placeholder:text-rule-strong"
                />

                <div className="flex items-center justify-between border-t border-rule px-6 py-2.5">
                  <span
                    className={`text-[11px] ${
                      intent.kind === 'invalid' ? 'text-oxblood' : 'text-muted'
                    }`}
                  >
                    {preview}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setPickQuery('')
                      setPickIndex(0)
                      setMode('pick')
                    }}
                    className="lbl-tight text-green hover:text-oxblood"
                  >
                    Tab changes target
                  </button>
                </div>

                {suggestions.length > 0 && (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-rule px-6 py-2.5">
                    <span className="lbl-tight shrink-0 text-muted">Waiting on</span>
                    {suggestions.map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => useRecipient(r)}
                        className="text-[12px] text-rule-strong hover:text-green"
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                )}

                {/*
                  Work, Note, Meeting and Risk used to sit here as four buttons
                  with shortcuts. They changed nothing - the weekly report never
                  read them - and they were the one question in the way of
                  writing a sentence. The kind now follows from where the line
                  was written and nobody is asked.
                */}
                <div className="flex items-center gap-4 border-t border-rule px-6 py-2.5">
                  <span className="ml-auto text-[10px] tracking-[0.14em] text-rule-strong uppercase">
                    {pending ? 'Saving...' : ready ? 'Enter saves' : 'Esc closes'}
                  </span>
                </div>

                {error && (
                  <div className="border-t border-oxblood px-6 py-2.5 text-[12px] text-oxblood">
                    {error}
                  </div>
                )}
              </>
            ) : (
              <>
                <input
                  ref={pickRef}
                  value={pickQuery}
                  onChange={(e) => {
                    setPickQuery(e.target.value)
                    setPickIndex(0)
                  }}
                  onKeyDown={onPickKey}
                  placeholder="Type to find the node..."
                  className="w-full border-0 bg-transparent px-6 py-5 text-[17px] outline-none placeholder:text-rule-strong"
                />
                <div className="max-h-[320px] overflow-y-auto border-t border-rule">
                  {filtered.length === 0 ? (
                    <div className="px-6 py-4 text-[12px] text-muted">No nodes match.</div>
                  ) : (
                    filtered.map((t, i) => (
                      <div
                        key={t.id}
                        onMouseEnter={() => setPickIndex(i)}
                        className={`flex w-full items-baseline gap-3 px-6 text-[12.5px] ${
                          i === pickIndex ? 'bg-paper text-ink' : 'text-muted'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setTargetId(t.id)
                            setMode('write')
                          }}
                          className="min-w-0 flex-1 py-2 text-left"
                        >
                          {t.path}
                        </button>
                        {/*
                          Only on the row under the cursor. A link on all forty
                          rows is a column of noise, and the keyboard has this on
                          Ctrl+Enter anyway: this is here so somebody who never
                          reads the hint line can still find out the picker goes
                          somewhere.
                        */}
                        {i === pickIndex && (
                          <button
                            type="button"
                            onClick={() => goTo(t)}
                            className="shrink-0 py-2 text-[10px] uppercase tracking-[0.14em] text-rule-strong hover:text-green"
                          >
                            Open
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
                <div className="border-t border-rule px-6 py-2.5 text-[10px] tracking-[0.14em] text-rule-strong uppercase">
                  Arrow keys select, Enter writes on it, Ctrl+Enter opens it, Esc goes back
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
