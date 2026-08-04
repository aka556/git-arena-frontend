/**
 * 协作房间契约类型（对应后端 RoomView / RoomJoinResponse）。
 */
import type { GitGraph } from './gitGraph'

export interface MemberView {
  memberId: string
  displayName: string
  avatarColor: string
  role: string
}

export interface PullRequestView {
  number: number
  title: string
  description: string | null
  sourceBranch: string
  targetBranch: string
  authorMemberId: string
  status: 'open' | 'merged' | 'closed'
  mergeable: 'unknown' | 'clean' | 'conflict'
  mergedByMemberId: string | null
  mergedAt: number | null
}

export interface RoomView {
  roomId: string
  joinCode: string
  name: string
  scenarioLevelSlug: string | null
  ownerMemberId: string | null
  members: MemberView[]
  pullRequests: PullRequestView[]
}

export interface RoomJoinResponse {
  room: RoomView
  memberId: string
  sessionId: string
  graph: GitGraph
}
