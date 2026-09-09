'use client'

import { useActionState } from 'react'
import { createToken, revokeToken } from '@/lib/token-actions'
import { formatDate } from '@/components/ui'

type Token = { id: string; name: string; created_at: string; last_used_at: string | null }

/**
 * Connecting the Claude app.
 *
 * The token is shown once, here, in the reply to making it. There is nowhere to
 * go and look it up later because only its hash is stored, which is the whole
 * reason a stolen database row is not a working credential.
 *
 * What the copy has to get across is small and specific: this thing can put
 * text in your inbox and it can do nothing else. People are right to be wary of
 * pasting a credential into another application, and the honest answer to that
 * wariness is the size of what it opens.
 */
export function Connector({ url, tokens }: { url: string; tokens: Token[] }) {
  const [made, action, pending] = useActionState(createToken, null)

  return (
    <section className="mt-14 border-t border-rule-strong pt-6">
      <h2 className="font-display text-[22px] font-medium">The Claude app</h2>
      <p className="mt-2 text-[13px] leading-relaxed text-muted">
        Say an idea to Claude on your phone and it lands in your Sparks inbox.
        Add Task Studio as a custom connector, with a token from here.
      </p>

      {made && 'token' in made && made.token && (
        <div className="mt-5 border border-ink bg-sheet px-4 py-3.5">
          <div className="lbl text-muted">Copy this now</div>
          <code className="mt-2 block break-all font-mono text-[12.5px] leading-relaxed">
            {made.token}
          </code>
          <p className="mt-2.5 text-[11px] leading-relaxed text-rule-strong">
            It is not stored in a form anyone can read back, this application
            included, so this is the only time it is shown. Lost it? Make
            another and revoke this one.
          </p>
        </div>
      )}

      {made && 'error' in made && made.error && (
        <p className="mt-4 text-[13px] text-oxblood">{made.error}</p>
      )}

      <form action={action} className="mt-5 flex items-end gap-3">
        <label className="block flex-1">
          <span className="lbl text-muted">What will hold it</span>
          <input
            name="name"
            placeholder="Claude on my phone"
            className="field"
          />
        </label>
        <button disabled={pending} className="btn">
          {pending ? 'Making' : 'Make a token'}
        </button>
      </form>

      {tokens.length > 0 && (
        <div className="mt-6 divide-y divide-rule border-y border-rule">
          {tokens.map((t) => (
            <div key={t.id} className="flex items-baseline gap-4 py-2.5">
              <span className="min-w-0 flex-1 text-[13px]">{t.name}</span>
              <span className="lbl-tight shrink-0 text-rule-strong">
                {t.last_used_at
                  ? `used ${formatDate(t.last_used_at.slice(0, 10))}`
                  : 'never used'}
              </span>
              <form action={revokeToken}>
                <input type="hidden" name="id" value={t.id} />
                <input type="hidden" name="redirectTo" value="/auth/password" />
                <button className="lbl-tight text-rule-strong hover:text-oxblood">
                  Revoke
                </button>
              </form>
            </div>
          ))}
        </div>
      )}

      <div className="mt-7 border-t border-rule pt-4">
        <div className="lbl text-muted">Setting it up in Claude</div>
        <ol className="mt-2.5 flex flex-col gap-1.5 text-[12px] leading-relaxed text-muted">
          <li>1. Settings, then Connectors, then Add custom connector.</li>
          <li>
            2. The URL is{' '}
            <code className="break-all bg-sheet px-1 font-mono text-[11.5px] text-ink">
              {url}/api/mcp
            </code>
          </li>
          <li>
            3. Under advanced settings, add the header{' '}
            <code className="bg-sheet px-1 font-mono text-[11.5px] text-ink">
              Authorization
            </code>{' '}
            with the value{' '}
            <code className="bg-sheet px-1 font-mono text-[11.5px] text-ink">
              Bearer &lt;your token&gt;
            </code>
          </li>
        </ol>
        <p className="mt-3 max-w-prose text-[11px] leading-relaxed text-rule-strong">
          <strong className="font-medium text-muted">
            What it can do, in full:
          </strong>{' '}
          add one sentence to your own Sparks inbox. It cannot read your
          projects, your prices or your documents, and it cannot change or
          delete anything. That is enforced in the database rather than promised
          here, which is why a token going astray is an annoyance and not an
          incident.
        </p>
      </div>
    </section>
  )
}
