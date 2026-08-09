<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
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
}

const overlayRef = ref<HTMLDivElement | null>(null)
const cardRef = ref<HTMLElement | null>(null)
const position = ref<Position | null>(null)
const dragging = ref(false)
const cardStyle = computed(() => position.value
  ? { left: `${position.value.x}px`, top: `${position.value.y}px`, right: 'auto' }
  : undefined)

let dragState: DragState | null = null
let resizeObserver: ResizeObserver | null = null

function beginDrag(event: PointerEvent): void {
  if (event.button !== 0) return
  const overlay = overlayRef.value
  const card = cardRef.value
  const handle = event.currentTarget as HTMLElement
  if (!overlay || !card) return

  const overlayRect = overlay.getBoundingClientRect()
  const cardRect = card.getBoundingClientRect()
  position.value = {
    x: cardRect.left - overlayRect.left,
    y: cardRect.top - overlayRect.top,
  }
  dragState = {
    pointerId: event.pointerId,
    offsetX: event.clientX - cardRect.left,
    offsetY: event.clientY - cardRect.top,
  }
  dragging.value = true
  handle.setPointerCapture(event.pointerId)
}

function moveCard(event: PointerEvent): void {
  const drag = dragState
  const overlay = overlayRef.value
  const card = cardRef.value
  if (!drag || drag.pointerId !== event.pointerId || !overlay || !card) return

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
  dragState = null
  dragging.value = false
}

function constrain(x: number, y: number): Position {
  const overlay = overlayRef.value
  const card = cardRef.value
  if (!overlay || !card) return { x, y }
  const margin = 12
  return {
    x: clamp(x, margin, overlay.clientWidth - card.offsetWidth - margin),
    y: clamp(y, margin, overlay.clientHeight - card.offsetHeight - margin),
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
</script>

<template>
  <div ref="overlayRef" class="goal-overlay" aria-live="polite">
    <Transition name="goal-card">
      <section
        v-if="props.open"
        ref="cardRef"
        class="goal-card"
        :class="{ dragging }"
        :style="cardStyle"
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
      <Button
        v-if="!props.open"
        class="goal-show"
        type="primary"
        size="small"
        @click="emit('update:open', true)"
      >
        显示目标
      </Button>
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
  top: 16px;
  right: 16px;
  display: flex;
  flex-direction: column;
  width: min(390px, calc(100% - 32px));
  height: min(520px, calc(100% - 32px));
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

.goal-show {
  position: absolute;
  top: 16px;
  right: 16px;
  pointer-events: auto;
  box-shadow: 0 7px 18px rgba(31, 76, 112, 0.2);
}

.goal-card-enter-active,
.goal-card-leave-active {
  transition: opacity 180ms ease, transform 220ms ease;
}

.goal-card-enter-from,
.goal-card-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(0.985);
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
  .goal-card {
    width: min(340px, calc(100% - 24px));
    top: 12px;
    right: 12px;
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
  }
}
</style>
