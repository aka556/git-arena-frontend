/**
 * 积分与排行榜接口（对应后端 ScoreController）。
 */
import { request } from './http'
import type { LeaderboardBoard, LeaderboardPeriod, ScoreMe } from '@/types/engagement'

/** 我的积分（需登录）。 */
export function getMyScore(): Promise<ScoreMe> {
  return request<ScoreMe>({ url: '/score/me', method: 'get' })
}

/**
 * 排行榜前 100（匿名可读）。
 * period=all 读累计总分；weekly/monthly 读物化视图的窗口内新增分，最多滞后一个刷新周期（5 分钟）。
 */
export function getLeaderboard(period: LeaderboardPeriod = 'all'): Promise<LeaderboardBoard> {
  return request<LeaderboardBoard>({ url: '/score/leaderboard', method: 'get', params: { period } })
}
