import { deleteDocument, moveDocument } from '@/lib/document-actions'
import { DocumentUpload } from '@/components/document-upload'
import { DEFAULT_FOLDERS, folderLabel, folderNumber } from '@/lib/template'
import { formatDate } from '@/components/ui'
import type { Document } from '@/lib/types'

/** 1.4 MB beats 1468006 bytes, every time. */
function formatSize(bytes: number | null) {
  if (bytes === null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
}

/** Filendelsen siger mere end et ikon ville. */
function extension(name: string) {
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.slice(dot + 1).toUpperCase().slice(0, 4)
}

const NO_FOLDER = 'No folder'

export function DocumentPanel({
  nodeId,
  documents,
  folders,
  titleById,
  redirectTo,
}: {
  nodeId: string
  documents: Document[]
  /** The project's folder set, from the template. Empty means the default. */
  folders: string[]
  titleById: Map<string, string>
  redirectTo: string
}) {
  const skeleton = folders.length > 0 ? folders : [...DEFAULT_FOLDERS]

  // Mapper der findes i skelettet, plus dem filer faktisk ligger i.
  const used = [
    ...new Set(documents.map((d) => d.folder).filter((f): f is string => f !== null)),
  ]
  const all = [...new Set([...skeleton, ...used])].sort()
  const loose = documents.filter((d) => d.folder === null)

  return (
    <section>
      <h2 className="font-display text-[26px] font-medium">Documents</h2>

      {/*
        The file goes straight from the browser to storage, never through a
        server action. See DocumentUpload: a server action's request body is
        capped at 4.5 MB on Vercel, so the 25 MB this panel promises was only
        ever true on the machine it was built on.
      */}
      <DocumentUpload
        nodeId={nodeId}
        folders={all}
        defaultFolder={skeleton[0] ?? ''}
      />

      <div className="mt-6 flex max-w-3xl flex-col gap-6">
        {all.map((folder) => {
          const inFolder = documents.filter((d) => d.folder === folder)
          const nr = folderNumber(folder)

          return (
            <div key={folder}>
              <div className="flex items-baseline gap-2.5">
                <span className="flex size-[18px] shrink-0 items-center justify-center border border-rule-strong text-[8.5px] tabular-nums text-muted">
                  {nr ?? '·'}
                </span>
                <span className="lbl">{folderLabel(folder)}</span>
                <span className="ml-auto text-[10px] tabular-nums text-rule-strong">
                  {inFolder.length > 0 ? inFolder.length : ''}
                </span>
              </div>

              {inFolder.length === 0 ? (
                <p className="mt-1.5 border-t border-rule pt-2 text-[11px] text-rule-strong">
                  Empty
                </p>
              ) : (
                <div className="mt-1.5">
                  {inFolder.map((d) => (
                    <DocumentRow
                      key={d.id}
                      doc={d}
                      folders={all}
                      titleById={titleById}
                      redirectTo={redirectTo}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}

        {loose.length > 0 && (
          <div>
            <div className="flex items-baseline gap-2.5">
              <span className="flex size-[18px] shrink-0 items-center justify-center border border-rule-strong text-[8.5px] text-muted">
                ·
              </span>
              <span className="lbl text-oxblood">{NO_FOLDER}</span>
              <span className="ml-auto text-[10px] tabular-nums text-rule-strong">
                {loose.length}
              </span>
            </div>
            <div className="mt-1.5">
              {loose.map((d) => (
                <DocumentRow
                  key={d.id}
                  doc={d}
                  folders={all}
                  titleById={titleById}
                  redirectTo={redirectTo}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <p className="mt-6 max-w-3xl border-t border-rule pt-3 text-[10.5px] leading-relaxed text-rule-strong">
        25 MB per file at most. Files live in a private bucket, and every click fetches
        an access link that expires after one minute.
      </p>
    </section>
  )
}

function DocumentRow({
  doc,
  folders,
  titleById,
  redirectTo,
}: {
  doc: Document
  folders: string[]
  titleById: Map<string, string>
  redirectTo: string
}) {
  return (
    <div className="flex items-baseline gap-3 border-t border-rule py-2.5 last:border-b">
      <span className="w-[34px] shrink-0 text-[9.5px] font-medium tracking-[0.1em] text-rule-strong">
        {extension(doc.name)}
      </span>

      <div className="min-w-0 flex-1">
        <a
          href={`/api/document/${doc.id}`}
          className="block truncate text-[12.5px] hover:text-green"
        >
          {doc.name}
        </a>
        <div className="mt-0.5 text-[10px] text-muted">
          {formatSize(doc.size_bytes)} · {formatDate(doc.created_at.slice(0, 10))}
          {titleById.get(doc.node_id) && <> · {titleById.get(doc.node_id)}</>}
        </div>
      </div>

      <form action={moveDocument} className="shrink-0">
        <input type="hidden" name="id" value={doc.id} />
        <select
          name="folder"
          defaultValue={doc.folder ?? ''}
          className="max-w-[104px] cursor-pointer truncate border-0 bg-transparent text-[10px] uppercase tracking-[0.1em] text-rule-strong outline-none hover:text-ink"
          aria-label="Move to folder"
        >
          <option value="">no folder</option>
          {folders.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <button type="submit" className="lbl-tight ml-1.5 text-rule-strong hover:text-ink">
          Move
        </button>
      </form>

      <form action={deleteDocument} className="shrink-0">
        <input type="hidden" name="id" value={doc.id} />
        <input type="hidden" name="redirectTo" value={redirectTo} />
        <button type="submit" className="lbl-tight text-rule-strong hover:text-oxblood">
          Delete
        </button>
      </form>
    </div>
  )
}
