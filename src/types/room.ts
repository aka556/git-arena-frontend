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
  /** 生效中的 approve 数（同一评审者只算最新一次）。 */
  approvals: number
  /** 是否被「请求修改」挡住合并（database.md §4.4 闸门）。 */
  changesRequested: boolean
  commentCount: number
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

/** 房间场景关卡（collab 关卡的目标说明与目标图）；房间无场景时后端返回 null。 */
export interface RoomScenarioView {
  slug: string
  title: string
  description: string | null
  difficulty: number
  goalGraph: GitGraph
}
