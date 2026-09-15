'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { recordUpload, signUpload } from '@/lib/document-actions'
import { BUCKET, MAX_BYTES } from '@/lib/document'

/**
 * The toolbar of the files page, and the form that unfolds under it.
 *
 * Two buttons, as the concept draws them: Upload and New folder. They open the
 * same form in two moods. Upload asks for a file and which folder it goes in;
 * New folder asks for the folder's name first, because a folder is nothing
 * but a label on a document and exists the moment a file carries it. That is
 * also why there is no «create folder» action in lib: the row is the folder.
 *
 * The upload itself is the same three steps DocumentUpload made and for the
 * same reason: a server action's request body is capped at 4.5 MB on Vercel,
 * and the 25 MB this page promises was only ever true on the machine it was
 * built on. So the file goes straight from the browser to storage on a signed
 * URL minted with the caller's own session, and only the facts for the row
 * come back through the action.
 */
type Mode = 'closed' | 'upload' | 'folder'

export function FilesUpload({
  nodeId,
  folders,
  defaultFolder,
  summary,
}: {
  nodeId: string
  /** The skeleton plus whatever folders files already sit in. */
  folders: string[]
  defaultFolder: string
  /** «3 files · 2 folders», worked out on the server. */
  summary: string
}) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('closed')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [progress, setProgress] = useState<string | null>(null)

  const toggle = (m: Mode) => {
    setProblem(null)
    setMode(mode === m ? 'closed' : m)
  }

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
    const folder = String(form.get('folder') ?? '').trim()
    if (mode === 'folder' && folder === '') {
      setProblem('Name the folder first.')
      return
    }

    setBusy(true)
    setProblem(null)
    setProgress('Preparing')

    try {
      const signed = await signUpload(nodeId, file.name)
      if ('error' in signed && signed.error) {
        setProblem(signed.error)
        return
      }

      setProgress(`Sending ${(file.size / 1024 / 1024).toFixed(1)} MB`)

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

      setProgress('Filing it')

      const recorded = await recordUpload({
        nodeId,
        path: signed.path!,
        name: file.name,
        folder,
      })

      if (recorded.error) {
        setProblem(recorded.error)
        return
      }

      setProgress(null)
      setMode('closed')
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      {/* Actions on one line, the count on the other side. Never a filter here. */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            className="btn"
            aria-pressed={mode === 'upload'}
            onClick={() => toggle('upload')}
          >
            Upload
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            aria-pressed={mode === 'folder'}
            onClick={() => toggle('folder')}
          >
            New folder
          </button>
        </div>
        <span className="micro text-muted">{summary}</span>
      </div>

      {mode !== 'closed' && (
        <form action={upload} className="panel grp-gap max-w-[760px] p-3.5">
          {mode === 'folder' ? (
            <label className="block">
              <span className="lbl text-muted">Folder</span>
              <input
                name="folder"
                type="text"
                required
                autoFocus
                disabled={busy}
                placeholder="02 Quotes"
                className="field mt-1"
              />
              <span className="mt-1.5 block text-[12px] leading-relaxed text-muted">
                A folder exists once a file is in it. Lead with its number and it
                sorts itself into the skeleton.
              </span>
            </label>
          ) : (
            <label className="block">
              <span className="lbl text-muted">Folder</span>
              <select
                name="folder"
                defaultValue={defaultFolder}
                disabled={busy}
                className="field mt-1"
              >
                <option value="">Unfiled</option>
                {folders.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="grp-gap block">
            <span className="lbl text-muted">File</span>
            <input
              type="file"
              name="file"
              required
              disabled={busy}
              className="mt-1.5 block w-full text-[12px] text-muted file:mr-3 file:border file:border-line-strong file:bg-transparent file:px-3 file:py-1.5 file:text-[12px] file:font-medium file:text-ink"
            />
          </label>

          <div className="grp-gap flex flex-wrap items-center gap-4">
            <button type="submit" disabled={busy} className="btn">
              {busy ? 'Working' : mode === 'folder' ? 'Upload into it' : 'Send it'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setMode('closed')}
              className="act"
            >
              Close
            </button>
            {progress && <span className="mono text-[12px] text-muted">{progress}</span>}
          </div>

          {problem && (
            <p className="mt-3 text-[12px] leading-relaxed text-rust">{problem}</p>
          )}

          <p className="mt-3 text-[12px] leading-relaxed text-muted">
            25 MB per file at most. Files live in a private bucket, and every click
            fetches an access link that expires after one minute.
          </p>
        </form>
      )}
    </div>
  )
}
