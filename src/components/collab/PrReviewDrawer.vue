<script setup lang="ts">
/**
 * PR 评审面板（database.md §4.4/§4.5）。左侧差异逐行可点评，右侧评审串。
 *
 * <p>差异由 D3/xterm 之外的普通表格呈现（不属 §6.2 的两个教学核心区），外壳用 Ant Design Vue。
 * 状态全部在 room store，本组件只管视图与交互。
 *
 * <p><b>过时评论如实标注</b>：后端重算不出行号时给 outdated=true / currentLine=null，
 * 此处必须显示"已过时"而不是退回旧行号——把评论贴到无关代码上比不显示更误导人。
 */
import { computed, ref } from 'vue'
import { Alert, Button, Drawer, Empty, Input, Radio, Spin, Tag, Tooltip, message } from 'ant-design-vue'
import { useRoomStore } from '@/stores/room'
import type { CommentView, DiffLine, DiffSide, FileDiff, InlineCommentInput, ReviewState } from '@/types/prReview'

const store = useRoomStore()

const reviewState = ref<ReviewState>('commented')
const reviewBody = ref('')
const generalComment = ref('')
const submitting = ref(false)

/** 正在写的行级评论草稿：key = `${filePath}:${side}:${line}`。 */
const draft = ref<{ filePath: string; side: DiffSide; line: number; body: string } | null>(null)
/** 本次评审待提交的行级评论（提交评审时一并发出）。 */
const pending = ref<InlineCommentInput[]>([])

const pr = computed(() => store.room?.pullRequests.find((p) => p.number === store.reviewingPr) ?? null)
const open = computed(() => store.reviewingPr !== null)
const inlineComments = computed(() => (store.prThread?.comments ?? []).filter((c) => c.commentKind === 'inline'))
const generalComments = computed(() => (store.prThread?.comments ?? []).filter((c) => c.commentKind === 'general'))

/** 该行上已有的评论：按重算后的当前行号挂，过时评论不挂在任何行上（改列在文件末尾）。 */
function commentsAt(file: FileDiff, line: DiffLine): CommentView[] {
  return inlineComments.value.filter((c) => {
    if (c.filePath !== file.path || c.outdated) return false
    const at = c.diffSide === 'old' ? line.oldLine : line.newLine
    return at !== null && c.currentLine === at
  })
}

function outdatedIn(file: FileDiff): CommentView[] {
  return inlineComments.value.filter((c) => c.filePath === file.path && c.outdated)
}

function pendingAt(file: FileDiff, line: DiffLine): InlineCommentInput[] {
  return pending.value.filter((p) => {
    const at = p.diffSide === 'old' ? line.oldLine : line.newLine
    return p.filePath === file.path && at !== null && p.line === at
  })
}

/** 点行号开评论草稿：新增/上下文行评新侧，删除行评旧侧——与后端锚点的侧别口径一致。 */
function startDraft(file: FileDiff, line: DiffLine): void {
  if (line.kind === 'hunk') return
  const side: DiffSide = line.kind === 'del' ? 'old' : 'new'
  const at = side === 'old' ? line.oldLine : line.newLine
  if (at === null) return
  draft.value = { filePath: file.path, side, line: at, body: '' }
}

function stageDraft(): void {
  const d = draft.value
  if (!d || !d.body.trim()) {
    message.warning('评论内容不能为空')
    return
  }
  pending.value.push({ filePath: d.filePath, diffSide: d.side, line: d.line, body: d.body.trim() })
  draft.value = null
}

function dropPending(index: number): void {
  pending.value.splice(index, 1)
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

async function onSubmitReview(): Promise<void> {
  submitting.value = true
  try {
    await store.submitReview({
      state: reviewState.value,
      body: reviewBody.value.trim() || undefined,
      comments: pending.value.length > 0 ? [...pending.value] : undefined,
    })
    pending.value = []
    reviewBody.value = ''
    message.success('评审已提交')
  } catch (e) {
    message.error(errMsg(e))
  } finally {
    submitting.value = false
  }
}

async function onAddGeneral(): Promise<void> {
  if (!generalComment.value.trim()) return
  try {
    await store.comment({ body: generalComment.value.trim() })
    generalComment.value = ''
  } catch (e) {
    message.error(errMsg(e))
  }
}

function lineClass(line: DiffLine): string {
  return `diff-line diff-${line.kind}`
}

function marker(line: DiffLine): string {
  return line.kind === 'add' ? '+' : line.kind === 'del' ? '-' : ' '
}

function stateLabel(state: ReviewState): string {
  return state === 'approved' ? '已批准' : state === 'changes_requested' ? '请求修改' : '留言'
}

function stateColor(state: ReviewState): string {
  return state === 'approved' ? 'green' : state === 'changes_requested' ? 'red' : 'default'
}
</script>

<template>
  <Drawer
    :open="open"
    :title="pr ? `评审 PR #${pr.number}：${pr.title}` : '评审'"
    placement="right"
    :width="900"
    @close="store.closeReview()"
  >
    <Spin :spinning="store.reviewLoading">
      <Alert
        v-if="store.prThread?.blocked"
        class="gate-alert"
        type="warning"
        show-icon
        message="该 PR 被「请求修改」挡住，无法合并"
        :description="`等待 ${store.prThread.blockingReviewers.join('、')} 重新评审通过。`"
      />
      <Alert
        v-else-if="store.prThread && store.prThread.approvals > 0"
        class="gate-alert"
        type="success"
        show-icon
        :message="`已获 ${store.prThread.approvals} 个批准`"
      />

      <div class="review-body">
        <section class="diff-col">
          <Empty v-if="!store.prDiff || store.prDiff.files.length === 0" description="这个 PR 没有文件改动" />
          <div v-for="file in store.prDiff?.files ?? []" :key="file.path" class="diff-file">
            <div class="diff-file-head">
              <span class="diff-path">{{ file.path }}</span>
              <Tag>{{ file.changeType }}</Tag>
            </div>
            <p v-if="file.binary" class="diff-binary">二进制文件，不展示差异</p>
            <table v-else class="diff-table">
              <tbody>
                <template v-for="(line, index) in file.lines" :key="index">
                  <tr :class="lineClass(line)" @click="startDraft(file, line)">
                    <td class="ln">{{ line.oldLine ?? '' }}</td>
                    <td class="ln">{{ line.newLine ?? '' }}</td>
                    <td class="code"><span class="marker">{{ marker(line) }}</span>{{ line.content }}</td>
                  </tr>
                  <tr v-for="c in commentsAt(file, line)" :key="`c${c.id}`" class="inline-comment-row">
                    <td colspan="3">
                      <div class="inline-comment">
                        <b>{{ c.authorName }}</b>
                        <Tooltip v-if="c.anchorSha" :title="`评论时针对 ${c.anchorSha}`">
                          <Tag class="anchor-tag">@{{ c.anchorSha }}</Tag>
                        </Tooltip>
                        <div class="comment-body">{{ c.body }}</div>
                      </div>
                    </td>
                  </tr>
                  <tr v-for="(p, pi) in pendingAt(file, line)" :key="`p${pi}`" class="inline-comment-row">
                    <td colspan="3">
                      <div class="inline-comment pending">
                        <b>待提交</b>
                        <div class="comment-body">{{ p.body }}</div>
                        <Button size="small" type="link" danger @click.stop="dropPending(pending.indexOf(p))">
                          撤回
                        </Button>
                      </div>
                    </td>
                  </tr>
                  <tr
                    v-if="draft && draft.filePath === file.path
                      && draft.line === (draft.side === 'old' ? line.oldLine : line.newLine)
                      && draft.side === (line.kind === 'del' ? 'old' : 'new')"
                    class="inline-comment-row"
                  >
                    <td colspan="3">
                      <div class="draft-box">
                        <Input.TextArea v-model:value="draft.body" :rows="2" placeholder="对这一行说点什么…" />
                        <div class="draft-actions">
                          <Button size="small" type="primary" @click.stop="stageDraft">加入本次评审</Button>
                          <Button size="small" @click.stop="draft = null">取消</Button>
                        </div>
                      </div>
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>

            <div v-if="outdatedIn(file).length > 0" class="outdated-box">
              <div class="outdated-title">已过时的评论（锚点行已被改写，无法再定位）</div>
              <div v-for="c in outdatedIn(file)" :key="`o${c.id}`" class="inline-comment outdated">
                <b>{{ c.authorName }}</b>
                <Tag color="orange">原第 {{ c.originalLine }} 行 @{{ c.anchorSha }}</Tag>
                <div class="comment-body">{{ c.body }}</div>
              </div>
            </div>
          </div>
        </section>

        <aside class="thread-col">
          <h4>评审记录</h4>
          <Empty v-if="(store.prThread?.reviews.length ?? 0) === 0" :image="null" description="还没有人评审" />
          <div v-for="r in store.prThread?.reviews ?? []" :key="r.id" class="review-item" :class="{ superseded: r.superseded }">
            <div class="review-head">
              <b>{{ r.reviewerName }}</b>
              <Tag :color="stateColor(r.state)">{{ stateLabel(r.state) }}</Tag>
              <Tag v-if="r.superseded" class="superseded-tag">已被更新</Tag>
            </div>
            <div v-if="r.body" class="comment-body">{{ r.body }}</div>
          </div>

          <h4>整体评论</h4>
          <div v-for="c in generalComments" :key="c.id" class="review-item">
            <b>{{ c.authorName }}</b>
            <div class="comment-body">{{ c.body }}</div>
          </div>
          <div class="general-form">
            <Input.TextArea v-model:value="generalComment" :rows="2" placeholder="留个整体意见…" />
            <Button size="small" block @click="onAddGeneral">发表评论</Button>
          </div>

          <h4>提交评审</h4>
          <Radio.Group v-model:value="reviewState" size="small" class="state-group">
            <Radio.Button value="commented">留言</Radio.Button>
            <Radio.Button value="approved">批准</Radio.Button>
            <Radio.Button value="changes_requested">请求修改</Radio.Button>
          </Radio.Group>
          <Input.TextArea v-model:value="reviewBody" :rows="3" placeholder="总评（可选）" />
          <p v-if="pending.length > 0" class="pending-hint">附带 {{ pending.length }} 条行级评论</p>
          <Button type="primary" block :loading="submitting" @click="onSubmitReview">提交评审</Button>
        </aside>
      </div>
    </Spin>
  </Drawer>
</template>

<style scoped>
.gate-alert {
  margin-bottom: 12px;
}
.review-body {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}
.diff-col {
  flex: 1;
  min-width: 0;
  max-height: calc(100vh - 200px);
  overflow: auto;
}
.thread-col {
  width: 280px;
  flex-shrink: 0;
}
.thread-col h4 {
  font-size: 13px;
  color: #344054;
  margin: 16px 0 8px;
}
.thread-col h4:first-child {
  margin-top: 0;
}
.diff-file {
  border: 1px solid #eef1f5;
  border-radius: 6px;
  margin-bottom: 12px;
  overflow: hidden;
}
.diff-file-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: #f8fafc;
  border-bottom: 1px solid #eef1f5;
}
.diff-path {
  font-family: monospace;
  font-size: 12px;
  color: #344054;
}
.diff-binary {
  padding: 10px;
  font-size: 12px;
  color: #98a2b3;
  margin: 0;
}
.diff-table {
  width: 100%;
  border-collapse: collapse;
  font-family: monospace;
  font-size: 12px;
}
.diff-line {
  cursor: pointer;
}
.diff-line:hover .code {
  background: #eef4ff;
}
.diff-hunk {
  background: #f3f6fb;
  color: #667085;
  cursor: default;
}
.diff-add .code {
  background: #e8f7ee;
}
.diff-del .code {
  background: #fdeceb;
}
.ln {
  width: 42px;
  text-align: right;
  padding: 0 6px;
  color: #b0b8c4;
  user-select: none;
  border-right: 1px solid #f0f2f5;
}
.code {
  padding: 0 8px;
  white-space: pre-wrap;
  word-break: break-all;
}
.marker {
  display: inline-block;
  width: 10px;
  color: #98a2b3;
}
.inline-comment-row td {
  padding: 0;
  background: #fff;
}
.inline-comment {
  margin: 6px 10px 6px 90px;
  padding: 8px 10px;
  border-left: 3px solid #2f80ed;
  background: #f8fafc;
  border-radius: 0 4px 4px 0;
  font-family: system-ui, sans-serif;
  font-size: 12px;
}
.inline-comment.pending {
  border-left-color: #f2994a;
}
.inline-comment.outdated {
  border-left-color: #f2994a;
  margin-left: 10px;
}
.anchor-tag {
  margin-left: 6px;
  font-family: monospace;
}
.comment-body {
  margin-top: 4px;
  color: #475467;
  line-height: 1.6;
  white-space: pre-wrap;
}
.draft-box {
  margin: 6px 10px 6px 90px;
}
.draft-actions {
  display: flex;
  gap: 6px;
  margin-top: 6px;
}
.outdated-box {
  border-top: 1px dashed #f0c9a0;
  padding: 8px 0;
  background: #fffaf5;
}
.outdated-title {
  font-size: 12px;
  color: #b26a1f;
  padding: 0 10px 4px;
}
.review-item {
  padding: 8px 10px;
  border: 1px solid #eef1f5;
  border-radius: 6px;
  margin-bottom: 8px;
  font-size: 12px;
}
.review-item.superseded {
  opacity: 0.55;
}
.review-head {
  display: flex;
  align-items: center;
  gap: 6px;
}
.superseded-tag {
  font-size: 11px;
}
.general-form {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 8px;
}
.state-group {
  display: flex;
  margin-bottom: 8px;
}
.pending-hint {
  font-size: 12px;
  color: #f2994a;
  margin: 8px 0;
}
</style>
