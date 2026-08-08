/**
 * 积分 / 成就 / 排行榜契约类型（对应后端 ScoreDtos、AchievementDtos）。
 */

export interface ScoreMe {
  userId: number
  totalPoints: number
}

export interface LeaderboardEntry {
  rank: number
  userId: number
  username: string | null
  displayName: string | null
  avatarColor: string | null
  totalPoints: number
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
