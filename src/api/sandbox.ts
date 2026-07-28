/**
 * 沙盒会话相关接口（对应后端 SandboxController，一个后端资源一个文件——§6.1）。
 */
import { request } from './http'
import type { GitGraph, SessionResponse } from '@/types/gitGraph'

/** 新建会话（创建隔离沙盒工作目录，尚未 git init）。 */
export function createSession(): Promise<SessionResponse> {
  return request<SessionResponse>({ url: '/sandbox', method: 'post' })
}

/** 重置会话沙盒到初始空态。 */
export function resetSession(sessionId: string): Promise<SessionResponse> {
  return request<SessionResponse>({ url: `/sandbox/${sessionId}/reset`, method: 'post' })
}

/** 读取当前图快照。 */
export function fetchGraph(sessionId: string): Promise<GitGraph> {
  return request<GitGraph>({ url: `/sandbox/${sessionId}/graph`, method: 'get' })
}
