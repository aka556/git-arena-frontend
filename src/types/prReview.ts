/**
 * PR 评审契约类型（对应后端 PrDiff / PrReviewDtos，database.md §4.4/§4.5）。
 */

/** 差异中一行的类型：hunk 为 @@ 头，其余为内容行。 */
export type DiffLineKind = 'hunk' | 'context' | 'add' | 'del'

export interface DiffLine {
  kind: DiffLineKind
  /** 旧侧行号；add 行为 null。 */
  oldLine: number | null
  /** 新侧行号；del 行为 null。 */
  newLine: number | null
  content: string
}

export interface FileDiff {
  path: string
  oldPath: string | null
  changeType: string
  binary: boolean
  lines: DiffLine[]
}

export interface PrDiff {
  /** merge-base(target, source)；无共同祖先时为 null。 */
  baseSha: string | null
  headSha: string
  files: FileDiff[]
}

export type ReviewState = 'approved' | 'changes_requested' | 'commented'

export type DiffSide = 'old' | 'new'

export interface ReviewView {
  id: number
  reviewerMemberId: string | null
  reviewerName: string
  state: ReviewState
  body: string | null
  submittedAt: number | null
  /** 已被同一评审者更晚的评审取代，不再参与合并闸门。 */
  superseded: boolean
}

export interface CommentView {
  id: number
  reviewId: number | null
  authorMemberId: string | null
  authorName: string
  body: string
  commentKind: 'general' | 'inline'
  filePath: string | null
  diffSide: DiffSide | null
  /** 写评论时的行号，不可变。 */
  originalLine: number | null
  /** 后端按当前 HEAD 重算出的行号；null 表示已无法定位。 */
  currentLine: number | null
  /** true 时 currentLine 必为 null，UI 须标注「评论已过时」而不是照旧贴行。 */
  outdated: boolean
  anchorSha: string | null
  createdAt: number | null
}

export interface ReviewThread {
  number: number
  status: string
  mergeable: string
  /** 被「请求修改」挡住合并。 */
  blocked: boolean
  blockingReviewers: string[]
  approvals: number
  reviews: ReviewView[]
  comments: CommentView[]
}

/** 提交评审时附带的一条行级评论：只报位置，锚点事实由后端定格。 */
export interface InlineCommentInput {
  filePath: string
  diffSide: DiffSide
  line: number
  body: string
}
