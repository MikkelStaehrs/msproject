'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { setPassword } from '@/lib/auth-actions'

/**
 * The form itself.
 *
 * Asks for no old password on purpose: an invitation link is the proof, and a
 * signed-in session is the proof the other way round.
 */
export function PasswordForm({ name }: { name: string }) {
  const [message, formAction, pending] = useActionState(setPassword, null)

  return (
    <>
      <h1 className="font-display text-3xl font-medium">
        {name === '' ? 'Choose a password' : 'Your account'}
      </h1>
      <p className="mt-3 text-[13px] leading-relaxed text-muted">
        The password is the only thing standing between the open internet and
        real project work, so make it long. A sentence you would remember beats
        something with symbols in it.
      </p>

      <form action={formAction} className="mt-8 flex flex-col gap-6">
        <label className="block">
          <span className="lbl text-muted">Your name</span>
          <input
            name="full_name"
            autoComplete="name"
            defaultValue={name}
            placeholder="Mikkel Stæhr"
            className="field"
          />
          <span className="mt-1 block text-[10.5px] leading-snug text-rule-strong">
            What colleagues see when you are named as an owner or a project
            manager. Not your email.
          </span>
        </label>

        <label className="block">
          <span className="lbl text-muted">New password</span>
          <input
            name="password"
            type="password"
            required
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
    </>
  )
}
