'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { setPassword } from '@/lib/auth-actions'
import { logout } from '@/app/login/actions'

/**
 * The form itself.
 *
 * Asks for no old password on purpose: an invitation link is the proof, and a
 * signed-in session is the proof the other way round.
 *
 * `first` is a fact rather than a mood. It means the account still holds the
 * password whoever created it typed, or has no name on it, and the app layout
 * will keep sending them back here until both are answered. So on a first
 * arrival this says what it is for, requires the name, and offers a way out
 * that is not the front door: signing out, in case somebody is looking at
 * somebody else's account.
 */
export function PasswordForm({ name, first }: { name: string; first: boolean }) {
  const [message, formAction, pending] = useActionState(setPassword, null)

  return (
    <>
      <h1 className="font-display text-3xl font-medium">
        {first ? 'Before you start' : 'Your account'}
      </h1>

      {first ? (
        <div className="mt-3 flex flex-col gap-2.5 text-[13px] leading-relaxed text-muted">
          <p>
            Two things, once. Your account was created for you, which means
            somebody else typed the password you just used and still knows it.
            Replacing it here is the only way that stops being true.
          </p>
          <p>
            And a name, because a project says who owns it and an email address
            is not an answer to that.
          </p>
        </div>
      ) : (
        <p className="mt-3 text-[13px] leading-relaxed text-muted">
          The password is the only thing standing between the open internet and
          real project work, so make it long. A sentence you would remember beats
          something with symbols in it.
        </p>
      )}

      <form action={formAction} className="mt-8 flex flex-col gap-6">
        <label className="block">
          <span className="lbl text-muted">Your name</span>
          <input
            name="full_name"
            autoComplete="name"
            defaultValue={name}
            required={first}
            placeholder="Mikkel Stæhr"
            className="field"
          />
          <span className="mt-1 block text-[10.5px] leading-snug text-rule-strong">
            What colleagues see when you are named as an owner or a project
            manager. Not your email.
          </span>
        </label>

        <label className="block">
          <span className="lbl text-muted">
            {first ? 'A password of your own' : 'New password'}
          </span>
          <input
            name="password"
            type="password"
            required
            minLength={10}
            autoComplete="new-password"
            className="field"
          />
          {first && (
            <span className="mt-1 block text-[10.5px] leading-snug text-rule-strong">
              At least ten characters. Length is the part that matters, so a
              sentence beats a symbol.
            </span>
          )}
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
          {pending ? 'Saving...' : first ? 'Save and go in' : 'Save it'}
        </button>

        {message && <p className="text-[13px] leading-relaxed text-oxblood">{message}</p>}
      </form>

      {first ? (
        /*
         * The way out. Without it, signing in as the wrong person is a trap:
         * the layout sends you here, and here has no front door.
         */
        <div className="mt-10 border-t border-rule pt-4 text-[11px] leading-relaxed text-muted">
          Not your account?{' '}
          <form action={logout} className="inline">
            <button className="text-ink underline decoration-rule-strong underline-offset-2">
              Sign out
            </button>
          </form>
        </div>
      ) : (
        <p className="mt-10 border-t border-rule pt-4 text-[11px] leading-relaxed text-muted">
          Landed here without a working link?{' '}
          <Link
            href="/login"
            className="text-ink underline decoration-rule-strong underline-offset-2"
          >
            Ask for a new one
          </Link>
          . They are single use and they expire.
        </p>
      )}
    </>
  )
}
