/**
 * 关卡编辑器接口（对应后端 LevelDraftController，一个后端资源一个文件——§6.1）。
 */
import { request } from './http'
import type {
  DraftDetail,
  DraftSummary,
  LevelFile,
  SelfCheckResult,
} from '@/types/levelDraft'

export function listMyDrafts(): Promise<DraftSummary[]> {
  return request<DraftSummary[]>({ url: '/level-drafts', method: 'get' })
}

export function getDraft(slug: string): Promise<DraftDetail> {
  return request<DraftDetail>({ url: `/level-drafts/${slug}`, method: 'get' })
}

/** 保存草稿（按 slug upsert）；仅语义校验，自证闭环留到发布。 */
export function saveDraft(slug: string, level: LevelFile): Promise<DraftDetail> {
  return request<DraftDetail>({
    url: `/level-drafts/${slug}`,
    method: 'put',
    data: { slug, level },
  })
}

/** 试跑自证闭环（零步不通关 + 参考解通关），不改状态。 */
export function selfCheckDraft(slug: string): Promise<SelfCheckResult> {
  return request<SelfCheckResult>({ url: `/level-drafts/${slug}/self-check`, method: 'post' })
}

/** 发布：后端自证全绿才置 published，否则连问题一起拒绝。 */
export function publishDraft(slug: string): Promise<SelfCheckResult> {
  return request<SelfCheckResult>({ url: `/level-drafts/${slug}/publish`, method: 'post' })
}

export function unpublishDraft(slug: string): Promise<void> {
  return request<void>({ url: `/level-drafts/${slug}/unpublish`, method: 'post' })
}

export function deleteDraft(slug: string): Promise<void> {
  return request<void>({ url: `/level-drafts/${slug}`, method: 'delete' })
}
