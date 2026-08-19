<script setup lang="ts">
/**
 * 分级提示编辑器：数组序即揭示顺序（tier 与 level_hints.order_index 同源）。
 * 建议由浅入深——先指方向、再给命令；使用提示不扣分（2026-08-10 起）。
 */
import { Button, Textarea } from 'ant-design-vue'
import type { SpecHint } from '@/types/levelDraft'

const props = defineProps<{
  hints: SpecHint[]
}>()

function add(): void {
  props.hints.push({ tier: props.hints.length + 1, body: '' })
}

function remove(index: number): void {
  props.hints.splice(index, 1)
  resequence()
}

function move(index: number, delta: number): void {
  const target = index + delta
  if (target < 0 || target >= props.hints.length) return
  ;[props.hints[index], props.hints[target]] = [props.hints[target]!, props.hints[index]!]
  resequence()
}

function resequence(): void {
  props.hints.forEach((hint, i) => { hint.tier = i + 1 })
}
</script>

<template>
  <div class="hints">
    <p v-if="props.hints.length === 0" class="hints-empty">
      还没有提示。好的提示由浅入深：第 1 级指方向，最后一级几乎给出命令。
    </p>

    <div v-for="(hint, i) in props.hints" :key="i" class="hint-row">
      <span class="hint-tier">第 {{ i + 1 }} 级</span>
      <Textarea
        v-model:value="hint.body"
        class="hint-body"
        :auto-size="{ minRows: 1, maxRows: 4 }"
        placeholder="提示内容"
      />
      <div class="hint-ops">
        <Button size="small" type="text" :disabled="i === 0" @click="move(i, -1)">↑</Button>
        <Button size="small" type="text" :disabled="i === props.hints.length - 1" @click="move(i, 1)">↓</Button>
        <Button size="small" type="text" danger @click="remove(i)">✕</Button>
      </div>
    </div>

    <Button size="small" type="dashed" block @click="add">＋ 添加提示</Button>
  </div>
</template>

<style scoped>
.hints {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.hints-empty {
  margin: 0;
  font-size: 12px;
  color: #98a2b3;
}

.hint-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.hint-tier {
  flex: none;
  margin-top: 5px;
  padding: 1px 8px;
  border-radius: 999px;
  background: #e8f0fe;
  color: #2b62b8;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}

.hint-body {
  flex: 1;
  font-size: 12.5px;
}

.hint-ops {
  display: flex;
  flex: none;
}
</style>
