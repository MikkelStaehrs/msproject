'use client'

import { Suspense, useActionState, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { login } from './actions'
import { requestReset } from '@/lib/auth-actions'

export default function LoginPage() {
  return (
    <Suspense>
      <Login />
    </Suspense>
  )
}

function Login() {
  const [error, formAction, pending] = useActionState(login, null)
  const [reset, resetAction, resetting] = useActionState(requestReset, null)
  const [forgot, setForgot] = useState(false)

  /*
   * A link that failed says so here.
   *
   * /auth/callback sends the reason rather than dropping people on a login form
   * with no explanation, because the honest cause is almost always "that link
   * has already been used or has expired" and not "you got your password
   * wrong". Those two need different reactions from the person reading it.
   */
  const linkProblem = useSearchParams().get('link')

  return (
    <main className="grid min-h-screen grid-cols-[1fr_440px]">
      <div className="flex flex-col justify-between pl-5 lg:pl-16 py-11 pr-5 lg:pr-14">
        <div className="lbl text-muted">Portfolio · Internal</div>

        <div>
          <h1 className="font-display text-[128px] font-medium leading-[0.94] tracking-[-0.03em]">
            Task Studio
          </h1>
          <div className="my-6 h-px bg-rule-strong" />
          <p className="max-w-[470px] text-sm leading-relaxed text-pretty">
            You never fill in a status report. You work, and the report writes
            itself.
          </p>
        </div>

        <div className="text-[11px] text-muted">
          You see the projects you are on, and nothing else.
        </div>
      </div>

      <div className="flex flex-col justify-center border-l border-rule-strong py-11 pl-10 pr-5 lg:pr-16">
        <h2 className="font-display text-3xl font-medium">
          {forgot ? 'Forgotten it' : 'Sign in'}
        </h2>

        {linkProblem && !forgot && (
          <p className="mt-5 border-l-2 border-oxblood pl-3 text-[12.5px] leading-relaxed text-oxblood">
            That link did not work: {linkProblem}
            <span className="mt-1 block text-muted">
              Invitation and reset links are single use and they expire. Ask for
              a new one below.
            </span>
          </p>
        )}

        {forgot ? (
          <>
            <p className="mt-4 text-[13px] leading-relaxed text-muted">
              We will send a link that lets you choose a new password. It works
              once, and not for long.
            </p>

            <form action={resetAction} className="mt-7 flex flex-col gap-6">
              <label className="block">
                <span className="lbl text-muted">E-mail</span>
                <input
                  name="email"
                  type="email"
                  required
                  autoFocus
                  autoComplete="username"
                  className="field"
                />
              </label>

              <button type="submit" disabled={resetting} className="btn mt-1.5 w-full">
                {resetting ? 'Sending...' : 'Send the link'}
              </button>
            </form>

            {reset === 'sent' && (
              <p className="mt-5 text-[13px] leading-relaxed">
                Sent, if that address has an account here.
                <span className="mt-1 block text-muted">
                  The same answer either way, on purpose: this form is on the
                  open side of the login, and a different reply would turn it
                  into a way of asking which of your colleagues has an account.
                </span>
              </p>
            )}

            <button
              onClick={() => setForgot(false)}
              className="lbl mt-9 self-start text-muted hover:text-ink"
            >
              Back to signing in
            </button>
          </>
        ) : (
          <>
            <form action={formAction} className="mt-9 flex flex-col gap-6">
              <label className="block">
                <span className="lbl text-muted">E-mail</span>
                <input
                  name="email"
                  type="email"
                  required
                  autoFocus
                  autoComplete="username"
                  className="field"
                />
              </label>

              <label className="block">
                <span className="lbl text-muted">Password</span>
                <input
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  className="field"
                />
              </label>

              <button type="submit" disabled={pending} className="btn mt-1.5 w-full">
                {pending ? 'Signing in...' : 'Sign in'}
              </button>

              {error && <p className="text-[13px] text-oxblood">{error}</p>}
            </form>

            <button
              onClick={() => setForgot(true)}
              className="lbl mt-6 self-start text-muted hover:text-ink"
            >
              Forgotten your password
            </button>
          </>
        )}

        <p className="mt-10 border-t border-rule pt-4 text-[11px] leading-relaxed text-muted">
          The session stays on this machine. Everything sits behind the login, even when
          you only need to log one line.
        </p>
      </div>
    </main>
  )
}
