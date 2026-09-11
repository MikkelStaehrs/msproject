'use client'

import { useActionState } from 'react'
import { createToken, revokeToken } from '@/lib/token-actions'
import { formatDate } from '@/components/ui'
import {
  TOKEN_SCOPES,
  TOKEN_SCOPE_HINT,
  TOKEN_SCOPE_LABEL,
  type TokenScope,
} from '@/lib/types'

type Token = {
  id: string
  name: string
  created_at: string
  last_used_at: string | null
  scope: TokenScope
}

/**
 * Connecting the Claude app.
 *
 * The token is shown once, here, in the reply to making it. There is nowhere to
 * go and look it up later because only its hash is stored, which is the whole
 * reason a stolen database row is not a working credential.
 *
 * What the copy has to get across is small and specific: the size of what this
 * thing opens. People are right to be wary of pasting a credential into another
 * application, and the honest answer to that wariness is a plain sentence about
 * the blast radius rather than reassurance.
 *
 * Which is why the scope is a choice made here rather than a default applied
 * quietly. A capture token puts text in your inbox and reads nothing. An
 * analyse token also reads the shape of your projects and the COGS reference,
 * so Claude can argue with an idea before it becomes work, and that is strictly
 * more to lose. Neither can change anything but a spark, at any scope.
 */
/**
 * Long enough ago that «never used» means something.
 *
 * A token made thirty seconds ago has not been used because nobody has had time
 * to paste it anywhere yet, and saying so would cry wolf on every single mint.
 */
const olderThanAnHour = (iso: string) =>
  Date.now() - Date.parse(iso) > 60 * 60 * 1000

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

      {/*
        The hint sits inside each option rather than under the select, for the
        same reason it does on the node type picker: this is a plain
        uncontrolled select, and a line beneath it can only ever describe one of
        the two.
      */}
      <form action={action} className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] sm:items-end lg:grid-cols-[1fr_1fr_auto]">
        <label className="block">
          <span className="lbl text-muted">What will hold it</span>
          <input
            name="name"
            placeholder="Claude on my phone"
            className="field"
          />
        </label>
        <label className="block">
          <span className="lbl text-muted">What it may do</span>
          <select name="scope" defaultValue="capture" className="field">
            {TOKEN_SCOPES.map((sc) => (
              <option key={sc} value={sc}>
                {TOKEN_SCOPE_LABEL[sc]} · {TOKEN_SCOPE_HINT[sc]}
              </option>
            ))}
          </select>
        </label>
        <button disabled={pending} className="btn">
          {pending ? 'Making' : 'Make a token'}
        </button>
      </form>

      {tokens.length > 0 && (
        <div className="mt-6 divide-y divide-rule border-y border-rule">
          {tokens.map((t) => (
            <div key={t.id} className="flex items-baseline gap-4 py-2.5">
              <span className="min-w-0 flex-1 text-[13px]">
                {t.name}
                {/*
                  Said on every row, not only the ones that can read. A list
                  where the wider capability is the one with a mark on it reads
                  as an exception; both stated, the difference is a fact about
                  each credential and revoking the right one needs no guesswork.
                */}
                <span className="lbl-tight ml-2 text-rule-strong">
                  {TOKEN_SCOPE_LABEL[t.scope]}
                </span>
              </span>
              {/*
                «Never used» is the most useful line on this page and it took an
                hour to notice, because it states a fact and not what the fact
                means.
                
                A connector that reports it cannot read, beside a token here
                that has never been used, is a connector sending a DIFFERENT
                token: a revoked one it kept, almost always. Three rounds were
                spent making new tokens over exactly that, with the answer on
                screen the whole time. So the row says what to do about it
                rather than leaving the reader to join two facts on separate
                screens.
                
                It is only said where it can be true. A token that has been used
                needs no explanation, and one made a moment ago has not had the
                chance yet.
              */}
              <span className="shrink-0 text-right">
                <span className="lbl-tight block text-rule-strong">
                  {t.last_used_at
                    ? `used ${formatDate(t.last_used_at.slice(0, 10))}`
                    : 'never used'}
                </span>
                {t.last_used_at === null && olderThanAnHour(t.created_at) && (
                  <span className="lbl-tight mt-0.5 block max-w-[15rem] leading-snug text-oxblood">
                    Nothing has ever arrived with this one. If your connector
                    says it cannot read, it is sending a different token.
                  </span>
                )}
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
