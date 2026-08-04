<script setup lang="ts">
/**
 * 协作房间页（M3 阶段B，§1 协作差异化的落地）。未入房显示建/加房；入房后：
 * 名册（化身配色，§6.3）｜「我的克隆」与「共享 origin」双图对照｜终端+面板（成员命令走同一链路 §3）｜PR 面板。
 * 房间状态经 STOMP 实时同步（他人 push / PR 变更即刷新）。
 */
import { ref, computed, onBeforeUnmount } from 'vue'
import { Avatar, Button, Card, Input, Tag, Tooltip, message } from 'ant-design-vue'
import { useRoomStore } from '@/stores/room'
import type { MemberView, PullRequestView } from '@/types/room'
import GitGraphView from '@/components/graph/GitGraphView.vue'
import TerminalView from '@/components/terminal/TerminalView.vue'
import OperationPanel from '@/components/panel/OperationPanel.vue'

const store = useRoomStore()
const terminalRef = ref<InstanceType<typeof TerminalView> | null>(null)

// 建/加房表单
const createName = ref('')
const createDisplay = ref('')
const joinCode = ref('')
const joinDisplay = ref('')

// 开 PR 表单
const prTitle = ref('')
const prSource = ref('')
const prTarget = ref('main')

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

const memberName = (id: string | null): string =>
  store.room?.members.find((m: MemberView) => m.memberId === id)?.displayName ?? '—'

const openPrs = computed(() => store.room?.pullRequests.filter((p: PullRequestView) => p.status === 'open') ?? [])
const closedPrs = computed(() => store.room?.pullRequests.filter((p: PullRequestView) => p.status !== 'open') ?? [])

async function onCreate(): Promise<void> {
  if (!createName.value.trim()) return message.warning('请输入房间名')
  try {
    await store.create(createName.value.trim(), createDisplay.value.trim() || '房主')
    bootTerminal()
  } catch (e) {
    message.error(errMsg(e))
  }
}

async function onJoin(): Promise<void> {
  if (!joinCode.value.trim()) return message.warning('请输入邀请码')
  try {
    await store.join(joinCode.value.trim(), joinDisplay.value.trim() || '玩家')
    bootTerminal()
  } catch (e) {
    message.error(errMsg(e))
  }
}

function bootTerminal(): void {
  setTimeout(() => {
    terminalRef.value?.boot([
      `已加入房间「${store.room?.name}」，邀请码 ${store.room?.joinCode}`,
      '试试： git checkout -b feature → 改文件 → git commit → git push origin feature，再开 PR',
    ])
  }, 0)
}

async function onExec(command: string, echo: boolean): Promise<void> {
  if (echo) terminalRef.value?.submitExternal(command)
  try {
    const res = await store.exec(command)
    terminalRef.value?.writeResult(res)
  } catch (e) {
    terminalRef.value?.writeError(errMsg(e))
  }
}

async function onOpenPr(): Promise<void> {
  if (!prTitle.value.trim() || !prSource.value.trim()) return message.warning('请填写 PR 标题与源分支')
  try {
    await store.openPr({
      title: prTitle.value.trim(),
      description: '',
      sourceBranch: prSource.value.trim(),
      targetBranch: prTarget.value.trim() || 'main',
    })
    prTitle.value = ''
    prSource.value = ''
    message.success('PR 已创建')
  } catch (e) {
    message.error(errMsg(e))
  }
}

async function onMergePr(number: number): Promise<void> {
  try {
    await store.mergePr(number)
    message.success(`PR #${number} 已合并`)
  } catch (e) {
    message.error(errMsg(e))
  }
}

onBeforeUnmount(() => store.disconnect())
</script>

<template>
  <div class="rooms">
    <!-- 未入房：建 / 加房 -->
    <div v-if="!store.room" class="lobby">
      <Card title="创建房间" class="lobby-card">
        <Input v-model:value="createName" placeholder="房间名" class="lobby-input" />
        <Input v-model:value="createDisplay" placeholder="你的昵称（可选）" class="lobby-input" />
        <Button type="primary" :loading="store.busy" block @click="onCreate">创建并进入</Button>
      </Card>
      <Card title="加入房间" class="lobby-card">
        <Input v-model:value="joinCode" placeholder="邀请码" class="lobby-input" />
        <Input v-model:value="joinDisplay" placeholder="你的昵称（可选）" class="lobby-input" />
        <Button :loading="store.busy" block @click="onJoin">加入</Button>
      </Card>
    </div>

    <!-- 入房后 -->
    <div v-else class="room">
      <header class="room-bar">
        <span class="room-name">{{ store.room.name }}</span>
        <Tag color="blue">邀请码 {{ store.room.joinCode }}</Tag>
        <span :class="['ws-dot', { on: store.connected }]" />
        <div class="roster">
          <Tooltip
            v-for="m in store.room.members"
            :key="m.memberId"
            :title="`${m.displayName}${m.role === 'owner' ? '（房主）' : ''}${m.memberId === store.memberId ? ' · 你' : ''}`"
          >
            <Avatar :style="{ backgroundColor: m.avatarColor, border: m.memberId === store.memberId ? '2px solid #111' : 'none' }" size="small">
              {{ m.displayName.slice(0, 1) }}
            </Avatar>
          </Tooltip>
        </div>
        <div class="spacer" />
        <Button size="small" @click="store.leave()">离开房间</Button>
      </header>

      <div class="room-body">
        <aside class="room-panel">
          <OperationPanel :disabled="store.busy" @run="(c: string) => onExec(c, true)" @reset="() => {}" />

          <Card size="small" title="Pull Requests" class="pr-card">
            <div class="pr-form">
              <Input v-model:value="prTitle" size="small" placeholder="PR 标题" />
              <Input v-model:value="prSource" size="small" placeholder="源分支（需先 push）" />
              <Input v-model:value="prTarget" size="small" placeholder="目标分支" />
              <Button size="small" type="primary" block @click="onOpenPr">开 PR</Button>
            </div>

            <div v-for="pr in openPrs" :key="pr.number" class="pr-item">
              <div class="pr-line">
                <b>#{{ pr.number }}</b> {{ pr.title }}
                <Tag :color="pr.mergeable === 'conflict' ? 'red' : 'green'" class="pr-tag">{{ pr.mergeable }}</Tag>
              </div>
              <div class="pr-sub">{{ pr.sourceBranch }} → {{ pr.targetBranch }} · {{ memberName(pr.authorMemberId) }}</div>
              <Button v-if="store.isOwner()" size="small" type="primary" @click="onMergePr(pr.number)">合并</Button>
            </div>
            <div v-for="pr in closedPrs" :key="pr.number" class="pr-item closed">
              <div class="pr-line"><b>#{{ pr.number }}</b> {{ pr.title }} <Tag color="purple">{{ pr.status }}</Tag></div>
            </div>
            <p v-if="store.room.pullRequests.length === 0" class="pr-empty">还没有 PR</p>
          </Card>
        </aside>

        <main class="room-graphs">
          <section class="pane">
            <div class="pane-title">我的克隆</div>
            <GitGraphView :graph="store.myGraph" />
          </section>
          <section class="pane shared">
            <div class="pane-title">共享 origin（大家一起看的远程）</div>
            <GitGraphView :graph="store.originGraph" />
          </section>
        </main>

        <section class="room-terminal">
          <TerminalView ref="terminalRef" @submit="(c: string) => onExec(c, false)" />
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rooms { height: 100vh; display: flex; flex-direction: column; overflow: hidden; }
.lobby { display: flex; gap: 24px; justify-content: center; align-items: center; height: 100%; background: #f5f7fa; }
.lobby-card { width: 300px; }
.lobby-input { margin-bottom: 10px; }
.room { display: flex; flex-direction: column; height: 100%; }
.room-bar { display: flex; align-items: center; gap: 10px; height: 48px; padding: 0 16px; background: #fff; border-bottom: 1px solid #e8e8e8; }
.room-name { font-weight: 700; color: #2f80ed; }
.ws-dot { width: 8px; height: 8px; border-radius: 50%; background: #cbd5e1; }
.ws-dot.on { background: #27ae60; }
.roster { display: flex; gap: 4px; margin-left: 8px; }
.spacer { flex: 1; }
.room-body { flex: 1; display: flex; min-height: 0; }
.room-panel { width: 240px; border-right: 1px solid #e8e8e8; overflow: auto; background: #fff; }
.pr-card { margin: 8px; }
.pr-form { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; }
.pr-item { padding: 6px 0; border-top: 1px solid #eef1f5; }
.pr-item.closed { opacity: 0.6; }
.pr-line { font-size: 13px; }
.pr-tag { margin-left: 4px; }
.pr-sub { font-size: 11px; color: #98a2b3; margin: 2px 0 4px; }
.pr-empty { font-size: 12px; color: #98a2b3; }
.room-graphs { flex: 1; display: flex; min-width: 0; }
.pane { flex: 1; min-width: 0; display: flex; flex-direction: column; overflow: hidden; }
.pane.shared { border-left: 1px dashed #cbd5e1; background: #f8fafc; }
.pane-title { font-size: 12px; font-weight: 600; color: #667085; padding: 6px 10px; border-bottom: 1px solid #eef1f5; background: #fff; }
.pane :deep(.graph-view) { flex: 1; }
.room-terminal { width: 38%; min-width: 340px; border-left: 1px solid #e8e8e8; }
</style>
