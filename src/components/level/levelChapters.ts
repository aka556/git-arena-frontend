/**
 * 关卡章节元数据（纯前端呈现层）：把 `levels.category` 映射成有推荐学习顺序的「章节」。
 *
 * <p>为什么放前端：章节只是选关页的组织方式，后端契约（LevelSummary.category）不变；
 * 未来若后端引入新分类，未登记的 category 会落进「更多练习」兜底章节，不会丢关卡。
 * 选关弹窗与「通关后推荐下一关」共用这里的排序，保证两处的"下一步"口径一致。
 */
import type { LevelSummary } from '@/types/level'

export interface ChapterMeta {
  key: string
  /** 章节序号（01、02…），也是推荐学习顺序。 */
  index: number
  name: string
  blurb: string
}

export const CHAPTERS: ChapterMeta[] = [
  { key: 'basics', index: 1, name: '基础操作', blurb: '提交、暂存与历史——一切从第一次 commit 开始' },
  { key: 'branching', index: 2, name: '分支', blurb: '分支只是可移动的指针，学会创建与切换' },
  { key: 'merge', index: 3, name: '合并', blurb: '把两条历史汇成一条，理解合并提交的双亲' },
  { key: 'rebase', index: 4, name: '变基', blurb: '换个起点重放提交，历史因此变得笔直' },
  { key: 'conflict', index: 5, name: '冲突', blurb: '直面 <<<<<<< 标记，亲手解决分歧' },
  { key: 'remote', index: 6, name: '远程', blurb: '与 origin 对话：fetch、pull、push 的往返' },
  { key: 'pr', index: 7, name: '协作 · PR', blurb: '多人共用一个远程，走一遍 Pull Request 工作流' },
]

const FALLBACK: ChapterMeta = { key: 'misc', index: 99, name: '更多练习', blurb: '未分类的自定义关卡' }

export function chapterOf(category: string): ChapterMeta {
  return CHAPTERS.find((c) => c.key === category) ?? FALLBACK
}

/** 章节序 → 关内序 → 标题；选关列表与"下一关"推荐都按这个顺序走。 */
export function sortLevels(levels: LevelSummary[]): LevelSummary[] {
  return [...levels].sort((a, b) =>
    chapterOf(a.category).index - chapterOf(b.category).index
    || a.orderIndex - b.orderIndex
    || a.title.localeCompare(b.title))
}

/** 通关后的下一步：按推荐顺序找第一个还没通、也没锁的单人关卡。 */
export function nextRecommended(
  levels: LevelSummary[],
  excludeSlug?: string,
): LevelSummary | null {
  return sortLevels(levels).find((l) =>
    l.slug !== excludeSlug
    && l.mode === 'solo'
    && l.status !== 'completed'
    && l.status !== 'locked') ?? null
}
