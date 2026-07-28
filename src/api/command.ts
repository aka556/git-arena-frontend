/**
 * 命令执行接口（对应后端 CommandController）。终端输入与图形面板动作都调用此处——同一执行链路（§3）。
 */
import { request } from './http'
import type { CommandResponse } from '@/types/gitGraph'

export function runCommand(sessionId: string, command: string): Promise<CommandResponse> {
  return request<CommandResponse>({
    url: '/command',
    method: 'post',
    data: { sessionId, command },
  })
}
