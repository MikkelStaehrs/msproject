import { createClient } from '@/lib/supabase/server'
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

  return (
    <main className="mx-auto max-w-[460px] px-5 py-24">
      {auth.user && (
        <div className="lbl mb-8 text-muted">{auth.user.email}</div>
      )}
      <PasswordForm name={profile?.full_name ?? ''} />
    </main>
  )
}
