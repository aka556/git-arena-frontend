/**
 * 成就接口（对应后端 AchievementController）。
 */
import { request } from './http'
import type { AchievementView } from '@/types/engagement'

/** 我的成就：返回全部启用中的成就定义，unlocked 标记是否已解锁（需登录）。 */
export function getMyAchievements(): Promise<AchievementView[]> {
  return request<AchievementView[]>({ url: '/achievements/me', method: 'get' })
}
