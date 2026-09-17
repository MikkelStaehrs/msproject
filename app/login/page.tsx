'use client'

import { Suspense, useActionState, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { login } from './actions'
import { requestReset } from '@/lib/auth-actions'
import { requestAccess } from '@/lib/access-actions'

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
  const [asked, askAction, asking] = useActionState(requestAccess, null)

  /*
   * Three things can be happening on this side of the page, and only one at a
   * time. Signing in is the default; the other two are each one click away and
   * each say plainly what they are, because the person reaching for them is
   * either locked out or not in yet, and neither of those is the moment to
   * make somebody guess.
   */
  const [mode, setMode] = useState<'in' | 'forgot' | 'ask'>('in')

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
    <main className="grid grid-cols-1 lg:min-h-screen lg:grid-cols-[1fr_440px]">
      <div className="flex flex-col justify-between pl-5 lg:pl-16 py-11 pr-5 lg:pr-14">
        <div className="lbl text-muted">Portfolio · Internal</div>

        <div>
          <h1 className="font-display text-[56px] font-medium leading-[0.94] tracking-[-0.03em] sm:text-[88px] lg:text-[128px]">
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

      <div className="flex flex-col justify-center border-t border-rule-strong py-11 pl-5 pr-5 lg:border-l lg:border-t-0 lg:pl-10 lg:pr-16">
        <h2 className="font-display text-3xl font-medium">
          {mode === 'forgot' ? 'Forgotten it' : mode === 'ask' ? 'Request access' : 'Sign in'}
        </h2>

        {linkProblem && mode === 'in' && (
          <p className="mt-5 border-l-2 border-oxblood pl-3 text-[12.5px] leading-relaxed text-oxblood">
            That link did not work: {linkProblem}
            <span className="mt-1 block text-muted">
              Invitation and reset links are single use and they expire. Ask for
              a new one below.
            </span>
          </p>
        )}

        {mode === 'forgot' ? (
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
              onClick={() => setMode('in')}
              className="lbl mt-9 self-start text-muted hover:text-ink"
            >
              Back to signing in
            </button>
          </>
        ) : mode === 'ask' ? (
          <>
            <p className="mt-4 text-[13px] leading-relaxed text-muted">
              There is no signing up here. Somebody who already works in this
              portfolio reads what you write and decides, and you hear back by
              email either way.
            </p>

            {asked === 'sent' ? (
              <p className="mt-7 text-[13px] leading-relaxed">
                That is with somebody now.
                <span className="mt-1 block text-muted">
                  Nothing else happens on your side. If you are let in, an
                  invitation arrives at that address and it is the link that
                  lets you choose a password.
                </span>
              </p>
            ) : (
              <form action={askAction} className="mt-7 flex flex-col gap-6">
                <label className="block">
                  <span className="lbl text-muted">Your name</span>
                  <input
                    name="full_name"
                    required
                    autoFocus
                    autoComplete="name"
                    className="field"
                  />
                </label>

                <label className="block">
                  <span className="lbl text-muted">E-mail</span>
                  <input
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    className="field"
                  />
                </label>

                {/*
                  Optional, and the label says what it is for rather than
                  asking an open question. «Why do you need access» is a form
                  field people leave empty; naming the work is something they
                  can answer.
                */}
                <label className="block">
                  <span className="lbl text-muted">What you work on</span>
                  <textarea
                    name="reason"
                    rows={3}
                    className="field resize-y"
                    placeholder="Which project, and what you would be doing in it."
                  />
                </label>

                <button type="submit" disabled={asking} className="btn mt-1.5 w-full">
                  {asking ? 'Sending...' : 'Send the request'}
                </button>

                {asked && asked !== 'sent' && (
                  <p className="text-[13px] leading-relaxed text-oxblood">{asked}</p>
                )}
              </form>
            )}

            <button
              onClick={() => setMode('in')}
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

            <div className="mt-6 flex flex-wrap items-baseline gap-x-7 gap-y-2">
              <button
                onClick={() => setMode('forgot')}
                className="lbl text-muted hover:text-ink"
              >
                Forgotten your password
              </button>
              <button
                onClick={() => setMode('ask')}
                className="lbl text-muted hover:text-ink"
              >
                Request access
              </button>
            </div>
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
