<script setup lang="ts">
/**
 * 工作台页面（CLAUDE.md §6.1 views）。图视图与终端视图并存，共用 store 里同一份 GitGraph 快照。
 *
 * <p>本页是命令的<b>唯一编排点</b>：终端回车与面板按钮都汇到统一执行链路（§3 黄金法则）。
 * 关卡模式下当前图占满画布，目标图以可移动浮窗叠加展示；两图仍共用同一确定性布局，校验走后端结构匹配。
 */
import { ref, onMounted, watch } from 'vue'
import { Button, Select, Modal, message } from 'ant-design-vue'
import { useSessionStore } from '@/stores/session'
import { useAuthStore } from '@/stores/auth'
import { useProgressStore } from '@/stores/progress'
import { useEngagementStore } from '@/stores/engagement'
import type { LevelSummary } from '@/types/level'
import GitGraphView from '@/components/graph/GitGraphView.vue'
import TerminalView from '@/components/terminal/TerminalView.vue'
import OperationPanel from '@/components/panel/OperationPanel.vue'
import LevelHintDrawer from '@/components/level/LevelHintDrawer.vue'
import GoalGraphCard from '@/components/level/GoalGraphCard.vue'
import EngagementDrawer from '@/components/engagement/EngagementDrawer.vue'
import UserMenu from '@/components/auth/UserMenu.vue'
import gitArenaLogo from '@/assets/git-arena.png'

const store = useSessionStore()
const auth = useAuthStore()
const progress = useProgressStore()
const engagement = useEngagementStore()
const terminalRef = ref<InstanceType<typeof TerminalView> | null>(null)
const graphRef = ref<InstanceType<typeof GitGraphView> | null>(null)
const starting = ref(false)
const selectedSlug = ref<string | undefined>(undefined)
const hintOpen = ref(false)
const engagementOpen = ref(false)
const goalOpen = ref(true)
/** 本次开关卡后是否已通关：通关后停掉自动校验与重复庆祝，重开/换关时复位。 */
const sessionPassed = ref(false)

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

async function bootFreeSandbox(): Promise<void> {
  starting.value = true
  try {
    await store.initSession()
    selectedSlug.value = undefined
    terminalRef.value?.boot([
      'git-arena · 自由沙盒',
      '试试： git init → touch a.txt → git add . → git commit -m "init" → git branch/switch/merge',
    ])
  } catch (e) {
    message.error(errMsg(e))
    terminalRef.value?.writeError('会话创建失败：' + errMsg(e))
  } finally {
    starting.value = false
  }
}

async function onStartLevel(): Promise<void> {
  const level = store.levels.find((l: LevelSummary) => l.slug === selectedSlug.value)
  if (!level) {
    message.warning('请先选择一个关卡')
    return
  }
  starting.value = true
  try {
    await store.startLevel(level)
    sessionPassed.value = false
    terminalRef.value?.boot([
      `关卡：${level.title}（难度 ${'★'.repeat(level.difficulty)}）`,
      '让当前仓库达到目标图的状态，达成后会自动判定通关。',
    ])
  } catch (e) {
    message.error(errMsg(e))
  } finally {
    starting.value = false
  }
}

/** 通关流程：刷新进度 → 弹珠庆祝动画（图形复原后）→ 恭喜消息。 */
async function celebratePass(): Promise<void> {
  sessionPassed.value = true
  const title = store.activeLevel?.title ?? ''
  store.markActiveLevelCompleted()
  await Promise.all([progress.load(), store.loadLevels(), auth.refresh().catch(() => undefined)])
  await (graphRef.value?.celebrate() ?? Promise.resolve())
  Modal.success({
    title: '🎉 恭喜通关！',
    content: title ? `已完成「${title}」，仓库结构与目标一致。` : '仓库结构与目标一致。',
  })
}

/** 自动校验（oh-my-git / Learning Git Branching 风格）：git 命令成功后静默判定，通过即庆祝。 */
async function autoValidate(cmd: string): Promise<void> {
  if (!store.activeLevel || sessionPassed.value) return
  if (!cmd.trim().startsWith('git ')) return // shell 命令不改变提交结构，跳过
  try {
    const res = await store.validate()
    if (res.passed) await celebratePass()
  } catch {
    // 偶发失败静默不打断练习；下一条 git 命令会再次触发判定
  }
}

/** 终端回车提交：命令已由终端自身回显，直接执行并写回结果。 */
async function onTerminalSubmit(cmd: string): Promise<void> {
  try {
    const res = await store.exec(cmd)
    terminalRef.value?.writeResult(res)
    if (res.ok) await autoValidate(cmd)
  } catch (e) {
    terminalRef.value?.writeError(errMsg(e))
  }
}

/** 面板按钮：先在终端回显等价命令，再走同一链路（§3）。 */
async function onPanelRun(cmd: string): Promise<void> {
  terminalRef.value?.submitExternal(cmd)
  try {
    const res = await store.exec(cmd)
    terminalRef.value?.writeResult(res)
    if (res.ok) await autoValidate(cmd)
  } catch (e) {
    terminalRef.value?.writeError(errMsg(e))
  }
}

async function onReset(): Promise<void> {
  try {
    await store.reset()
    sessionPassed.value = false // 重开/重置后允许再次自动判定
    terminalRef.value?.boot([store.activeLevel ? '--- 关卡已重开 ---' : '--- 沙盒已重置 ---'])
    message.success(store.activeLevel ? '已重开本关' : '已重置到空仓库')
  } catch (e) {
    message.error(errMsg(e))
  }
}

onMounted(async () => {
  try {
    await store.loadLevels()
  } catch (e) {
    message.warning('关卡列表加载失败：' + errMsg(e))
  }
  await progress.load()
  await bootFreeSandbox()
})

// 登录/登出切换时刷新进度与关卡列表，确保状态字段同步到 UI。
watch(() => auth.isAuthenticated, async (isAuthenticated) => {
  if (!isAuthenticated) {
    engagement.clearPersonal()
  }
  await progress.load()
  await store.loadLevels()
})

watch(() => store.activeLevel?.slug, (slug, previousSlug) => {
  if (slug && slug !== previousSlug) goalOpen.value = true
})

</script>

<template>
  <div class="workbench">
    <header class="toolbar">
      <div class="brand">
        <img :src="gitArenaLogo" alt="" class="brand-logo" />
        <span>git-arena</span>
      </div>
      <RouterLink to="/rooms" class="nav-link">协作房间 →</RouterLink>

      <Select
        v-model:value="selectedSlug"
        class="level-select"
        size="small"
        placeholder="选择关卡…"
        :options="store.levels.map((l: LevelSummary) => ({
          value: l.slug,
          label: `${l.status === 'completed' ? '✓ ' : ''}[${l.category}] ${l.title} ${'★'.repeat(l.difficulty)}${l.status === 'in_progress' ? ' · 进行中' : l.status === 'locked' ? ' · 锁定' : ''}`,
          disabled: l.status === 'locked',
        }))"
      />
      <Button size="small" type="primary" :loading="starting" @click="onStartLevel">
        {{ store.activeLevel && store.activeLevel.slug === selectedSlug ? '重开关卡' : '开始关卡' }}
      </Button>
      <Button v-if="store.activeLevel" size="small" @click="hintOpen = true">
        提示{{ store.revealedHints > 0 ? ` ${store.revealedHints}/${store.levelDetail?.hints.length ?? 0}` : '' }}
      </Button>

      <div class="spacer"></div>
      <span v-if="auth.isAuthenticated && progress.completedCount > 0" class="progress-badge">
        已通关 {{ progress.completedCount }}/{{ store.levels.length }}
      </span>
      <span v-if="store.activeLevel" class="level-badge">{{ store.activeLevel.title }}</span>
      <span class="session">会话：{{ store.sessionId ? store.sessionId.slice(0, 8) : '未连接' }}</span>
      <Button size="small" @click="engagementOpen = true">
        成长{{ auth.isAuthenticated ? ` · ${auth.user?.totalPoints ?? 0}` : '' }}
      </Button>
      <Button size="small" :loading="starting" @click="bootFreeSandbox">自由沙盒</Button>
      <UserMenu />
    </header>

    <div class="body">
      <aside class="panel-col">
        <OperationPanel :disabled="!store.sessionId || store.busy" @run="onPanelRun" @reset="onReset" />
      </aside>

      <!-- stage 承载浮动目标卡的活动范围：图形区 + 终端区都可拖放 -->
      <div class="stage">
        <main class="graph-col">
          <section class="graph-pane">
            <div v-if="store.activeLevel" class="current-label">
              <span class="current-label-mark"></span>
              当前图
            </div>
            <GitGraphView ref="graphRef" :graph="store.graph" :interactive="true" />
          </section>
        </main>

        <section class="terminal-col">
          <TerminalView ref="terminalRef" @submit="onTerminalSubmit" />
        </section>

        <GoalGraphCard
          v-if="store.activeLevel"
          :key="`${store.sessionId ?? ''}:${store.activeLevel.slug}`"
          v-model:open="goalOpen"
          :graph="store.goalGraph"
          :level-title="store.activeLevel.title"
          :completed="store.activeLevel.status === 'completed'"
        />
      </div>
    </div>

    <LevelHintDrawer v-model:open="hintOpen" />
    <EngagementDrawer v-model:open="engagementOpen" />
  </div>
</template>

<style scoped>
.workbench {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 48px;
  padding: 0 16px;
  background: #fff;
  border-bottom: 1px solid #e8e8e8;
}
.brand {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  flex: 0 0 auto;
  font-weight: 700;
  font-size: 16px;
  color: #2f80ed;
  margin-right: 8px;
}
.brand-logo {
  width: 28px;
  height: 28px;
  object-fit: contain;
  flex: 0 0 28px;
  display: block;
}
.nav-link {
  font-size: 13px;
  color: #2f80ed;
  margin-right: 12px;
}
.level-select {
  width: 260px;
}
.spacer {
  flex: 1;
}
.level-badge {
  font-size: 12px;
  color: #2f80ed;
  background: #e8f0fe;
  padding: 2px 8px;
  border-radius: 4px;
}
.progress-badge {
  font-size: 12px;
  color: #27ae60;
  background: #e9f7ef;
  padding: 2px 8px;
  border-radius: 4px;
}
.session {
  font-size: 12px;
  color: #98a2b3;
  font-family: monospace;
}
.body {
  flex: 1;
  display: flex;
  min-height: 0;
}
.panel-col {
  width: 220px;
  border-right: 1px solid #e8e8e8;
  overflow: auto;
  background: #fff;
}
.stage {
  /* 目标卡浮层的坐标系与拖拽范围（图形区 + 终端区）；
     --goal-home-offset 与 .terminal-col 宽度保持同源，供卡片默认锚点避开终端。 */
  --goal-home-offset: max(40%, 360px);
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
}
.graph-col {
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
  overflow: hidden;
}
.graph-pane {
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.current-label {
  position: absolute;
  z-index: 4;
  top: 14px;
  left: 16px;
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  font-weight: 600;
  color: #4c5d70;
  pointer-events: none;
}
.current-label-mark {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #2f80ed;
  box-shadow: 0 0 0 3px rgba(47, 128, 237, 0.13);
}
.graph-pane :deep(.graph-view) {
  flex: 1;
}
.terminal-col {
  width: var(--goal-home-offset);
  border-left: 1px solid #e8e8e8;
}
</style>
