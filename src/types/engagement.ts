/**
 * 积分 / 成就 / 排行榜契约类型（对应后端 ScoreDtos、AchievementDtos）。
 */

export interface ScoreMe {
  userId: number
  totalPoints: number
}

/** 榜单口径（database.md §5.7）：all=累计总分，weekly/monthly=窗口内新增分。 */
export type LeaderboardPeriod = 'all' | 'weekly' | 'monthly'

export interface LeaderboardEntry {
  rank: number
  userId: number
  username: string | null
  displayName: string | null
  avatarColor: string | null
  /** 含义随所属 Board 的 metric 变化：total=累计分，window=窗口内新增分。 */
  points: number
}

export interface LeaderboardBoard {
  period: LeaderboardPeriod
  /** total=累计总分；window=窗口内新增分。两种口径不可混排，UI 需分别标注。 */
  metric: 'total' | 'window'
  /** 时段榜物化视图的最近刷新时刻（ISO-8601）；总榜为实时读，恒为 null。 */
  refreshedAt: string | null
  entries: LeaderboardEntry[]
}

export interface AchievementView {
  id: number
  code: string
  name: string
  description: string | null
  /** 图标标识（后端给的是语义 code，不是 URL），前端映射到 emoji。 */
  icon: string | null
  points: number
  category: string
  unlocked: boolean
  /** ISO-8601 带时区，仅 unlocked 时非空。 */
  unlockedAt: string | null
}
