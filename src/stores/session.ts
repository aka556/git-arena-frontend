/**
 * 会话与图状态 store（§6.2：业务状态入 Pinia）。
 *
 * <p>持有唯一的 GitGraph 快照——图视图与终端视图都从这里读，绝不各自维护状态（§3 黄金法则）。
 * 所有会改变仓库的动作都经 {@link exec}（终端与面板共用），保证同一执行链路。
 *
 * <p>关卡模式：startLevel 用后端构建好的关卡沙盒<b>替换</b>当前会话，goalGraph 供目标图对照渲染
 * （§6.3 当前图 vs 目标图并排）；validate 只读校验，不改状态。
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { CommandResponse, GitGraph } from '@/types/gitGraph'
import type { LevelDetail, LevelSummary, ValidateResponse } from '@/types/level'
import { createSession, resetSession } from '@/api/sandbox'
import { runCommand } from '@/api/command'
import { getLevel, listLevels, startLevel as apiStartLevel, useHint, validateLevel } from '@/api/level'
import { useAuthStore } from './auth'

export const useSessionStore = defineStore('session', () => {
  const sessionId = ref<string | null>(null)
  const graph = ref<GitGraph | null>(null)
  const busy = ref(false)

  /** 关卡目录（进入工作台时加载一次）。 */
  const levels = ref<LevelSummary[]>([])
  /** 当前进行中的关卡；null = 自由沙盒模式。 */
  const activeLevel = ref<LevelSummary | null>(null)
  /** 关卡目标图（只读，来自关卡 spec，非仓库快照）。 */
  const goalGraph = ref<GitGraph | null>(null)
  /** 当前关卡详情（说明 + 分级提示）。 */
  const levelDetail = ref<LevelDetail | null>(null)
  /** 已揭示的提示条数（逐级揭示；开始/重开关卡时归零）。 */
  const revealedHints = ref(0)

  /** 新建自由沙盒会话（退出关卡模式）。 */
  async function initSession(): Promise<void> {
    const res = await createSession()
    sessionId.value = res.sessionId
    graph.value = res.graph
    activeLevel.value = null
    goalGraph.value = null
    levelDetail.value = null
    revealedHints.value = 0
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
      if (res.ok && /^git\s+commit(?:\s|$)/.test(command.trim())) {
        await useAuthStore().refresh().catch(() => undefined)
      }
      return res
    } finally {
      busy.value = false
    }
  }

  /** 重置沙盒。关卡模式下=重开本关（重新构建 initial），自由模式=清空。 */
  async function reset(): Promise<void> {
    if (activeLevel.value) {
      await startLevel(activeLevel.value)
      return
    }
    if (!sessionId.value) return
    const res = await resetSession(sessionId.value)
    graph.value = res.graph
  }

  async function loadLevels(): Promise<void> {
    levels.value = await listLevels()
  }

  /** 开始/重开一个关卡：后端新建沙盒并构建 initial，本地切换会话；同时拉取详情（说明+提示）。 */
  async function startLevel(level: LevelSummary): Promise<void> {
    busy.value = true
    try {
      const [res, detail] = await Promise.all([apiStartLevel(level.slug), getLevel(level.slug)])
      sessionId.value = res.sessionId
      graph.value = res.graph
      goalGraph.value = res.goalGraph
      activeLevel.value = level
      levelDetail.value = detail
      revealedHints.value = detail.hints.filter((hint) => hint.used).length
    } finally {
      busy.value = false
    }
  }

  /** 逐级使用下一条提示；已使用提示由详情回读，不重复扣分。 */
  async function revealNextHint(): Promise<void> {
    const total = levelDetail.value?.hints.length ?? 0
    if (!levelDetail.value || !activeLevel.value || revealedHints.value >= total) {
      return
    }
    const hint = levelDetail.value.hints[revealedHints.value]
    if (!hint) return
    if (hint.used) {
      revealedHints.value += 1
      return
    }
    if (!useAuthStore().isAuthenticated) {
      throw new Error('请先登录后使用提示')
    }
    if (hint.id == null) {
      throw new Error('提示尚未同步到数据库，请稍后重试')
    }
    const result = await useHint(activeLevel.value.slug, hint.id)
    hint.used = true
    revealedHints.value += 1
    useAuthStore().setTotalPoints(result.totalPoints)
  }

  /** 校验当前关卡是否达成。 */
  async function validate(): Promise<ValidateResponse> {
    if (!sessionId.value || !activeLevel.value) {
      throw new Error('当前没有进行中的关卡')
    }
    return validateLevel(activeLevel.value.slug, sessionId.value)
  }

  return {
    sessionId, graph, busy,
    levels, activeLevel, goalGraph, levelDetail, revealedHints,
    initSession, exec, reset,
    loadLevels, startLevel, validate, revealNextHint,
  }
})
