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
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  BranchesOutlined,
  LinkOutlined,
  PlusOutlined,
  TeamOutlined,
} from '@ant-design/icons-vue'
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
    <!-- 未入房：协作大厅 -->
    <div v-if="!store.room" class="lobby">
      <div class="lobby-top">
        <RouterLink to="/" class="nav-link">
          <ArrowLeftOutlined />
          <span>返回工作台</span>
        </RouterLink>
        <div class="spacer" />
        <UserMenu />
      </div>
      <main class="lobby-main">
        <section class="lobby-intro">
          <div class="intro-mark"><TeamOutlined /></div>
          <p class="lobby-eyebrow">COLLABORATION LAB / 01</p>
          <h1>把 Git 练习，<br /><em>变成一次真实协作。</em></h1>
          <p class="lobby-copy">
            创建一个共享仓库，邀请队友一起练习分支、推拉、冲突与 Pull Request。
            每个人都有自己的克隆，提交图会在你们眼前同步生长。
          </p>
          <div class="lobby-flow" aria-label="协作流程">
            <span><i>01</i>建房或加入</span>
            <b>→</b>
            <span><i>02</i>各自提交</span>
            <b>→</b>
            <span><i>03</i>合并协作</span>
          </div>
          <div class="lobby-note">
            <BranchesOutlined />
            <span>实时看到自己的克隆与共享 origin，两张图始终对照。</span>
          </div>
        </section>

        <section class="lobby-actions" aria-label="房间操作">
          <Card class="lobby-card create-card" :bordered="false">
            <div class="card-kicker"><PlusOutlined /> <span>HOST A ROOM</span></div>
            <h2>创建房间</h2>
            <p class="card-copy">你来设定练习场景，生成邀请码后邀请队友加入。</p>
            <form class="lobby-form" @submit.prevent="onCreate">
              <label class="lobby-field">
                <span>房间名称</span>
                <Input v-model:value="createName" size="large" placeholder="例如：周三 Git 练习" autocomplete="off" />
              </label>
              <label class="lobby-field">
                <span>你的昵称 <small>可选</small></span>
                <Input v-model:value="createDisplay" size="large" placeholder="在房间里显示的名字" autocomplete="nickname" />
              </label>
              <label class="lobby-field">
                <span>练习场景 <small>可选</small></span>
                <Select
                  v-model:value="createScenario"
                  size="large"
                  class="lobby-select"
                  allow-clear
                  placeholder="自由协作，或选择一张关卡"
                >
                  <SelectOption v-for="l in collabLevels" :key="l.slug" :value="l.slug">
                    {{ l.title }}（★{{ l.difficulty }}）
                  </SelectOption>
                </Select>
              </label>
              <Button class="lobby-primary" type="primary" size="large" html-type="submit" :loading="store.busy" block>
                创建并进入
                <ArrowRightOutlined />
              </Button>
            </form>
          </Card>

          <Card class="lobby-card join-card" :bordered="false">
            <div class="card-kicker join-kicker"><LinkOutlined /> <span>JOIN A ROOM</span></div>
            <h2>加入房间</h2>
            <p class="card-copy">输入队友分享的邀请码，立即进入同一个远程仓库。</p>
            <form class="lobby-form" @submit.prevent="onJoin">
              <label class="lobby-field">
                <span>邀请码</span>
                <Input v-model:value="joinCode" size="large" placeholder="例如：A7K-29Q" autocomplete="off" @pressEnter="onJoin" />
              </label>
              <label class="lobby-field">
                <span>你的昵称 <small>可选</small></span>
                <Input v-model:value="joinDisplay" size="large" placeholder="在房间里显示的名字" autocomplete="nickname" />
              </label>
              <div class="join-spacer" aria-hidden="true" />
              <Button class="lobby-secondary" size="large" html-type="submit" :loading="store.busy" block>
                加入房间
                <ArrowRightOutlined />
              </Button>
            </form>
            <p class="join-hint">没有邀请码？让队友先创建房间并分享给你。</p>
          </Card>
        </section>
      </main>
    </div>

    <!-- 入房后 -->
    <div v-else class="room">
      <header class="room-bar">
        <span class="room-name">{{ store.room?.name }}</span>
        <Tag color="blue">邀请码 {{ store.room?.joinCode }}</Tag>
        <span :class="['ws-dot', { on: store.connected }]" />
        <div class="roster">
          <Tooltip
            v-for="m in store.room?.members ?? []"
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
            <p v-if="store.room?.pullRequests.length === 0" class="pr-empty">还没有 PR</p>
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
.lobby { position: relative; display: flex; flex-direction: column; height: 100%; overflow: auto; color: #172b3a; background: #edf4f1; }
.lobby::before { position: absolute; inset: 0; pointer-events: none; content: ''; opacity: .46; background: radial-gradient(circle at 10% 18%, rgba(83, 154, 124, .22), transparent 34%), radial-gradient(circle at 89% 76%, rgba(242, 182, 104, .16), transparent 30%), linear-gradient(135deg, rgba(255,255,255,.42), transparent 48%); }
.lobby-top { position: relative; z-index: 1; display: flex; align-items: center; gap: 8px; height: 58px; flex: none; padding: 0 clamp(20px, 5vw, 72px); border-bottom: 1px solid rgba(39, 74, 64, .1); background: rgba(248, 252, 250, .74); backdrop-filter: blur(12px); }
.lobby-top .nav-link { display: inline-flex; align-items: center; gap: 8px; color: #315c50; font-size: 13px; font-weight: 600; text-decoration: none; transition: color 140ms ease, transform 140ms ease; }
.lobby-top .nav-link:hover { color: #16735b; transform: translateX(-2px); }
.lobby-main { position: relative; z-index: 1; display: grid; grid-template-columns: minmax(260px, .82fr) minmax(540px, 1.18fr); gap: clamp(34px, 7vw, 110px); align-items: center; width: min(1180px, calc(100% - 48px)); margin: 0 auto; padding: clamp(48px, 8vh, 96px) 0; }
.lobby-intro { max-width: 470px; }
.intro-mark { display: grid; place-items: center; width: 44px; height: 44px; margin-bottom: 22px; border: 1px solid rgba(30, 98, 77, .2); border-radius: 13px; color: #1c8064; background: rgba(255,255,255,.56); box-shadow: 0 8px 22px rgba(36, 95, 77, .08); font-size: 20px; }
.lobby-eyebrow, .card-kicker { margin: 0; color: #3b8b73; font-size: 10px; font-weight: 800; letter-spacing: .2em; }
.lobby-intro h1 { margin: 12px 0 18px; color: #193a35; font-size: clamp(34px, 3.6vw, 52px); font-weight: 700; letter-spacing: 0; line-height: 1.05; }
.lobby-intro h1 em { color: #d17b40; font-style: normal; }
.lobby-copy { max-width: 420px; margin: 0; color: #5d716d; font-size: 15px; line-height: 1.85; }
.lobby-flow { display: flex; align-items: center; gap: 10px; margin-top: 34px; color: #45645e; font-size: 11px; font-weight: 700; }
.lobby-flow span { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.lobby-flow i { display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; color: #fff; background: #398a70; font-family: 'Cascadia Code', Consolas, monospace; font-size: 9px; font-style: normal; }
.lobby-flow b { color: #a0b3ac; font-size: 16px; font-weight: 400; }
.lobby-note { display: flex; align-items: center; gap: 9px; max-width: 390px; margin-top: 34px; padding-top: 15px; border-top: 1px solid rgba(52, 105, 87, .16); color: #77908a; font-size: 12px; line-height: 1.55; }
.lobby-note :deep(svg) { flex: none; color: #3d9a78; font-size: 16px; }
.lobby-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.lobby-card { display: flex; flex-direction: column; box-sizing: border-box; min-height: 442px; padding: 30px 30px 28px; border: 1px solid rgba(52, 91, 77, .12); border-radius: 18px; box-shadow: 0 20px 48px rgba(42, 84, 70, .1); transition: transform 180ms ease, box-shadow 180ms ease; }
.lobby-card:hover { transform: translateY(-4px); box-shadow: 0 26px 56px rgba(42, 84, 70, .15); }
.lobby-card :deep(.ant-card-body) { display: flex; flex: 1; flex-direction: column; min-height: 0; padding: 0; }
.create-card { background: linear-gradient(145deg, #fff 0%, #f8fcfa 100%); }
.join-card { background: linear-gradient(145deg, #fdfbf7 0%, #fff 100%); }
.card-kicker { display: flex; align-items: center; gap: 7px; color: #39876f; }
.card-kicker :deep(svg) { font-size: 14px; }
.join-kicker { color: #c07a43; }
.lobby-card h2 { margin: 11px 0 7px; color: #203d38; font-size: 25px; letter-spacing: 0; }
.card-copy { min-height: 42px; margin: 0 0 25px; color: #73827e; font-size: 12px; line-height: 1.7; }
.lobby-form { display: flex; flex: 1; flex-direction: column; min-height: 0; }
.lobby-field { display: flex; flex-direction: column; gap: 7px; margin-bottom: 17px; color: #526862; font-size: 11px; font-weight: 700; letter-spacing: .02em; }
.lobby-field small { margin-left: 4px; color: #a4b2ad; font-size: 10px; font-weight: 500; }
.lobby-field :deep(.ant-input), .lobby-field :deep(.ant-select-selector) { border-color: #d8e6df !important; border-radius: 9px !important; box-shadow: none !important; }
.lobby-field :deep(.ant-input:hover), .lobby-field :deep(.ant-select-selector:hover) { border-color: #77b69e !important; }
.lobby-select { width: 100%; }
.lobby-primary, .lobby-secondary { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 44px; margin-top: auto; border-radius: 9px; font-size: 13px; font-weight: 700; }
.lobby-primary { border: none; background: #287a61; box-shadow: 0 8px 16px rgba(40, 122, 97, .2); }
.lobby-primary:hover { background: #1e684f !important; }
.lobby-secondary { color: #b56732; border-color: #e7c7a9; background: #fffaf5; }
.lobby-secondary:hover { color: #995324 !important; border-color: #d89561 !important; }
.join-spacer { flex: 1; min-height: 30px; }
.join-hint { margin: 16px 0 0; color: #9b9b8f; font-size: 11px; line-height: 1.55; }

@media (max-width: 920px) {
  .lobby-main { grid-template-columns: 1fr; gap: 38px; align-items: start; max-width: 680px; padding-top: 54px; }
  .lobby-intro { max-width: 620px; text-align: center; }
  .intro-mark { margin-right: auto; margin-left: auto; }
  .lobby-copy { margin-right: auto; margin-left: auto; }
  .lobby-flow, .lobby-note { justify-content: center; margin-right: auto; margin-left: auto; }
  .lobby-note { text-align: left; }
}

@media (max-width: 620px) {
  .lobby-top { height: 52px; padding: 0 16px; }
  .lobby-main { width: calc(100% - 32px); gap: 30px; padding: 34px 0 48px; }
  .lobby-intro h1 { font-size: clamp(33px, 10vw, 42px); }
  .lobby-copy { font-size: 13px; line-height: 1.7; }
  .lobby-flow { flex-wrap: wrap; gap: 7px; justify-content: center; margin-top: 24px; }
  .lobby-flow b { display: none; }
  .lobby-note { margin-top: 24px; text-align: left; }
  .lobby-actions { grid-template-columns: 1fr; }
  .lobby-card { min-height: 0; padding: 25px 22px 23px; }
  .card-copy { min-height: 0; margin-bottom: 22px; }
  .lobby-form { height: auto; }
  .join-spacer { display: none; }
  .lobby-primary, .lobby-secondary { margin-top: 10px; }
}

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
