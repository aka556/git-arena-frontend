/**
 * 关卡接口（对应后端 LevelController，一个后端资源一个文件——§6.1）。
 */
import { request } from './http'
import type { LevelDetail, LevelSummary, StartLevelResponse, ValidateResponse } from '@/types/level'

export function listLevels(): Promise<LevelSummary[]> {
  return request<LevelSummary[]>({ url: '/levels', method: 'get' })
}

export function getLevel(slug: string): Promise<LevelDetail> {
  return request<LevelDetail>({ url: `/levels/${slug}`, method: 'get' })
}

/** 开始关卡：后端新建沙盒并构建 initial，返回新会话与当前/目标图。 */
export function startLevel(slug: string): Promise<StartLevelResponse> {
  return request<StartLevelResponse>({ url: `/levels/${slug}/start`, method: 'post' })
}

/** 校验当前会话是否达成关卡目标。 */
export function validateLevel(slug: string, sessionId: string): Promise<ValidateResponse> {
  return request<ValidateResponse>({
    url: `/levels/${slug}/validate`,
    method: 'post',
    data: { sessionId },
  })
}
