/**
 * Apply the migrations that have not reached the database yet.
 *
 *   npm run migrate          what would run, and nothing else
 *   npm run migrate -- --go  actually run them
 *
 * Until 11 September 2026 this was a person pasting each file into the Supabase
 * SQL editor, because the project held no credential that could run DDL. It now
 * holds one, in SUPABASE_TOKEN, and this goes through the Management API.
 *
 * WHAT THIS DOES NOT CHANGE, and the reason it is worth writing down: the value
 * of the old way was never the pasting. Two migrations were caught before they
 * ever ran that day, one where a variable collided with `node.owner` and one
 * where `create or replace` cannot change a return type, and both were caught by
 * READING the file. A runner removes the waiting, not the reading, and the
 * temptation it introduces is to iterate, run, patch, run, until it stops
 * complaining. That produces migrations that apply and schemas nobody
 * understands. Write it to be right, then run it.
 *
 * `schema_migration` stays the record of what actually landed. This reads it
 * rather than keeping a list of its own, so a file applied by hand in the
 * editor is not applied twice, and the answer to «what is in the database» has
 * exactly one source.
 *
 * Dry by default. A tool that changes a schema because you forgot an argument
 * is a tool that eventually changes the wrong one.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const env: Record<string, string> = {}
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

const TOKEN = env.SUPABASE_TOKEN
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL

/**
 * Every finish sets a code and returns rather than calling `process.exit`.
 *
 * On Windows, exiting while a fetch handle is still closing aborts the process
 * with a libuv assertion instead of the message you were trying to print, which
 * is a confusing way to report a migration failure.
 */
async function main(): Promise<number> {
  if (!TOKEN || !URL_) {
    console.error(
      'Missing SUPABASE_TOKEN or NEXT_PUBLIC_SUPABASE_URL in .env.local.\n' +
        'Without the token, migrations go back to being pasted into the SQL editor.',
    )
    return 1
  }
  const ref = new URL(URL_).hostname.split('.')[0]

  /** One statement, or a whole file. A refusal comes back, it is not thrown. */
  const sql = async (query: string) => {
    const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    })
    return { ok: r.ok, status: r.status, body: await r.text() }
  }

  const applied = await sql('select version from schema_migration')
  if (!applied.ok) {
    console.error(`Could not read schema_migration: ${applied.status} ${applied.body}`)
    return 1
  }
  const have = new Set(
    (JSON.parse(applied.body) as { version: string }[]).map((r) => r.version),
  )

  const files = readdirSync('supabase/migrations')
    .filter((f) => f.endsWith('.sql'))
    .sort()
  const pending = files.filter((f) => !have.has(f.replace(/\.sql$/, '')))

  console.log(`${have.size} applied, ${files.length} on disk, ${pending.length} pending`)
  for (const f of pending) console.log(`  ${f}`)
  if (pending.length === 0) return 0

  if (!process.argv.includes('--go')) {
    console.log('\nNothing was run. Add --go to apply them.')
    return 0
  }

  /*
   * One file at a time, stopping at the first failure.
   *
   * Every migration here opens with `begin` and closes with `commit`, so a file
   * that fails half way rolls itself back. Carrying on after a failure would
   * apply migrations out of order, which is the one thing the filename ordering
   * exists to prevent.
   */
  for (const f of pending) {
    process.stdout.write(`\n${f} ... `)
    const res = await sql(readFileSync(join('supabase/migrations', f), 'utf8'))
    if (!res.ok) {
      console.log(`FAILED (${res.status})`)
      console.log(res.body.slice(0, 2000))
      console.log('\nStopped. Nothing after this one was attempted.')
      return 1
    }
    console.log('ok')
  }

  /*
   * And prove it, rather than trusting that a 200 meant what it looked like.
   * Every migration ends by recording itself, so one that ran without doing so
   * is one whose last statement did not execute.
   */
  const after = await sql('select version from schema_migration')
  const now = new Set(
    (JSON.parse(after.body) as { version: string }[]).map((r) => r.version),
  )
  const missing = pending.filter((f) => !now.has(f.replace(/\.sql$/, '')))
  console.log(
    missing.length === 0
      ? `\n${pending.length} applied and recorded. Run npm run audit.`
      : `\nRan, but these did not record themselves: ${missing.join(', ')}`,
  )
  return missing.length === 0 ? 0 : 1
}

process.exitCode = await main()
