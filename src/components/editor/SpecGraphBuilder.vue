<script setup lang="ts">
/**
 * SpecGraph 可视化搭建器（关卡编辑器的核心交互）：按 git 的心智模型点选操作——
 * 「提交推进分支、合并产生双亲、HEAD 决定落点」，由构造保证拓扑序与引用完整，
 * 作者不再手写 JSON。每一步操作即时渲染成图（§6.3 同一套确定性布局，所见即玩家所见）。
 *
 * <p>就地修改父级传入的 spec（编辑器持有唯一草稿对象）；语义校验权威仍在后端。
 */
import { computed, reactive, ref } from 'vue'
import { Button, Collapse, CollapsePanel, Input, Popover, Select, message } from 'ant-design-vue'
import GitGraphView from '@/components/graph/GitGraphView.vue'
import { specToGraph } from '@/composables/useSpecGraph'
import type { SpecCommit } from '@/types/levelDraft'
import FileMapEditor from './FileMapEditor.vue'
import {
  addBranch, addCommit, addTag, commitSeqs, decodeHead, encodeHead, headTip,
  mergeBranch, removeBranch, removeCommit, removeTag, type GraphSpec,
} from './specModel'

const props = defineProps<{
  spec: GraphSpec
  variant: 'initial' | 'goal'
}>()

const previewGraph = computed(() => specToGraph(props.spec))
const commits = computed(() => props.spec.commits ?? [])
const branches = computed(() => props.spec.branches ?? [])
const tags = computed(() => props.spec.tags ?? [])

const pop = reactive({ commit: false, branch: false, merge: false, tag: false })
const commitMsg = ref('')
const branchName = ref('')
const branchAt = ref('')
const mergeFrom = ref('')
const tagName = ref('')
const tagAt = ref('')
/** 展开文件编辑的提交 seq（一次只展开一个，保持列表紧凑）。 */
const filesOpenSeq = ref<string | null>(null)

const seqOptions = computed(() => commitSeqs(props.spec).map((s) => ({ value: s, label: s })))

const headValue = computed(() => encodeHead(props.spec.head))
const headOptions = computed(() => {
  const options = branches.value.map((b) => ({
    value: `branch:${b.name}`,
    label: `HEAD → ${b.name}`,
  }))
  for (const c of commits.value) {
    options.push({ value: `detached:${c.seq}`, label: `HEAD 游离 @ ${c.seq}` })
  }
  // 空仓库的未出生分支不在 branches 里，但必须是合法选项（否则下拉显示裸值）
  if (!options.some((o) => o.value === headValue.value)) {
    const head = props.spec.head
    options.unshift({
      value: headValue.value,
      label: head?.type === 'branch' ? `HEAD → ${head.ref}（未出生）` : `HEAD → ${head?.ref ?? 'main'}`,
    })
  }
  return options
})

function apply(error: string | null, onOk?: () => void): void {
  if (error) {
    message.warning(error)
    return
  }
  onOk?.()
}

function onCommit(): void {
  apply(addCommit(props.spec, commitMsg.value), () => {
    commitMsg.value = ''
    pop.commit = false
  })
}

function openBranchPop(): void {
  branchAt.value = headTip(props.spec) ?? ''
  branchName.value = ''
}

function onBranch(): void {
  if (!branchAt.value) {
    message.warning('先创建至少一个提交')
    return
  }
  apply(addBranch(props.spec, branchName.value, branchAt.value), () => {
    pop.branch = false
  })
}

function onMerge(): void {
  if (!mergeFrom.value) {
    message.warning('选择要合并进来的分支')
    return
  }
  apply(mergeBranch(props.spec, mergeFrom.value), () => {
    mergeFrom.value = ''
    pop.merge = false
  })
}

const mergeSources = computed(() => {
  const head = props.spec.head
  const current = head?.type === 'branch' ? head.ref : null
  return branches.value
    .filter((b) => b.name !== current)
    .map((b) => ({ value: b.name, label: `${b.name}（${b.target}）` }))
})

function openTagPop(): void {
  tagAt.value = headTip(props.spec) ?? ''
  tagName.value = ''
}

function onTag(): void {
  if (!tagAt.value) {
    message.warning('先创建至少一个提交')
    return
  }
  apply(addTag(props.spec, tagName.value, tagAt.value), () => {
    pop.tag = false
  })
}

function onHeadChange(value: unknown): void {
  props.spec.head = decodeHead(String(value))
}

function onRemoveCommit(seq: string): void {
  apply(removeCommit(props.spec, seq))
  if (filesOpenSeq.value === seq) filesOpenSeq.value = null
}

function onRemoveBranch(name: string): void {
  apply(removeBranch(props.spec, name))
}

/** 展开某个提交的文件编辑；首次展开时补上 files 容器。 */
function toggleFiles(commit: SpecCommit): void {
  if (filesOpenSeq.value === commit.seq) {
    filesOpenSeq.value = null
    return
  }
  commit.files = commit.files ?? {}
  filesOpenSeq.value = commit.seq
}

function fileCount(commit: SpecCommit): number {
  return Object.keys(commit.files ?? {}).length
}

/** 提交行里父提交的可选集：只允许数组中更早出现的 seq（拓扑序由构造保证，§3.1）。 */
function parentOptions(index: number): { value: string; label: string }[] {
  return commits.value.slice(0, index).map((c) => ({ value: c.seq, label: c.seq }))
}
</script>

<template>
  <div class="builder">
    <div class="builder-bar">
      <Popover v-model:open="pop.commit" trigger="click" placement="bottomLeft">
        <template #content>
          <div class="pop-form">
            <Input
              v-model:value="commitMsg"
              size="small"
              placeholder="提交信息（可留空）"
              @press-enter="onCommit"
            />
            <Button type="primary" size="small" @click="onCommit">在 HEAD 处提交</Button>
          </div>
        </template>
        <Button size="small" type="primary" ghost>＋ 提交</Button>
      </Popover>

      <Popover v-model:open="pop.branch" trigger="click" placement="bottomLeft" @open-change="(o: boolean) => o && openBranchPop()">
        <template #content>
          <div class="pop-form">
            <Input v-model:value="branchName" size="small" placeholder="分支名，如 feature" spellcheck="false" @press-enter="onBranch" />
            <Select v-model:value="branchAt" size="small" class="pop-select" :options="seqOptions" placeholder="创建在哪个提交" />
            <Button type="primary" size="small" @click="onBranch">创建分支</Button>
          </div>
        </template>
        <Button size="small">⑂ 分支</Button>
      </Popover>

      <Popover v-model:open="pop.merge" trigger="click" placement="bottomLeft">
        <template #content>
          <div class="pop-form">
            <Select v-model:value="mergeFrom" size="small" class="pop-select" :options="mergeSources" placeholder="把哪个分支合并进来" />
            <Button type="primary" size="small" @click="onMerge">合并到 HEAD 所在分支</Button>
            <p class="pop-hint">合并提交的首父 = 当前分支（方向即考点）</p>
          </div>
        </template>
        <Button size="small" :disabled="branches.length < 2">⇥ 合并</Button>
      </Popover>

      <Popover v-model:open="pop.tag" trigger="click" placement="bottomLeft" @open-change="(o: boolean) => o && openTagPop()">
        <template #content>
          <div class="pop-form">
            <Input v-model:value="tagName" size="small" placeholder="标签名，如 v1.0" spellcheck="false" @press-enter="onTag" />
            <Select v-model:value="tagAt" size="small" class="pop-select" :options="seqOptions" placeholder="打在哪个提交" />
            <Button type="primary" size="small" @click="onTag">打标签</Button>
          </div>
        </template>
        <Button size="small">⌂ 标签</Button>
      </Popover>

      <Select
        :value="headValue"
        size="small"
        class="head-select"
        :options="headOptions"
        @change="onHeadChange"
      />

      <span class="builder-count">{{ commits.length }} 个提交</span>
    </div>

    <div class="builder-canvas">
      <GitGraphView :graph="previewGraph" :fit="true" />
      <div v-if="commits.length === 0" class="builder-empty">
        <template v-if="props.variant === 'initial'">
          空仓库：HEAD 停在未出生的 <code>main</code> 上。<br />点上方「＋ 提交」创建第一个提交，或保持空仓库教 <code>git add / commit</code>。
        </template>
        <template v-else>
          目标图还是空的：用上方按钮搭出玩家应达成的结构，<br />或点「从初始图复制」在初始图基础上继续演化。
        </template>
      </div>
    </div>

    <div v-if="branches.length || tags.length" class="builder-refs">
      <Popover v-for="b in branches" :key="`b:${b.name}`" trigger="click" placement="bottom">
        <template #content>
          <div class="pop-form">
            <span class="pop-label">{{ b.name }} 指向</span>
            <Select :value="b.target" size="small" class="pop-select" :options="seqOptions" @change="b.target = String($event)" />
            <Button danger size="small" @click="onRemoveBranch(b.name)">删除分支</Button>
          </div>
        </template>
        <button class="ref-chip branch" type="button">
          {{ b.name }}<i>→{{ b.target }}</i>
        </button>
      </Popover>

      <Popover v-for="t in tags" :key="`t:${t.name}`" trigger="click" placement="bottom">
        <template #content>
          <div class="pop-form">
            <span class="pop-label">{{ t.name }} 指向</span>
            <Select :value="t.target" size="small" class="pop-select" :options="seqOptions" @change="t.target = String($event)" />
            <Button danger size="small" @click="removeTag(props.spec, t.name)">删除标签</Button>
          </div>
        </template>
        <button class="ref-chip tag" type="button">
          ⌂ {{ t.name }}<i>→{{ t.target }}</i>
        </button>
      </Popover>
    </div>

    <Collapse v-if="commits.length" ghost class="builder-detail">
      <CollapsePanel key="commits" :header="`提交明细（信息 / 父提交${props.variant === 'initial' ? ' / 携带文件' : ''}）`">
        <div v-for="(c, i) in commits" :key="c.seq" class="commit-row-wrap">
          <div class="commit-row">
            <span class="commit-seq">{{ c.seq }}</span>
            <Select
              :value="c.parents ?? []"
              mode="multiple"
              size="small"
              class="commit-parents"
              :options="parentOptions(i)"
              :placeholder="i === 0 ? '根提交' : '父提交'"
              @change="c.parents = ($event as string[])"
            />
            <Input
              :value="c.message ?? ''"
              size="small"
              class="commit-msg"
              :placeholder="props.variant === 'goal' ? '提交信息（默认不比对）' : `提交信息（默认 commit ${c.seq}）`"
              @update:value="c.message = $event || null"
            />
            <Button
              v-if="props.variant === 'initial'"
              size="small"
              type="text"
              class="commit-files-btn"
              :class="{ active: filesOpenSeq === c.seq }"
              @click="toggleFiles(c)"
            >
              🗎 {{ fileCount(c) || '' }}
            </Button>
            <Button size="small" type="text" danger @click="onRemoveCommit(c.seq)">✕</Button>
          </div>
          <div v-if="filesOpenSeq === c.seq && c.files" class="commit-files">
            <p class="commit-files-tip">该提交把这些文件设为给定内容（整文件快照；未提及的继承首父）</p>
            <FileMapEditor :files="c.files" :allow-delete="true" empty-text="该提交不改动文件" />
          </div>
        </div>
      </CollapsePanel>
    </Collapse>
  </div>
</template>

<style scoped>
.builder {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.builder-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.head-select {
  min-width: 168px;
  margin-left: auto;
}

.builder-count {
  flex: none;
  font-family: 'Cascadia Code', Consolas, monospace;
  font-size: 11px;
  color: #8a97a6;
}

.builder-canvas {
  position: relative;
  height: 300px;
  overflow: hidden;
  border: 1px solid #e3e9f0;
  border-radius: 8px;
  background:
    radial-gradient(#dfe8f2 1px, transparent 1px) 0 0 / 16px 16px,
    #fbfdff;
}

.builder-canvas :deep(.graph-view) {
  background: transparent;
}

.builder-empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  font-size: 12.5px;
  line-height: 1.9;
  color: #8a97a6;
  pointer-events: none;
}

.builder-empty code {
  padding: 0 4px;
  border-radius: 4px;
  background: #eef2f7;
  font-family: 'Cascadia Code', Consolas, monospace;
}

.builder-refs {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.ref-chip {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px 9px;
  border: 1px solid #cfdff5;
  border-radius: 999px;
  background: #e8f0fe;
  color: #2b62b8;
  font-family: 'Cascadia Code', Consolas, monospace;
  font-size: 11px;
  cursor: pointer;
  transition: box-shadow 120ms ease;
}

.ref-chip:hover {
  box-shadow: 0 2px 8px rgba(47, 128, 237, 0.2);
}

.ref-chip i {
  font-style: normal;
  opacity: 0.55;
}

.ref-chip.tag {
  border-color: #efdcc3;
  background: #fdf4e7;
  color: #a4671f;
}

.pop-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 210px;
}

.pop-select {
  width: 100%;
}

.pop-hint {
  margin: 0;
  font-size: 11px;
  color: #98a2b3;
}

.pop-label {
  font-size: 12px;
  font-weight: 600;
  color: #334155;
}

.builder-detail :deep(.ant-collapse-header) {
  padding: 4px 0 !important;
  font-size: 12.5px;
  color: #4c5d70;
}

.builder-detail :deep(.ant-collapse-content-box) {
  padding: 4px 0 0 !important;
}

.commit-row-wrap {
  margin-bottom: 6px;
}

.commit-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.commit-seq {
  flex: none;
  min-width: 34px;
  padding: 1px 0;
  border-radius: 5px;
  background: #20364a;
  color: #8ed7b4;
  font-family: 'Cascadia Code', Consolas, monospace;
  font-size: 11px;
  font-weight: 700;
  text-align: center;
}

.commit-parents {
  flex: none;
  width: 150px;
}

.commit-msg {
  flex: 1;
  min-width: 100px;
  font-size: 12px;
}

.commit-files-btn {
  flex: none;
  color: #7c8aa0;
}

.commit-files-btn.active {
  color: #2f80ed;
  background: #e8f0fe;
}

.commit-files {
  margin: 6px 0 4px 40px;
  padding: 8px;
  border-left: 3px solid #dbe5f0;
  background: #fafcfe;
  border-radius: 0 6px 6px 0;
}

.commit-files-tip {
  margin: 0 0 8px;
  font-size: 11px;
  color: #98a2b3;
}
</style>
