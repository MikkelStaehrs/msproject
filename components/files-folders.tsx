import Link from 'next/link'
import { Folder } from 'lucide-react'
import { deleteDocument, moveDocument } from '@/lib/document-actions'
import { formatDate } from '@/components/ui'
import type { Document } from '@/lib/types'

/**
 * The folders that hold something, and the files in them.
 *
 * A folder is a label on a document, so an empty folder does not exist and is
 * not drawn: the skeleton lives in the upload form, where a folder is chosen,
 * and appears here the moment a file carries it. The page says so underneath.
 *
 * Each file row is the file: the row opens it, and the `⋯` at its end opens
 * the two things that differ from «open», moving it to another folder and
 * deleting it. Those unfold in place under the row through `?doc=<id>`, so
 * the page stays server rendered and a link to an open row opens the same
 * way for the next person.
 */

export type FolderGroup = { name: string; docs: Document[] }

/** The label the file was uploaded with, minus its extension. */
export function stem(name: string) {
  return name.replace(/\.[a-z0-9]{1,5}$/i, '')
}

/**
 * «PDF», from the name first and the mime type second. The name is what the
 * person chose and is almost always right; the mime type is what the browser
 * guessed on the way up.
 */
const BY_MIME: Record<string, string> = {
  'application/pdf': 'PDF',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PPTX',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'image/png': 'PNG',
  'image/jpeg': 'JPG',
}

export function fileType(doc: Pick<Document, 'name' | 'mime_type'>) {
  const dot = doc.name.lastIndexOf('.')
  if (dot > 0 && doc.name.length - dot <= 6) return doc.name.slice(dot + 1).toUpperCase()
  return (doc.mime_type && BY_MIME[doc.mime_type]) || 'FILE'
}

export function FilesFolders({
  groups,
  folders,
  titleById,
  openDoc,
  base,
}: {
  groups: FolderGroup[]
  /** Every folder a file could be moved to. */
  folders: string[]
  titleById: Map<string, string>
  /** The document whose actions are unfolded, from `?doc=`. */
  openDoc: string | undefined
  base: string
}) {
  return (
    <div className="panel max-w-[1120px]">
      {groups.map((g, i) => (
        <div key={g.name} className={`p-3.5 ${i > 0 ? 'border-t border-line' : ''}`}>
          <div className="flex items-center gap-3">
            <Folder size={20} strokeWidth={1} aria-hidden className="shrink-0 text-ink" />
            <span className="lbl text-ink">{g.name}</span>
          </div>

          <ul className="ml-8 mt-2.5 list-none p-0">
            {g.docs.map((d) => {
              const open = openDoc === d.id
              return (
                <li key={d.id} className="border-b border-line last:border-b-0">
                  <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1 py-2 hover:bg-hover">
                    <a
                      href={`/api/document/${d.id}`}
                      className="min-w-0 flex-1 basis-[240px] hover:text-green"
                    >
                      <div className="leading-normal">{stem(d.name)}</div>
                      <div className="mt-1 text-[12px] leading-snug text-muted">
                        {titleById.get(d.node_id) ?? ''}
                      </div>
                    </a>
                    <span className="micro whitespace-nowrap text-muted">
                      {fileType(d)} · {formatDate(d.created_at.slice(0, 10))}
                    </span>
                    <Link
                      href={open ? base : `${base}?doc=${d.id}`}
                      aria-label={open ? 'Close' : 'More'}
                      aria-expanded={open}
                      className="more"
                    >
                      ⋯
                    </Link>
                  </div>

                  {open && (
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line py-2.5 text-[13px]">
                      <form action={moveDocument} className="flex items-center gap-2.5">
                        <input type="hidden" name="id" value={d.id} />
                        <label className="flex items-center gap-2.5">
                          <span className="micro text-muted">Move to</span>
                          <select
                            name="folder"
                            defaultValue={d.folder ?? ''}
                            /* .field is 100 % wide and unlayered, so a utility cannot narrow it. */
                            className="field min-w-[180px]"
                            style={{ width: 'auto' }}
                          >
                            <option value="">Unfiled</option>
                            {folders.map((f) => (
                              <option key={f} value={f}>
                                {f}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button type="submit" className="act">
                          Move
                        </button>
                      </form>

                      <form action={deleteDocument}>
                        <input type="hidden" name="id" value={d.id} />
                        <input type="hidden" name="redirectTo" value={base} />
                        <button type="submit" className="act text-rust">
                          Delete
                        </button>
                      </form>

                      <span className="text-[12px] text-muted">
                        {d.size_bytes === null ? '' : `${Math.round(d.size_bytes / 1024)} kB`}
                      </span>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}
