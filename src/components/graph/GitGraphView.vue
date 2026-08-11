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
  PADDING,
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

interface RefEntry {
  key: string
  label: string
  isHead: boolean
  remote?: boolean
}

interface RefTag extends RefEntry {
  x: number
  y: number
}

const EDGE_COLOR = '#78889b'
const NODE_FILL = '#2f80ed'
const HEAD_ACCENT = '#e25555'
const BRANCH_FILL = '#e8f0fe'
const REMOTE_FILL = '#fff1e6'
const REMOTE_TEXT = '#b55320'
const GHOST_OPACITY = 0.34
const GHOST_SETTLE_MS = 180
const GHOST_HOLD_MS = 8000
const GHOST_FADE_MS = 700

/** 标签间距与「标签区 → 提交信息」间距；提交信息排在所有标签之后，避免相互遮挡。 */
const REF_GAP = 6
const MSG_GAP = 10
/** 交互画布的留白：顶部保底空间要容得下「当前图」角标。 */
const TOP_GUARD = 56
const EDGE_PAD = 24

const svgRef = ref<SVGSVGElement | null>(null)
const visualPositions = new Map<string, Point>()
const anchorPositions = new Map<string, Point>()
const nodeVelocities = new Map<string, Velocity>()
const edgeMotions = new Map<string, EdgeMotion>()
const edgeOffsets = new Map<string, number>()

let graphState: GitGraph | null = null
let layoutState: GraphLayout | null = null
let refEntries = new Map<string, RefEntry[]>()
let zoomBehavior: d3.ZoomBehavior<SVGSVGElement, unknown> | null = null
let resizeObserver: ResizeObserver | null = null
let frameId: number | null = null
let draggingNodeId: string | null = null
let canvasWidth = 0
let canvasHeight = 0
let reduceMotion = false
/** 通关庆祝：burst=弹珠散开落地，recover=spring 拉回原位；resolve 在图形完全复原后触发。 */
let celebrationPhase: 'burst' | 'recover' | null = null
let celebrationDeadline = 0
let celebrationSettledAt = 0
let celebrationResolve: (() => void) | null = null

/** 估算文本渲染宽度：CJK 全宽、拉丁半宽，宽度只用于排布不必像素级精确。 */
function estimateTextWidth(text: string, latin: number, cjk: number): number {
  let width = 0
  for (const ch of text) width += (ch.codePointAt(0) ?? 0) > 0x2e7f ? cjk : latin
  return width
}

function refPillWidth(label: string): number {
  return Math.ceil(estimateTextWidth(label, 6.8, 11)) + 16
}

/** 提交信息的起始 x：排在该提交全部标签之后。 */
function msgOffsetX(entries: RefEntry[] | undefined): number {
  if (!entries || entries.length === 0) return NODE_RADIUS + 12
  let refsWidth = 0
  for (const entry of entries) refsWidth += refPillWidth(entry.label) + REF_GAP
  return NODE_RADIUS + 12 + refsWidth - REF_GAP + MSG_GAP
}

/** 收集每个提交上的引用标签，固定优先级：HEAD 所在分支 → 本地分支 → tag → 远程 → 游离 HEAD。 */
function collectRefEntries(graph: GitGraph): Map<string, RefEntry[]> {
  const byCommit = new Map<string, RefEntry[]>()
  const push = (target: string | null | undefined, entry: RefEntry): void => {
    if (!target) return
    const list = byCommit.get(target)
    if (list) list.push(entry)
    else byCommit.set(target, [entry])
  }

  for (const branch of graph.branches) {
    const isHead = graph.head.type === 'branch' && graph.head.ref === branch.name
    push(branch.target, {
      key: `branch:${branch.name}`,
      label: isHead ? `HEAD → ${branch.name}` : branch.name,
      isHead,
    })
  }
  for (const tag of graph.tags) {
    push(tag.target, { key: `tag:${tag.name}`, label: `tag: ${tag.name}`, isHead: false })
  }
  for (const remote of graph.remotes) {
    for (const branch of remote.branches) {
      push(branch.target, {
        key: `remote:${remote.name}/${branch.name}`,
        label: `${remote.name}/${branch.name}`,
        isHead: false,
        remote: true,
      })
    }
  }
  if (graph.head.type === 'detached') {
    push(graph.head.ref, { key: 'head:detached', label: 'HEAD', isHead: true })
  }

  const rank = (entry: RefEntry): number =>
    entry.isHead ? 0 : entry.remote ? 3 : entry.key.startsWith('tag:') ? 2 : 1
  for (const list of byCommit.values()) {
    list.sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label))
  }
  return byCommit
}

function buildRefTags(positions: Map<string, Point>): RefTag[] {
  const tags: RefTag[] = []
  for (const [target, entries] of refEntries) {
    const pos = positions.get(target)
    if (!pos) continue
    let x = pos.x + NODE_RADIUS + 12
    for (const entry of entries) {
      tags.push({ ...entry, x, y: pos.y })
      x += refPillWidth(entry.label) + REF_GAP
    }
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

  if (celebrationPhase === 'burst') {
    const now = performance.now()
    const settled = stepCelebration(layout)
    // 等所有节点都落定在地面并停留片刻，再交还给 spring 拉回原位（超时兜底防悬挂）
    if (settled) {
      if (celebrationSettledAt === 0) celebrationSettledAt = now
    } else {
      celebrationSettledAt = 0
    }
    const rested = celebrationSettledAt > 0 && now - celebrationSettledAt > 450
    if (rested || now >= celebrationDeadline) {
      celebrationPhase = 'recover'
    } else {
      return true
    }
  }

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

/** 弹珠物理：重力下坠、落地反弹衰减、左右墙反弹；返回是否所有节点都已落定在地面。 */
function stepCelebration(layout: GraphLayout): boolean {
  const floor = canvasHeight - NODE_RADIUS - 10
  const leftWall = NODE_RADIUS + 8
  const rightWall = canvasWidth - NODE_RADIUS - 8
  let settled = true

  for (const node of layout.nodes) {
    const point = visualPositions.get(node.id)
    const velocity = nodeVelocities.get(node.id)
    if (!point || !velocity) continue
    velocity.y += 0.32
    point.x += velocity.x
    point.y += velocity.y
    if (point.y > floor) {
      point.y = floor
      velocity.y *= -0.58
      velocity.x *= 0.94
      if (Math.abs(velocity.y) < 1.2) velocity.y = 0 // 微弹截断，尽快安定
    }
    if (point.x < leftWall) {
      point.x = leftWall
      velocity.x *= -0.7
    } else if (point.x > rightWall) {
      point.x = rightWall
      velocity.x *= -0.7
    }
    if (Math.abs(velocity.x) + Math.abs(velocity.y) > 0.4 || point.y < floor - 0.5) {
      settled = false
    }
  }
  // 弹跳期连接线已淡出，不更新边控制点；recover 阶段 spring 会把它们追回原位
  return settled
}

/**
 * 通关庆祝：节点像弹珠一样从图心弹开、落地弹跳，随后 spring 拉回原图形状。
 * 返回的 Promise 在图形完全复原后 resolve（宿主据此弹恭喜消息）。
 */
function celebrate(): Promise<void> {
  const layout = layoutState
  if (!layout || layout.nodes.length === 0 || reduceMotion) {
    return Promise.resolve()
  }
  celebrationResolve?.() // 重入保护：上一场未完直接了结
  draggingNodeId = null
  resetView()

  let centerX = 0
  for (const node of layout.nodes) {
    const point = visualPositions.get(node.id)
    centerX += point?.x ?? node.x
  }
  centerX /= layout.nodes.length

  for (const node of layout.nodes) {
    const point = visualPositions.get(node.id)
    const velocity = nodeVelocities.get(node.id)
    if (!point || !velocity) continue
    const dx = point.x - centerX
    const length = Math.max(1, Math.abs(dx))
    // 全部向上抛起 + 大幅水平随机：节点彼此散开后各自落地，而不是原地上下弹
    velocity.x = (dx / length) * 2.5 + (Math.random() - 0.5) * 12
    velocity.y = -(6 + Math.random() * 5)
  }

  celebrationPhase = 'burst'
  celebrationSettledAt = 0
  celebrationDeadline = performance.now() + 5000
  // 只弹节点本身：标签与提交信息淡出，待图形复原后再淡回
  if (svgRef.value) d3.select(svgRef.value).classed('celebrating', true)
  return new Promise((resolve) => {
    celebrationResolve = resolve
    kickMotion()
  })
}

defineExpose({ celebrate })

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
    // 弹珠全部归位（图形复原）后才算庆祝完成，宿主此时再弹恭喜消息
    if (!moving && celebrationPhase === 'recover') {
      celebrationPhase = null
      if (svgRef.value) d3.select(svgRef.value).classed('celebrating', false)
      celebrationResolve?.()
      celebrationResolve = null
    }
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

  const refs = buildRefTags(visualPositions)
  svg.select<SVGGElement>('g.layer-refs')
    .selectAll<SVGGElement, RefTag>('g.ref')
    .data(refs, (tag) => tag.key)
    .attr('transform', (tag) => `translate(${tag.x},${tag.y})`)
}

/** 内容实际宽度：最宽一行 = 节点 x + 标签区 + 提交信息（含左侧 PADDING 起点）。 */
function measureContentWidth(layout: GraphLayout, fit: boolean): number {
  let max = layout.width
  for (const node of layout.nodes) {
    const message = truncate(node.message, fit ? 22 : 30)
    const end = node.x + msgOffsetX(refEntries.get(node.id)) + estimateTextWidth(message, 7.2, 12)
    max = Math.max(max, end)
  }
  return Math.ceil(max)
}

/** 渲染层视口适配：整体平移布局坐标（布局层保持纯函数，§6.3）。 */
function shiftLayout(layout: GraphLayout, dx: number, dy: number): GraphLayout {
  if (dx === 0 && dy === 0) return layout
  const positions = new Map<string, { x: number; y: number; lane: number }>()
  for (const [id, pos] of layout.positions) {
    positions.set(id, { x: pos.x + dx, y: pos.y + dy, lane: pos.lane })
  }
  return {
    ...layout,
    nodes: layout.nodes.map((node) => ({ ...node, x: node.x + dx, y: node.y + dy })),
    edges: layout.edges.map((edge) => ({
      ...edge,
      x1: edge.x1 + dx,
      y1: edge.y1 + dy,
      x2: edge.x2 + dx,
      y2: edge.y2 + dy,
    })),
    positions,
  }
}

function render(): void {
  const svgEl = svgRef.value
  if (!svgEl) return
  const svg = d3.select(svgEl)
  const graph = props.graph

  // 新快照到来时中断弹跳，让节点直接 spring 去新布局（庆祝让位于真实状态）
  if (celebrationPhase === 'burst') {
    celebrationPhase = 'recover'
  }

  if (!graph || graph.commits.length === 0) {
    graphState = null
    layoutState = null
    refEntries = new Map()
    celebrationPhase = null
    svg.classed('celebrating', false)
    celebrationResolve?.()
    celebrationResolve = null
    visualPositions.clear()
    anchorPositions.clear()
    nodeVelocities.clear()
    edgeMotions.clear()
    svg.selectAll('*').remove()
    svg.attr('width', props.fit ? '100%' : 0).attr('height', props.fit ? '100%' : 0).attr('viewBox', null)
    return
  }

  refEntries = collectRefEntries(graph)
  let layout = layoutGraph(graph)
  const host = svgEl.parentElement
  const contentWidth = measureContentWidth(layout, props.fit) + EDGE_PAD
  const contentHeight = layout.height

  if (props.interactive) {
    canvasWidth = Math.max(contentWidth + EDGE_PAD, host?.clientWidth ?? 0, 640)
    canvasHeight = Math.max(contentHeight + TOP_GUARD + EDGE_PAD, host?.clientHeight ?? 0, 420)
    // 内容小于画布时整体居中；大图保底留白（顶部让出「当前图」角标）
    const offsetX = Math.max(EDGE_PAD, (canvasWidth - contentWidth) / 2)
    const offsetY = Math.max(TOP_GUARD, (canvasHeight - contentHeight) / 2)
    layout = shiftLayout(layout, offsetX - PADDING, offsetY - PADDING)
  } else {
    canvasWidth = Math.max(contentWidth, 360)
    canvasHeight = Math.max(contentHeight, 260)
  }

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
      (update) => update
        .interrupt()
        .classed('ghost', false)
        .attr('pointer-events', null)
        .attr('opacity', 1),
      (exit) => exit
        .interrupt()
        .classed('ghost', true)
        .attr('pointer-events', 'none')
        .transition()
        .duration(reduceMotion ? 0 : GHOST_SETTLE_MS)
        .attr('opacity', GHOST_OPACITY)
        .transition()
        .delay(GHOST_HOLD_MS)
        .duration(reduceMotion ? 0 : GHOST_FADE_MS)
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
      (update) => update
        .interrupt()
        .classed('ghost', false)
        .attr('pointer-events', null)
        .attr('opacity', 1),
      (exit) => exit
        .interrupt()
        .classed('ghost', true)
        .attr('pointer-events', 'none')
        .transition()
        .duration(reduceMotion ? 0 : GHOST_SETTLE_MS)
        .attr('opacity', GHOST_OPACITY)
        .transition()
        .delay(GHOST_HOLD_MS)
        .duration(reduceMotion ? 0 : GHOST_FADE_MS)
        .attr('opacity', 0)
        .remove(),
    )
    .classed('draggable', props.interactive)
    .attr('aria-label', (commit) => `${commit.seq} ${commit.message}`)

  node.select<SVGTextElement>('text.seq').text((commit) => commit.seq)
  node.select<SVGTextElement>('text.msg')
    .attr('x', (commit) => msgOffsetX(refEntries.get(commit.id)))
    .text((commit) => truncate(commit.message, props.fit ? 22 : 30))
  setupNodeDrag(node)

  const refTags = buildRefTags(visualPositions)
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
    .attr('width', (tag) => refPillWidth(tag.label))
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

/* 通关庆祝只弹节点本体：连接线、标签与提交信息淡出，节点归位后淡回 */
.graph-svg :deep(.msg),
.graph-svg :deep(.layer-refs),
.graph-svg :deep(.layer-edges) {
  transition: opacity 200ms ease;
}

.graph-svg.celebrating :deep(.msg),
.graph-svg.celebrating :deep(.layer-refs),
.graph-svg.celebrating :deep(.layer-edges) {
  opacity: 0;
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
