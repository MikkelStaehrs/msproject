'use client'

/**
 * A named action that ends in a log line: Chase, Write a line.
 *
 * Both open the same overlay Ctrl K opens, with the node already chosen, so
 * the common case costs no searching. Chasing a supplier IS writing a line
 * («Chased IT again, no date given»), which is why it needs no form of its
 * own: the line is the record, and Friday is assembled from it.
 */
export function OverviewAct({ nodeId, label }: { nodeId: string; label: string }) {
  return (
    <button
      type="button"
      onClick={() =>
        window.dispatchEvent(new CustomEvent('quickadd:open', { detail: { nodeId } }))
      }
      className="act relative z-10"
    >
      {label}
    </button>
  )
}
