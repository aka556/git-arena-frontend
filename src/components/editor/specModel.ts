/**
 * 可视化关卡搭建的图操作模型（docs/level-spec.md §3–§5 的交互式封装）。
 *
 * <p>这些函数按 git 的心智模型操作 SpecGraph（提交推进分支、合并产生双亲……），
 * 由构造保证拓扑序与引用完整性——比让作者手写 JSON 再靠校验兜底友好得多。
 * 全部只做<b>形状层面</b>的操作与守卫（返回错误文案或 null），语义校验权威仍只在后端一处。
 * 函数就地修改传入的响应式对象（编辑器持有唯一一份草稿，不做快照复制）。
 */
import type {
  GoalGraph,
  InitialSpec,
  LevelFile,
  SpecCommit,
  SpecHead,
} from '@/types/levelDraft'

/** initial 与 goal.graph 的公共形状（两者都能用同一套搭建操作）。 */
export type GraphSpec = InitialSpec | GoalGraph

/** 补齐容器字段，让模板/后端返回的稀疏对象可以直接被搭建器编辑。 */
export function ensureGraph(spec: GraphSpec): void {
  spec.commits = spec.commits ?? []
  spec.branches = spec.branches ?? []
  spec.tags = spec.tags ?? []
  spec.head = spec.head ?? { type: 'branch', ref: 'main' }
}

export function nextSeq(spec: GraphSpec): string {
  const max = (spec.commits ?? []).reduce((acc, c) => {
    const m = /^C([1-9][0-9]{0,3})$/.exec(c.seq)
    return m ? Math.max(acc, Number(m[1])) : acc
  }, 0)
  return `C${max + 1}`
}

/** HEAD 当前落点（seq）；分支未出生（空仓库）返回 null。 */
export function headTip(spec: GraphSpec): string | null {
  const head = spec.head
  if (!head) return null
  if (head.type === 'detached') return head.ref
  return (spec.branches ?? []).find((b) => b.name === head.ref)?.target ?? null
}

export function commitSeqs(spec: GraphSpec): string[] {
  return (spec.commits ?? []).map((c) => c.seq)
}

/**
 * 在 HEAD 处新建提交并推进引用（模拟 git commit）。
 * 空仓库（分支未出生）会同时创建首个提交与分支——与真实 git 的首次提交一致。
 */
export function addCommit(spec: GraphSpec, message?: string): string | null {
  ensureGraph(spec)
  const head = spec.head!
  const seq = nextSeq(spec)
  const commit: SpecCommit = { seq, parents: [] }
  const text = message?.trim()
  if (text) commit.message = text

  if (head.type === 'detached') {
    commit.parents = [head.ref]
    spec.commits!.push(commit)
    head.ref = seq
    return null
  }
  const branch = spec.branches!.find((b) => b.name === head.ref)
  if (branch) {
    commit.parents = [branch.target]
    spec.commits!.push(commit)
    branch.target = seq
  } else {
    spec.commits!.push(commit)
    spec.branches!.push({ name: head.ref, target: seq })
  }
  return null
}

/** 合并 source 到 HEAD 所在分支（模拟 git merge：首父=当前分支，方向即考点）。 */
export function mergeBranch(spec: GraphSpec, sourceBranch: string, message?: string): string | null {
  ensureGraph(spec)
  const head = spec.head!
  if (head.type !== 'branch') return '游离 HEAD 上不能合并——先把 HEAD 切回分支'
  const current = spec.branches!.find((b) => b.name === head.ref)
  const source = spec.branches!.find((b) => b.name === sourceBranch)
  if (!current) return `分支 ${head.ref} 还没有提交`
  if (!source) return `分支 ${sourceBranch} 不存在`
  if (source.name === current.name) return '不能合并自己'
  if (source.target === current.target) return '两个分支指向同一提交，无需合并'
  const seq = nextSeq(spec)
  const commit: SpecCommit = { seq, parents: [current.target, source.target] }
  const text = message?.trim()
  if (text) commit.message = text
  spec.commits!.push(commit)
  current.target = seq
  return null
}

export function addBranch(spec: GraphSpec, name: string, target: string): string | null {
  ensureGraph(spec)
  const trimmed = name.trim()
  if (!trimmed) return '请填写分支名'
  if (/[\s~^:?*[\\]/.test(trimmed)) return '分支名不能包含空白或 ~ ^ : ? * [ \\'
  if (spec.branches!.some((b) => b.name === trimmed)) return `分支 ${trimmed} 已存在`
  if (!spec.commits!.some((c) => c.seq === target)) return '目标提交不存在'
  spec.branches!.push({ name: trimmed, target })
  return null
}

export function addTag(spec: GraphSpec, name: string, target: string): string | null {
  ensureGraph(spec)
  const trimmed = name.trim()
  if (!trimmed) return '请填写标签名'
  if (/[\s~^:?*[\\]/.test(trimmed)) return '标签名不能包含空白或 ~ ^ : ? * [ \\'
  if (spec.tags!.some((t) => t.name === trimmed)) return `标签 ${trimmed} 已存在`
  if (!spec.commits!.some((c) => c.seq === target)) return '目标提交不存在'
  spec.tags!.push({ name: trimmed, target })
  return null
}

export function removeBranch(spec: GraphSpec, name: string): string | null {
  const head = spec.head
  if (head?.type === 'branch' && head.ref === name) return 'HEAD 正指着这个分支，先切换 HEAD'
  spec.branches = (spec.branches ?? []).filter((b) => b.name !== name)
  return null
}

export function removeTag(spec: GraphSpec, name: string): void {
  spec.tags = (spec.tags ?? []).filter((t) => t.name !== name)
}

/** 删除提交的守卫：只有"无人引用的叶子"可删，把爆炸半径说清楚而不是级联删除。 */
export function removeCommit(spec: GraphSpec, seq: string): string | null {
  const commits = spec.commits ?? []
  const child = commits.find((c) => (c.parents ?? []).includes(seq))
  if (child) return `${seq} 是 ${child.seq} 的父提交，先删除后代提交`
  const branch = (spec.branches ?? []).find((b) => b.target === seq)
  if (branch) return `分支 ${branch.name} 指着 ${seq}，先移走或删除该分支`
  const tag = (spec.tags ?? []).find((t) => t.target === seq)
  if (tag) return `标签 ${tag.name} 指着 ${seq}，先删除该标签`
  if (spec.head?.type === 'detached' && spec.head.ref === seq) return 'HEAD 游离在这个提交上，先移走 HEAD'
  const remote = (spec.remotes ?? []).find((r) =>
    (r.branches ?? []).some((rb) => rb.target === seq || rb.tracked === seq))
  if (remote) return `远程 ${remote.name} 的分支引用了 ${seq}，先调整远程配置`
  spec.commits = commits.filter((c) => c.seq !== seq)
  return null
}

/** HEAD 选项编码：branch:main / detached:C3 —— 供下拉框往返。 */
export function encodeHead(head: SpecHead | null | undefined): string {
  const h = head ?? { type: 'branch' as const, ref: 'main' }
  return `${h.type}:${h.ref}`
}

export function decodeHead(value: string): SpecHead {
  const idx = value.indexOf(':')
  const type = value.slice(0, idx) === 'detached' ? 'detached' as const : 'branch' as const
  return { type, ref: value.slice(idx + 1) }
}

/**
 * 把 initial 图复制成 goal 起点：goal 不允许 files/author（level-spec §5.1），
 * 远程侧取 origin 真实指向（tracked 视角是"过程"，goal 表达的是"结果"）。
 */
export function copyInitialToGoal(initial: InitialSpec): GoalGraph {
  return {
    commits: (initial.commits ?? []).map((c) => {
      const copy: SpecCommit = { seq: c.seq, parents: [...(c.parents ?? [])] }
      if (c.message) copy.message = c.message
      return copy
    }),
    branches: (initial.branches ?? []).map((b) => ({ name: b.name, target: b.target })),
    tags: (initial.tags ?? []).map((t) => ({ name: t.name, target: t.target })),
    head: initial.head ? { ...initial.head } : { type: 'branch', ref: 'main' },
    ...(initial.remotes?.length
      ? {
          remotes: initial.remotes.map((r) => ({
            name: r.name,
            branches: (r.branches ?? []).map((rb) => ({ name: rb.name, target: rb.target })),
          })),
        }
      : {}),
  }
}

/** 深拷贝（草稿装载/模板实例化共用；LevelFile 是纯 JSON 结构，JSON 往返即可）。 */
export function cloneLevel<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/** 装载草稿/模板时把所有可编辑容器补齐，搭建器与列表编辑器不再到处判空。 */
export function normalizeLevel(level: LevelFile): LevelFile {
  const copy = cloneLevel(level)
  copy.initial = copy.initial ?? {}
  ensureGraph(copy.initial)
  // 工作区容器补齐给编辑器就地修改；保存时 pruneLevel 会把空容器收拢回缺省
  copy.initial.workingDir = copy.initial.workingDir ?? {}
  copy.initial.workingDir.files = copy.initial.workingDir.files ?? {}
  copy.initial.workingDir.staged = copy.initial.workingDir.staged ?? []
  copy.goal = copy.goal ?? { graph: {} }
  copy.goal.graph = copy.goal.graph ?? {}
  ensureGraph(copy.goal.graph)
  copy.goal.match = copy.goal.match ?? {}
  copy.goal.assertions = copy.goal.assertions ?? []
  copy.solution = copy.solution ?? { steps: [] }
  copy.solution.steps = copy.solution.steps ?? []
  copy.hints = copy.hints ?? []
  return copy
}

/** 保存前收拢：空的可选容器还原为缺省，别把 [] / {} 噪声写进库里。 */
export function pruneLevel(level: LevelFile): LevelFile {
  const copy = cloneLevel(level)
  const dropEmpty = (spec: GraphSpec): void => {
    if (!spec.tags?.length) delete spec.tags
    // 远程编辑器允许留半填的行，保存时静默丢弃不完整行而不是让语义校验报错
    if (spec.remotes?.length) {
      spec.remotes = spec.remotes
        .map((r) => ({ ...r, branches: (r.branches ?? []).filter((rb) => rb.name.trim() && rb.target) }))
        .filter((r) => r.branches.length > 0)
    }
    if (!spec.remotes?.length) delete spec.remotes
  }
  dropEmpty(copy.initial)
  const wd = copy.initial.workingDir
  if (wd && !Object.keys(wd.files ?? {}).length && !(wd.staged ?? []).length) {
    delete copy.initial.workingDir
  }
  dropEmpty(copy.goal.graph)
  if (copy.goal.match && Object.values(copy.goal.match).every((v) => v == null)) delete copy.goal.match
  if (!copy.goal.assertions?.length) delete copy.goal.assertions
  const gwd = copy.goal.graph.workingDir
  if (gwd && !(gwd.staged ?? []).length && !(gwd.modified ?? []).length && !(gwd.untracked ?? []).length) {
    delete copy.goal.graph.workingDir
  }
  if (copy.solution && !copy.solution.steps.length && !copy.solution.notes?.trim()) {
    copy.solution = null
  }
  if (!copy.hints?.length) delete copy.hints
  return copy
}
