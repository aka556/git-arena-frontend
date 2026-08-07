/**
 * 关卡进度接口（对应后端 ProgressController，§6.1）。
 */
import { request } from './http'

/** 关卡进度视图（对应后端 ProgressView）。firstCompletedAt 为 ISO 字符串。 */
export interface ProgressView {
  slug: string
  status: string
  attempts: number
  starRating: number
  bestCommandCount: number | null
  firstCompletedAt: string | null
}

/** 我的进度（需登录）。 */
export function myProgress(): Promise<ProgressView[]> {
  return request<ProgressView[]>({ url: '/progress', method: 'get' })
}
