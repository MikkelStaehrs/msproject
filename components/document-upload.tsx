'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { recordUpload, signUpload } from '@/lib/document-actions'
import { BUCKET, MAX_BYTES } from '@/lib/document'

/**
 * The upload that goes straight to storage.
 *
 * The whole reason this is a client component: a server action receives the
 * entire request body, and on Vercel that body is capped at 4.5 MB. The app
 * promised 25 MB and kept the promise only on the machine it was built on,
 * which is the worst shape a limit can have. A scanned drawing worked here and
 * would have failed the first time a colleague tried it.
 *
 * Three steps, and the file passes through none of our own servers: ask for a
 * signed URL, PUT the bytes at Supabase, then send back the few facts the row
 * needs. The signature is minted with the caller's own session, so the storage
 * policy still decides whether they may write anything at all.
 */
export function DocumentUpload({
  nodeId,
  folders,
  defaultFolder,
}: {
  nodeId: string
  folders: string[]
  defaultFolder: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [progress, setProgress] = useState<string | null>(null)

  async function upload(form: FormData) {
    const file = form.get('file')
    if (!(file instanceof File) || file.size === 0) {
      setProblem('Choose a file first.')
      return
    }
    if (file.size > MAX_BYTES) {
      setProblem(
        `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ` +
          `${Math.round(MAX_BYTES / 1024 / 1024)} MB.`,
      )
      return
    }

    setBusy(true)
    setProblem(null)
    setProgress('Preparing...')

    try {
      const signed = await signUpload(nodeId, file.name)
      if ('error' in signed && signed.error) {
        setProblem(signed.error)
        return
      }

      setProgress(`Sending ${(file.size / 1024 / 1024).toFixed(1)} MB...`)

      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      )

      const { error: putError } = await supabase.storage
        .from(BUCKET)
        .uploadToSignedUrl(signed.path!, signed.token!, file, {
          contentType: file.type || 'application/octet-stream',
        })

      if (putError) {
        setProblem(`The upload failed: ${putError.message}`)
        return
      }

      setProgress('Filing it...')

      const recorded = await recordUpload({
        nodeId,
        path: signed.path!,
        name: file.name,
        folder: String(form.get('folder') ?? ''),
      })

      if (recorded.error) {
        setProblem(recorded.error)
        return
      }

      setProgress(null)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      action={upload}
      className="mt-4 max-w-3xl border-y border-rule py-3.5"
    >
      <input
        type="file"
        name="file"
        required
        disabled={busy}
        className="w-full text-[11px] text-muted file:mr-3 file:border file:border-rule-strong file:bg-transparent file:px-3 file:py-1.5 file:text-[10px] file:font-medium file:uppercase file:tracking-[0.14em] file:text-ink"
      />

      <div className="mt-3 flex items-center gap-3">
        <select
          name="folder"
          defaultValue={defaultFolder}
          disabled={busy}
          className="field flex-1"
        >
          <option value="">No folder</option>
          {folders.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={busy}
          className="lbl shrink-0 text-green hover:text-oxblood disabled:text-rule-strong"
        >
          {busy ? 'Working' : 'Upload'}
        </button>
      </div>

      {progress && (
        <p className="mt-2 text-[11px] tabular-nums text-muted">{progress}</p>
      )}
      {problem && (
        <p className="mt-2 text-[12px] leading-relaxed text-oxblood">{problem}</p>
      )}
    </form>
  )
}
