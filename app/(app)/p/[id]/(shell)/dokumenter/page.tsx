import { notFound } from 'next/navigation'
import { ProjectFrame } from '@/components/project-frame'
import { createClient } from '@/lib/supabase/server'
import { QueryFailure, firstError } from '@/lib/failure'
import { subtreeSet } from '@/lib/subtree'
import { DocumentPanel } from '@/components/document-panel'
import type { Document, Node } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function DocumentsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const base = `/p/${id}/dokumenter`

  /*
   * One round trip. Asking which nodes sit underneath and only then filtering
   * by the answer costs a second wait for nothing at this size.
   */
  const [projectRes, titlesRes, docRes] = await Promise.all([
    supabase.from('node').select('*').eq('id', id).single(),
    supabase.from('node').select('id, parent_id, title'),
    supabase
      .from('document')
      .select('*')
      
      .order('created_at', { ascending: false }),
  ])

  /*
   * The project itself is left to notFound() below rather than checked here.
   * `.single()` reports a row that is not there as an error, and a project you
   * are not a member of is exactly that, so folding it in would answer «the
   * database is not answering as expected» to what is really a 404.
   *
   * The other two are the hole worth closing: a failed read of either renders
   * an empty folder list, and a project with no files looks identical to a
   * project whose files could not be read.
   */
  const failure = firstError([titlesRes, docRes])
  if (failure) return <QueryFailure message={failure} />

  const project = projectRes.data as Node | null
  if (!project) notFound()

  // Fetched whole, cut here. See lib/subtree.
  const everyNode = (titlesRes.data ?? []) as {
    id: string
    parent_id: string | null
    title: string
  }[]
  const inProject = subtreeSet(everyNode, id)

  const documents = ((docRes.data ?? []) as Document[]).filter((d) =>
    inProject.has(d.node_id),
  )
  const titleById = new Map(
    everyNode.filter((n) => inProject.has(n.id)).map((n) => [
      n.id,
      n.title,
    ]),
  )

  return (
    <ProjectFrame projectId={id} frameNodeId={id}>
    <div className="px-5 lg:px-10 py-7">
      <DocumentPanel
        nodeId={project.id}
        documents={documents}
        folders={
          Array.isArray(project.reporting?.folders)
            ? (project.reporting.folders as string[])
            : []
        }
        titleById={titleById}
        redirectTo={base}
      />
    </div>
    </ProjectFrame>
  )
}
