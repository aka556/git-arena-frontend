<script setup lang="ts">
/**
 * Git 提交图视图（CLAUDE.md §6.3）。确定性布局只提供锚点；玩家图的拖动、弹性连线和缩放
 * 都是渲染层的临时状态，不会写回 GitGraph 快照。目标图默认保持只读。
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as d3 from 'd3'
import type { GitGraph } from '@/types/gitGraph'
import {
  layoutGraph,
  NODE_RADIUS,
  type GraphLayout,
  type LaidCommit,
  type LaidEdge,
} from './layout'

const props = withDefaults(defineProps<{
  graph: GitGraph | null
  /** 仅当前玩家图开启节点拖动、画布平移、滚轮缩放与双击复位。 */
  interactive?: boolean
  /** 在固定容器内完整展示图，供浮动目标卡片使用。 */
  fit?: boolean
}>(), {
  interactive: false,
  fit: false,
})

interface Point {
  x: number
  y: number
}

interface Velocity {
  x: number
  y: number
}

interface EdgeMotion {
  c1: Point
  c2: Point
  v1: Velocity
  v2: Velocity
}

interface RefTag {
  key: string
  label: string
  isHead: boolean
  remote?: boolean
  x: number
  y: number
}

const EDGE_COLOR = '#78889b'
const NODE_FILL = '#2f80ed'
const HEAD_ACCENT = '#e25555'
const BRANCH_FILL = '#e8f0fe'
const REMOTE_FILL = '#fff1e6'
const REMOTE_TEXT = '#b55320'

const svgRef = ref<SVGSVGElement | null>(null)
const visualPositions = new Map<string, Point>()
const anchorPositions = new Map<string, Point>()
const nodeVelocities = new Map<string, Velocity>()
const edgeMotions = new Map<string, EdgeMotion>()
const edgeOffsets = new Map<string, number>()

let graphState: GitGraph | null = null
let layoutState: GraphLayout | null = null
let zoomBehavior: d3.ZoomBehavior<SVGSVGElement, unknown> | null = null
let resizeObserver: ResizeObserver | null = null
let frameId: number | null = null
let draggingNodeId: string | null = null
let canvasWidth = 0
let canvasHeight = 0
let reduceMotion = false

function buildRefTags(graph: GitGraph, positions: Map<string, Point>): RefTag[] {
  const tags: RefTag[] = []
  const stackByCommit = new Map<string, number>()
  const place = (target: string): Point | null => {
    const pos = positions.get(target)
    if (!pos) return null
    const stack = stackByCommit.get(target) ?? 0
    stackByCommit.set(target, stack + 1)
    return { x: pos.x + NODE_RADIUS + 14 + stack * 84, y: pos.y }
  }

  for (const branch of graph.branches) {
    if (!branch.target) continue
    const at = place(branch.target)
    if (!at) continue
    const isHead = graph.head.type === 'branch' && graph.head.ref === branch.name
    tags.push({
      key: `branch:${branch.name}`,
      label: isHead ? `HEAD → ${branch.name}` : branch.name,
      isHead,
      x: at.x,
      y: at.y,
    })
  }
  for (const tag of graph.tags) {
    if (!tag.target) continue
    const at = place(tag.target)
    if (!at) continue
    tags.push({ key: `tag:${tag.name}`, label: `tag: ${tag.name}`, isHead: false, x: at.x, y: at.y })
  }
  for (const remote of graph.remotes) {
    for (const branch of remote.branches) {
      if (!branch.target) continue
      const at = place(branch.target)
      if (!at) continue
      tags.push({
        key: `remote:${remote.name}/${branch.name}`,
        label: `${remote.name}/${branch.name}`,
        isHead: false,
        remote: true,
        x: at.x,
        y: at.y,
      })
    }
  }
  if (graph.head.type === 'detached') {
    const at = place(graph.head.ref)
    if (at) tags.push({ key: 'head:detached', label: 'HEAD', isHead: true, x: at.x, y: at.y })
  }
  return tags
}

function setupInteraction(): void {
  const svgEl = svgRef.value
  if (!svgEl) return

  const svg = d3.select(svgEl)
  svg.on('.zoom', null).on('dblclick.reset', null)
  zoomBehavior = null

  if (!props.interactive) {
    svg.classed('panning dragging-node', false)
    return
  }

  zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.68, 2.5])
    .filter((event) => {
      if (event.type === 'wheel') return true
      const target = event.target
      return !(target instanceof Element && target.closest('g.commit'))
    })
    .wheelDelta((event) => {
      const unit = event.deltaMode === 1 ? 0.045 : event.deltaMode === 2 ? 0.6 : 0.0014
      return -event.deltaY * unit * (event.ctrlKey ? 5 : 1)
    })
    .on('start', (event) => {
      if (event.sourceEvent?.type !== 'wheel') svg.classed('panning', true)
    })
    .on('zoom', (event) => {
      svg.select<SVGGElement>('g.layer-viewport').attr('transform', event.transform.toString())
    })
    .on('end', () => svg.classed('panning', false))

  svg
    .call(zoomBehavior)
    .on('dblclick.zoom', null)
    .on('dblclick.reset', () => resetView())
}

function setupNodeDrag(node: d3.Selection<SVGGElement, LaidCommit, SVGGElement, unknown>): void {
  node.on('.drag', null)
  if (!props.interactive) return

  const drag = d3.drag<SVGGElement, LaidCommit>()
    .filter((event) => event.button === 0)
    .subject((_event, datum) => visualPositions.get(datum.id) ?? { x: datum.x, y: datum.y })
    .on('start', function (event, datum) {
      event.sourceEvent?.stopPropagation()
      draggingNodeId = datum.id
      nodeVelocities.set(datum.id, { x: 0, y: 0 })
      d3.select(this).classed('is-dragging', true)
      d3.select(svgRef.value).classed('dragging-node', true)
      kickMotion()
    })
    .on('drag', (event, datum) => {
      const point = visualPositions.get(datum.id)
      if (!point) return
      point.x = clamp(event.x, NODE_RADIUS + 8, canvasWidth - NODE_RADIUS - 8)
      point.y = clamp(event.y, NODE_RADIUS + 8, canvasHeight - NODE_RADIUS - 8)
      updateScene()
      kickMotion()
    })
    .on('end', function () {
      d3.select(this).classed('is-dragging', false)
      draggingNodeId = null
      d3.select(svgRef.value).classed('dragging-node', false)
      kickMotion()
    })

  node.call(drag)
}

function resetView(): void {
  draggingNodeId = null
  for (const velocity of nodeVelocities.values()) {
    velocity.x = 0
    velocity.y = 0
  }
  kickMotion()

  const svgEl = svgRef.value
  if (svgEl && zoomBehavior) {
    d3.select(svgEl)
      .transition()
      .duration(reduceMotion ? 0 : 320)
      .ease(d3.easeCubicOut)
      .call(zoomBehavior.transform, d3.zoomIdentity)
  }
}

function syncMotionLayout(graph: GitGraph, layout: GraphLayout, animateEntries: boolean): void {
  const activeIds = new Set(layout.nodes.map((node) => node.id))
  const commits = new Map(graph.commits.map((commit) => [commit.id, commit]))

  for (const node of layout.nodes) {
    anchorPositions.set(node.id, { x: node.x, y: node.y })
    if (!visualPositions.has(node.id)) {
      if (!animateEntries) {
        visualPositions.set(node.id, { x: node.x, y: node.y })
      } else {
        const firstParent = commits.get(node.id)?.parents[0]
        const parentPosition = firstParent ? visualPositions.get(firstParent) : undefined
        visualPositions.set(node.id, parentPosition
          ? { x: parentPosition.x, y: parentPosition.y }
          : { x: node.x, y: node.y })
      }
    }
    if (!nodeVelocities.has(node.id)) nodeVelocities.set(node.id, { x: 0, y: 0 })
  }

  for (const id of [...visualPositions.keys()]) {
    if (activeIds.has(id)) continue
    visualPositions.delete(id)
    anchorPositions.delete(id)
    nodeVelocities.delete(id)
  }

  buildEdgeOffsets(layout.edges)
  const activeEdges = new Set(layout.edges.map((edge) => edge.id))
  for (const edge of layout.edges) {
    if (edgeMotions.has(edge.id)) continue
    const target = desiredControls(edge)
    edgeMotions.set(edge.id, {
      c1: { ...target.c1 },
      c2: { ...target.c2 },
      v1: { x: 0, y: 0 },
      v2: { x: 0, y: 0 },
    })
  }
  for (const id of [...edgeMotions.keys()]) {
    if (!activeEdges.has(id)) edgeMotions.delete(id)
  }
}

function buildEdgeOffsets(edges: LaidEdge[]): void {
  edgeOffsets.clear()
  const sourceGroups = d3.group(edges, (edge) => edge.source)
  const targetGroups = d3.group(edges, (edge) => edge.target)

  for (const group of [...sourceGroups.values(), ...targetGroups.values()]) {
    if (group.length < 2) continue
    const sorted = [...group].sort((a, b) => a.id.localeCompare(b.id))
    sorted.forEach((edge, index) => {
      const offset = (index - (sorted.length - 1) / 2) * 9
      edgeOffsets.set(edge.id, (edgeOffsets.get(edge.id) ?? 0) + offset)
    })
  }
}

function desiredControls(edge: LaidEdge): { c1: Point; c2: Point } {
  const source = visualPositions.get(edge.source) ?? { x: edge.x1, y: edge.y1 }
  const target = visualPositions.get(edge.target) ?? { x: edge.x2, y: edge.y2 }
  const dx = target.x - source.x
  const dy = target.y - source.y
  const length = Math.max(1, Math.hypot(dx, dy))
  const normalX = -dy / length
  const normalY = dx / length
  const laneBend = Math.sign(dx) * Math.min(28, Math.abs(dx) * 0.18)
  const bend = laneBend + (edgeOffsets.get(edge.id) ?? 0)

  return {
    c1: {
      x: source.x + dx * 0.34 + normalX * bend,
      y: source.y + dy * 0.34 + normalY * bend,
    },
    c2: {
      x: source.x + dx * 0.66 + normalX * bend,
      y: source.y + dy * 0.66 + normalY * bend,
    },
  }
}

function edgePath(edge: LaidEdge): string {
  const source = visualPositions.get(edge.source) ?? { x: edge.x1, y: edge.y1 }
  const target = visualPositions.get(edge.target) ?? { x: edge.x2, y: edge.y2 }
  const motion = edgeMotions.get(edge.id)
  const controls = motion ?? desiredControls(edge)
  return [
    `M${source.x.toFixed(2)},${source.y.toFixed(2)}`,
    `C${controls.c1.x.toFixed(2)},${controls.c1.y.toFixed(2)}`,
    `${controls.c2.x.toFixed(2)},${controls.c2.y.toFixed(2)}`,
    `${target.x.toFixed(2)},${target.y.toFixed(2)}`,
  ].join(' ')
}

function stepMotion(): boolean {
  const layout = layoutState
  if (!layout) return false
  let moving = false

  for (const node of layout.nodes) {
    if (node.id === draggingNodeId) continue
    const point = visualPositions.get(node.id)
    const target = anchorPositions.get(node.id)
    const velocity = nodeVelocities.get(node.id)
    if (!point || !target || !velocity) continue
    moving = springPoint(point, velocity, target, 0.13, 0.7) || moving
  }

  for (const edge of layout.edges) {
    const motion = edgeMotions.get(edge.id)
    if (!motion) continue
    const target = desiredControls(edge)
    moving = springPoint(motion.c1, motion.v1, target.c1, 0.16, 0.72) || moving
    moving = springPoint(motion.c2, motion.v2, target.c2, 0.16, 0.72) || moving
  }

  return moving
}

function springPoint(
  point: Point,
  velocity: Velocity,
  target: Point,
  stiffness: number,
  damping: number,
): boolean {
  const dx = target.x - point.x
  const dy = target.y - point.y
  velocity.x = (velocity.x + dx * stiffness) * damping
  velocity.y = (velocity.y + dy * stiffness) * damping
  point.x += velocity.x
  point.y += velocity.y

  const settled = Math.abs(dx) + Math.abs(dy) < 0.08
    && Math.abs(velocity.x) + Math.abs(velocity.y) < 0.08
  if (settled) {
    point.x = target.x
    point.y = target.y
    velocity.x = 0
    velocity.y = 0
  }
  return !settled
}

function kickMotion(): void {
  if (frameId !== null) return
  if (reduceMotion) {
    for (const [id, anchor] of anchorPositions) {
      const point = visualPositions.get(id)
      if (point) Object.assign(point, anchor)
    }
    for (const edge of layoutState?.edges ?? []) {
      const controls = desiredControls(edge)
      const motion = edgeMotions.get(edge.id)
      if (motion) {
        Object.assign(motion.c1, controls.c1)
        Object.assign(motion.c2, controls.c2)
      }
    }
    updateScene()
    return
  }

  const tick = () => {
    frameId = null
    const moving = stepMotion()
    updateScene()
    if (moving || draggingNodeId) frameId = requestAnimationFrame(tick)
  }
  frameId = requestAnimationFrame(tick)
}

function updateScene(): void {
  const svgEl = svgRef.value
  const layout = layoutState
  const graph = graphState
  if (!svgEl || !layout || !graph) return
  const svg = d3.select(svgEl)

  svg.select<SVGGElement>('g.layer-edges')
    .selectAll<SVGPathElement, LaidEdge>('path.edge:not(.ghost)')
    .attr('d', edgePath)

  svg.select<SVGGElement>('g.layer-nodes')
    .selectAll<SVGGElement, LaidCommit>('g.commit:not(.ghost)')
    .attr('transform', (node) => {
      const point = visualPositions.get(node.id) ?? node
      return `translate(${point.x},${point.y})`
    })

  const refs = buildRefTags(graph, visualPositions)
  svg.select<SVGGElement>('g.layer-refs')
    .selectAll<SVGGElement, RefTag>('g.ref')
    .data(refs, (tag) => tag.key)
    .attr('transform', (tag) => `translate(${tag.x},${tag.y})`)
}

function render(): void {
  const svgEl = svgRef.value
  if (!svgEl) return
  const svg = d3.select(svgEl)
  const graph = props.graph

  if (!graph || graph.commits.length === 0) {
    graphState = null
    layoutState = null
    visualPositions.clear()
    anchorPositions.clear()
    nodeVelocities.clear()
    edgeMotions.clear()
    svg.selectAll('*').remove()
    svg.attr('width', props.fit ? '100%' : 0).attr('height', props.fit ? '100%' : 0).attr('viewBox', null)
    return
  }

  const layout = layoutGraph(graph)
  const host = svgEl.parentElement
  const contentWidth = Math.max(layout.width + 220, 360)
  const contentHeight = Math.max(layout.height, props.fit ? 260 : 0)
  canvasWidth = props.interactive
    ? Math.max(contentWidth, host?.clientWidth ?? 0, 640)
    : contentWidth
  canvasHeight = props.interactive
    ? Math.max(contentHeight, host?.clientHeight ?? 0, 420)
    : Math.max(contentHeight, 260)

  if (props.fit) {
    svg
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('viewBox', `0 0 ${canvasWidth} ${canvasHeight}`)
      .attr('preserveAspectRatio', 'xMidYMid meet')
  } else {
    svg.attr('width', canvasWidth).attr('height', canvasHeight).attr('viewBox', null)
  }

  const animateSnapshot = graphState !== null
  graphState = graph
  layoutState = layout
  syncMotionLayout(graph, layout, animateSnapshot)

  const viewport = ensureGroup(svg, 'viewport')
  const edges = ensureGroup(viewport, 'edges')
  const nodes = ensureGroup(viewport, 'nodes')
  const refs = ensureGroup(viewport, 'refs')

  edges
    .selectAll<SVGPathElement, LaidEdge>('path.edge')
    .data(layout.edges, (edge) => edge.id)
    .join(
      (enter) => {
        const path = enter.append('path')
          .attr('class', 'edge')
          .attr('fill', 'none')
          .attr('stroke', EDGE_COLOR)
          .attr('stroke-width', 2.4)
          .attr('stroke-linecap', 'round')
        if (animateSnapshot && !reduceMotion) {
          path.attr('opacity', 0).transition().duration(220).attr('opacity', 1)
        }
        return path
      },
      (update) => update,
      (exit) => exit
        .classed('ghost', true)
        .attr('pointer-events', 'none')
        .transition()
        .duration(reduceMotion ? 0 : 780)
        .attr('opacity', 0)
        .remove(),
    )

  const node = nodes
    .selectAll<SVGGElement, LaidCommit>('g.commit')
    .data(layout.nodes, (commit) => commit.id)
    .join(
      (enter) => {
        const group = enter.append('g').attr('class', 'commit')
        group.append('circle').attr('class', 'commit-hit').attr('r', NODE_RADIUS + 11).attr('fill', 'transparent')
        group.append('circle')
          .attr('class', 'commit-node')
          .attr('r', NODE_RADIUS)
          .attr('fill', NODE_FILL)
          .attr('stroke', '#ffffff')
          .attr('stroke-width', 3)
        group.append('text')
          .attr('class', 'seq')
          .attr('text-anchor', 'middle')
          .attr('dy', '0.35em')
          .attr('fill', '#ffffff')
          .attr('font-size', 11)
          .attr('font-weight', 700)
        group.append('text')
          .attr('class', 'msg')
          .attr('x', NODE_RADIUS + 11)
          .attr('dy', '0.35em')
          .attr('fill', '#3f4b5b')
          .attr('font-size', 12)
        if (animateSnapshot && !reduceMotion) {
          group.attr('opacity', 0).transition().duration(260).attr('opacity', 1)
        }
        return group
      },
      (update) => update,
      (exit) => exit
        .classed('ghost', true)
        .attr('pointer-events', 'none')
        .transition()
        .duration(reduceMotion ? 0 : 900)
        .attr('opacity', 0)
        .remove(),
    )
    .classed('draggable', props.interactive)
    .attr('aria-label', (commit) => `${commit.seq} ${commit.message}`)

  node.select<SVGTextElement>('text.seq').text((commit) => commit.seq)
  node.select<SVGTextElement>('text.msg').text((commit) => truncate(commit.message, props.fit ? 22 : 30))
  setupNodeDrag(node)

  const refTags = buildRefTags(graph, visualPositions)
  const refSelection = refs
    .selectAll<SVGGElement, RefTag>('g.ref')
    .data(refTags, (tag) => tag.key)
    .join(
      (enter) => {
        const group = enter.append('g').attr('class', 'ref')
        group.append('rect').attr('rx', 4).attr('height', 20).attr('y', -10)
        group.append('text').attr('dy', '0.35em').attr('x', 8).attr('font-size', 11).attr('font-weight', 600)
        return group
      },
      (update) => update,
      (exit) => exit.remove(),
    )

  refSelection.select<SVGRectElement>('rect')
    .attr('width', (tag) => tag.label.length * 7 + 16)
    .attr('fill', (tag) => (tag.isHead ? HEAD_ACCENT : tag.remote ? REMOTE_FILL : BRANCH_FILL))
  refSelection.select<SVGTextElement>('text')
    .attr('fill', (tag) => (tag.isHead ? '#ffffff' : tag.remote ? REMOTE_TEXT : '#2f6fc0'))
    .text((tag) => tag.label)

  updateScene()
  kickMotion()
}

function ensureGroup<T extends SVGElement>(
  parent: d3.Selection<T, unknown, null, undefined>,
  name: string,
): d3.Selection<SVGGElement, unknown, null, undefined> {
  let group = parent.select<SVGGElement>(`g.layer-${name}`)
  if (group.empty()) group = parent.append('g').attr('class', `layer-${name}`)
  return group
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

onMounted(() => {
  reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  setupInteraction()
  render()
  const host = svgRef.value?.parentElement
  if (host) {
    resizeObserver = new ResizeObserver(() => render())
    resizeObserver.observe(host)
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  if (frameId !== null) cancelAnimationFrame(frameId)
})

watch(() => [props.interactive, props.fit], () => {
  setupInteraction()
  render()
})
watch(() => props.graph, render, { deep: true })
</script>

<template>
  <div class="graph-view" :class="{ interactive: props.interactive, fit: props.fit }">
    <svg
      ref="svgRef"
      class="graph-svg"
      :class="{ interactive: props.interactive }"
      :aria-label="props.interactive ? '可交互的当前提交图' : '只读提交图'"
    ></svg>
    <div v-if="!props.graph || props.graph.commits.length === 0" class="graph-empty">
      当前仓库还没有提交
    </div>
  </div>
</template>

<style scoped>
.graph-view {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: auto;
  background: #f8fafc;
}

.graph-view.interactive,
.graph-view.fit {
  overflow: hidden;
}

.graph-svg {
  display: block;
}

.graph-svg.interactive {
  cursor: grab;
  touch-action: none;
  user-select: none;
}

.graph-svg.interactive.panning,
.graph-svg.interactive.dragging-node {
  cursor: grabbing;
}

.graph-svg :deep(.edge) {
  vector-effect: non-scaling-stroke;
  pointer-events: none;
}

.graph-svg :deep(.commit) {
  outline: none;
}

.graph-svg :deep(.commit.draggable) {
  cursor: grab;
}

.graph-svg :deep(.commit.draggable.is-dragging) {
  cursor: grabbing;
}

.graph-svg :deep(.commit-node) {
  filter: drop-shadow(0 3px 5px rgba(31, 61, 91, 0.2));
  transition: filter 160ms ease, stroke-width 160ms ease;
}

.graph-svg :deep(.commit.draggable:hover .commit-node),
.graph-svg :deep(.commit.is-dragging .commit-node) {
  filter: drop-shadow(0 5px 9px rgba(31, 61, 91, 0.28));
  stroke-width: 4;
}

.graph-svg :deep(.commit-hit) {
  pointer-events: all;
}

.graph-svg :deep(.msg),
.graph-svg :deep(.seq),
.graph-svg :deep(.ref) {
  pointer-events: none;
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
</style>
