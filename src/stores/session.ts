/**
 * 会话与图状态 store（§6.2：业务状态入 Pinia）。
 *
 * <p>持有唯一的 GitGraph 快照——图视图与终端视图都从这里读，绝不各自维护状态（§3 黄金法则）。
 * 所有会改变仓库的动作都经 {@link exec}（终端与图形面板共用），保证同一执行链路。
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { CommandResponse, GitGraph } from '@/types/gitGraph'
import { createSession, resetSession } from '@/api/sandbox'
import { runCommand } from '@/api/command'

export const useSessionStore = defineStore('session', () => {
  const sessionId = ref<string | null>(null)
  const graph = ref<GitGraph | null>(null)
  const busy = ref(false)

  /** 新建会话，拿到初始（空）图。 */
  async function initSession(): Promise<void> {
    const res = await createSession()
    sessionId.value = res.sessionId
    graph.value = res.graph
  }

  /**
   * 执行一条命令（终端回车或面板按钮都调它——同一链路）。
   * 返回后端结果供调用方显示 stdout/stderr；同时用返回的新快照刷新图。
   */
  async function exec(command: string): Promise<CommandResponse> {
    if (!sessionId.value) {
      throw new Error('会话未就绪')
    }
    busy.value = true
    try {
      const res = await runCommand(sessionId.value, command)
      graph.value = res.graph
      return res
    } finally {
      busy.value = false
    }
  }

  /** 重置沙盒到空态。 */
  async function reset(): Promise<void> {
    if (!sessionId.value) return
    const res = await resetSession(sessionId.value)
    graph.value = res.graph
  }

  return { sessionId, graph, busy, initSession, exec, reset }
})
