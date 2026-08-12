/**
 * spec 图（docs/level-spec.md §3）→ GitGraph 快照（CLAUDE.md §5）的纯函数转换，供关卡编辑器<b>即时预览</b>。
 *
 * <p>为什么在前端也做一份：编辑器要在每次敲键后立刻重画初始图/目标图，走后端往返既慢又要求先落库。
 * 这里只做<b>形状映射</b>（seq 直接当作 id——spec 里本就没有 hash），<b>不做任何语义判定</b>：
 * 校验与真实构建仍然只有后端 LevelValidator/LevelBuilder 一处权威（§3 黄金法则不被破坏）。
 */
import type { GitGraph, CommitNode, BranchRef, TagRef, RemoteRef } from '@/types/gitGraph'
import type { GoalGraph, InitialSpec, SpecCommit } from '@/types/levelDraft'

type SpecGraphLike = InitialSpec | GoalGraph

/** 与后端 LevelBuilder 的确定性时间戳同源（§4.1），让预览的排布与真实构建一致。 */
const BASE_EPOCH = 1_700_000_000

function toCommits(commits: SpecCommit[] | null | undefined): CommitNode[] {
  const list = commits ?? []
  // 快照按"最新在前"排列（GraphMapper 的约定），spec 数组是拓扑序，故反向
  return [...list].reverse().map((c) => {
    const index = list.indexOf(c)
    return {
      id: c.seq,
      parents: [...(c.parents ?? [])],
      message: c.message ?? `commit ${c.seq}`,
      author: c.author ?? 'arena',
      timestamp: BASE_EPOCH + 60 * index,
      seq: c.seq,
      unreachable: false,
    }
  })
}

export function specToGraph(spec: SpecGraphLike | null | undefined): GitGraph {
  const source = spec ?? {}
  const branches: BranchRef[] = (source.branches ?? []).map((b) => ({
    name: b.name,
    target: b.target,
    isRemote: false,
  }))
  const tags: TagRef[] = (source.tags ?? []).map((t) => ({ name: t.name, target: t.target }))
  const remotes: RemoteRef[] = (source.remotes ?? []).map((r) => ({
    name: r.name,
    branches: (r.branches ?? []).map((rb) => ({
      name: rb.name,
      // 图上画的是 remote-tracking 视角：tracked 缺省=target，"none"=本地还不知道（不画）
      target: rb.tracked === undefined || rb.tracked === null ? rb.target : rb.tracked,
    })).filter((rb) => rb.target !== 'none'),
  }))

  const wd = (source as InitialSpec).workingDir as Record<string, unknown> | null | undefined
  const staged = Array.isArray(wd?.staged) ? (wd?.staged as string[]) : []
  const modified = Array.isArray(wd?.modified) ? (wd?.modified as string[]) : []
  const untracked = Array.isArray(wd?.untracked) ? (wd?.untracked as string[]) : []

  return {
    version: 2,
    commits: toCommits(source.commits),
    branches,
    tags,
    head: source.head ?? { type: 'branch', ref: 'main' },
    remotes,
    workingDir: { staged, modified, untracked },
  }
}
