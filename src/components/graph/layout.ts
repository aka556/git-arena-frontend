/**
 * 布局层（CLAUDE.md §6.3）：纯函数，GitGraph → 节点坐标。
 *
 * <p><b>确定性</b>：同一份 GitGraph 永远产出同一张图，不依赖任何渲染状态、不使用力导向。
 * 采用标准 git 泳道（lane）算法按 commit id 稳定分配列；M1 线性历史退化为单列。
 * 后端 commits 为最新在前（拓扑序），故行号 i 越小越新，最新在顶部。
 */
import type { GitGraph } from '@/types/gitGraph'

export const NODE_RADIUS = 16
export const ROW_HEIGHT = 64
export const COL_WIDTH = 56
export const PADDING = 32

export interface LaidCommit {
  id: string
  seq: string
  message: string
  author: string
  lane: number
  x: number
  y: number
}

export interface LaidEdge {
  id: string
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface GraphLayout {
  nodes: LaidCommit[]
  edges: LaidEdge[]
  width: number
  height: number
  /** commit id → 坐标，供引用层（分支/HEAD 标签）定位。 */
  positions: Map<string, { x: number; y: number; lane: number }>
}

function laneX(lane: number): number {
  return PADDING + lane * COL_WIDTH
}

function rowY(row: number): number {
  return PADDING + row * ROW_HEIGHT
}

export function layoutGraph(graph: GitGraph): GraphLayout {
  const commits = graph.commits
  const known = new Set(commits.map((c) => c.id))

  // lanes[k] = 该泳道当前"等待落位"的父提交 id（某个已放置的子提交指向它）
  const lanes: (string | null)[] = []
  const positions = new Map<string, { x: number; y: number; lane: number }>()
  const nodes: LaidCommit[] = []

  const firstFreeLane = (): number => {
    const idx = lanes.findIndex((x) => x === null)
    if (idx >= 0) return idx
    lanes.push(null)
    return lanes.length - 1
  }

  commits.forEach((c, row) => {
    // 找到为本提交预留的泳道（此前某子提交把它作为父登记）；没有则分配新泳道
    let lane = lanes.findIndex((x) => x === c.id)
    if (lane < 0) {
      lane = firstFreeLane()
    }
    // 释放其它同样指向本提交的重复预留（多个子提交汇入）
    for (let k = 0; k < lanes.length; k++) {
      if (k !== lane && lanes[k] === c.id) lanes[k] = null
    }

    const x = laneX(lane)
    const y = rowY(row)
    positions.set(c.id, { x, y, lane })
    nodes.push({ id: c.id, seq: c.seq, message: c.message, author: c.author, lane, x, y })

    // 本泳道沿首父延续；其余父（merge）另占泳道以对齐
    const firstParent = c.parents.length > 0 ? c.parents[0]! : null
    lanes[lane] = firstParent && known.has(firstParent) ? firstParent : null
    for (let p = 1; p < c.parents.length; p++) {
      const parent = c.parents[p]!
      if (known.has(parent) && lanes.indexOf(parent) < 0) {
        lanes[firstFreeLane()] = parent
      }
    }
  })

  // 边：子 → 每个已知父
  const edges: LaidEdge[] = []
  for (const c of commits) {
    const from = positions.get(c.id)
    if (!from) continue
    for (const parentId of c.parents) {
      const to = positions.get(parentId)
      if (!to) continue
      edges.push({ id: `${c.id}->${parentId}`, x1: from.x, y1: from.y, x2: to.x, y2: to.y })
    }
  }

  const laneCount = Math.max(1, lanes.length)
  const width = PADDING * 2 + (laneCount - 1) * COL_WIDTH + NODE_RADIUS * 2
  const height = PADDING * 2 + Math.max(0, commits.length - 1) * ROW_HEIGHT + NODE_RADIUS * 2

  return { nodes, edges, width, height, positions }
}
