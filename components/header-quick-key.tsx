'use client'

/**
 * The `Ctrl K` badge in the header's utility row.
 *
 * It is the pointer's route to quick entry, so it stays visible on a phone
 * even though there is no Ctrl there: hidden, the header would offer no way
 * into the overlay at all. The overlay listens for the event; this only
 * sends it, exactly as the old «New entry» trigger did.
 */
export function HeaderQuickKey() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent('quickadd:open'))}
      aria-label="Open quick entry"
      title="Quick entry"
      className="kbd cursor-pointer bg-transparent hover:text-ink"
    >
      Ctrl K
    </button>
  )
}
