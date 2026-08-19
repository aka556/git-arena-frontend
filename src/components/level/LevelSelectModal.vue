<script setup lang="ts">
/**
 * 关卡选择弹窗（替代工具栏下拉的「更佳关卡提供方式」）：
 * 按章节组织的闯关地图——章节有推荐顺序与进度，卡片一眼可见状态，
 * 选中后先看到关卡说明与目标图预览再进门，降低上手门槛。
 *
 * <p>协作关卡不能单人开启（后端 fail-closed），卡片引导去协作房间建房练习。
 */
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Button, Modal, Spin, message } from 'ant-design-vue'
import { useSessionStore } from '@/stores/session'
import { getLevel } from '@/api/level'
import type { LevelDetail, LevelSummary } from '@/types/level'
import GitGraphView from '@/components/graph/GitGraphView.vue'
import { CHAPTERS, chapterOf, sortLevels, type ChapterMeta } from './levelChapters'

const props = defineProps<{
  open: boolean
  /** 父级正在启动关卡时按钮转圈，防止重复点击。 */
  starting?: boolean
}>()

const emit = defineEmits<{
  'update:open': [open: boolean]
  start: [level: LevelSummary]
  free: []
}>()

const store = useSessionStore()
const router = useRouter()

const selected = ref<LevelSummary | null>(null)
const detail = ref<LevelDetail | null>(null)
const detailLoading = ref(false)
const detailCache = new Map<string, LevelDetail>()

interface ChapterGroup {
  meta: ChapterMeta
  levels: LevelSummary[]
  done: number
}

const groups = computed<ChapterGroup[]>(() => {
  const sorted = sortLevels(store.levels)
  const byKey = new Map<string, LevelSummary[]>()
  for (const level of sorted) {
    const key = chapterOf(level.category).key
    const list = byKey.get(key) ?? []
    list.push(level)
    byKey.set(key, list)
  }
  const order = [...CHAPTERS.map((c) => c.key), ...byKey.keys()]
  const seen = new Set<string>()
  const result: ChapterGroup[] = []
  for (const key of order) {
    if (seen.has(key) || !byKey.has(key)) continue
    seen.add(key)
    const levels = byKey.get(key)!
    result.push({
      meta: chapterOf(levels[0]!.category),
      levels,
      done: levels.filter((l) => l.status === 'completed').length,
    })
  }
  return result
})

const completedCount = computed(() => store.levels.filter((l) => l.status === 'completed').length)
const progressPercent = computed(() =>
  store.levels.length === 0 ? 0 : Math.round((completedCount.value / store.levels.length) * 100))

function statusText(level: LevelSummary): string {
  if (level.status === 'completed') return '已通关'
  if (level.status === 'in_progress') return '进行中'
  if (level.status === 'locked') return '未解锁'
  return ''
}

async function select(level: LevelSummary): Promise<void> {
  if (level.status === 'locked') return
  selected.value = level
  const cached = detailCache.get(level.slug)
  if (cached) {
    detail.value = cached
    return
  }
  detail.value = null
  detailLoading.value = true
  try {
    const loaded = await getLevel(level.slug)
    detailCache.set(level.slug, loaded)
    // 加载期间用户可能已点了别的卡片：只有仍是当前选中项才展示
    if (selected.value?.slug === level.slug) detail.value = loaded
  } catch (e) {
    message.error(e instanceof Error ? e.message : String(e))
  } finally {
    detailLoading.value = false
  }
}

function onPrimary(): void {
  const level = selected.value
  if (!level) return
  if (level.mode === 'collab') {
    emit('update:open', false)
    router.push('/rooms')
    return
  }
  emit('start', level)
}

function close(): void {
  emit('update:open', false)
}

// 打开时预选正在进行的关卡（没有则选第一个可玩的），让「继续上次」零查找
watch(() => props.open, (open) => {
  if (!open) return
  const current = store.activeLevel
    ? store.levels.find((l) => l.slug === store.activeLevel?.slug)
    : null
  const target = current
    ?? sortLevels(store.levels).find((l) => l.status !== 'completed' && l.status !== 'locked')
    ?? sortLevels(store.levels)[0]
  if (target) void select(target)
})
</script>

<template>
  <Modal
    :open="props.open"
    :footer="null"
    :closable="false"
    :width="960"
    wrap-class-name="level-select-wrap"
    @cancel="close"
  >
    <div class="map">
      <header class="map-head">
        <div class="map-heading">
          <span class="map-kicker">LEVEL MAP</span>
          <h2>关卡地图</h2>
        </div>
        <div class="map-progress">
          <span class="map-progress-num">{{ completedCount }}<i>/{{ store.levels.length }}</i></span>
          <span class="map-progress-label">已通关</span>
          <span class="map-progress-track"><i :style="{ width: `${progressPercent}%` }" /></span>
        </div>
        <button class="map-close" aria-label="关闭" @click="close">✕</button>
      </header>

      <div class="map-body">
        <section v-for="group in groups" :key="group.meta.key" class="chapter">
          <div class="chapter-head">
            <span class="chapter-index">{{ String(group.meta.index).padStart(2, '0') }}</span>
            <div class="chapter-title">
              <h3>{{ group.meta.name }}</h3>
              <p>{{ group.meta.blurb }}</p>
            </div>
            <span class="chapter-done" :class="{ full: group.done === group.levels.length }">
              {{ group.done }}/{{ group.levels.length }}
            </span>
          </div>

          <div class="chapter-grid">
            <button
              v-for="level in group.levels"
              :key="level.slug"
              class="level-card"
              :class="[level.status, { selected: selected?.slug === level.slug, collab: level.mode === 'collab' }]"
              :disabled="level.status === 'locked'"
              @click="select(level)"
              @dblclick="selected?.slug === level.slug && onPrimary()"
            >
              <span class="level-state">
                <template v-if="level.status === 'completed'">✓</template>
                <template v-else-if="level.status === 'locked'">🔒</template>
                <template v-else>{{ level.orderIndex }}</template>
              </span>
              <span class="level-name">{{ level.title }}</span>
              <span class="level-meta">
                <span class="level-stars">{{ '★'.repeat(level.difficulty) }}</span>
                <span v-if="level.mode === 'collab'" class="level-badge navy">协作</span>
                <span v-else-if="statusText(level)" class="level-badge" :class="level.status">
                  {{ statusText(level) }}
                </span>
              </span>
            </button>
          </div>
        </section>
      </div>

      <footer class="map-foot">
        <template v-if="selected">
          <div class="foot-info">
            <div class="foot-title">
              <strong>{{ selected.title }}</strong>
              <span class="foot-stars">{{ '★'.repeat(selected.difficulty) }}</span>
              <span v-if="selected.mode === 'collab'" class="level-badge navy">协作房间</span>
              <span v-else-if="selected.status === 'completed'" class="level-badge completed">已通关</span>
            </div>
            <p class="foot-desc">
              <Spin v-if="detailLoading" size="small" />
              <template v-else>{{ detail?.description || '让「当前图」变成「目标图」即通关。' }}</template>
            </p>
            <Button
              type="primary"
              size="large"
              class="foot-start"
              :loading="props.starting"
              @click="onPrimary"
            >
              {{ selected.mode === 'collab' ? '去协作房间练习 →'
                : selected.status === 'completed' ? '再玩一次'
                : selected.status === 'in_progress' ? '继续挑战' : '开始关卡' }}
            </Button>
            <a class="foot-free" @click="emit('free')">或进入自由沙盒随便玩 →</a>
          </div>
          <div class="foot-preview">
            <span class="foot-preview-label">目标图</span>
            <div class="foot-preview-canvas">
              <GitGraphView v-if="detail" :graph="detail.goalGraph" :fit="true" />
            </div>
          </div>
        </template>
        <p v-else class="foot-empty">点击一个关卡查看目标</p>
      </footer>
    </div>
  </Modal>
</template>

<style scoped>
.map {
  display: flex;
  flex-direction: column;
  max-height: min(78vh, 820px);
  margin: -20px -24px;
  overflow: hidden;
  border-radius: 8px;
}

.map-head {
  display: flex;
  align-items: center;
  gap: 20px;
  flex: none;
  padding: 18px 24px 16px;
  color: #fff;
  background:
    radial-gradient(circle at 88% -40%, rgba(73, 169, 124, 0.35), transparent 55%),
    linear-gradient(120deg, #1b2f42, #20364a 60%, #274158);
}

.map-kicker {
  display: block;
  color: #8ed7b4;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.22em;
}

.map-heading h2 {
  margin: 2px 0 0;
  color: #fff;
  font-size: 19px;
  line-height: 1.2;
}

.map-progress {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.map-progress-num {
  font-family: 'Cascadia Code', Consolas, monospace;
  font-size: 20px;
  font-weight: 700;
  color: #8ed7b4;
}

.map-progress-num i {
  font-style: normal;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.55);
}

.map-progress-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
}

.map-progress-track {
  position: relative;
  flex: 1;
  max-width: 300px;
  height: 5px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.16);
  align-self: center;
}

.map-progress-track i {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: 999px;
  background: linear-gradient(90deg, #49a97c, #8ed7b4);
  transition: width 400ms ease;
}

.map-close {
  flex: none;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.75);
  background: rgba(255, 255, 255, 0.1);
  font-size: 13px;
  cursor: pointer;
  transition: background 140ms ease, color 140ms ease;
}

.map-close:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.2);
}

.map-body {
  flex: 1;
  min-height: 0;
  padding: 18px 24px 8px;
  overflow-y: auto;
  background:
    radial-gradient(#e3ebf4 1px, transparent 1px) 0 0 / 18px 18px,
    #f6f9fc;
}

.chapter {
  margin-bottom: 22px;
}

.chapter-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}

.chapter-index {
  flex: none;
  font-family: 'Cascadia Code', Consolas, monospace;
  font-size: 22px;
  font-weight: 700;
  color: #c4d2e0;
  line-height: 1;
}

.chapter-title {
  flex: 1;
  min-width: 0;
}

.chapter-title h3 {
  margin: 0;
  font-size: 14px;
  color: #1b2a3a;
}

.chapter-title p {
  margin: 1px 0 0;
  font-size: 12px;
  color: #8a97a6;
}

.chapter-done {
  flex: none;
  padding: 2px 9px;
  border-radius: 999px;
  font-family: 'Cascadia Code', Consolas, monospace;
  font-size: 11px;
  color: #64748b;
  background: #e8eef5;
}

.chapter-done.full {
  color: #1d7a4d;
  background: #dcf2e6;
}

.chapter-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(196px, 1fr));
  gap: 10px;
}

.level-card {
  display: grid;
  grid-template-columns: 30px 1fr;
  grid-template-rows: auto auto;
  align-items: center;
  gap: 2px 10px;
  padding: 10px 12px;
  border: 1px solid #dfe7ef;
  border-radius: 8px;
  background: #fff;
  text-align: left;
  cursor: pointer;
  transition: transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease;
}

.level-card:hover:not(:disabled) {
  transform: translateY(-2px);
  border-color: #b9cee8;
  box-shadow: 0 8px 20px rgba(32, 54, 74, 0.1);
}

.level-card.selected {
  border-color: #2f80ed;
  box-shadow: 0 0 0 2px rgba(47, 128, 237, 0.18), 0 8px 20px rgba(32, 54, 74, 0.08);
}

.level-card.completed {
  border-color: #cbe8d8;
  background: #f4fbf7;
}

.level-card.completed.selected {
  border-color: #49a97c;
  box-shadow: 0 0 0 2px rgba(73, 169, 124, 0.2);
}

.level-card:disabled {
  cursor: not-allowed;
  opacity: 0.55;
  background: #f2f5f8;
}

.level-state {
  grid-row: 1 / 3;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  font-family: 'Cascadia Code', Consolas, monospace;
  font-size: 13px;
  font-weight: 700;
  color: #64748b;
  background: #eef2f7;
}

.level-card.completed .level-state {
  color: #fff;
  background: #49a97c;
}

.level-card.in_progress .level-state {
  color: #b26a17;
  background: #fdeeda;
  box-shadow: 0 0 0 3px rgba(242, 153, 74, 0.18);
}

.level-name {
  overflow: hidden;
  font-size: 13px;
  font-weight: 600;
  color: #1b2a3a;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.level-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 18px;
}

.level-stars {
  font-size: 11px;
  color: #f2b01e;
  letter-spacing: 1px;
}

.level-badge {
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 10px;
  line-height: 15px;
}

.level-badge.completed {
  color: #1d7a4d;
  background: #dcf2e6;
}

.level-badge.in_progress {
  color: #b26a17;
  background: #fdeeda;
}

.level-badge.navy {
  color: #e9f2fb;
  background: #20364a;
}

.map-foot {
  display: flex;
  gap: 18px;
  flex: none;
  min-height: 150px;
  padding: 14px 24px 16px;
  border-top: 1px solid #e3e9f0;
  background: #fff;
}

.foot-info {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
}

.foot-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  color: #1b2a3a;
}

.foot-stars {
  font-size: 12px;
  color: #f2b01e;
}

.foot-desc {
  flex: 1;
  margin: 6px 0 10px;
  overflow-y: auto;
  max-height: 64px;
  font-size: 12.5px;
  line-height: 1.65;
  color: #4c5d70;
}

.foot-start {
  align-self: flex-start;
  min-width: 150px;
}

.foot-free {
  margin-top: 8px;
  font-size: 12px;
  color: #8a97a6;
}

.foot-free:hover {
  color: #2f80ed;
}

.foot-preview {
  position: relative;
  flex: none;
  width: 300px;
  overflow: hidden;
  border: 1px solid #d7e3d9;
  border-radius: 8px;
  background: #f2f8f5;
}

.foot-preview-label {
  position: absolute;
  z-index: 2;
  top: 6px;
  left: 8px;
  padding: 1px 7px;
  border-radius: 4px;
  color: #fff;
  background: #49a97c;
  font-size: 10px;
  font-weight: 700;
}

.foot-preview-canvas {
  height: 100%;
}

.foot-preview-canvas :deep(.graph-view) {
  background: transparent;
}

.foot-empty {
  align-self: center;
  margin: 0 auto;
  color: #98a2b3;
  font-size: 13px;
}

@media (max-width: 760px) {
  .foot-preview {
    display: none;
  }
}
</style>

<style>
/* Modal 容器本身的圆角与去内边距（wrapClassName 作用于全局层，故不 scoped） */
.level-select-wrap .ant-modal-content {
  padding: 20px 24px;
  overflow: hidden;
}
</style>
