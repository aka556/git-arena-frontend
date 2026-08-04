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
import type { RoomView } from '@/types/room'
import {
  createRoom as apiCreateRoom,
  joinRoom as apiJoinRoom,
  fetchOriginGraph,
  memberExec,
  openPullRequest,
  mergePullRequest,
} from '@/api/room'

export const useRoomStore = defineStore('room', () => {
  const room = ref<RoomView | null>(null)
  const memberId = ref<string | null>(null)
  const sessionId = ref<string | null>(null)
  const myGraph = ref<GitGraph | null>(null)
  const originGraph = ref<GitGraph | null>(null)
  const busy = ref(false)
  const connected = ref(false)

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
          // 房间有变（他人 push / PR）→ 刷新共享图
          void refreshOrigin()
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

  async function create(name: string, displayName: string): Promise<void> {
    busy.value = true
    try {
      const res = await apiCreateRoom(name, displayName)
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
    connectStomp(res.room.roomId)
    void refreshOrigin()
  }

  /** 成员命令（终端/面板共用）。刷新自己的图；push 由后端广播触发共享图刷新。 */
  async function exec(command: string): Promise<CommandResponse> {
    if (!room.value || !memberId.value) throw new Error('未加入房间')
    const res = await memberExec(room.value.roomId, memberId.value, command)
    myGraph.value = res.graph
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
  }

  function leave(): void {
    disconnect()
    room.value = null
    memberId.value = null
    sessionId.value = null
    myGraph.value = null
    originGraph.value = null
  }

  return {
    room, memberId, sessionId, myGraph, originGraph, busy, connected,
    isOwner, create, join, exec, openPr, mergePr, refreshOrigin, leave, disconnect,
  }
})
