'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { setPassword } from '@/lib/auth-actions'

/**
 * Where an invitation lands, and where you change your own.
 *
 * Reached with a session already created by the link in the email, which is why
 * it asks for no old password: the link was the proof. Signed in and wanting a
 * different password, you land here the same way, from the account menu.
 */
export default function PasswordPage() {
  const [message, formAction, pending] = useActionState(setPassword, null)

  return (
    <main className="mx-auto max-w-[460px] px-5 py-24">
      <h1 className="font-display text-3xl font-medium">Choose a password</h1>
      <p className="mt-3 text-[13px] leading-relaxed text-muted">
        This is the only thing standing between the open internet and real
        project work, so make it long. A sentence you would remember beats
        something with symbols in it.
      </p>

      <form action={formAction} className="mt-8 flex flex-col gap-6">
        <label className="block">
          <span className="lbl text-muted">New password</span>
          <input
            name="password"
            type="password"
            required
            autoFocus
            minLength={10}
            autoComplete="new-password"
            className="field"
          />
        </label>

        <label className="block">
          <span className="lbl text-muted">Again</span>
          <input
            name="again"
            type="password"
            required
            minLength={10}
            autoComplete="new-password"
            className="field"
          />
        </label>

        <button type="submit" disabled={pending} className="btn mt-1.5 w-full">
          {pending ? 'Saving...' : 'Save it'}
        </button>

        {message && <p className="text-[13px] leading-relaxed text-oxblood">{message}</p>}
      </form>

      <p className="mt-10 border-t border-rule pt-4 text-[11px] leading-relaxed text-muted">
        Landed here without a working link?{' '}
        <Link href="/login" className="text-ink underline decoration-rule-strong underline-offset-2">
          Ask for a new one
        </Link>
        . They are single use and they expire.
      </p>
    </main>
  )
}
