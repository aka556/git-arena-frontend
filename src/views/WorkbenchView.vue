<script setup lang="ts">
/**
 * 工作台页面（CLAUDE.md §6.1 views）。图视图与终端视图并存，共用 store 里同一份 GitGraph 快照。
 *
 * <p>本页是命令的<b>唯一编排点</b>：终端回车与面板按钮都汇到统一执行链路（§3 黄金法则）。
 * 关卡模式下并排渲染"当前图 | 目标图"（§6.3 对照展示，两图共用同一确定性布局），校验走后端结构匹配。
 */
import { computed, ref, onMounted, watch } from 'vue'
import { Button, Select, Modal, message } from 'ant-design-vue'
import { useSessionStore } from '@/stores/session'
import { useAuthStore } from '@/stores/auth'
import { useProgressStore } from '@/stores/progress'
import type { LevelSummary } from '@/types/level'
import GitGraphView from '@/components/graph/GitGraphView.vue'
import TerminalView from '@/components/terminal/TerminalView.vue'
import OperationPanel from '@/components/panel/OperationPanel.vue'
import LevelHintDrawer from '@/components/level/LevelHintDrawer.vue'
import UserMenu from '@/components/auth/UserMenu.vue'

const store = useSessionStore()
const auth = useAuthStore()
const progress = useProgressStore()
const terminalRef = ref<InstanceType<typeof TerminalView> | null>(null)
const starting = ref(false)
const selectedSlug = ref<string | undefined>(undefined)
const hintOpen = ref(false)

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
    terminalRef.value?.boot([
      `关卡：${level.title}（难度 ${'★'.repeat(level.difficulty)}）`,
      '让"当前图"变成右侧"目标图"，然后点「校验」。',
    ])
  } catch (e) {
    message.error(errMsg(e))
  } finally {
    starting.value = false
  }
}

async function onValidate(): Promise<void> {
  try {
    const res = await store.validate()
    if (res.passed) {
      // 后端已在校验时落库本次通关（登录用户）；这里重拉进度以更新"已通关"标注。
      await Promise.all([progress.load(), auth.refresh().catch(() => undefined)])
      Modal.success({ title: '🎉 通关！', content: '仓库结构与目标一致。' })
    } else {
      Modal.warning({
        title: '还没达成目标',
        content: () => res.reasons.map((r) => '· ' + r).join('\n'),
      })
    }
  } catch (e) {
    message.error(errMsg(e))
  }
}

/** 终端回车提交：命令已由终端自身回显，直接执行并写回结果。 */
async function onTerminalSubmit(cmd: string): Promise<void> {
  try {
    const res = await store.exec(cmd)
    terminalRef.value?.writeResult(res)
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
  } catch (e) {
    terminalRef.value?.writeError(errMsg(e))
  }
}

async function onReset(): Promise<void> {
  try {
    await store.reset()
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
watch(() => auth.isAuthenticated, async () => {
  await progress.load()
  await store.loadLevels()
})

</script>

<template>
  <div class="workbench">
    <header class="toolbar">
      <div class="brand">git-arena</div>
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
      <Button v-if="store.activeLevel" size="small" @click="onValidate">校验</Button>
      <Button v-if="store.activeLevel" size="small" @click="hintOpen = true">
        提示{{ store.revealedHints > 0 ? ` ${store.revealedHints}/${store.levelDetail?.hints.length ?? 0}` : '' }}
      </Button>

      <div class="spacer"></div>
      <span v-if="auth.isAuthenticated && progress.completedCount > 0" class="progress-badge">
        已通关 {{ progress.completedCount }}/{{ store.levels.length }}
      </span>
      <span v-if="store.activeLevel" class="level-badge">{{ store.activeLevel.title }}</span>
      <span class="session">会话：{{ store.sessionId ? store.sessionId.slice(0, 8) : '未连接' }}</span>
      <Button size="small" :loading="starting" @click="bootFreeSandbox">自由沙盒</Button>
      <UserMenu />
    </header>

    <div class="body">
      <aside class="panel-col">
        <OperationPanel :disabled="!store.sessionId || store.busy" @run="onPanelRun" @reset="onReset" />
      </aside>

      <main class="graph-col" :class="{ split: store.activeLevel }">
        <section class="graph-pane">
          <div v-if="store.activeLevel" class="pane-title">当前图</div>
          <GitGraphView :graph="store.graph" />
        </section>
        <section v-if="store.activeLevel" class="graph-pane goal-pane">
          <div class="pane-title">目标图</div>
          <GitGraphView :graph="store.goalGraph" />
        </section>
      </main>

      <section class="terminal-col">
        <TerminalView ref="terminalRef" @submit="onTerminalSubmit" />
      </section>
    </div>

    <LevelHintDrawer v-model:open="hintOpen" />
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
  font-weight: 700;
  font-size: 16px;
  color: #2f80ed;
  margin-right: 8px;
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
.graph-col {
  flex: 1;
  min-width: 0;
  display: flex;
  overflow: hidden;
}
.graph-pane {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.goal-pane {
  border-left: 1px dashed #cbd5e1;
  background: #f8fafc;
}
.pane-title {
  font-size: 12px;
  font-weight: 600;
  color: #667085;
  padding: 6px 10px;
  border-bottom: 1px solid #eef1f5;
  background: #fff;
}
.graph-pane :deep(.graph-view) {
  flex: 1;
}
.terminal-col {
  width: 40%;
  min-width: 360px;
  border-left: 1px solid #e8e8e8;
}
</style>
