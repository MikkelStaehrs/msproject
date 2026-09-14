/**
 * Walking the tree in memory, so a page does not have to ask the database
 * where its own children are.
 *
 * v_node_descendant is the right answer in SQL, where a view joins against it
 * and Postgres does the work in one pass. It is the wrong answer as a separate
 * round trip: every page was fetching the id list first and only then issuing
 * the queries that filter by it, which turns one wait into two. On a project
 * page that happened three times, once for the tree, once for the frame and
 * once more when an edit form was open, and each cost about a tenth of a
 * second of doing nothing.
 *
 * The whole portfolio is a few dozen rows. Fetching it and walking it here is
 * free by comparison.
 */

export type Parented = { id: string; parent_id: string | null }

/** Children by parent, in the order given. */
export function childrenByParent<T extends Parented>(nodes: T[]): Map<string, T[]> {
  const out = new Map<string, T[]>()
  for (const n of nodes) {
    if (n.parent_id === null) continue
    out.set(n.parent_id, [...(out.get(n.parent_id) ?? []), n])
  }
  return out
}

/**
 * A node and everything under it, the node itself first.
 *
 * Matches v_node_descendant, which includes the root at depth zero, so a caller
 * can swap one for the other without the set changing shape.
 */
export function subtreeIds(nodes: Parented[], rootId: string): string[] {
  const kids = childrenByParent(nodes)
  const out: string[] = []
  const walk = (nodeId: string) => {
    out.push(nodeId)
    for (const k of kids.get(nodeId) ?? []) walk(k.id)
  }
  walk(rootId)
  return out
}

/** The same, as a set, for the filtering that always follows. */
export function subtreeSet(nodes: Parented[], rootId: string): Set<string> {
  return new Set(subtreeIds(nodes, rootId))
}

/** Everything under a node, not counting the node. */
export function descendantIds(nodes: Parented[], rootId: string): string[] {
  return subtreeIds(nodes, rootId).slice(1)
}

/**
 * Which project every node belongs to: the root of its own branch.
 *
 * Four pages built this by hand, and each of them paid a round trip to
 * `v_node_descendant` for it, filtering the result down to the rows whose
 * `root_id` happens to be a root. That is the exact thing the top of this file
 * says is the wrong answer: the id list arrives first and only then can the
 * page use it, which turns one wait into two, for an answer already sitting in
 * the `node` rows the page has.
 *
 * Memoised on the way up, so a deep branch is walked once rather than once per
 * node on it. A node whose parent is missing - which RLS can produce, since a
 * child is visible only when its project is - maps to itself, so a link built
 * from this always goes somewhere rather than nowhere.
 */
export function projectOf(nodes: Parented[]): Map<string, string> {
  const parent = new Map(nodes.map((n) => [n.id, n.parent_id]))
  const root = new Map<string, string>()

  const find = (id: string): string => {
    const known = root.get(id)
    if (known !== undefined) return known

    const climbed: string[] = []
    let at: string = id
    for (;;) {
      const up = parent.get(at) ?? null
      if (up === null || !parent.has(up)) break
      climbed.push(at)
      const cached = root.get(up)
      if (cached !== undefined) {
        at = cached
        break
      }
      at = up
    }
    for (const seen of climbed) root.set(seen, at)
    root.set(id, at)
    return at
  }

  for (const n of nodes) find(n.id)
  return root
}
