<script setup lang="ts">
/**
 * Git 提交图视图（CLAUDE.md §6.3）。分层：布局层（layout.ts 纯函数）→ 结构层（节点/边，以 commit id 为
 * key 的 D3 join）→ 引用层（branch/tag/HEAD 标签）→ 化身层（M1 用 HEAD 标记占位）。
 *
 * <p>M1 只打两个地基：布局确定性、节点 key 稳定。动画属 P2，此处不做（§6.3 分期落地）。
 */
import { ref, watch, onMounted } from 'vue'
import * as d3 from 'd3'
import type { GitGraph } from '@/types/gitGraph'
import { layoutGraph, NODE_RADIUS, type LaidCommit, type LaidEdge } from './layout'

const props = defineProps<{ graph: GitGraph | null }>()

const svgRef = ref<SVGSVGElement | null>(null)

const EDGE_COLOR = '#9aa5b1'
const NODE_FILL = '#2f80ed'
const HEAD_ACCENT = '#eb5757'
const BRANCH_FILL = '#e8f0fe'

interface RefTag {
  key: string
  label: string
  isHead: boolean
  x: number
  y: number
}

function buildRefTags(graph: GitGraph, positions: Map<string, { x: number; y: number }>): RefTag[] {
  const tags: RefTag[] = []
  const stackByCommit = new Map<string, number>()
  const place = (target: string): { x: number; y: number } | null => {
    const pos = positions.get(target)
    if (!pos) return null
    const stack = stackByCommit.get(target) ?? 0
    stackByCommit.set(target, stack + 1)
    return { x: pos.x + NODE_RADIUS + 14 + stack * 84, y: pos.y }
  }

  for (const b of graph.branches) {
    if (!b.target) continue
    const at = place(b.target)
    if (!at) continue
    const isHead = graph.head.type === 'branch' && graph.head.ref === b.name
    tags.push({ key: `branch:${b.name}`, label: isHead ? `HEAD → ${b.name}` : b.name, isHead, x: at.x, y: at.y })
  }
  for (const t of graph.tags) {
    if (!t.target) continue
    const at = place(t.target)
    if (!at) continue
    tags.push({ key: `tag:${t.name}`, label: `🏷 ${t.name}`, isHead: false, x: at.x, y: at.y })
  }
  // detached HEAD：化身离开分支标签，独立站在该提交上（§6.3）
  if (graph.head.type === 'detached') {
    const at = place(graph.head.ref)
    if (at) tags.push({ key: 'head:detached', label: 'HEAD', isHead: true, x: at.x, y: at.y })
  }
  return tags
}

function render(): void {
  const svgEl = svgRef.value
  if (!svgEl) return
  const svg = d3.select(svgEl)
  const graph = props.graph

  if (!graph || graph.commits.length === 0) {
    svg.selectAll('*').remove()
    svg.attr('width', 0).attr('height', 0)
    return
  }

  const layout = layoutGraph(graph)
  svg.attr('width', layout.width).attr('height', layout.height)

  const gEdges = ensureGroup(svg, 'edges')
  const gNodes = ensureGroup(svg, 'nodes')
  const gRefs = ensureGroup(svg, 'refs')

  // 结构层：边（key = 边 id）
  gEdges
    .selectAll<SVGLineElement, LaidEdge>('line.edge')
    .data(layout.edges, (d) => d.id)
    .join(
      (enter) => enter.append('line').attr('class', 'edge').attr('stroke', EDGE_COLOR).attr('stroke-width', 2),
      (update) => update,
      (exit) => exit.remove(),
    )
    .attr('x1', (d) => d.x1)
    .attr('y1', (d) => d.y1)
    .attr('x2', (d) => d.x2)
    .attr('y2', (d) => d.y2)

  // 结构层：节点（key = commit id，禁止依赖数组下标——§6.3）
  const node = gNodes
    .selectAll<SVGGElement, LaidCommit>('g.commit')
    .data(layout.nodes, (d) => d.id)
    .join((enter) => {
      const g = enter.append('g').attr('class', 'commit')
      g.append('circle').attr('r', NODE_RADIUS).attr('fill', NODE_FILL)
      g.append('text').attr('class', 'seq').attr('text-anchor', 'middle').attr('dy', '0.35em')
        .attr('fill', '#fff').attr('font-size', 11)
      g.append('text').attr('class', 'msg').attr('x', NODE_RADIUS + 10).attr('dy', '0.35em')
        .attr('fill', '#4a4a4a').attr('font-size', 12)
      return g
    })

  node.attr('transform', (d) => `translate(${d.x},${d.y})`)
  node.select('text.seq').text((d) => d.seq)
  node.select('text.msg').text((d) => truncate(d.message, 28))

  // 引用层 + 化身层占位：branch / tag / HEAD 标签（key = ref key）
  const ref = gRefs
    .selectAll<SVGGElement, RefTag>('g.ref')
    .data(buildRefTags(graph, layout.positions), (d) => d.key)
    .join((enter) => {
      const g = enter.append('g').attr('class', 'ref')
      g.append('rect').attr('rx', 4).attr('height', 20).attr('y', -10)
      g.append('text').attr('dy', '0.35em').attr('x', 8).attr('font-size', 11)
      return g
    })

  ref.attr('transform', (d) => `translate(${d.x},${d.y})`)
  ref.select('rect')
    .attr('width', (d) => d.label.length * 7 + 16)
    .attr('fill', (d) => (d.isHead ? HEAD_ACCENT : BRANCH_FILL))
  ref.select('text')
    .attr('fill', (d) => (d.isHead ? '#fff' : '#2f80ed'))
    .text((d) => d.label)
}

function ensureGroup(
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
  name: string,
): d3.Selection<SVGGElement, unknown, null, undefined> {
  let g = svg.select<SVGGElement>(`g.layer-${name}`)
  if (g.empty()) {
    g = svg.append('g').attr('class', `layer-${name}`)
  }
  return g
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

onMounted(render)
watch(() => props.graph, render, { deep: true })
</script>

<template>
  <div class="graph-view">
    <svg ref="svgRef" class="graph-svg"></svg>
    <div v-if="!props.graph || props.graph.commits.length === 0" class="graph-empty">
      空仓库 · 运行 <code>git init</code> 后 <code>touch</code> / <code>git add</code> / <code>git commit</code> 看提交生长
    </div>
  </div>
</template>

<style scoped>
.graph-view {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: auto;
  background: #fbfcfe;
}
.graph-svg {
  display: block;
}
.graph-empty {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: #98a2b3;
  font-size: 13px;
  text-align: center;
  white-space: nowrap;
}
.graph-empty code {
  background: #eef1f5;
  padding: 1px 5px;
  border-radius: 3px;
  color: #566;
}
</style>
