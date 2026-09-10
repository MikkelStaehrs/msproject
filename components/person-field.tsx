'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * A field that holds one person.
 *
 * It was a plain input with a `<datalist>` on it, and that was very nearly
 * right: typing filters, and anything can still be typed, which matters because
 * the product owner on a real project is often somebody who will never sign in
 * here. What it got wrong is the case you hit constantly. A datalist filters by
 * what is already in the field, so on a field that is FULL - which is every
 * field you are about to correct - pressing the arrow offers you the one name
 * already there and looks broken.
 *
 * So the datalist stays, for typing, and this adds the other half: a button
 * that shows every name whatever is in the field. Picking one replaces the
 * contents, which is the point of opening a list on a full field.
 *
 * THE NAMES ARE READ OUT OF THE DATALIST, not passed in. The layout renders it
 * once for the whole app precisely so the list does not have to be threaded
 * through five components to reach a field, and reading it back is reading that
 * same one source rather than opening a second.
 */
export function PersonField({
  name,
  defaultValue,
  listId = 'known-people',
  className = 'field',
}: {
  name: string
  defaultValue: string
  listId?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [names, setNames] = useState<string[]>([])
  const box = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return

    const shut = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent) {
        if (e.key === 'Escape') setOpen(false)
        return
      }
      if (!box.current?.contains(e.target as Element)) setOpen(false)
    }
    document.addEventListener('mousedown', shut)
    document.addEventListener('keydown', shut)
    return () => {
      document.removeEventListener('mousedown', shut)
      document.removeEventListener('keydown', shut)
    }
  }, [open])

  /*
   * Both of these stop the click reaching the <label> that wraps the field on
   * every form here. A label activates its control, so without this, opening
   * the list would also focus the input and some browsers would drop the
   * native datalist on top of it: two dropdowns, one gesture.
   */
  const show = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const list = document.getElementById(listId) as HTMLDataListElement | null
    setNames([...(list?.options ?? [])].map((o) => o.value))
    setOpen((was) => !was)
  }

  const choose = (e: React.MouseEvent, value: string) => {
    e.preventDefault()
    e.stopPropagation()
    if (input.current) {
      input.current.value = value
      // React does not see a value set straight on the DOM node, and something
      // else may be listening. Say it happened.
      input.current.dispatchEvent(new Event('input', { bubbles: true }))
      input.current.focus()
    }
    setOpen(false)
  }

  return (
    <div ref={box} className="relative">
      <input
        ref={input}
        name={name}
        defaultValue={defaultValue}
        list={listId}
        autoComplete="off"
        className={`${className} pr-7`}
      />

      <button
        type="button"
        onClick={show}
        aria-label="Show everyone this portfolio knows"
        className="absolute bottom-[7px] right-0 px-1 text-[9px] leading-none text-rule-strong hover:text-ink"
      >
        &#9660;
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-20 max-h-56 overflow-y-auto border border-rule-strong bg-sheet shadow-sm">
          {names.length === 0 ? (
            <p className="px-2.5 py-2 text-[11px] leading-snug text-muted">
              Nobody is known yet. Type a name and it will be offered from here
              on.
            </p>
          ) : (
            names.map((n) => (
              <button
                key={n}
                type="button"
                onClick={(e) => choose(e, n)}
                className="block w-full px-2.5 py-1.5 text-left text-[12.5px] hover:bg-paper"
              >
                {n}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
