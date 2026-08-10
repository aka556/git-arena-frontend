<script setup lang="ts">
/**
 * 协作房间页（M3 阶段B，§1 协作差异化的落地）。未入房显示建/加房；入房后：
 * 名册（化身配色，§6.3）｜「我的克隆」与「共享 origin」双图对照｜终端+面板（成员命令走同一链路 §3）｜PR 面板。
 * 房间状态经 STOMP 实时同步（他人 push / PR 变更即刷新）。
 */
import { ref, computed, onBeforeUnmount, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  Avatar, Button, Card, Input, Select, SelectOption, Tag, Tooltip, message,
} from 'ant-design-vue'
import { useRoomStore } from '@/stores/room'
import { useAuthStore } from '@/stores/auth'
import type { MemberView, PullRequestView } from '@/types/room'
import type { LevelSummary } from '@/types/level'
import { listLevels } from '@/api/level'
import GitGraphView from '@/components/graph/GitGraphView.vue'
import TerminalView from '@/components/terminal/TerminalView.vue'
import OperationPanel from '@/components/panel/OperationPanel.vue'
import PrReviewDrawer from '@/components/collab/PrReviewDrawer.vue'
import UserMenu from '@/components/auth/UserMenu.vue'

const store = useRoomStore()
const auth = useAuthStore()
const router = useRouter()
const terminalRef = ref<InstanceType<typeof TerminalView> | null>(null)

// 建/加房表单（昵称默认取登录用户展示名，方便协作中辨认彼此——呼应 §6.3 化身标识）
const createName = ref('')
const createDisplay = ref(auth.user?.displayName ?? '')
const createScenario = ref<string | undefined>(undefined)
const collabLevels = ref<LevelSummary[]>([])
const joinCode = ref('')
const joinDisplay = ref(auth.user?.displayName ?? '')
const validating = ref(false)

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

/** 协作房间需登录（后端以登录用户鉴权，memberId 只是标识不是凭证）：未登录先引导登录。 */
function requireLogin(): boolean {
  if (auth.isAuthenticated) return true
  message.info('参与协作房间需要先登录（游客也可一键体验）')
  void router.push({ path: '/login', query: { redirect: '/rooms' } })
  return false
}

async function onCreate(): Promise<void> {
  if (!createName.value.trim()) return message.warning('请输入房间名')
  if (!requireLogin()) return
  try {
    await store.create(
      createName.value.trim(),
      createDisplay.value.trim() || '房主',
      createScenario.value,
    )
    bootTerminal()
  } catch (e) {
    message.error(errMsg(e))
  }
}

async function onJoin(): Promise<void> {
  if (!joinCode.value.trim()) return message.warning('请输入邀请码')
  if (!requireLogin()) return
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

/** 打开评审面板（差异 + 评审串由 store 拉取）。 */
async function onReview(number: number): Promise<void> {
  try {
    await store.loadReview(number)
  } catch (e) {
    message.error(errMsg(e))
  }
}

/** 校验房间场景关卡：通过后给出明确反馈，未通过把差异原样列出（教学反馈）。 */
async function onValidateScenario(): Promise<void> {
  validating.value = true
  try {
    const res = await store.validateScenario()
    if (res.passed) {
      message.success('🎉 场景关卡达成！')
    } else {
      message.warning('还没达成目标，看看下面的差异')
    }
  } catch (e) {
    message.error(errMsg(e))
  } finally {
    validating.value = false
  }
}

// collab 关卡列表供建房时选场景（solo 关卡不能当房间场景，后端也会 fail-closed 拒绝）
onMounted(async () => {
  try {
    collabLevels.value = (await listLevels()).filter((l) => l.mode === 'collab')
  } catch {
    collabLevels.value = []
  }
})

onBeforeUnmount(() => store.disconnect())
</script>

<template>
  <div class="rooms">
    <!-- 未入房：建 / 加房 -->
    <div v-if="!store.room" class="lobby">
      <div class="lobby-top">
        <RouterLink to="/" class="nav-link">← 工作台</RouterLink>
        <div class="spacer" />
        <UserMenu />
      </div>
      <div class="lobby-cards">
        <Card title="创建房间" class="lobby-card">
          <Input v-model:value="createName" placeholder="房间名" class="lobby-input" />
          <Input v-model:value="createDisplay" placeholder="你的昵称（可选）" class="lobby-input" />
          <Select
            v-model:value="createScenario"
            class="lobby-input"
            allow-clear
            placeholder="场景关卡（可选，留空=自由协作）"
          >
            <SelectOption v-for="l in collabLevels" :key="l.slug" :value="l.slug">
              {{ l.title }}（★{{ l.difficulty }}）
            </SelectOption>
          </Select>
          <Button type="primary" :loading="store.busy" block @click="onCreate">创建并进入</Button>
        </Card>
        <Card title="加入房间" class="lobby-card">
          <Input v-model:value="joinCode" placeholder="邀请码" class="lobby-input" />
          <Input v-model:value="joinDisplay" placeholder="你的昵称（可选）" class="lobby-input" />
          <Button :loading="store.busy" block @click="onJoin">加入</Button>
        </Card>
      </div>
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
        <UserMenu />
      </header>

      <div class="room-body">
        <aside class="room-panel">
          <Card v-if="store.scenario" size="small" class="scenario-card">
            <template #title>
              <span class="scenario-title">
                场景关卡 · {{ store.scenario.title }}
                <Tag v-if="store.scenarioPassed" color="green">已达成</Tag>
              </span>
            </template>
            <p class="scenario-desc">{{ store.scenario.description }}</p>
            <div class="scenario-goal">
              <div class="scenario-goal-label">目标图</div>
              <div class="scenario-goal-canvas">
                <GitGraphView :graph="store.scenario.goalGraph" :fit="true" />
              </div>
            </div>
            <Button size="small" type="primary" block :loading="validating" @click="onValidateScenario">
              校验目标
            </Button>
            <ul v-if="store.scenarioResult && !store.scenarioResult.passed" class="scenario-reasons">
              <li v-for="(r, i) in store.scenarioResult.reasons" :key="i">{{ r }}</li>
            </ul>
          </Card>

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
              <div class="pr-badges">
                <Tag v-if="pr.changesRequested" color="red">请求修改</Tag>
                <Tag v-else-if="pr.approvals > 0" color="green">已批准 {{ pr.approvals }}</Tag>
                <Tag v-if="pr.commentCount > 0">评论 {{ pr.commentCount }}</Tag>
              </div>
              <div class="pr-actions">
                <Button size="small" @click="onReview(pr.number)">评审</Button>
                <Tooltip v-if="store.isOwner() && pr.changesRequested" title="有评审者请求修改，需其重新评审通过后才能合并">
                  <Button size="small" type="primary" disabled>合并</Button>
                </Tooltip>
                <Button
                  v-else-if="store.isOwner()"
                  size="small"
                  type="primary"
                  @click="onMergePr(pr.number)"
                >
                  合并
                </Button>
              </div>
            </div>
            <div v-for="pr in closedPrs" :key="pr.number" class="pr-item closed">
              <div class="pr-line"><b>#{{ pr.number }}</b> {{ pr.title }} <Tag color="purple">{{ pr.status }}</Tag></div>
              <Button size="small" type="link" @click="onReview(pr.number)">查看评审</Button>
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

      <PrReviewDrawer />
    </div>
  </div>
</template>

<style scoped>
.rooms { height: 100vh; display: flex; flex-direction: column; overflow: hidden; }
.lobby { display: flex; flex-direction: column; height: 100%; background: #f5f7fa; }
.lobby-top { display: flex; align-items: center; gap: 8px; height: 48px; padding: 0 16px; background: #fff; border-bottom: 1px solid #e8e8e8; }
.lobby-top .nav-link { font-size: 13px; color: #2f80ed; }
.lobby-cards { flex: 1; display: flex; gap: 24px; justify-content: center; align-items: center; }
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
.scenario-card { margin: 8px; }
.scenario-title { font-size: 12px; }
.scenario-desc { margin: 0 0 8px; font-size: 12px; line-height: 1.6; color: #475467; white-space: pre-wrap; }
.scenario-goal { margin-bottom: 8px; }
.scenario-goal-label { margin-bottom: 4px; font-size: 11px; color: #98a2b3; }
.scenario-goal-canvas { height: 150px; overflow: hidden; border: 1px solid #eef1f5; border-radius: 4px; }
.scenario-reasons { margin: 8px 0 0; padding-left: 16px; font-size: 11px; color: #eb5757; }
.pr-card { margin: 8px; }
.pr-form { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; }
.pr-item { padding: 6px 0; border-top: 1px solid #eef1f5; }
.pr-item.closed { opacity: 0.6; }
.pr-line { font-size: 13px; }
.pr-tag { margin-left: 4px; }
.pr-sub { font-size: 11px; color: #98a2b3; margin: 2px 0 4px; }
.pr-badges { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 6px; }
.pr-actions { display: flex; gap: 6px; }
.pr-empty { font-size: 12px; color: #98a2b3; }
.room-graphs { flex: 1; display: flex; min-width: 0; }
.pane { flex: 1; min-width: 0; display: flex; flex-direction: column; overflow: hidden; }
.pane.shared { border-left: 1px dashed #cbd5e1; background: #f8fafc; }
.pane-title { font-size: 12px; font-weight: 600; color: #667085; padding: 6px 10px; border-bottom: 1px solid #eef1f5; background: #fff; }
.pane :deep(.graph-view) { flex: 1; }
.room-terminal { width: 38%; min-width: 340px; border-left: 1px solid #e8e8e8; }
</style>
