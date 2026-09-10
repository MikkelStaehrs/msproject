import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { Connector } from './connector'
import { PasswordForm } from './form'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Your account' }

/**
 * Where an invitation lands, and the only place you can change your own
 * password or the name colleagues see.
 *
 * It began as the landing page for an invitation link and nothing else, which
 * left a gap worth naming: the first account here set its password before there
 * was anywhere to give a name, and there was no route back. So the header links
 * here, and the page reads whatever is already set rather than starting from
 * blank and quietly wiping it.
 */
export default async function PasswordPage() {
  const supabase = await createClient()

  const { data: auth } = await supabase.auth.getUser()

  const { data: profile } = auth.user
    ? await supabase
        .from('profile')
        .select('full_name, password_set_at')
        .eq('id', auth.user.id)
        .maybeSingle()
    : { data: null }

  const { data: tokens } = auth.user
    ? await supabase
        .from('spark_token')
        .select('id, name, created_at, last_used_at')
        .order('created_at', { ascending: false })
    : { data: null }

  /*
   * The address the connector has to be pointed at. Read from the request
   * rather than configured, so it is right on the deployment, right in
   * development, and cannot drift from whatever the site is actually served on.
   */
  /*
   * A first arrival, and it is a fact about the account rather than a flag:
   * no name yet, or a password nobody has replaced since the account was
   * created for them. The app layout sends people here while either holds, so
   * this page has to read as a welcome rather than as a settings screen.
   */
  const first =
    auth.user !== null &&
    (profile === null ||
      profile.full_name === null ||
      profile.password_set_at === null)

  const host = (await headers()).get('host') ?? ''
  const origin = host === '' ? '' : `${host.startsWith('localhost') ? 'http' : 'https'}://${host}`

  return (
    <main className="mx-auto max-w-[520px] px-5 py-24">
      {auth.user && (
        <div className="lbl mb-8 text-muted">{auth.user.email}</div>
      )}

      <PasswordForm
        name={profile?.full_name ?? ''}
        first={first}
      />

      {/*
        Only for somebody already set up. On a first arrival the job is a name
        and a password; a connector to configure as well would be a second
        errand at the worst possible moment, and the one thing on this page that
        can wait.
      */}
      {auth.user && !first && <Connector url={origin} tokens={tokens ?? []} />}
    </main>
  )
}
