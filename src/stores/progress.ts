/**
 * 关卡进度 store（§6.2：一个领域一个 store）。持有当前用户的关卡进度，供工作台标注"已通关"。
 *
 * <p>进度真相在后端库（user_level_progress）；本 store 只是只读缓存，登录态变化或每次通关后重拉。
 * 未登录时为空集合（匿名不落库）。
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { myProgress, type ProgressView } from '@/api/progress'
import { useAuthStore } from './auth'

export const useProgressStore = defineStore('progress', () => {
  const items = ref<ProgressView[]>([])

  const completedSlugs = computed(
    () => new Set(items.value.filter((p) => p.status === 'completed').map((p) => p.slug)),
  )
  const completedCount = computed(() => completedSlugs.value.size)

  /** 拉取我的进度；未登录或失败则清空（不打断页面）。 */
  async function load(): Promise<void> {
    if (!useAuthStore().isAuthenticated) {
      items.value = []
      return
    }
    try {
      items.value = await myProgress()
    } catch {
      items.value = []
    }
  }

  function isCompleted(slug: string): boolean {
    return completedSlugs.value.has(slug)
  }

  return { items, completedSlugs, completedCount, load, isCompleted }
})
