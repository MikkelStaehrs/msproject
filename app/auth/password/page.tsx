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
    ? await supabase.from('profile').select('full_name').eq('id', auth.user.id).maybeSingle()
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
  const host = (await headers()).get('host') ?? ''
  const origin = host === '' ? '' : `${host.startsWith('localhost') ? 'http' : 'https'}://${host}`

  return (
    <main className="mx-auto max-w-[520px] px-5 py-24">
      {auth.user && (
        <div className="lbl mb-8 text-muted">{auth.user.email}</div>
      )}
      <PasswordForm name={profile?.full_name ?? ''} />
      {/*
        Only for somebody already signed in. Arriving here from an invitation
        link, the job is to choose a password; a connector to set up as well
        would be two errands at the worst moment.
      */}
      {auth.user && <Connector url={origin} tokens={tokens ?? []} />}
    </main>
  )
}
