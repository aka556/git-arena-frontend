<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Button } from 'ant-design-vue'
import type { GitGraph } from '@/types/gitGraph'
import GitGraphView from '@/components/graph/GitGraphView.vue'

const props = defineProps<{
  open: boolean
  graph: GitGraph | null
  levelTitle: string
  completed: boolean
}>()

const emit = defineEmits<{
  'update:open': [open: boolean]
}>()

interface Position {
  x: number
  y: number
}

interface DragState {
  pointerId: number
  offsetX: number
  offsetY: number
  startX: number
  startY: number
  moved: boolean
}

const overlayRef = ref<HTMLDivElement | null>(null)
const cardRef = ref<HTMLElement | null>(null)
const showRef = ref<HTMLElement | null>(null)
/** 卡片与收起态按钮共享的位置；null = 停靠在默认锚点（图形区右上角）。 */
const position = ref<Position | null>(null)
const dragging = ref(false)
const floatStyle = computed(() => position.value
  ? {
      left: `${position.value.x}px`,
      top: `${position.value.y}px`,
      right: 'auto',
      bottom: 'auto',
    }
  : undefined)

let dragState: DragState | null = null
let suppressClick = false
let resizeObserver: ResizeObserver | null = null

/** 当前浮动体：展开时是卡片，收起时是「显示目标」按钮；隐藏在原位、拖动共用一套状态。 */
function floatingEl(): HTMLElement | null {
  return props.open ? cardRef.value : showRef.value
}

function beginDrag(event: PointerEvent): void {
  if (event.button !== 0) return
  const overlay = overlayRef.value
  const target = floatingEl()
  const handle = event.currentTarget as HTMLElement
  if (!overlay || !target) return

  const rect = target.getBoundingClientRect()
  dragState = {
    pointerId: event.pointerId,
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top,
    startX: event.clientX,
    startY: event.clientY,
    moved: false,
  }
  dragging.value = true
  handle.setPointerCapture(event.pointerId)
}

function moveCard(event: PointerEvent): void {
  const drag = dragState
  const overlay = overlayRef.value
  if (!drag || drag.pointerId !== event.pointerId || !overlay) return
  // 首次越过阈值才把位置从 CSS 锚点固化为绝对坐标：纯点击不破坏默认停靠
  if (!drag.moved) {
    if (Math.abs(event.clientX - drag.startX) + Math.abs(event.clientY - drag.startY) <= 4) return
    drag.moved = true
  }

  const bounds = overlay.getBoundingClientRect()
  position.value = constrain(
    event.clientX - bounds.left - drag.offsetX,
    event.clientY - bounds.top - drag.offsetY,
  )
}

function finishDrag(event: PointerEvent): void {
  if (!dragState || dragState.pointerId !== event.pointerId) return
  const handle = event.currentTarget as HTMLElement
  if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId)
  const moved = dragState.moved
  suppressClick = moved
  dragState = null
  dragging.value = false
  // pointer capture 会把合成 click 的目标改写到 wrap 上，内部按钮的 @click 收不到；
  // 收起态的「原地点击展开」因此在这里完成（pointercancel 不算点击）。
  if (!moved && !props.open && event.type === 'pointerup') {
    emit('update:open', true)
  }
}

/** 收起态按钮：拖动结束后的 click 不当作「展开」。 */
function onShowClickCapture(event: MouseEvent): void {
  if (!suppressClick) return
  suppressClick = false
  event.stopPropagation()
}

function constrain(x: number, y: number): Position {
  const overlay = overlayRef.value
  const target = floatingEl()
  if (!overlay || !target) return { x, y }
  const margin = 12
  return {
    x: clamp(x, margin, overlay.clientWidth - target.offsetWidth - margin),
    y: clamp(y, margin, overlay.clientHeight - target.offsetHeight - margin),
  }
}

function keepInBounds(): void {
  if (!position.value) return
  position.value = constrain(position.value.x, position.value.y)
}

function resetPosition(): void {
  position.value = null
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

onMounted(() => {
  if (!overlayRef.value) return
  resizeObserver = new ResizeObserver(keepInBounds)
  resizeObserver.observe(overlayRef.value)
})

onBeforeUnmount(() => resizeObserver?.disconnect())

// 从按钮位置展开成卡片（尺寸变大）后，把可能越界的部分收回画布内。
watch(() => props.open, (open) => {
  if (open) nextTick(keepInBounds)
})
</script>

<template>
  <div ref="overlayRef" class="goal-overlay" aria-live="polite">
    <Transition name="goal-card" appear>
      <section
        v-if="props.open"
        ref="cardRef"
        class="goal-card"
        :class="{ dragging }"
        :style="floatStyle"
        aria-label="关卡目标图"
      >
        <header
          class="goal-header"
          title="拖动目标窗"
          @pointerdown="beginDrag"
          @pointermove="moveCard"
          @pointerup="finishDrag"
          @pointercancel="finishDrag"
          @dblclick="resetPosition"
        >
          <div class="goal-heading">
            <span class="goal-kicker">目标图</span>
            <span class="goal-title">{{ props.levelTitle }}</span>
          </div>
          <span class="goal-status" :class="{ completed: props.completed }">
            {{ props.completed ? '已通关' : '待达成' }}
          </span>
          <Button class="goal-action" type="text" size="small" @pointerdown.stop @click="resetPosition">
            复位
          </Button>
          <Button class="goal-action" type="text" size="small" @pointerdown.stop @click="emit('update:open', false)">
            隐藏
          </Button>
        </header>

        <div class="goal-canvas">
          <GitGraphView :graph="props.graph" :fit="true" />
        </div>
      </section>
    </Transition>

    <Transition name="goal-tab">
      <div
        v-if="!props.open"
        ref="showRef"
        class="goal-show-wrap"
        :class="{ dragging }"
        :style="floatStyle"
        title="点击展开目标图，拖动可移动"
        @pointerdown="beginDrag"
        @pointermove="moveCard"
        @pointerup="finishDrag"
        @pointercancel="finishDrag"
        @click.capture="onShowClickCapture"
      >
        <Button
          class="goal-show"
          type="primary"
          size="small"
          @click="emit('update:open', true)"
        >
          显示目标
        </Button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.goal-overlay {
  position: absolute;
  z-index: 8;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.goal-card {
  position: absolute;
  /* 默认锚点：图形区右上角。--goal-home-offset 由宿主视图注入（=终端列宽），
     使浮层 overlay 覆盖「图形区 + 终端区」时，默认位置仍避开终端。 */
  top: 16px;
  right: calc(16px + var(--goal-home-offset, 0px));
  display: flex;
  flex-direction: column;
  width: min(390px, calc(100% - 32px));
  height: min(440px, calc(100% - 32px));
  min-height: min(300px, calc(100% - 32px));
  overflow: hidden;
  border: 1px solid #9cb2c4;
  border-radius: 6px;
  background: #f2f8f5;
  box-shadow: 0 16px 36px rgba(30, 52, 73, 0.2), 0 3px 9px rgba(30, 52, 73, 0.12);
  pointer-events: auto;
  transition: box-shadow 160ms ease;
}

.goal-card.dragging {
  box-shadow: 0 22px 44px rgba(30, 52, 73, 0.25), 0 5px 12px rgba(30, 52, 73, 0.14);
}

.goal-header {
  display: flex;
  align-items: center;
  gap: 7px;
  min-height: 48px;
  padding: 6px 7px 6px 12px;
  color: #ffffff;
  background: #20364a;
  cursor: grab;
  touch-action: none;
  user-select: none;
}

.goal-card.dragging .goal-header {
  cursor: grabbing;
}

.goal-heading {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  justify-content: center;
}

.goal-kicker {
  color: #8ed7b4;
  font-size: 10px;
  font-weight: 700;
  line-height: 1.1;
}

.goal-title {
  overflow: hidden;
  color: #ffffff;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.goal-status {
  flex: none;
  padding: 2px 7px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 4px;
  color: #dce7ef;
  font-size: 10px;
  line-height: 16px;
}

.goal-status.completed {
  border-color: rgba(111, 220, 166, 0.5);
  color: #8fe0b7;
}

.goal-action {
  flex: none;
  color: #dce7ef;
}

.goal-action:hover,
.goal-action:focus-visible {
  color: #ffffff;
  background: rgba(255, 255, 255, 0.1);
}

.goal-canvas {
  flex: 1;
  min-height: 0;
  border-top: 3px solid #49a97c;
}

.goal-canvas :deep(.graph-view) {
  background: #f2f8f5;
}

.goal-show-wrap {
  position: absolute;
  top: 16px;
  right: calc(16px + var(--goal-home-offset, 0px));
  pointer-events: auto;
  cursor: grab;
  touch-action: none;
  user-select: none;
}

.goal-show-wrap.dragging {
  cursor: grabbing;
}

.goal-show-wrap.dragging .goal-show {
  pointer-events: none;
}

.goal-show {
  box-shadow: 0 7px 18px rgba(31, 76, 112, 0.2);
}

/* 开启关卡：延迟片刻后从右上方浮现，不与初始布局争夺注意力。 */
.goal-card-enter-active {
  transition:
    opacity 360ms ease 260ms,
    transform 420ms cubic-bezier(0.22, 0.9, 0.3, 1.04) 260ms;
}

.goal-card-leave-active {
  transition: opacity 160ms ease, transform 200ms ease;
}

.goal-card-enter-from {
  opacity: 0;
  transform: translate(18px, -22px) scale(0.94);
}

.goal-card-leave-to {
  opacity: 0;
  transform: translateY(-10px) scale(0.98);
}

.goal-tab-enter-active,
.goal-tab-leave-active {
  transition: opacity 150ms ease, transform 180ms ease;
}

.goal-tab-enter-from,
.goal-tab-leave-to {
  opacity: 0;
  transform: translateX(10px);
}

@media (max-width: 900px) {
  .goal-card,
  .goal-show-wrap {
    top: 12px;
    /* 窄屏下图形区太窄，默认锚点回退到整个舞台右上角 */
    right: 12px;
  }

  .goal-card {
    width: min(340px, calc(100% - 24px));
  }

  .goal-status {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .goal-card,
  .goal-card-enter-active,
  .goal-card-leave-active,
  .goal-tab-enter-active,
  .goal-tab-leave-active {
    transition-duration: 0ms;
    transition-delay: 0ms;
  }
}
</style>
