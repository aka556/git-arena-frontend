/**
 * 成长系统状态（积分、成就、排行榜）。
 *
 * <p>服务端仍是积分与解锁状态的唯一真相；本 store 只缓存用于展示的只读查询结果，
 * 组件不得直接请求接口（AGENTS.md §6.2）。
 */
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { getMyAchievements } from '@/api/achievement'
import { getLeaderboard, getMyScore } from '@/api/score'
import { useAuthStore } from './auth'
import type { AchievementView, LeaderboardBoard, LeaderboardPeriod } from '@/types/engagement'

const EMPTY_BOARD: LeaderboardBoard = { period: 'all', metric: 'total', refreshedAt: null, entries: [] }

export const useEngagementStore = defineStore('engagement', () => {
  const board = ref<LeaderboardBoard>(EMPTY_BOARD)
  const period = ref<LeaderboardPeriod>('all')
  const achievements = ref<AchievementView[]>([])
  const loading = ref(false)
  const boardLoading = ref(false)
  const loaded = ref(false)

  const leaderboard = computed(() => board.value.entries)

  const unlockedCount = computed(() => achievements.value.filter((achievement) => achievement.unlocked).length)
  const totalAchievementPoints = computed(() => achievements.value
    .filter((achievement) => achievement.unlocked)
    .reduce((sum, achievement) => sum + achievement.points, 0))

  /**
   * 拉取成长中心所需数据。排行榜对匿名用户开放；个人积分与成就仅在登录后加载。
   */
  async function load(): Promise<void> {
    const auth = useAuthStore()
    loading.value = true
    try {
      const boardRequest = getLeaderboard(period.value)
      if (auth.isAuthenticated) {
        const [nextBoard, score, nextAchievements] = await Promise.all([
          boardRequest,
          getMyScore(),
          getMyAchievements(),
        ])
        board.value = nextBoard
        achievements.value = nextAchievements
        auth.setTotalPoints(score.totalPoints)
      } else {
        board.value = await boardRequest
        achievements.value = []
      }
      loaded.value = true
    } finally {
      loading.value = false
    }
  }

  /** 切换榜单口径：只重取榜单，不动成就与个人积分。 */
  async function switchPeriod(next: LeaderboardPeriod): Promise<void> {
    period.value = next
    boardLoading.value = true
    try {
      board.value = await getLeaderboard(next)
    } finally {
      boardLoading.value = false
    }
  }

  /** 退出或切换账号时清除上一位用户的个人成就缓存。 */
  function clearPersonal(): void {
    achievements.value = []
  }

  return {
    board,
    period,
    leaderboard,
    achievements,
    loading,
    boardLoading,
    loaded,
    unlockedCount,
    totalAchievementPoints,
    load,
    switchPeriod,
    clearPersonal,
  }
})
