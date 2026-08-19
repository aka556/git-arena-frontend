/**
 * 创作模板（内置起步蓝图）：一键得到一份完整、互洽的 LevelFile，作者在其上改而不是从零写。
 *
 * <p>模板与官方关卡同源（docs/level-spec.md 的示例族谱），因此"保存→自证→发布"天然能走通；
 * slug 留空强制作者起自己的名字，标题/说明是可改的建议稿。
 */
import type { LevelFile } from '@/types/levelDraft'

export interface LevelTemplate {
  id: string
  name: string
  tagline: string
  /** 这个模板示范了 spec 的哪些能力，选择时一目了然。 */
  teaches: string[]
  level: LevelFile
}

function meta(partial: Partial<LevelFile['meta']>): LevelFile['meta'] {
  return {
    slug: '',
    title: '',
    description: '',
    category: 'basics',
    difficulty: 1,
    mode: 'solo',
    orderIndex: 1,
    visibility: 'public',
    ...partial,
  }
}

export const LEVEL_TEMPLATES: LevelTemplate[] = [
  {
    id: 'blank',
    name: '空白画布',
    tagline: '最小可发布骨架：空仓库 → 一个提交',
    teaches: ['从零搭建', '自由发挥'],
    level: {
      specVersion: 1,
      meta: meta({ title: '', category: 'basics' }),
      initial: {
        commits: [],
        branches: [],
        head: { type: 'branch', ref: 'main' },
        workingDir: { files: { 'hello.txt': 'hi\n' }, staged: [] },
      },
      goal: {
        graph: {
          commits: [{ seq: 'C1', parents: [] }],
          branches: [{ name: 'main', target: 'C1' }],
          head: { type: 'branch', ref: 'main' },
        },
        match: { compareWorkingDir: true },
      },
      solution: {
        steps: [{ run: 'git add hello.txt' }, { run: 'git commit -m "init"' }],
      },
      hints: [],
    },
  },
  {
    id: 'first-commit',
    name: '第一次提交',
    tagline: '工作区有文件，教 add + commit 的完整闭环',
    teaches: ['工作区配方', '工作区校验', '分级提示'],
    level: {
      specVersion: 1,
      meta: meta({
        title: '第一次提交',
        description: '工作区里有一个还没被追踪的文件。把它暂存并提交，让 main 分支诞生第一个提交。',
        category: 'basics',
      }),
      initial: {
        commits: [],
        branches: [],
        head: { type: 'branch', ref: 'main' },
        workingDir: { files: { 'hello.txt': 'hi\n' }, staged: [] },
      },
      goal: {
        graph: {
          commits: [{ seq: 'C1', parents: [] }],
          branches: [{ name: 'main', target: 'C1' }],
          head: { type: 'branch', ref: 'main' },
        },
        match: { compareWorkingDir: true },
      },
      solution: {
        steps: [{ run: 'git add hello.txt' }, { run: 'git commit -m "init"' }],
        notes: 'add 把文件放进暂存区，commit 才真正写入历史。',
      },
      hints: [
        { tier: 1, body: '先 git add 把文件放进暂存区' },
        { tier: 2, body: 'git commit -m "..." 完成第一个提交' },
      ],
    },
  },
  {
    id: 'branch',
    name: '分支入门',
    tagline: '一条直线历史上创建分支但不切换',
    teaches: ['分支指针', 'HEAD 校验'],
    level: {
      specVersion: 1,
      meta: meta({
        title: '创建一个分支',
        description: 'main 上已有两个提交。创建一个名为 feature 的分支（指向当前提交），但 HEAD 仍留在 main。',
        category: 'branching',
        difficulty: 2,
      }),
      initial: {
        commits: [
          { seq: 'C1', parents: [], message: 'c1', files: { 'a.txt': '1\n' } },
          { seq: 'C2', parents: ['C1'], message: 'c2', files: { 'a.txt': '2\n' } },
        ],
        branches: [{ name: 'main', target: 'C2' }],
        head: { type: 'branch', ref: 'main' },
      },
      goal: {
        graph: {
          commits: [
            { seq: 'C1', parents: [] },
            { seq: 'C2', parents: ['C1'] },
          ],
          branches: [
            { name: 'main', target: 'C2' },
            { name: 'feature', target: 'C2' },
          ],
          head: { type: 'branch', ref: 'main' },
        },
      },
      solution: {
        steps: [{ run: 'git branch feature' }],
        notes: 'git branch <名> 只创建指针、不切换。',
      },
      hints: [
        { tier: 1, body: 'git branch feature 创建分支但不切换' },
        { tier: 2, body: '用 checkout -b / switch -c 会顺便切过去，HEAD 就不在 main 了' },
      ],
    },
  },
  {
    id: 'merge',
    name: '双分支合并',
    tagline: '两条分叉的历史汇成一个合并提交',
    teaches: ['合并双亲', '首父方向'],
    level: {
      specVersion: 1,
      meta: meta({
        title: '合并 feature 分支',
        description: 'main 与 feature 从 C1 分叉。站在 main 上合并 feature，产生一个双亲的合并提交。',
        category: 'merge',
        difficulty: 2,
      }),
      initial: {
        commits: [
          { seq: 'C1', parents: [] },
          { seq: 'C2', parents: ['C1'] },
          { seq: 'C3', parents: ['C1'] },
        ],
        branches: [
          { name: 'main', target: 'C2' },
          { name: 'feature', target: 'C3' },
        ],
        head: { type: 'branch', ref: 'main' },
      },
      goal: {
        graph: {
          commits: [
            { seq: 'C1', parents: [] },
            { seq: 'C2', parents: ['C1'] },
            { seq: 'C3', parents: ['C1'] },
            { seq: 'C4', parents: ['C2', 'C3'] },
          ],
          branches: [
            { name: 'main', target: 'C4' },
            { name: 'feature', target: 'C3' },
          ],
          head: { type: 'branch', ref: 'main' },
        },
      },
      solution: {
        steps: [{ run: 'git merge feature' }],
        notes: '合并提交的首父是所在分支（main），方向本身就是考点。',
      },
      hints: [{ tier: 1, body: '想想 merge 该站在哪个分支上执行' }],
    },
  },
  {
    id: 'conflict',
    name: '制造冲突',
    tagline: '两侧改同一文件，练习解决 <<<<<<< 标记',
    teaches: ['提交携带文件', '内容断言', 'writeFile 参考解'],
    level: {
      specVersion: 1,
      meta: meta({
        title: '解决合并冲突',
        description: '两个分支都改了 greeting.txt。合并 feature 会触发冲突：手工合并两侧内容，完成合并提交，并保证没有冲突标记残留。',
        category: 'conflict',
        difficulty: 3,
      }),
      initial: {
        commits: [
          { seq: 'C1', parents: [], files: { 'greeting.txt': 'hello\n' } },
          { seq: 'C2', parents: ['C1'], files: { 'greeting.txt': 'hello world\n' } },
          { seq: 'C3', parents: ['C1'], files: { 'greeting.txt': 'hello arena\n' } },
        ],
        branches: [
          { name: 'main', target: 'C2' },
          { name: 'feature', target: 'C3' },
        ],
        head: { type: 'branch', ref: 'main' },
      },
      goal: {
        graph: {
          commits: [
            { seq: 'C1', parents: [] },
            { seq: 'C2', parents: ['C1'] },
            { seq: 'C3', parents: ['C1'] },
            { seq: 'C4', parents: ['C2', 'C3'] },
          ],
          branches: [
            { name: 'main', target: 'C4' },
            { name: 'feature', target: 'C3' },
          ],
          head: { type: 'branch', ref: 'main' },
        },
        assertions: [
          { type: 'fileAtHeadNotContains', path: 'greeting.txt', pattern: '<<<<<<<' },
        ],
      },
      solution: {
        steps: [
          { run: 'git merge feature' },
          { writeFile: { path: 'greeting.txt', content: 'hello world arena\n' } },
          { run: 'git add greeting.txt' },
          { run: 'git commit -m "resolve conflict"' },
        ],
        notes: 'merge 触发冲突后手工合并两侧修改，再 add + commit 完成合并提交。',
      },
      hints: [
        { tier: 1, body: '冲突文件里会出现 <<<<<<< ======= >>>>>>> 三段标记' },
        { tier: 2, body: '把文件改成你想要的最终内容，git add 后再 commit' },
      ],
    },
  },
  {
    id: 'remote',
    name: '远程推送',
    tagline: '本地领先 origin 一个提交，教 push 的快进同步',
    teaches: ['remotes 配置', 'tracked 视角', 'branchPushed 断言'],
    level: {
      specVersion: 1,
      meta: meta({
        title: '推送到远程',
        description: '本地 main 领先 origin 一个提交。用 git push 把本地提交同步到远程，让 origin/main 追上来。',
        category: 'remote',
        difficulty: 3,
      }),
      initial: {
        commits: [
          { seq: 'C1', parents: [], message: 'base', files: { 'base.txt': 'base\n' } },
          { seq: 'C2', parents: ['C1'], message: 'local work', files: { 'local.txt': 'local\n' } },
        ],
        branches: [{ name: 'main', target: 'C2' }],
        head: { type: 'branch', ref: 'main' },
        remotes: [
          { name: 'origin', branches: [{ name: 'main', target: 'C1', tracked: 'C1' }] },
        ],
      },
      goal: {
        graph: {
          commits: [
            { seq: 'C1', parents: [] },
            { seq: 'C2', parents: ['C1'] },
          ],
          branches: [{ name: 'main', target: 'C2' }],
          head: { type: 'branch', ref: 'main' },
          remotes: [
            { name: 'origin', branches: [{ name: 'main', target: 'C2' }] },
          ],
        },
        assertions: [{ type: 'branchPushed', name: 'main' }],
      },
      solution: {
        steps: [{ run: 'git push origin main' }],
        notes: '本地包含远程的全部历史，是一次快进推送。',
      },
      hints: [
        { tier: 1, body: 'git push origin main 把本地 main 推到远程' },
      ],
    },
  },
]
