import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { QueryFailure, firstError } from '@/lib/failure'
import { subtreeSet } from '@/lib/subtree'
import { formatMoney } from '@/lib/cost'
import { formatDate } from '@/components/ui'
import { FilesUpload } from '@/components/files-upload'
import { FilesFolders, stem, type FolderGroup } from '@/components/files-folders'
import { FilesTree, type TreeNode } from '@/components/files-tree'
import type { Document, Node, NodeCost } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Files' }

/**
 * Files: the paper a project has collected, and where it sits.
 *
 * The concept draws two columns inside the shell. The work area holds the
 * toolbar, the folders that hold something, and the project drawn as a tree
 * so a file's node can be found in it. The rail answers the two questions
 * asked of a pile of paper: what came in last, and what money stands behind
 * it. Nothing here is typed except the upload; the rest is read.
 */
const UNFILED = 'Unfiled'

export default async function FilesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ doc?: string }>
}) {
  const { id } = await params
  const { doc: openDoc } = await searchParams
  const supabase = await createClient()
  const base = `/p/${id}/dokumenter`

  /*
   * One round trip. Asking which nodes sit underneath and only then filtering
   * by the answer costs a second wait for nothing at this size.
   */
  const [projectRes, nodesRes, docRes, costRes] = await Promise.all([
    supabase.from('node').select('*').eq('id', id).single(),
    supabase.from('node').select('id, parent_id, title, type').order('sort_order'),
    supabase.from('document').select('*').order('created_at', { ascending: false }),
    supabase.from('v_node_cost').select('*').eq('node_id', id).maybeSingle(),
  ])

  /*
   * The project itself is left to notFound() below. `.single()` reports a row
   * that is not there as an error, and a project you are not a member of is
   * exactly that. The other three are the hole worth closing: a failed read
   * renders an empty folder list, and a project with no files looks identical
   * to a project whose files could not be read.
   */
  const failure = firstError([nodesRes, docRes, costRes])
  if (failure) return <QueryFailure message={failure} />

  const project = projectRes.data as Node | null
  if (!project) notFound()

  // Fetched whole, cut here. See lib/subtree.
  const everyNode = (nodesRes.data ?? []) as TreeNode[]
  const inProject = subtreeSet(everyNode, id)
  const nodes = everyNode.filter((n) => inProject.has(n.id))
  const titleById = new Map(nodes.map((n) => [n.id, n.title]))

  const documents = ((docRes.data ?? []) as Document[]).filter((d) => inProject.has(d.node_id))

  /*
   * Only the folders that hold something. A folder is a label on a row, so
   * one with nothing in it is not a thing the page can show; the skeleton is
   * where files are put, not what the page lists.
   */
  const byFolder = new Map<string, Document[]>()
  for (const d of documents) {
    const key = d.folder ?? UNFILED
    byFolder.set(key, [...(byFolder.get(key) ?? []), d])
  }
  const groups: FolderGroup[] = [...byFolder.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, docs]) => ({ name, docs }))

  const skeleton = Array.isArray(project.reporting?.folders)
    ? (project.reporting.folders as unknown[]).filter((f): f is string => typeof f === 'string')
    : []
  const used = [...byFolder.keys()].filter((f) => f !== UNFILED)
  const folders = [...new Set([...skeleton, ...used])].sort()

  const summary =
    `${documents.length} file${documents.length === 1 ? '' : 's'} · ` +
    `${groups.length} folder${groups.length === 1 ? '' : 's'}`

  /*
   * The money. Everything rolled up is euro, whatever a line was quoted in,
   * and the view may hold no row at all for a project with no lines, which is
   * the same as zero here.
   */
  const cost = (costRes.data ?? null) as NodeCost | null
  const priced = Number(cost?.once_priced ?? 0)
  const committed = Number(cost?.once_committed ?? 0)
  const withPaper = Number(cost?.once_with_paper ?? 0)
  const running = Number(cost?.annual_priced ?? 0)
  const eur = (n: number) => formatMoney(n, 'EUR')

  const recent = [...documents].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_400px] 2xl:grid-cols-[minmax(0,1fr)_460px]">
      <div className="work min-w-0 px-5 py-7 lg:px-8">
        <FilesUpload
          nodeId={project.id}
          folders={folders}
          defaultFolder={skeleton[0] ?? ''}
          summary={summary}
        />

        {groups.length === 0 ? (
          <p className="grp-gap prose-measure text-[13px] text-muted">
            Nothing is attached yet. Upload puts the first file here, under the folder
            you give it.
          </p>
        ) : (
          <div className="grp-gap">
            <FilesFolders
              groups={groups}
              folders={folders}
              titleById={titleById}
              openDoc={openDoc}
              base={base}
            />
          </div>
        )}

        <p className="grp-gap prose-measure text-[12px] text-muted">
          {skeleton.length === 0
            ? 'Only the folders that hold something are shown. The numbered skeleton is not set up on this project, so there is nothing standing empty and waiting.'
            : `Only the folders that hold something are shown. The numbered skeleton has ${skeleton.length} folder${skeleton.length === 1 ? '' : 's'}, and the empty ones wait in the upload form.`}
        </p>

        <h2 className="sec-gap text-[17px] font-semibold tracking-[-0.025em]">Where it sits</h2>
        <FilesTree project={project} nodes={nodes} />
      </div>

      <div className="min-w-0 border-t border-line px-5 py-7 lg:px-8 xl:border-l xl:border-t-0">
        <h2 className="text-[15px] font-semibold tracking-[-0.02em]">Recently added</h2>
        {recent.length === 0 ? (
          <p className="grp-gap text-[13px] text-muted">Nothing added yet.</p>
        ) : (
          <div className="panel panel-list grp-gap">
            {recent.map((d) => (
              <div key={d.id} className="flex items-start gap-3">
                <span className="mono w-[1.1em] shrink-0 text-center text-muted">·</span>
                <div className="min-w-0 flex-1">
                  <a href={`/api/document/${d.id}`} className="block leading-normal hover:text-green">
                    {stem(d.name)}
                  </a>
                  <div className="mt-1 text-[12px] leading-snug text-muted">
                    {d.folder ?? UNFILED} · {Math.round((d.size_bytes ?? 0) / 1024)} kB
                  </div>
                </div>
                <span className="mono shrink-0 pt-0.5 text-[9.5px] uppercase tracking-[0.1em] text-muted">
                  {formatDate(d.created_at.slice(0, 10))}
                </span>
              </div>
            ))}
          </div>
        )}

        <h2 className="sec-gap text-[15px] font-semibold tracking-[-0.02em]">
          Money behind the paper
        </h2>
        <div className="panel grp-gap">
          <table className="tbl">
            <tbody>
              <tr>
                <td className="grow">Priced</td>
                <td className={`num text-right ${priced > 0 ? '' : 'text-rust'}`}>
                  {priced > 0 ? eur(priced) : 'Nothing recorded'}
                </td>
              </tr>
              <tr>
                <td className="grow">Committed</td>
                <td className={`num text-right ${committed > 0 ? '' : 'text-rust'}`}>
                  {committed > 0 ? eur(committed) : 'Nothing recorded'}
                </td>
              </tr>
              <tr>
                <td className="grow text-muted">With a document behind it</td>
                <td className={`num text-right ${withPaper > 0 ? '' : 'text-muted'}`}>
                  {withPaper > 0 ? eur(withPaper) : '-'}
                </td>
              </tr>
              <tr>
                <td className="grow text-muted">Running cost a year</td>
                <td className={`num text-right ${running > 0 ? '' : 'text-muted'}`}>
                  {running > 0 ? eur(running) : '-'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="grp-gap text-[12px] leading-relaxed text-muted">
          {priced > 0
            ? `${eur(withPaper)} of the ${eur(priced)} priced has a file behind it. The lines themselves live on Economics.`
            : documents.length > 0
              ? `${documents.length} file${documents.length === 1 ? ' is' : 's are'} attached and none has a price on it. Rust here means a person has to type one, not that anything is wrong.`
              : 'Nothing is attached and nothing is priced. Rust here means a person has to type a figure, not that anything is wrong.'}
        </p>
      </div>
    </div>
  )
}
