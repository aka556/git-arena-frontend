<script setup lang="ts">
/**
 * 关卡编辑器（M4，docs/level-spec.md §2 的可视化编辑）。
 *
 * <p>编辑的就是 LevelFile 本身：meta 走表单，三个 spec 走 JSON 编辑区并<b>实时预览成图</b>
 * （§6.3 的同一套确定性布局，所见即玩家将看到的初始图/目标图）。
 * 发布前必须过后端自证闭环（零步不通关 + 参考解通关），这是关卡质量的唯一硬闸门。
 */
import { computed, onMounted, ref, watch } from 'vue'
import {
  Alert, Button, Card, Empty, Form, FormItem, Input, InputNumber, Modal,
  Popconfirm, Select, SelectOption, Space, Tag, Textarea, message,
} from 'ant-design-vue'
import GitGraphView from '@/components/graph/GitGraphView.vue'
import { specToGraph } from '@/composables/useSpecGraph'
import {
  deleteDraft, getDraft, listMyDrafts, publishDraft, saveDraft, selfCheckDraft, unpublishDraft,
} from '@/api/levelDraft'
import type { DraftSummary, LevelFile, SelfCheckResult } from '@/types/levelDraft'
import { useAuthStore } from '@/stores/auth'

const CATEGORIES = ['basics', 'branching', 'merge', 'rebase', 'remote', 'conflict', 'pr']

const BLANK: LevelFile = {
  specVersion: 1,
  meta: {
    slug: '', title: '', description: '', category: 'basics',
    difficulty: 1, mode: 'solo', orderIndex: 1, visibility: 'public',
  },
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
  solution: { steps: [{ run: 'git add hello.txt' }, { run: 'git commit -m "init"' }] },
  hints: [],
}

const auth = useAuthStore()
const drafts = ref<DraftSummary[]>([])
const current = ref<LevelFile>(clone(BLANK))
const currentSlug = ref('')
const currentStatus = ref<string>('draft')
const loading = ref(false)
const busy = ref(false)
const checkResult = ref<SelfCheckResult | null>(null)

// 三个 spec 以 JSON 文本编辑：既保留全部表达力，又与 level.json 创作格式完全一致
const initialText = ref('')
const goalText = ref('')
const solutionText = ref('')
const initialError = ref('')
const goalError = ref('')
const solutionError = ref('')

const initialGraph = computed(() => specToGraph(parsed(initialText.value, initialError)))
const goalGraph = computed(() => specToGraph(parsed(goalText.value, goalError)?.graph
  ?? parsed(goalText.value, goalError)))
const canPublish = computed(() => checkResult.value?.ok === true)

// description 在契约里可为 null，antd 输入框只接受 string：在这里收敛两者的差异
const metaDescription = computed({
  get: () => current.value.meta.description ?? '',
  set: (v: string) => { current.value.meta.description = v },
})

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/** 解析 JSON 并把错误写进对应的错误位；解析失败时保留上一次可用结构（预览不闪烁）。 */
function parsed(text: string, errorRef: { value: string }): any {
  if (!text.trim()) {
    errorRef.value = ''
    return null
  }
  try {
    const value = JSON.parse(text)
    errorRef.value = ''
    return value
  } catch (e) {
    errorRef.value = e instanceof Error ? e.message : String(e)
    return null
  }
}

function loadIntoEditor(level: LevelFile, slug: string, status: string): void {
  current.value = clone(level)
  currentSlug.value = slug
  currentStatus.value = status
  initialText.value = JSON.stringify(level.initial ?? {}, null, 2)
  goalText.value = JSON.stringify(level.goal ?? {}, null, 2)
  solutionText.value = level.solution ? JSON.stringify(level.solution, null, 2) : ''
  checkResult.value = null
}

async function refreshList(): Promise<void> {
  if (!auth.isAuthenticated) return
  loading.value = true
  try {
    drafts.value = await listMyDrafts()
  } catch (e) {
    message.error(errText(e))
  } finally {
    loading.value = false
  }
}

function newDraft(): void {
  loadIntoEditor(clone(BLANK), '', 'draft')
}

async function openDraft(slug: string): Promise<void> {
  try {
    const detail = await getDraft(slug)
    loadIntoEditor(detail.level, detail.slug, detail.status)
  } catch (e) {
    message.error(errText(e))
  }
}

/** 组装编辑器里的四块（meta + 三个 spec）成一份完整 LevelFile。 */
function assemble(): LevelFile | null {
  const initial = parsed(initialText.value, initialError)
  const goal = parsed(goalText.value, goalError)
  const solution = solutionText.value.trim() ? parsed(solutionText.value, solutionError) : null
  if (initialError.value || goalError.value || solutionError.value) {
    message.error('JSON still has syntax errors — 请先修正高亮的解析错误')
    return null
  }
  if (!goal) {
    message.error('goal 不能为空')
    return null
  }
  return {
    specVersion: 1,
    meta: { ...current.value.meta, slug: currentSlug.value },
    initial: initial ?? {},
    goal,
    solution,
    hints: current.value.hints ?? [],
  }
}

async function onSave(): Promise<void> {
  const slug = currentSlug.value.trim()
  if (!slug) {
    message.warning('请先填写 slug')
    return
  }
  const level = assemble()
  if (!level) return
  busy.value = true
  try {
    const saved = await saveDraft(slug, level)
    loadIntoEditor(saved.level, saved.slug, saved.status)
    message.success('草稿已保存')
    await refreshList()
  } catch (e) {
    message.error(errText(e))
  } finally {
    busy.value = false
  }
}

async function onSelfCheck(): Promise<void> {
  if (!currentSlug.value) {
    message.warning('请先保存草稿')
    return
  }
  busy.value = true
  try {
    checkResult.value = await selfCheckDraft(currentSlug.value)
    if (checkResult.value.ok) message.success('自证通过，可以发布了')
  } catch (e) {
    message.error(errText(e))
  } finally {
    busy.value = false
  }
}

async function onPublish(): Promise<void> {
  busy.value = true
  try {
    checkResult.value = await publishDraft(currentSlug.value)
    currentStatus.value = 'published'
    message.success('关卡已发布，其他玩家可以在关卡列表里看到它')
    await refreshList()
  } catch (e) {
    message.error(errText(e))
  } finally {
    busy.value = false
  }
}

async function onUnpublish(): Promise<void> {
  try {
    await unpublishDraft(currentSlug.value)
    currentStatus.value = 'draft'
    message.success('已下架为草稿')
    await refreshList()
  } catch (e) {
    message.error(errText(e))
  }
}

async function onDelete(slug: string): Promise<void> {
  try {
    await deleteDraft(slug)
    if (currentSlug.value === slug) newDraft()
    message.success('已删除')
    await refreshList()
  } catch (e) {
    message.error(errText(e))
  }
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

// 任何改动都让上一次自证结果失效——否则会拿旧的"绿灯"去发布改坏了的关卡
watch([initialText, goalText, solutionText, () => current.value.meta], () => {
  checkResult.value = null
}, { deep: true })

onMounted(refreshList)
</script>

<template>
  <div class="editor-page">
    <header class="editor-top">
      <div class="brand">
        <RouterLink to="/" class="back">← 返回工作台</RouterLink>
        <h1>关卡编辑器</h1>
      </div>
      <Space>
        <Button @click="newDraft">新建关卡</Button>
        <Button :loading="busy" @click="onSave">保存草稿</Button>
        <Button :loading="busy" @click="onSelfCheck">试跑自证</Button>
        <Button type="primary" :disabled="!canPublish" :loading="busy" @click="onPublish">
          发布
        </Button>
        <Button v-if="currentStatus === 'published'" danger @click="onUnpublish">下架</Button>
      </Space>
    </header>

    <Alert
      v-if="!auth.isAuthenticated"
      type="info"
      show-icon
      message="关卡编辑器需要登录"
      description="登录后你创作的关卡才有归属，也才能发布给其他玩家。"
      class="editor-alert"
    />

    <div v-else class="editor-body">
      <aside class="editor-side">
        <div class="side-title">我的关卡</div>
        <Empty v-if="drafts.length === 0" description="还没有创作过关卡" />
        <ul v-else class="draft-list">
          <li
            v-for="d in drafts"
            :key="d.slug"
            :class="{ active: d.slug === currentSlug }"
            @click="openDraft(d.slug)"
          >
            <div class="draft-line">
              <span class="draft-title">{{ d.title || d.slug }}</span>
              <Tag :color="d.status === 'published' ? 'green' : 'default'">
                {{ d.status === 'published' ? '已发布' : '草稿' }}
              </Tag>
            </div>
            <div class="draft-meta">
              <span>{{ d.category }} · ★{{ d.difficulty }} · {{ d.mode }}</span>
              <Popconfirm title="删除这个关卡？" @confirm="onDelete(d.slug)">
                <a class="draft-del" @click.stop>删除</a>
              </Popconfirm>
            </div>
          </li>
        </ul>
      </aside>

      <main class="editor-main">
        <Card size="small" title="基本信息">
          <Form layout="vertical" class="meta-form">
            <FormItem label="slug（URL 与进度的稳定标识，发布后别改）">
              <Input v-model:value="currentSlug" placeholder="my-first-level" />
            </FormItem>
            <FormItem label="标题">
              <Input v-model:value="current.meta.title" placeholder="第一次提交" />
            </FormItem>
            <FormItem label="分类">
              <Select v-model:value="current.meta.category">
                <SelectOption v-for="c in CATEGORIES" :key="c" :value="c">{{ c }}</SelectOption>
              </Select>
            </FormItem>
            <FormItem label="难度（1–5）">
              <InputNumber v-model:value="current.meta.difficulty" :min="1" :max="5" />
            </FormItem>
            <FormItem label="模式">
              <Select v-model:value="current.meta.mode">
                <SelectOption value="solo">solo（单人）</SelectOption>
                <SelectOption value="collab">collab（协作房间）</SelectOption>
              </Select>
            </FormItem>
            <FormItem label="关卡说明" class="meta-desc">
              <Textarea v-model:value="metaDescription" :rows="3" />
            </FormItem>
          </Form>
        </Card>

        <div class="spec-grid">
          <Card size="small" title="initial（初始仓库蓝图）">
            <Textarea v-model:value="initialText" :rows="14" class="code" spellcheck="false" />
            <p v-if="initialError" class="json-error">JSON 解析失败：{{ initialError }}</p>
            <div class="preview">
              <div class="preview-label">初始图预览</div>
              <div class="preview-canvas"><GitGraphView :graph="initialGraph" :fit="true" /></div>
            </div>
          </Card>

          <Card size="small" title="goal（通关校验规则）">
            <Textarea v-model:value="goalText" :rows="14" class="code" spellcheck="false" />
            <p v-if="goalError" class="json-error">JSON 解析失败：{{ goalError }}</p>
            <div class="preview">
              <div class="preview-label">目标图预览</div>
              <div class="preview-canvas"><GitGraphView :graph="goalGraph" :fit="true" /></div>
            </div>
          </Card>
        </div>

        <Card size="small" title="solution（参考解，发布必填）">
          <Textarea v-model:value="solutionText" :rows="8" class="code" spellcheck="false" />
          <p v-if="solutionError" class="json-error">JSON 解析失败：{{ solutionError }}</p>
        </Card>

        <Card size="small" title="自证闭环（发布前的质量门）">
          <Empty v-if="!checkResult" description="改动后请重新「试跑自证」" />
          <template v-else>
            <ul class="check-list">
              <li :class="{ pass: checkResult.semanticsOk }">
                {{ checkResult.semanticsOk ? '✓' : '✗' }} 语义校验（引用完整、拓扑序、断言可用）
              </li>
              <li :class="{ pass: checkResult.zeroStepFails }">
                {{ checkResult.zeroStepFails ? '✓' : '✗' }} 零步不通关（玩家不能一进门就赢）
              </li>
              <li :class="{ pass: checkResult.solutionPasses }">
                {{ checkResult.solutionPasses ? '✓' : '✗' }} 参考解可通关（三份 spec 互洽）
              </li>
            </ul>
            <Alert
              v-if="checkResult.problems.length"
              type="error"
              show-icon
              message="需要修正"
              class="check-problems"
            >
              <template #description>
                <ul><li v-for="(p, i) in checkResult.problems" :key="i">{{ p }}</li></ul>
              </template>
            </Alert>
          </template>
        </Card>
      </main>
    </div>
  </div>
</template>

<style scoped>
.editor-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background: #f5f7fa;
}

.editor-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 18px;
  background: #fff;
  border-bottom: 1px solid #e8edf3;
}

.brand {
  display: flex;
  align-items: baseline;
  gap: 14px;
}

.brand h1 {
  margin: 0;
  font-size: 17px;
}

.back {
  font-size: 13px;
  color: #2f80ed;
}

.editor-alert {
  margin: 24px;
}

.editor-body {
  display: flex;
  flex: 1;
  min-height: 0;
}

.editor-side {
  width: 260px;
  flex: none;
  padding: 12px;
  overflow-y: auto;
  background: #fff;
  border-right: 1px solid #e8edf3;
}

.side-title {
  margin-bottom: 10px;
  font-size: 13px;
  font-weight: 600;
  color: #344054;
}

.draft-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.draft-list li {
  padding: 8px 10px;
  margin-bottom: 6px;
  border: 1px solid #eef1f5;
  border-radius: 6px;
  cursor: pointer;
}

.draft-list li:hover,
.draft-list li.active {
  border-color: #2f80ed;
  background: #f5f9ff;
}

.draft-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.draft-title {
  overflow: hidden;
  font-size: 13px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.draft-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 4px;
  font-size: 11px;
  color: #98a2b3;
}

.draft-del {
  color: #eb5757;
}

.editor-main {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  overflow-y: auto;
}

.meta-form {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 0 14px;
}

.meta-desc {
  grid-column: 1 / -1;
}

.spec-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(380px, 1fr));
  gap: 12px;
}

.code {
  font-family: 'Cascadia Code', Consolas, Menlo, monospace;
  font-size: 12px;
  line-height: 1.55;
}

.json-error {
  margin: 6px 0 0;
  font-size: 12px;
  color: #eb5757;
}

.preview {
  margin-top: 10px;
}

.preview-label {
  margin-bottom: 4px;
  font-size: 12px;
  color: #667085;
}

.preview-canvas {
  height: 220px;
  overflow: hidden;
  border: 1px solid #eef1f5;
  border-radius: 6px;
}

.check-list {
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 13px;
}

.check-list li {
  padding: 3px 0;
  color: #eb5757;
}

.check-list li.pass {
  color: #27ae60;
}

.check-problems {
  margin-top: 10px;
}

.check-problems ul {
  margin: 0;
  padding-left: 18px;
}
</style>
