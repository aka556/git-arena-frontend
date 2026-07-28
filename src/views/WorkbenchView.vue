<script setup lang="ts">
/**
 * 工作台页面（CLAUDE.md §6.1 views）。图视图与终端视图并存，共用 store 里同一份 GitGraph 快照。
 *
 * <p>本页是命令的<b>唯一编排点</b>：终端回车与面板按钮都汇到 {@link execute}，经 store.exec 走同一后端
 * 链路（§3 黄金法则），再把结果写回终端；图视图通过 store.graph 响应式刷新。
 */
import { ref, onMounted } from 'vue'
import { Button, message } from 'ant-design-vue'
import { useSessionStore } from '@/stores/session'
import GitGraphView from '@/components/graph/GitGraphView.vue'
import TerminalView from '@/components/terminal/TerminalView.vue'
import OperationPanel from '@/components/panel/OperationPanel.vue'

const store = useSessionStore()
const terminalRef = ref<InstanceType<typeof TerminalView> | null>(null)
const starting = ref(false)

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

async function boot(): Promise<void> {
  starting.value = true
  try {
    await store.initSession()
    terminalRef.value?.boot([
      'git-arena · M1 骨架',
      '试试： git init → touch a.txt → git add . → git commit -m "init" → git log',
    ])
  } catch (e) {
    message.error(errMsg(e))
    terminalRef.value?.writeError('会话创建失败：' + errMsg(e))
  } finally {
    starting.value = false
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
    terminalRef.value?.boot(['--- 沙盒已重置 ---'])
    message.success('已重置到空仓库')
  } catch (e) {
    message.error(errMsg(e))
  }
}

onMounted(boot)
</script>

<template>
  <div class="workbench">
    <header class="toolbar">
      <div class="brand">git-arena</div>
      <div class="spacer"></div>
      <span class="session">会话：{{ store.sessionId ? store.sessionId.slice(0, 8) : '未连接' }}</span>
      <Button size="small" :loading="starting" @click="boot">新建会话</Button>
    </header>

    <div class="body">
      <aside class="panel-col">
        <OperationPanel :disabled="!store.sessionId || store.busy" @run="onPanelRun" @reset="onReset" />
      </aside>

      <main class="graph-col">
        <GitGraphView :graph="store.graph" />
      </main>

      <section class="terminal-col">
        <TerminalView ref="terminalRef" @submit="onTerminalSubmit" />
      </section>
    </div>
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
  gap: 12px;
  height: 48px;
  padding: 0 16px;
  background: #fff;
  border-bottom: 1px solid #e8e8e8;
}
.brand {
  font-weight: 700;
  font-size: 16px;
  color: #2f80ed;
}
.spacer {
  flex: 1;
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
  overflow: auto;
}
.terminal-col {
  width: 46%;
  min-width: 360px;
  border-left: 1px solid #e8e8e8;
}
</style>
