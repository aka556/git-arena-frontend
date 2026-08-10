/**
 * 协作房间 store（§6.2）。持有房间快照、本成员标识、本成员克隆图与共享 origin 图。
 *
 * <p>成员命令走 memberExec（同一命令链路 §3，后端在 push 后广播）；房间状态变更（有人加入 / push /
 * PR）经 STOMP 主题 /topic/rooms/{id} 推来，收到即刷新名册、PR 与共享图——图仍是后端实时读出的快照，
 * 不在前端预测（§3 黄金法则）。
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { Client, type IMessage } from '@stomp/stompjs'
import SockJS from 'sockjs-client'
import type { CommandResponse, GitGraph } from '@/types/gitGraph'
import type { DiffSide, InlineCommentInput, PrDiff, ReviewState, ReviewThread } from '@/types/prReview'
import type { RoomScenarioView, RoomView } from '@/types/room'
import type { ValidateResponse } from '@/types/level'
import {
  createRoom as apiCreateRoom,
  joinRoom as apiJoinRoom,
  addPrComment,
  fetchOriginGraph,
  fetchPrDiff,
  fetchPrThread,
  fetchRoomScenario,
  memberExec,
  openPullRequest,
  mergePullRequest,
  submitPrReview,
  validateRoomScenario,
} from '@/api/room'
import { useAuthStore } from './auth'

export const useRoomStore = defineStore('room', () => {
  const room = ref<RoomView | null>(null)
  const memberId = ref<string | null>(null)
  const sessionId = ref<string | null>(null)
  const myGraph = ref<GitGraph | null>(null)
  const originGraph = ref<GitGraph | null>(null)
  const busy = ref(false)
  const connected = ref(false)

  /** 房间场景关卡（collab 关卡）；自由协作房间为 null。 */
  const scenario = ref<RoomScenarioView | null>(null)
  const scenarioResult = ref<ValidateResponse | null>(null)
  const scenarioPassed = ref(false)

  /** 正在评审的 PR 编号；null = 未打开评审面板。 */
  const reviewingPr = ref<number | null>(null)
  const prDiff = ref<PrDiff | null>(null)
  const prThread = ref<ReviewThread | null>(null)
  const reviewLoading = ref(false)

  let stomp: Client | null = null

  function isOwner(): boolean {
    return !!room.value && !!memberId.value && room.value.ownerMemberId === memberId.value
  }

  async function refreshOrigin(): Promise<void> {
    if (room.value) {
      originGraph.value = await fetchOriginGraph(room.value.roomId)
    }
  }

  function connectStomp(roomId: string): void {
    disconnect()
    stomp = new Client({
      webSocketFactory: () => new SockJS('/ws'),
      reconnectDelay: 3000,
      onConnect: () => {
        connected.value = true
        stomp?.subscribe(`/topic/rooms/${roomId}`, (msg: IMessage) => {
          room.value = JSON.parse(msg.body) as RoomView
          // 房间有变（他人 push / PR / 评审）→ 刷新共享图
          void refreshOrigin()
          // push 会让后端重算行级评论锚点（§4.5），面板开着就得重拉，否则显示的是过期行号
          if (reviewingPr.value != null) {
            void loadReview(reviewingPr.value).catch(() => undefined)
          }
        })
      },
      onDisconnect: () => (connected.value = false),
    })
    stomp.activate()
  }

  function disconnect(): void {
    if (stomp) {
      void stomp.deactivate()
      stomp = null
    }
    connected.value = false
  }

  async function create(name: string, displayName: string, scenarioLevelSlug?: string): Promise<void> {
    busy.value = true
    try {
      const res = await apiCreateRoom(name, displayName, scenarioLevelSlug)
      applyJoin(res)
    } finally {
      busy.value = false
    }
  }

  async function join(joinCode: string, displayName: string): Promise<void> {
    busy.value = true
    try {
      const res = await apiJoinRoom(joinCode, displayName)
      applyJoin(res)
    } finally {
      busy.value = false
    }
  }

  function applyJoin(res: {
    room: RoomView
    memberId: string
    sessionId: string
    graph: GitGraph
  }): void {
    room.value = res.room
    memberId.value = res.memberId
    sessionId.value = res.sessionId
    myGraph.value = res.graph
    scenarioResult.value = null
    scenarioPassed.value = false
    connectStomp(res.room.roomId)
    void refreshOrigin()
    void loadScenario()
  }

  /** 拉取房间场景关卡（建房时选定的 collab 关卡）；自由房间置 null。 */
  async function loadScenario(): Promise<void> {
    if (!room.value) return
    try {
      scenario.value = await fetchRoomScenario(room.value.roomId)
    } catch {
      scenario.value = null // 场景加载失败不该挡住协作本身
    }
  }

  /** 跑场景关卡校验（prMerged 断言查本房 PR）。 */
  async function validateScenario(): Promise<ValidateResponse> {
    if (!room.value || !memberId.value) throw new Error('未加入房间')
    const res = await validateRoomScenario(room.value.roomId, memberId.value)
    scenarioResult.value = res
    if (res.passed) scenarioPassed.value = true
    return res
  }

  /** 成员命令（终端/面板共用）。刷新自己的图；push 由后端广播触发共享图刷新。 */
  async function exec(command: string): Promise<CommandResponse> {
    if (!room.value || !memberId.value) throw new Error('未加入房间')
    const res = await memberExec(room.value.roomId, memberId.value, command)
    myGraph.value = res.graph
    if (res.ok && /^git\s+commit(?:\s|$)/.test(command.trim())) {
      await useAuthStore().refresh().catch(() => undefined)
    }
    return res
  }

  async function openPr(payload: {
    title: string
    description: string
    sourceBranch: string
    targetBranch: string
  }): Promise<void> {
    if (!room.value || !memberId.value) throw new Error('未加入房间')
    room.value = await openPullRequest(room.value.roomId, { memberId: memberId.value, ...payload })
  }

  async function mergePr(number: number): Promise<void> {
    if (!room.value || !memberId.value) throw new Error('未加入房间')
    room.value = await mergePullRequest(room.value.roomId, number, memberId.value)
    await refreshOrigin()
    await useAuthStore().refresh().catch(() => undefined)
    if (reviewingPr.value === number) {
      await loadReview(number)
    }
  }

  /** 打开某个 PR 的评审面板：差异与评审串一并拉取。 */
  async function loadReview(number: number): Promise<void> {
    if (!room.value) throw new Error('未加入房间')
    reviewingPr.value = number
    reviewLoading.value = true
    try {
      const [diff, thread] = await Promise.all([
        fetchPrDiff(room.value.roomId, number),
        fetchPrThread(room.value.roomId, number),
      ])
      prDiff.value = diff
      prThread.value = thread
    } finally {
      reviewLoading.value = false
    }
  }

  function closeReview(): void {
    reviewingPr.value = null
    prDiff.value = null
    prThread.value = null
  }

  /**
   * 提交评审。附带的行级评论只报「哪一侧的哪一行」，
   * 锚点事实（sha / hunk）由后端按当时真实 diff 定格，前端不自报（§4.5）。
   */
  async function submitReview(payload: {
    state: ReviewState
    body?: string
    comments?: InlineCommentInput[]
  }): Promise<void> {
    if (!room.value || reviewingPr.value == null) throw new Error('没有正在评审的 PR')
    prThread.value = await submitPrReview(room.value.roomId, reviewingPr.value, payload)
  }

  async function comment(payload: {
    body: string
    filePath?: string
    diffSide?: DiffSide
    line?: number
  }): Promise<void> {
    if (!room.value || reviewingPr.value == null) throw new Error('没有正在评审的 PR')
    prThread.value = await addPrComment(room.value.roomId, reviewingPr.value, payload)
  }

  function leave(): void {
    disconnect()
    room.value = null
    memberId.value = null
    sessionId.value = null
    myGraph.value = null
    originGraph.value = null
    closeReview()
  }

  return {
    room, memberId, sessionId, myGraph, originGraph, busy, connected,
    scenario, scenarioResult, scenarioPassed,
    reviewingPr, prDiff, prThread, reviewLoading,
    isOwner, create, join, exec, openPr, mergePr, refreshOrigin, leave, disconnect,
    loadScenario, validateScenario,
    loadReview, closeReview, submitReview, comment,
  }
})
