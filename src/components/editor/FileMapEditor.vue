<script setup lang="ts">
/**
 * 文件表编辑器：编辑 spec 里的 `Record<path, content|null>`（null=删除该文件）。
 *
 * <p>两处复用：提交的 files（整文件快照）与 initial.workingDir（附带 staged 勾选）。
 * 内部用行数组编辑（路径可随时改名），每次变更整体重建传入的 record——
 * 直接对 record 键做 v-model 无法表达"改名"，行模型才是自然的编辑单元。
 */
import { ref, watch } from 'vue'
import { Button, Checkbox, Input, Textarea, Tooltip } from 'ant-design-vue'

const props = defineProps<{
  /** 被编辑的文件表（父级保证非空对象，本组件就地重建其键值）。 */
  files: Record<string, string | null>
  /** 传入即显示 staged 勾选列（workingDir 场景），就地同步该数组。 */
  staged?: string[]
  /** 允许"删除文件"标记（提交与 workingDir 都支持 null 语义）。 */
  allowDelete?: boolean
  emptyText?: string
}>()

interface Row {
  path: string
  content: string
  del: boolean
  staged: boolean
}

const rows = ref<Row[]>([])

function initRows(): void {
  rows.value = Object.entries(props.files).map(([path, content]) => ({
    path,
    content: content ?? '',
    del: content === null,
    staged: props.staged?.includes(path) ?? false,
  }))
}

/** 行 → record 的单向重建；空路径行留在界面上但不进 record。 */
function sync(): void {
  for (const key of Object.keys(props.files)) delete props.files[key]
  const stagedPaths: string[] = []
  for (const row of rows.value) {
    const path = row.path.trim()
    if (!path) continue
    props.files[path] = row.del ? null : row.content
    if (row.staged && !row.del) stagedPaths.push(path)
  }
  if (props.staged) props.staged.splice(0, props.staged.length, ...stagedPaths)
}

function addRow(): void {
  rows.value.push({ path: '', content: '', del: false, staged: false })
}

function removeRow(index: number): void {
  rows.value.splice(index, 1)
}

watch(rows, sync, { deep: true })
// 装载新草稿/切换提交时 files 对象整体更换，行模型跟着重建
watch(() => props.files, initRows, { immediate: true })
</script>

<template>
  <div class="filemap">
    <p v-if="rows.length === 0" class="filemap-empty">{{ props.emptyText ?? '还没有文件' }}</p>

    <div v-for="(row, i) in rows" :key="i" class="filemap-row" :class="{ deleted: row.del }">
      <div class="filemap-head">
        <Input
          v-model:value="row.path"
          class="filemap-path"
          size="small"
          placeholder="路径，如 docs/a.txt"
          spellcheck="false"
        />
        <Checkbox v-if="props.staged" v-model:checked="row.staged" :disabled="row.del" class="filemap-staged">
          已暂存
        </Checkbox>
        <Tooltip v-if="props.allowDelete" title="标记为「删除该文件」（内容留空，构建时删除它）">
          <Checkbox v-model:checked="row.del" class="filemap-del">删除</Checkbox>
        </Tooltip>
        <Button type="text" size="small" danger class="filemap-remove" @click="removeRow(i)">✕</Button>
      </div>
      <Textarea
        v-if="!row.del"
        v-model:value="row.content"
        class="filemap-content"
        :auto-size="{ minRows: 1, maxRows: 6 }"
        placeholder="文件内容"
        spellcheck="false"
      />
    </div>

    <Button size="small" type="dashed" block class="filemap-add" @click="addRow">＋ 添加文件</Button>
  </div>
</template>

<style scoped>
.filemap {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.filemap-empty {
  margin: 0;
  font-size: 12px;
  color: #98a2b3;
}

.filemap-row {
  padding: 8px;
  border: 1px solid #e7edf4;
  border-radius: 6px;
  background: #fbfcfe;
}

.filemap-row.deleted {
  background: #fff7f5;
  border-color: #f3ded8;
}

.filemap-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.filemap-path {
  flex: 1;
  font-family: 'Cascadia Code', Consolas, monospace;
  font-size: 12px;
}

.filemap-staged,
.filemap-del {
  flex: none;
  font-size: 12px;
  color: #4c5d70;
}

.filemap-remove {
  flex: none;
}

.filemap-content {
  margin-top: 6px;
  font-family: 'Cascadia Code', Consolas, monospace;
  font-size: 12px;
}

.filemap-add {
  color: #7c8aa0;
}
</style>
