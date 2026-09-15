import { childrenByParent } from '@/lib/subtree'

/**
 * The project drawn as a hairline tree: the project, its direct parts across,
 * and each part's children down a stem. Perpendicular bends only, no boxes,
 * no arrows, the type in micro above the name. The same drawing the concept
 * uses for «Where it sits», which is why it stops at two levels: it says
 * where a file's node hangs, not everything the project contains.
 *
 * It is one finished drawing scaled as a whole (§11), so the bends keep
 * meeting the middle of their labels at any width. The viewBox grows with
 * the number of parts rather than squeezing them, because two labels drawn
 * over each other say less than one.
 */

export type TreeNode = {
  id: string
  parent_id: string | null
  title: string
  type: string
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

export function FilesTree({ project, nodes }: { project: TreeNode; nodes: TreeNode[] }) {
  const kids = childrenByParent(nodes)
  const top = kids.get(project.id) ?? []
  const deepest = Math.max(1, ...top.map((t) => (kids.get(t.id) ?? []).length))

  const colW = 170
  const W = Math.max(680, colW * top.length)
  const H = 120 + 22 * deepest
  const mid = W / 2
  const xs = top.map((_, i) => Math.round((W / Math.max(top.length, 1)) * i + W / Math.max(top.length, 1) / 2))

  return (
    <div className="panel grp-gap max-w-[760px] p-3.5">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="The project drawn as a hairline tree"
        className="h-auto w-full max-w-[720px] stroke-line-strong"
        style={{ strokeWidth: 1, fill: 'none' }}
      >
        <text x={mid - 120} y={14} className="micro fill-muted stroke-none text-[9px]">
          {project.type.toUpperCase()}
        </text>
        <text x={mid - 120} y={31} className="font-sans fill-ink stroke-none text-[12px]">
          {clip(project.title, 44)}
        </text>

        {top.length > 0 && <line x1={mid} y1={40} x2={mid} y2={56} />}
        {xs.length > 1 && <line x1={xs[0]} y1={56} x2={xs[xs.length - 1]} y2={56} />}

        {top.map((t, i) => {
          const x = xs[i]
          const below = kids.get(t.id) ?? []
          return (
            <g key={t.id}>
              <line x1={x} y1={56} x2={x} y2={72} />
              <text x={x - 40} y={86} className="micro fill-muted stroke-none text-[9px]">
                {t.type.toUpperCase()}
              </text>
              <text x={x - 40} y={102} className="font-sans fill-ink stroke-none text-[12px]">
                {clip(t.title, 26)}
              </text>
              {below.length > 0 && (
                <line x1={x - 30} y1={110} x2={x - 30} y2={110 + 22 * below.length - 10} />
              )}
              {below.map((k, j) => {
                const y = 110 + 22 * j + 12
                return (
                  <g key={k.id}>
                    <line x1={x - 30} y1={y} x2={x - 16} y2={y} />
                    <text x={x - 10} y={y + 4} className="font-sans fill-ink stroke-none text-[12px]">
                      {clip(k.title, 24)}
                    </text>
                  </g>
                )
              })}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
