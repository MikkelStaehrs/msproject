'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { logout } from '@/app/login/actions'

/**
 * When the page itself throws.
 *
 * There was nothing here, which is why a colleague saw Vercel's own sentence
 * and nothing else: «Application error: a client-side exception has occurred.»
 * That is the same failure the middleware has a comment about, in a different
 * layer and with the same cost. Two deployments were spent guessing at a cause
 * the process already knew, and this time somebody was locked out of their work
 * while the guessing went on.
 *
 * So the error is shown. What React hands us differs by where the fault was,
 * and both cases are worth saying out loud rather than hiding:
 *
 *   - A fault in the BROWSER carries its real message. That is the one a person
 *     can send on and somebody can act on within the minute.
 *   - A fault on the SERVER is stripped in production, deliberately: an
 *     exception can carry a query, a path or a value that a page has no
 *     business printing. What survives is `digest`, which is in the server log
 *     under the same string, so the two can be matched up.
 *
 * AND A WAY OUT. The header, with its sign out, lives inside the layout; when
 * the layout is what threw, the only door is inside the burning room. Sign out
 * is here because the commonest shape of this is one account whose data trips
 * one line of code, and for that person every page is this page until the
 * session goes.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  /*
   * Into the browser console as well, whole. The page shows a message; the
   * console has the stack, and the stack is what says which component.
   */
  useEffect(() => {
    console.error('Task Studio failed to render this page:', error)
  }, [error])

  return (
    <main className="px-[var(--gut)] py-[12vh]">
      <div className="mx-auto max-w-[36rem]">
        <h1 className="m-0 text-[24px] font-semibold leading-tight tracking-[-0.02em] text-green">
          This page did not load
        </h1>

        <p className="prose-measure mt-3 text-[13px] leading-relaxed text-muted">
          Nothing has been lost. The fault is in the application rather than in
          anything you did, and it is worth passing on: what is in the box below
          is what somebody needs in order to fix it.
        </p>

        <pre className="mt-5 overflow-x-auto whitespace-pre-wrap border border-line-strong bg-inset p-4 text-[12px] leading-relaxed">
          {error.message || 'The message was stripped, which means the fault was on the server.'}
          {error.digest && `\n\nReference: ${error.digest}`}
        </pre>

        <div className="mt-6 flex flex-wrap items-center gap-4">
          <button onClick={reset} className="btn">
            Try again
          </button>
          <Link href="/" className="act">
            Overview
          </Link>
          {/*
            The door that is not inside the room. Sign out lives in the header,
            the header lives in the layout, and when the layout is what threw
            there is no header to press.
          */}
          <form action={logout} className="ml-auto">
            <button className="act text-muted">Sign out</button>
          </form>
        </div>
      </div>
    </main>
  )
}
