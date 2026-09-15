'use client'

/**
 * The `Ctrl K` badge beside «Capture a thought».
 *
 * The same route to quick entry the header offers, drawn as the concept's
 * `.kbd` rather than as a second labelled button, because the band already
 * has one button and the badge is only saying that the keyboard gets there
 * too. The overlay listens for the event; this only sends it.
 */
export function SparkCaptureKey() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent('quickadd:open'))}
      aria-label="Open quick entry"
      className="kbd hidden cursor-pointer bg-transparent hover:text-ink lg:inline-block"
    >
      Ctrl K
    </button>
  )
}
