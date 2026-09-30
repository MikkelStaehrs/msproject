'use client'

import { useEffect } from 'react'

/**
 * When the root layout itself throws.
 *
 * The last boundary. `app/error.tsx` catches whatever its children throw, but
 * it renders INSIDE the root layout, so it cannot catch that layout failing:
 * fonts, the html element, anything above it. This replaces the whole document
 * instead, which is why it carries its own html and body and why it can use
 * none of the application's styles. They are loaded by the layout that just
 * failed.
 *
 * Hence the inline style. It is not a lapse. A page whose job is to work when
 * nothing else does cannot depend on a stylesheet arriving.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Task Studio failed at the root:', error)
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          font: '15px/1.6 system-ui, sans-serif',
          margin: '12vh auto',
          maxWidth: '34rem',
          padding: '0 1.5rem',
          color: '#1a1a1a',
          background: '#f4efe6',
        }}
      >
        <h1 style={{ fontSize: '1.15rem', margin: '0 0 .75rem' }}>
          Task Studio did not start
        </h1>
        <p style={{ margin: '.75rem 0' }}>
          This is the whole application failing rather than one page of it, so
          there is nothing to navigate to. Nothing has been lost.
        </p>
        <pre
          style={{
            background: '#fbf8f2',
            border: '1px solid #cfc7b8',
            padding: '.75rem',
            overflowX: 'auto',
            whiteSpace: 'pre-wrap',
            fontSize: '13px',
          }}
        >
          {error.message || 'The message was stripped, which means the fault was on the server.'}
          {error.digest && `\n\nReference: ${error.digest}`}
        </pre>
        <p style={{ margin: '.75rem 0' }}>
          <button
            onClick={reset}
            style={{
              font: 'inherit',
              padding: '.4rem .9rem',
              border: '1px solid #1e4632',
              background: '#1e4632',
              color: '#fbf8f2',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </p>
      </body>
    </html>
  )
}
