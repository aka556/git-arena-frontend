/**
 * 关卡编辑器契约类型（对应后端 LevelDraftDtos 与 docs/level-spec.md 的 LevelFile）。
 *
 * <p>LevelFile 是 spec 契约在前端的唯一来源——编辑器提交的就是这份结构，
 * 后端用同一套 LevelValidator/LevelBuilder 校验与构建（不存在"编辑器专用"的第二套语义）。
 */

/** 提交节点：seq 是稳定标识（C1、C2…），spec 中不出现 hash。 */
export interface SpecCommit {
  seq: string
  parents: string[]
  message?: string | null
  author?: string | null
  /** 整文件快照，null=删除；仅 initial 有效。 */
  files?: Record<string, string | null> | null
}

export interface SpecRef {
  name: string
  target: string
}

export interface SpecHead {
  type: 'branch' | 'detached'
  ref: string
}

export interface SpecRemoteBranch {
  name: string
  target: string
  /** 本地 remote-tracking 指向；缺省=target（已 fetch），"none"=本地还不知道。 */
  tracked?: string | null
}

export interface SpecRemote {
  name: string
  branches: SpecRemoteBranch[]
}

/** initial 的 workingDir 是构建配方（files 覆盖写 + staged 子集）。 */
export interface InitialWorkingDir {
  files?: Record<string, string | null> | null
  staged?: string[] | null
}

/** goal 的 workingDir 是状态断言（与 GitGraph 快照同形）。 */
export interface StatusWorkingDir {
  staged?: string[] | null
  modified?: string[] | null
  untracked?: string[] | null
}

export interface InitialSpec {
  commits?: SpecCommit[] | null
  branches?: SpecRef[] | null
  tags?: SpecRef[] | null
  head?: SpecHead | null
  remotes?: SpecRemote[] | null
  workingDir?: InitialWorkingDir | null
}

export interface GoalGraph {
  commits?: SpecCommit[] | null
  branches?: SpecRef[] | null
  tags?: SpecRef[] | null
  head?: SpecHead | null
  remotes?: SpecRemote[] | null
  workingDir?: StatusWorkingDir | null
}

export interface MatchPolicy {
  allowExtraCommits?: boolean | null
  allowExtraBranches?: boolean | null
  allowExtraTags?: boolean | null
  ignoreMessages?: boolean | null
  compareHead?: boolean | null
  compareWorkingDir?: boolean | null
}

export interface SpecAssertion {
  type: string
  name?: string | null
  path?: string | null
  pattern?: string | null
  remote?: string | null
  number?: number | null
}

export interface GoalSpec {
  graph: GoalGraph
  match?: MatchPolicy | null
  assertions?: SpecAssertion[] | null
}

export interface SolutionStep {
  run?: string | null
  writeFile?: { path: string; content: string } | null
}

export interface SolutionSpec {
  steps: SolutionStep[]
  notes?: string | null
}

export interface SpecHint {
  tier?: number | null
  body: string
  costPoints?: number | null
}

export interface LevelMeta {
  slug: string
  title: string
  description?: string | null
  category: string
  difficulty: number
  mode: 'solo' | 'collab'
  orderIndex?: number | null
  visibility?: string | null
}

export interface LevelFile {
  specVersion: number
  meta: LevelMeta
  initial: InitialSpec
  goal: GoalSpec
  solution?: SolutionSpec | null
  hints?: SpecHint[] | null
}

export interface DraftSummary {
  slug: string
  title: string
  category: string
  difficulty: number
  mode: string
  status: 'draft' | 'published' | 'archived'
  visibility: string
  updatedAt: string
}

export interface DraftDetail {
  slug: string
  status: 'draft' | 'published' | 'archived'
  visibility: string
  level: LevelFile
}

/** 自证闭环结果（docs/level-spec.md §7）：三项全绿才可发布。 */
export interface SelfCheckResult {
  ok: boolean
  semanticsOk: boolean
  zeroStepFails: boolean
  solutionPasses: boolean
  problems: string[]
}
