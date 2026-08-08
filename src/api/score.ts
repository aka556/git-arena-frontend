/**
 * 积分与排行榜接口（对应后端 ScoreController）。
 */
import { request } from './http'
import type { LeaderboardEntry, ScoreMe } from '@/types/engagement'

/** 我的积分（需登录）。 */
export function getMyScore(): Promise<ScoreMe> {
  return request<ScoreMe>({ url: '/score/me', method: 'get' })
}

/** 全时段总榜（前 100，按 users.total_points 累计积分排名）。 */
export function getLeaderboard(): Promise<LeaderboardEntry[]> {
  return request<LeaderboardEntry[]>({ url: '/score/leaderboard', method: 'get' })
}
