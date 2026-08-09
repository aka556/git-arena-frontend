/**
 * 协作房间接口（对应后端 RoomController，§6.1）。
 */
import { request } from './http'
import type { CommandResponse, GitGraph } from '@/types/gitGraph'
import type {
  DiffSide,
  InlineCommentInput,
  PrDiff,
  ReviewState,
  ReviewThread,
} from '@/types/prReview'
import type { RoomJoinResponse, RoomView } from '@/types/room'

export function createRoom(name: string, displayName: string, scenarioLevelSlug?: string): Promise<RoomJoinResponse> {
  return request<RoomJoinResponse>({ url: '/rooms', method: 'post', data: { name, displayName, scenarioLevelSlug } })
}

export function joinRoom(joinCode: string, displayName: string): Promise<RoomJoinResponse> {
  return request<RoomJoinResponse>({ url: '/rooms/join', method: 'post', data: { joinCode, displayName } })
}

export function fetchOriginGraph(roomId: string): Promise<GitGraph> {
  return request<GitGraph>({ url: `/rooms/${roomId}/origin-graph`, method: 'get' })
}

/** 成员命令：走房间成员通道（后端在 push 后广播），与终端/面板共用同一链路（§3）。 */
export function memberExec(roomId: string, memberId: string, command: string): Promise<CommandResponse> {
  return request<CommandResponse>({
    url: `/rooms/${roomId}/members/${memberId}/exec`,
    method: 'post',
    data: { command },
  })
}

export function openPullRequest(
  roomId: string,
  payload: { memberId: string; title: string; description: string; sourceBranch: string; targetBranch: string },
): Promise<RoomView> {
  return request<RoomView>({ url: `/rooms/${roomId}/pulls`, method: 'post', data: payload })
}

export function mergePullRequest(roomId: string, number: number, memberId: string): Promise<RoomView> {
  return request<RoomView>({ url: `/rooms/${roomId}/pulls/${number}/merge`, method: 'post', data: { memberId } })
}

// ---- PR 评审（database.md §4.4/§4.5） ----

/** PR 三点差异（merge-base(target, source) → source HEAD），供评审面板渲染与行级评论定位。 */
export function fetchPrDiff(roomId: string, number: number): Promise<PrDiff> {
  return request<PrDiff>({ url: `/rooms/${roomId}/pulls/${number}/diff`, method: 'get' })
}

export function fetchPrThread(roomId: string, number: number): Promise<ReviewThread> {
  return request<ReviewThread>({ url: `/rooms/${roomId}/pulls/${number}/reviews`, method: 'get' })
}

/** 提交一次评审，可附带一批行级评论。 */
export function submitPrReview(
  roomId: string,
  number: number,
  payload: { state: ReviewState; body?: string; comments?: InlineCommentInput[] },
): Promise<ReviewThread> {
  return request<ReviewThread>({
    url: `/rooms/${roomId}/pulls/${number}/reviews`,
    method: 'post',
    data: payload,
  })
}

/** 追加一条评论：带 filePath+diffSide+line 即行级，否则整体。 */
export function addPrComment(
  roomId: string,
  number: number,
  payload: { body: string; filePath?: string; diffSide?: DiffSide; line?: number },
): Promise<ReviewThread> {
  return request<ReviewThread>({
    url: `/rooms/${roomId}/pulls/${number}/comments`,
    method: 'post',
    data: payload,
  })
}
