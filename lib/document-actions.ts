'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { randomUUID } from 'node:crypto'
import { BUCKET, MAX_BYTES } from '@/lib/document'
import { safeName } from '@/lib/document-store'
import { required } from '@/lib/form'

/**
 * Direct upload, in two steps, because the one step version cannot work in
 * production.
 *
 * A server action receives the whole request body, and on Vercel that body is
 * capped at 4.5 MB: anything larger comes back as 413 FUNCTION_PAYLOAD_TOO_LARGE
 * with no help. The app promised 25 MB and delivered it locally, which is the
 * worst kind of limit, because a scanned drawing works on your machine and
 * fails the first time somebody else tries it.
 *
 * So the file never passes through here. The browser asks for a signed URL,
 * uploads straight to storage, and then sends back only the few facts needed
 * for the row. The signature is minted with the caller's own session, so the
 * storage policy still decides whether they may write at all.
 */
export async function signUpload(nodeId: string, fileName: string) {
  const supabase = await createClient()

  /*
   * The node has to be one the caller can see. Storage policies allow any
   * signed-in user into this bucket, so without this check a member of one
   * project could park a file under another project's id.
   */
  const { data: node, error: nodeError } = await supabase
    .from('node')
    .select('id')
    .eq('id', nodeId)
    .maybeSingle()

  if (nodeError) return { error: nodeError.message }
  if (!node) return { error: 'That project is not yours to add to.' }

  const path = `${nodeId}/${randomUUID()}-${safeName(fileName)}`

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(path)

  if (error || !data) return { error: error?.message ?? 'Could not start the upload.' }

  return { path: data.path, token: data.token }
}

/**
 * The row, once the bytes are already there.
 *
 * Nothing here trusts the size or the type the browser reports: they are read
 * back from storage. A row claiming 2 KB over a 60 MB object would make the
 * documents page lie about what the project holds.
 */
export async function recordUpload(input: {
  nodeId: string
  path: string
  name: string
  folder: string | null
}) {
  const supabase = await createClient()

  const slash = input.path.lastIndexOf('/')
  const { data: found, error: statError } = await supabase.storage
    .from(BUCKET)
    .list(input.path.slice(0, slash), { search: input.path.slice(slash + 1) })

  const object = found?.[0]
  if (statError || !object) {
    return { error: 'The upload did not arrive. Try again.' }
  }

  const size = (object.metadata?.size as number | undefined) ?? null
  const mime = (object.metadata?.mimetype as string | undefined) ?? null

  if (size !== null && size > MAX_BYTES) {
    await supabase.storage.from(BUCKET).remove([input.path])
    return { error: `That file is over the ${Math.round(MAX_BYTES / 1024 / 1024)} MB limit.` }
  }

  const folder = (input.folder ?? '').trim()

  const { error } = await supabase.from('document').insert({
    node_id: input.nodeId,
    name: input.name,
    path: input.path,
    mime_type: mime,
    size_bytes: size,
    folder: folder === '' ? null : folder,
  })

  // Without the row the file is invisible forever, so clean up right away.
  if (error) {
    await supabase.storage.from(BUCKET).remove([input.path])
    return { error: error.message }
  }

  revalidatePath('/', 'layout')
  return {}
}

/** Move a file to another folder. Only the label changes, not the path. */
export async function moveDocument(fd: FormData) {
  const supabase = await createClient()
  const folder = String(fd.get('folder') ?? '').trim()

  const { error } = await supabase
    .from('document')
    .update({ folder: folder === '' ? null : folder })
    .eq('id', required(fd, 'id'))

  if (error) throw new Error(`Could not move the document: ${error.message}`)
  revalidatePath('/', 'layout')
}

export async function deleteDocument(fd: FormData) {
  const supabase = await createClient()
  const id = required(fd, 'id')

  const { data: doc } = await supabase
    .from('document')
    .select('path')
    .eq('id', id)
    .single()

  if (doc) await supabase.storage.from(BUCKET).remove([doc.path])

  const { error } = await supabase.from('document').delete().eq('id', id)
  if (error) throw new Error(`Could not delete the document: ${error.message}`)

  revalidatePath('/', 'layout')
  redirect(String(fd.get('redirectTo') ?? '/'))
}

/**
 * Files in storage do not follow when a node is deleted. Only the database
 * row does, through the cascade. So they are cleared explicitly first.
 */
export async function purgeDocumentsForSubtree(nodeId: string) {
  const supabase = await createClient()

  const { data: subtree } = await supabase
    .from('v_node_descendant')
    .select('node_id')
    .eq('root_id', nodeId)

  const ids = (subtree ?? []).map((d) => d.node_id)
  if (ids.length === 0) return

  const { data: docs } = await supabase.from('document').select('path').in('node_id', ids)
  const paths = (docs ?? []).map((d) => d.path)
  if (paths.length > 0) await supabase.storage.from(BUCKET).remove(paths)
}
