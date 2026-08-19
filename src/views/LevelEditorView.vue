<script setup lang="ts">
/**
 * 关卡编辑器（M4，docs/level-spec.md §2 的可视化创作台）。
 *
 * <p>创作方式：模板起步 + 三段可视化搭建（初始图 / 目标图 / 参考解），
 * 每一步即时渲染成图（§6.3 同一套确定性布局）；JSON 收进各段的「高级模式」，
 * 与 level.json 创作格式完全一致。发布前必须过后端自证闭环（§7.1），
 * 保存/自证/发布前都会先落库——自证跑的是服务端已保存的草稿，本地不落库的检查没有意义。
 */
import { computed, onMounted, reactive, ref, watch } from 'vue'
import {
  Alert, Button, Empty, Input, InputNumber, Modal, Popconfirm, Rate, Segmented,
  Select, Switch, Textarea, message,
} from 'ant-design-vue'
import {
  deleteDraft, getDraft, listMyDrafts, publishDraft, saveDraft, selfCheckDraft, unpublishDraft,
} from '@/api/levelDraft'
import type {
  DraftSummary, GoalSpec, InitialSpec, LevelFile, SelfCheckResult, SolutionSpec,
} from '@/types/levelDraft'
import { useAuthStore } from '@/stores/auth'
import { CHAPTERS } from '@/components/level/levelChapters'
import SpecGraphBuilder from '@/components/editor/SpecGraphBuilder.vue'
import FileMapEditor from '@/components/editor/FileMapEditor.vue'
import RemotesEditor from '@/components/editor/RemotesEditor.vue'
import MatchPolicyEditor from '@/components/editor/MatchPolicyEditor.vue'
import AssertionsEditor from '@/components/editor/AssertionsEditor.vue'
import SolutionBuilder from '@/components/editor/SolutionBuilder.vue'
import HintsBuilder from '@/components/editor/HintsBuilder.vue'
import TemplatePickerModal from '@/components/editor/TemplatePickerModal.vue'
import { LEVEL_TEMPLATES, type LevelTemplate } from '@/components/editor/levelTemplates'
import {
  cloneLevel, copyInitialToGoal, ensureGraph, normalizeLevel, pruneLevel,
} from '@/components/editor/specModel'

const auth = useAuthStore()

const drafts = ref<DraftSummary[]>([])
const current = ref<LevelFile>(normalizeLevel(cloneLevel(LEVEL_TEMPLATES[0]!.level)))
const currentSlug = ref('')
/** 已在服务端存在的 slug（打开或保存过）；有值即锁定 slug 输入，防止改名裂成两份草稿。 */
const loadedSlug = ref('')
const currentStatus = ref<string>('draft')
const loading = ref(false)
const busy = ref(false)
const checkResult = ref<SelfCheckResult | null>(null)
const templateOpen = ref(false)

type JsonKey = 'initial' | 'goal' | 'solution'
const jsonMode = reactive<Record<JsonKey, boolean>>({ initial: false, goal: false, solution: false })
const jsonBuf = reactive<Record<JsonKey, string>>({ initial: '', goal: '', solution: '' })
const jsonErr = reactive<Record<JsonKey, string>>({ initial: '', goal: '', solution: '' })

const MODE_OPTIONS = [
  { label: '单人 solo', value: 'solo' },
  { label: '协作 collab', value: 'collab' },
]

const categoryOptions = CHAPTERS.map((c) => ({ value: c.key, label: `${c.name}（${c.key}）` }))

const isCollab = computed(() => current.value.meta.mode === 'collab')
const slugLocked = computed(() => Boolean(loadedSlug.value))
const canPublish = computed(() => checkResult.value?.ok === true)

// description 在契约里可为 null，antd 输入框只接受 string：在这里收敛两者的差异
const metaDescription = computed({
  get: () => current.value.meta.description ?? '',
  set: (v: string) => { current.value.meta.description = v },
})

/** 工作区容器由 normalizeLevel 补齐；这里只做类型收窄给编辑器。 */
const initialWd = computed(() => {
  const wd = current.value.initial.workingDir
  return wd?.files && wd.staged ? { files: wd.files, staged: wd.staged } : null
})

/** collab 关卡 initial 描述的是共享裸 origin（§5.5）——工作区/远程配置属违规，给出即时纠偏。 */
const collabExtras = computed(() => {
  if (!isCollab.value) return null
  const wd = current.value.initial.workingDir
  const hasWd = Object.keys(wd?.files ?? {}).length > 0 || (wd?.staged ?? []).length > 0
  const hasRemotes = (current.value.initial.remotes ?? []).length > 0
  return hasWd || hasRemotes ? { hasWd, hasRemotes } : null
})

function clearCollabExtras(): void {
  current.value.initial.workingDir = { files: {}, staged: [] }
  current.value.initial.remotes = []
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

function loadIntoEditor(level: LevelFile, slug: string, status: string): void {
  current.value = normalizeLevel(level)
  currentSlug.value = slug
  loadedSlug.value = slug
  currentStatus.value = status
  jsonMode.initial = jsonMode.goal = jsonMode.solution = false
  jsonErr.initial = jsonErr.goal = jsonErr.solution = ''
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

function onPickTemplate(template: LevelTemplate): void {
  loadIntoEditor(cloneLevel(template.level), '', 'draft')
  loadedSlug.value = ''
  message.success(`已载入模板「${template.name}」——改成你的关卡吧`)
}

async function openDraft(slug: string): Promise<void> {
  try {
    const detail = await getDraft(slug)
    loadIntoEditor(detail.level, detail.slug, detail.status)
  } catch (e) {
    message.error(errText(e))
  }
}

/** 段落级 JSON 高级模式：进入时序列化当前结构，退出时解析回写（解析失败留在 JSON 态）。 */
function sectionValue(key: JsonKey): unknown {
  if (key === 'initial') return current.value.initial
  if (key === 'goal') return current.value.goal
  return current.value.solution
}

function toggleJson(key: JsonKey, on: boolean): void {
  if (on) {
    jsonBuf[key] = JSON.stringify(sectionValue(key), null, 2)
    jsonErr[key] = ''
    jsonMode[key] = true
    return
  }
  if (!commitJson(key)) return
  jsonMode[key] = false
}

function commitJson(key: JsonKey): boolean {
  try {
    const text = jsonBuf[key].trim()
    const parsed = text ? JSON.parse(text) as unknown : null
    const next: LevelFile = { ...current.value }
    if (key === 'initial') {
      next.initial = (parsed ?? {}) as InitialSpec
    } else if (key === 'goal') {
      // 兼容直接贴一张图（无 graph 包裹）的写法
      const goal = (parsed ?? { graph: {} }) as Record<string, unknown>
      next.goal = ('graph' in goal ? goal : { graph: goal }) as unknown as GoalSpec
    } else {
      next.solution = (parsed ?? { steps: [] }) as SolutionSpec
    }
    current.value = normalizeLevel(next)
    jsonErr[key] = ''
    return true
  } catch (e) {
    jsonErr[key] = errText(e)
    message.error(`JSON 解析失败：${errText(e)}`)
    return false
  }
}

/** 组装完整 LevelFile（含收拢空容器）；处于 JSON 态的段先解析回写。 */
function assemble(slug: string): LevelFile | null {
  for (const key of ['initial', 'goal', 'solution'] as JsonKey[]) {
    if (jsonMode[key] && !commitJson(key)) return null
  }
  return pruneLevel({
    ...cloneLevel(current.value),
    meta: { ...current.value.meta, slug },
  })
}

/**
 * 保存到服务端（保存/自证/发布共用的前置动作）。
 * 自证与发布都作用于"已保存的草稿"，先落库才不会检查到旧内容。
 */
async function persist(): Promise<string | null> {
  const slug = currentSlug.value.trim()
  if (!slug) {
    message.warning('先给关卡起一个 slug（URL 与进度的稳定标识）')
    return null
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    message.warning('slug 只能用小写字母、数字与中划线，如 my-first-level')
    return null
  }
  const level = assemble(slug)
  if (!level) return null
  try {
    const saved = await saveDraft(slug, level)
    loadedSlug.value = saved.slug
    currentStatus.value = saved.status
    await refreshList()
    return saved.slug
  } catch (e) {
    message.error(errText(e))
    return null
  }
}

async function onSave(): Promise<void> {
  busy.value = true
  try {
    if (await persist()) message.success('草稿已保存')
  } finally {
    busy.value = false
  }
}

async function onSelfCheck(): Promise<void> {
  busy.value = true
  try {
    const slug = await persist()
    if (!slug) return
    checkResult.value = await selfCheckDraft(slug)
    if (checkResult.value.ok) message.success('自证全绿，可以发布了')
  } catch (e) {
    message.error(errText(e))
  } finally {
    busy.value = false
  }
}

async function onPublish(): Promise<void> {
  busy.value = true
  try {
    const slug = await persist()
    if (!slug) return
    checkResult.value = await publishDraft(slug)
    currentStatus.value = 'published'
    message.success('关卡已发布，其他玩家可以在关卡地图里看到它')
    await refreshList()
  } catch (e) {
    message.error(errText(e))
  } finally {
    busy.value = false
  }
}

async function onUnpublish(): Promise<void> {
  try {
    await unpublishDraft(loadedSlug.value)
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
    if (loadedSlug.value === slug) onPickTemplate(LEVEL_TEMPLATES[0]!)
    message.success('已删除')
    await refreshList()
  } catch (e) {
    message.error(errText(e))
  }
}

function copyGoalFromInitial(): void {
  const apply = (): void => {
    current.value.goal.graph = copyInitialToGoal(current.value.initial)
    ensureGraph(current.value.goal.graph)
    message.success('已复制初始图为目标起点，继续在目标图上演化出通关结构')
  }
  if ((current.value.goal.graph.commits ?? []).length > 0) {
    Modal.confirm({
      title: '覆盖目标图？',
      content: '目标图现有内容将被初始图替换。',
      okText: '覆盖',
      cancelText: '取消',
      onOk: apply,
    })
  } else {
    apply()
  }
}

function gateClass(value: boolean | undefined): string {
  if (!checkResult.value) return 'idle'
  return value ? 'pass' : 'fail'
}

// 任何改动都让上一次自证结果失效——否则会拿旧的"绿灯"去发布改坏了的关卡
watch([current, currentSlug], () => { checkResult.value = null }, { deep: true })
watch(jsonBuf, () => { checkResult.value = null }, { deep: true })

onMounted(refreshList)
</script>

<template>
  <div class="editor-page">
    <header class="editor-top">
      <div class="brand">
        <RouterLink to="/" class="back">← 工作台</RouterLink>
        <div class="brand-title">
          <span class="brand-kicker">LEVEL WORKSHOP</span>
          <h1>关卡编辑器</h1>
        </div>
      </div>

      <div v-if="auth.isAuthenticated" class="top-status">
        <span v-if="loadedSlug" class="slug-chip">{{ loadedSlug }}</span>
        <span class="status-chip" :class="currentStatus === 'published' ? 'published' : 'draft'">
          {{ currentStatus === 'published' ? '已发布' : loadedSlug ? '草稿' : '未保存' }}
        </span>
      </div>

      <div v-if="auth.isAuthenticated" class="top-actions">
        <Button @click="templateOpen = true">＋ 新建关卡</Button>
        <Button :loading="busy" @click="onSave">保存草稿</Button>
        <Button v-if="currentStatus === 'published'" danger @click="onUnpublish">下架</Button>
      </div>
    </header>

    <div v-if="!auth.isAuthenticated" class="login-gate">
      <div class="login-card">
        <span class="login-icon">✎</span>
        <h2>登录后开始创作</h2>
        <p>登录后你创作的关卡才有归属，发布的关卡会进入所有玩家的关卡地图。</p>
        <RouterLink to="/login?redirect=/level-editor">
          <Button type="primary" size="large">去登录</Button>
        </RouterLink>
      </div>
    </div>

    <div v-else class="editor-body">
      <aside class="editor-side">
        <div class="side-head">
          <span>我的关卡</span>
          <span class="side-count">{{ drafts.length }}</span>
        </div>
        <Empty
          v-if="drafts.length === 0 && !loading"
          description="还没有创作过关卡——点「新建关卡」从模板起步"
          :image-style="{ height: '52px' }"
        />
        <ul v-else class="draft-list">
          <li
            v-for="d in drafts"
            :key="d.slug"
            :class="{ active: d.slug === loadedSlug }"
            @click="openDraft(d.slug)"
          >
            <span class="draft-dot" :class="d.status"></span>
            <div class="draft-main">
              <span class="draft-title">{{ d.title || d.slug }}</span>
              <span class="draft-meta">
                {{ d.category }} · {{ '★'.repeat(d.difficulty) }} · {{ d.status === 'published' ? '已发布' : '草稿' }}
              </span>
            </div>
            <Popconfirm title="删除这个关卡？" @confirm="onDelete(d.slug)">
              <button class="draft-del" title="删除" @click.stop>✕</button>
            </Popconfirm>
          </li>
        </ul>
      </aside>

      <main class="editor-main">
        <!-- 01 基本信息 -->
        <section class="sec">
          <div class="sec-head">
            <span class="sec-num">01</span>
            <div class="sec-title">
              <h2>基本信息</h2>
              <p>关卡在地图里的名片：标题、章节与难度</p>
            </div>
          </div>
          <div class="meta-grid">
            <div class="field">
              <label>slug（稳定标识，发布后不可改）</label>
              <Input
                v-model:value="currentSlug"
                :disabled="slugLocked"
                placeholder="my-first-level"
                spellcheck="false"
                class="mono"
              />
              <span v-if="slugLocked" class="field-hint">已锁定；要另起炉灶请「新建关卡」</span>
            </div>
            <div class="field">
              <label>标题</label>
              <Input v-model:value="current.meta.title" placeholder="例如：第一次提交" />
            </div>
            <div class="field">
              <label>章节</label>
              <Select v-model:value="current.meta.category" :options="categoryOptions" />
            </div>
            <div class="field">
              <label>难度</label>
              <Rate v-model:value="current.meta.difficulty" :count="5" :allow-clear="false" />
            </div>
            <div class="field">
              <label>模式</label>
              <Segmented
                :value="current.meta.mode"
                :options="MODE_OPTIONS"
                @change="current.meta.mode = $event === 'collab' ? 'collab' : 'solo'"
              />
              <span class="field-hint">
                {{ isCollab ? '协作：initial 描述房间共享的裸 origin，建房选本关即生效' : '单人：玩家在自己的沙盒里闯关' }}
              </span>
            </div>
            <div class="field">
              <label>章节内排序（可选）</label>
              <InputNumber
                :value="current.meta.orderIndex ?? undefined"
                :min="1"
                style="width: 100%"
                @update:value="current.meta.orderIndex = typeof $event === 'number' ? $event : null"
              />
            </div>
            <div class="field span-all">
              <label>关卡说明（玩家开卡前看到的引导，支持换行）</label>
              <Textarea v-model:value="metaDescription" :rows="2" placeholder="用一两句话讲清楚：现状是什么、要达成什么" />
            </div>
          </div>
        </section>

        <!-- 02 初始仓库 -->
        <section class="sec accent-blue">
          <div class="sec-head">
            <span class="sec-num">02</span>
            <div class="sec-title">
              <h2>初始仓库</h2>
              <p>{{ isCollab ? '房间共享 origin 的起点（§5.5：无工作区、无远程）' : '玩家开卡时看到的样子——图 + 工作区 + 远程' }}</p>
            </div>
            <label class="json-toggle">
              <Switch size="small" :checked="jsonMode.initial" @change="toggleJson('initial', Boolean($event))" />
              JSON
            </label>
          </div>

          <template v-if="jsonMode.initial">
            <Textarea v-model:value="jsonBuf.initial" :rows="16" class="code" spellcheck="false" />
            <p v-if="jsonErr.initial" class="json-error">JSON 解析失败：{{ jsonErr.initial }}</p>
          </template>
          <template v-else>
            <Alert
              v-if="collabExtras"
              type="warning"
              show-icon
              class="collab-alert"
              message="协作关卡的 initial 不能包含工作区/远程配置"
            >
              <template #description>
                initial 描述的是房间共享的裸 origin（裸仓库没有工作区；origin 就是它自己）。
                <a @click="clearCollabExtras">一键清除违规配置</a>
              </template>
            </Alert>

            <SpecGraphBuilder :spec="current.initial" variant="initial" />

            <template v-if="!isCollab">
              <div v-if="initialWd" class="sub-panel">
                <div class="sub-title">
                  工作区（构建配方）
                  <span class="sub-hint">checkout HEAD 后覆盖写这些文件；勾「已暂存」= 进过 git add</span>
                </div>
                <FileMapEditor
                  :files="initialWd.files"
                  :staged="initialWd.staged"
                  :allow-delete="true"
                  empty-text="工作区干净：玩家开卡即与 HEAD 一致（教 add/commit 的关卡通常放几个文件在这里）"
                />
              </div>
              <div class="sub-panel">
                <div class="sub-title">远程仓库</div>
                <RemotesEditor :spec="current.initial" variant="initial" />
              </div>
            </template>
          </template>
        </section>

        <!-- 03 通关目标 -->
        <section class="sec accent-goal">
          <div class="sec-head">
            <span class="sec-num">03</span>
            <div class="sec-title">
              <h2>通关目标</h2>
              <p>玩家要把仓库变成的样子——结构精确匹配打底，图看不出的用断言</p>
            </div>
            <Button v-if="!jsonMode.goal" size="small" @click="copyGoalFromInitial">⇩ 从初始图复制</Button>
            <label class="json-toggle">
              <Switch size="small" :checked="jsonMode.goal" @change="toggleJson('goal', Boolean($event))" />
              JSON
            </label>
          </div>

          <template v-if="jsonMode.goal">
            <Textarea v-model:value="jsonBuf.goal" :rows="16" class="code" spellcheck="false" />
            <p v-if="jsonErr.goal" class="json-error">JSON 解析失败：{{ jsonErr.goal }}</p>
          </template>
          <template v-else>
            <SpecGraphBuilder :spec="current.goal.graph" variant="goal" />

            <div class="sub-panel">
              <div class="sub-title">目标侧远程（教 push/fetch 时声明期望的远程指向）</div>
              <RemotesEditor :spec="current.goal.graph" variant="goal" />
            </div>
            <div class="sub-panel">
              <div class="sub-title">匹配策略</div>
              <MatchPolicyEditor :goal="current.goal" />
            </div>
            <div class="sub-panel">
              <div class="sub-title">断言</div>
              <AssertionsEditor :goal="current.goal" :mode="current.meta.mode" />
            </div>
          </template>
        </section>

        <!-- 04 参考解 -->
        <section class="sec">
          <div class="sec-head">
            <span class="sec-num">04</span>
            <div class="sec-title">
              <h2>参考解</h2>
              <p>从初始到目标的官方走法——提示系统的「看答案」与发布自证都用它</p>
            </div>
            <label class="json-toggle">
              <Switch size="small" :checked="jsonMode.solution" @change="toggleJson('solution', Boolean($event))" />
              JSON
            </label>
          </div>

          <template v-if="jsonMode.solution">
            <Textarea v-model:value="jsonBuf.solution" :rows="10" class="code" spellcheck="false" />
            <p v-if="jsonErr.solution" class="json-error">JSON 解析失败：{{ jsonErr.solution }}</p>
          </template>
          <SolutionBuilder v-else-if="current.solution" :solution="current.solution" :collab="isCollab" />
        </section>

        <!-- 05 分级提示 -->
        <section class="sec">
          <div class="sec-head">
            <span class="sec-num">05</span>
            <div class="sec-title">
              <h2>分级提示</h2>
              <p>卡关玩家逐级揭示的援手（使用提示不扣分）</p>
            </div>
          </div>
          <HintsBuilder v-if="current.hints" :hints="current.hints" />
        </section>

        <!-- 06 发布质检 -->
        <section class="sec gates-sec">
          <div class="sec-head">
            <span class="sec-num">06</span>
            <div class="sec-title">
              <h2>发布质检</h2>
              <p>三道质量门全绿才可上架——与官方关卡走同一条校验链路</p>
            </div>
          </div>

          <div class="gates">
            <div class="gate" :class="gateClass(checkResult?.semanticsOk)">
              <span class="gate-mark"></span>
              <strong>语义校验</strong>
              <p>引用完整 · 拓扑序 · 断言可用</p>
            </div>
            <span class="gate-arrow">→</span>
            <div class="gate" :class="gateClass(checkResult?.zeroStepFails)">
              <span class="gate-mark"></span>
              <strong>零步不通关</strong>
              <p>玩家不能一进门就赢</p>
            </div>
            <span class="gate-arrow">→</span>
            <div class="gate" :class="gateClass(checkResult?.solutionPasses)">
              <span class="gate-mark"></span>
              <strong>参考解通关</strong>
              <p>{{ isCollab ? '协作关卡豁免此项' : '三份 spec 互洽' }}</p>
            </div>
          </div>

          <Alert
            v-if="checkResult?.problems.length"
            type="error"
            show-icon
            message="需要修正"
            class="check-problems"
          >
            <template #description>
              <ul><li v-for="(p, i) in checkResult!.problems" :key="i">{{ p }}</li></ul>
            </template>
          </Alert>

          <div class="gate-actions">
            <Button :loading="busy" @click="onSelfCheck">保存并试跑自证</Button>
            <Button type="primary" :disabled="!canPublish" :loading="busy" @click="onPublish">
              发布关卡
            </Button>
            <span v-if="currentStatus === 'published'" class="gate-live">✓ 当前版本已上架，改动后需重新发布</span>
            <span v-else-if="!canPublish" class="gate-tip">自证全绿后解锁发布</span>
          </div>
        </section>
      </main>
    </div>

    <TemplatePickerModal v-model:open="templateOpen" @pick="onPickTemplate" />
  </div>
</template>

<style scoped>
.editor-page {
  --ink: #1b2a3a;
  --ink-soft: #4c5d70;
  --muted: #8a97a6;
  --line: #e3e9f0;
  --navy: #20364a;
  --green: #49a97c;

  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background:
    radial-gradient(#e7edf4 1px, transparent 1px) 0 0 / 22px 22px,
    #f4f7fa;
}

.editor-top {
  display: flex;
  align-items: center;
  gap: 18px;
  flex: none;
  padding: 10px 20px;
  background: #fff;
  border-bottom: 1px solid var(--line);
}

.brand {
  display: flex;
  align-items: center;
  gap: 16px;
}

.back {
  font-size: 13px;
  color: #2f80ed;
  white-space: nowrap;
}

.brand-kicker {
  display: block;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.22em;
  color: var(--green);
}

.brand-title h1 {
  margin: 0;
  font-size: 17px;
  color: var(--ink);
  line-height: 1.2;
}

.top-status {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.slug-chip {
  overflow: hidden;
  max-width: 240px;
  padding: 2px 9px;
  border-radius: 5px;
  background: #eef2f7;
  color: var(--ink-soft);
  font-family: 'Cascadia Code', Consolas, monospace;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-chip {
  flex: none;
  padding: 2px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
}

.status-chip.draft {
  color: #6b7c90;
  background: #eef2f7;
}

.status-chip.published {
  color: #1d7a4d;
  background: #dcf2e6;
}

.top-actions {
  display: flex;
  gap: 8px;
  flex: none;
  margin-left: auto;
}

/* —— 登录引导 —— */
.login-gate {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
}

.login-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  max-width: 360px;
  padding: 36px 42px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 18px 40px rgba(32, 54, 74, 0.08);
  text-align: center;
}

.login-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 46px;
  margin-bottom: 4px;
  border-radius: 50%;
  background: #e8f0fe;
  color: #2f80ed;
  font-size: 20px;
}

.login-card h2 {
  margin: 0;
  font-size: 17px;
  color: var(--ink);
}

.login-card p {
  margin: 0 0 12px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--muted);
}

/* —— 主体 —— */
.editor-body {
  display: flex;
  flex: 1;
  min-height: 0;
}

.editor-side {
  display: flex;
  flex-direction: column;
  width: 248px;
  flex: none;
  padding: 14px 12px;
  overflow-y: auto;
  background: #fff;
  border-right: 1px solid var(--line);
}

.side-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  font-size: 13px;
  font-weight: 700;
  color: var(--ink);
}

.side-count {
  padding: 0 7px;
  border-radius: 999px;
  background: #eef2f7;
  color: var(--muted);
  font-family: 'Cascadia Code', Consolas, monospace;
  font-size: 11px;
  font-weight: 400;
}

.draft-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.draft-list li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 9px;
  margin-bottom: 6px;
  border: 1px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  transition: background 120ms ease, border-color 120ms ease;
}

.draft-list li:hover {
  background: #f5f9ff;
}

.draft-list li.active {
  border-color: #bcd4f5;
  background: #f0f6ff;
}

.draft-dot {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #c8d2dd;
}

.draft-dot.published {
  background: var(--green);
  box-shadow: 0 0 0 3px rgba(73, 169, 124, 0.16);
}

.draft-main {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
}

.draft-title {
  overflow: hidden;
  font-size: 13px;
  font-weight: 600;
  color: var(--ink);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.draft-meta {
  font-size: 11px;
  color: var(--muted);
}

.draft-del {
  flex: none;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: transparent;
  font-size: 11px;
  cursor: pointer;
}

.draft-list li:hover .draft-del {
  color: #b9c3cf;
}

.draft-del:hover {
  color: #e25555 !important;
  background: #fdeeea;
}

.editor-main {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 14px;
  padding: 16px 20px 40px;
  overflow-y: auto;
}

/* —— 工序卡片 —— */
.sec {
  padding: 16px 18px 18px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 1px 3px rgba(32, 54, 74, 0.04);
}

.sec.accent-blue {
  border-top: 3px solid #2f80ed;
}

.sec.accent-goal {
  border-top: 3px solid var(--green);
}

.sec-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}

.sec-num {
  flex: none;
  font-family: 'Cascadia Code', Consolas, monospace;
  font-size: 24px;
  font-weight: 700;
  color: #d4dee9;
  line-height: 1;
}

.sec-title {
  flex: 1;
  min-width: 0;
}

.sec-title h2 {
  margin: 0;
  font-size: 15px;
  color: var(--ink);
}

.sec-title p {
  margin: 1px 0 0;
  font-size: 12px;
  color: var(--muted);
}

.json-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: none;
  font-family: 'Cascadia Code', Consolas, monospace;
  font-size: 11px;
  color: var(--muted);
  cursor: pointer;
  user-select: none;
}

/* —— 表单 —— */
.meta-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 12px 16px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.field.span-all {
  grid-column: 1 / -1;
}

.field label {
  font-size: 12px;
  font-weight: 600;
  color: var(--ink-soft);
}

.field-hint {
  font-size: 11px;
  color: var(--muted);
}

.mono {
  font-family: 'Cascadia Code', Consolas, monospace;
}

/* —— 子面板 —— */
.sub-panel {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px dashed var(--line);
}

.sub-title {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 8px;
  font-size: 12.5px;
  font-weight: 700;
  color: var(--ink-soft);
}

.sub-hint {
  font-size: 11px;
  font-weight: 400;
  color: var(--muted);
}

.collab-alert {
  margin-bottom: 12px;
}

.code {
  font-family: 'Cascadia Code', Consolas, monospace;
  font-size: 12px;
  line-height: 1.55;
}

.json-error {
  margin: 6px 0 0;
  font-size: 12px;
  color: #e25555;
}

/* —— 质量门 —— */
.gates-sec {
  border-top: 3px solid var(--navy);
}

.gates {
  display: flex;
  align-items: stretch;
  gap: 10px;
  margin-bottom: 14px;
}

.gate {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: #fafcfe;
  transition: border-color 200ms ease, background 200ms ease;
}

.gate strong {
  font-size: 13px;
  color: var(--ink);
}

.gate p {
  margin: 0;
  font-size: 11.5px;
  color: var(--muted);
}

.gate-mark {
  width: 18px;
  height: 18px;
  margin-bottom: 4px;
  border-radius: 50%;
  background: #e3e9f0;
  position: relative;
}

.gate-mark::after {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  content: '';
}

.gate.pass {
  border-color: #bfe5d1;
  background: #f2faf6;
}

.gate.pass .gate-mark {
  background: var(--green);
}

.gate.pass .gate-mark::after {
  content: '✓';
}

.gate.fail {
  border-color: #f3cfc7;
  background: #fff7f5;
}

.gate.fail .gate-mark {
  background: #e25555;
}

.gate.fail .gate-mark::after {
  content: '✗';
}

.gate-arrow {
  align-self: center;
  color: #c4d2e0;
  font-size: 15px;
}

.check-problems {
  margin-bottom: 14px;
}

.check-problems ul {
  margin: 0;
  padding-left: 18px;
}

.gate-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.gate-tip {
  font-size: 12px;
  color: var(--muted);
}

.gate-live {
  font-size: 12px;
  color: #1d7a4d;
}

@media (max-width: 860px) {
  .gates {
    flex-direction: column;
  }

  .gate-arrow {
    transform: rotate(90deg);
  }
}
</style>
