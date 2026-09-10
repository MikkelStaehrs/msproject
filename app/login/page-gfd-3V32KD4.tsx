'use client'

import { useActionState } from 'react'
import { login } from './actions'

export default function LoginPage() {
  const [error, formAction, pending] = useActionState(login, null)

  return (
    <main className="grid grid-cols-1 lg:min-h-screen lg:grid-cols-[1fr_440px]">
      <div className="flex flex-col justify-between pl-5 lg:pl-16 py-11 pr-5 lg:pr-14">
        <div className="lbl text-muted">Portfolio · Internal</div>

        <div>
          <h1 className="font-display text-[56px] font-medium leading-[0.94] tracking-[-0.03em] sm:text-[88px] lg:text-[128px]">
            MSProjects
          </h1>
          <div className="my-6 h-px bg-rule-strong" />
          <p className="max-w-[470px] text-sm leading-relaxed text-pretty">
            You never fill in a status report. You work, and the report writes
            itself.
          </p>
        </div>

        <div className="text-[11px] text-muted">
          One account. No sharing, no notifications, no integrations.
        </div>
      </div>

      <div className="flex flex-col justify-center border-t border-rule-strong py-11 pl-5 pr-5 lg:border-l lg:border-t-0 lg:pl-10 lg:pr-16">
        <h2 className="font-display text-3xl font-medium">Sign in</h2>

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

        <p className="mt-10 border-t border-rule pt-4 text-[11px] leading-relaxed text-muted">
          The session stays on this machine. Everything sits behind the login, even when
          you only need to log one line.
        </p>
      </div>
    </main>
  )
}
