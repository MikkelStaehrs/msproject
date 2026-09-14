import {
  childrenByParent,
  descendantIds,
  projectOf,
  subtreeIds,
  subtreeSet,
} from './subtree.ts'

let failed = 0
function check(name: string, got: unknown, expected: unknown) {
  if (JSON.stringify(got) === JSON.stringify(expected)) console.log(`ok    ${name}`)
  else {
    failed++
    console.log(`FAIL  ${name}\n      expected: ${JSON.stringify(expected)}\n      got:      ${JSON.stringify(got)}`)
  }
}

const nodes = [
  { id: 'root', parent_id: null },
  { id: 'a', parent_id: 'root' },
  { id: 'a1', parent_id: 'a' },
  { id: 'a1x', parent_id: 'a1' },
  { id: 'b', parent_id: 'root' },
  { id: 'other', parent_id: null },
]

// v_node_descendant includes the root at depth zero, so this has to as well or
// a caller swapping one for the other would silently lose a row.
check('the root is part of its own subtree', subtreeIds(nodes, 'root'), [
  'root', 'a', 'a1', 'a1x', 'b',
])
check('a branch is only its own branch', subtreeIds(nodes, 'a'), ['a', 'a1', 'a1x'])
check('a leaf is just itself', subtreeIds(nodes, 'a1x'), ['a1x'])
check('another root is not included', subtreeIds(nodes, 'root').includes('other'), false)
check('an unknown id gives just itself', subtreeIds(nodes, 'ghost'), ['ghost'])

check('descendants leave the node out', descendantIds(nodes, 'a'), ['a1', 'a1x'])
check('a leaf has no descendants', descendantIds(nodes, 'b'), [])

check('the set is the same members', [...subtreeSet(nodes, 'a')].sort(), ['a', 'a1', 'a1x'])

check('children come in the order given', childrenByParent(nodes).get('root')?.map((n) => n.id), ['a', 'b'])
check('a leaf has no children entry', childrenByParent(nodes).has('a1x'), false)
check('roots are not children of anything', childrenByParent(nodes).has('null'), false)

// --- Which project a node belongs to ----------------------------------------
/*
 * Four pages built this by hand and each paid a round trip to
 * v_node_descendant for it. Every depth is covered here because the memoising
 * walk is the only interesting part: a1x is three levels down and must land on
 * root, not on a1.
 */
const roots = projectOf(nodes)
check('a root is its own project', roots.get('root'), 'root')
check('a child belongs to the root', roots.get('a'), 'root')
check('and so does a grandchild', roots.get('a1'), 'root')
check('and a great grandchild', roots.get('a1x'), 'root')
check('a second root does not absorb the first', roots.get('other'), 'other')
check('every node is accounted for', roots.size, nodes.length)

/*
 * RLS can show a child whose parent it will not show, because a child is
 * visible only when its project is. Walking up then runs out of tree, and the
 * node maps to itself rather than to undefined: a link built from this goes
 * somewhere rather than nowhere.
 */
const orphaned = projectOf([{ id: 'lost', parent_id: 'invisible' }])
check('a node whose parent is not visible maps to itself', orphaned.get('lost'), 'lost')

console.log(failed === 0 ? '\nAll tests passed.' : `\n${failed} test(s) failed.`)
process.exitCode = failed === 0 ? 0 : 1
