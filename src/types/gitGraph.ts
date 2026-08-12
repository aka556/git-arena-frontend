/**
 * GitGraph 只读快照契约（CLAUDE.md §5）——前端唯一来源，禁止在组件里散落重复定义（§6.2）。
 * 字段须与后端 org.xiaoyu.gitarena.domain.graph.GitGraph 逐字段对齐；破坏性变更两端一起改并升 version。
 */

export interface CommitNode {
  /** 短 hash（对外展示） */
  id: string
  /** 父提交短 hash；merge 有多个；首父在前 */
  parents: string[]
  message: string
  author: string
  /** epoch 秒 */
  timestamp: number
  /** 稳定序号 C1、C2…（最老为 C1），教学对照用 */
  seq: string
  /**
   * 已不被任何引用可达（reset/rebase/切离游离线后的孤儿提交）。
   * git 并不删除它们（reflog 可找回），故图上画成幽灵节点而非抹掉（§6.3）。
   */
  unreachable: boolean
}

export interface BranchRef {
  name: string
  /** 指向 commit 短 hash；未出生分支为 null */
  target: string | null
  isRemote: boolean
}

export interface TagRef {
  name: string
  target: string | null
}

export type HeadRef =
  | { type: 'branch'; ref: string }
  | { type: 'detached'; ref: string }

export interface RemoteBranch {
  name: string
  target: string | null
}

export interface RemoteRef {
  name: string
  branches: RemoteBranch[]
}

export interface WorkingDir {
  staged: string[]
  modified: string[]
  untracked: string[]
}

export interface GitGraph {
  /** 契约版本，破坏性变更 +1 */
  version: number
  commits: CommitNode[]
  branches: BranchRef[]
  tags: TagRef[]
  head: HeadRef
  remotes: RemoteRef[]
  workingDir: WorkingDir
}

/** 命令执行结果（后端 CommandResponse）。 */
export interface CommandResponse {
  ok: boolean
  stdout: string
  stderr: string
  graph: GitGraph
  cwd: string
}

/** 会话创建/重置响应（后端 SessionResponse）。 */
export interface SessionResponse {
  sessionId: string
  graph: GitGraph
}
