<script setup lang="ts">
/**
 * 断言编辑器（level-spec §5.4）：精确图匹配表达不了的目标走断言——
 * 文件内容、分支已推送、PR 已合并。类型与参数做成表单，未实现的类型不出现在选项里（fail-closed 同源）。
 */
import { Button, Input, InputNumber, Select, Tooltip } from 'ant-design-vue'
import type { GoalSpec, SpecAssertion } from '@/types/levelDraft'

const props = defineProps<{
  goal: GoalSpec
  /** 关卡模式：prMerged 仅 collab 关卡可用（导入时校验），这里先在 UI 上说清楚。 */
  mode: string
}>()

interface AssertionMeta {
  type: string
  label: string
  hint: string
  params: ('name' | 'path' | 'pattern' | 'remote' | 'number')[]
}

const TYPES: AssertionMeta[] = [
  { type: 'branchExists', label: '分支存在', hint: '只要求分支存在，不关心指向（配合宽松匹配的开放式关卡）', params: ['name'] },
  { type: 'fileAtHeadContains', label: '文件包含内容', hint: 'HEAD 树中该文件内容匹配正则', params: ['path', 'pattern'] },
  { type: 'fileAtHeadNotContains', label: '文件不含内容', hint: '冲突关卡验「无 <<<<<<< 残留」的标准手段', params: ['path', 'pattern'] },
  { type: 'branchPushed', label: '分支已推送', hint: '远程同名分支存在且与本地同指向（initial 需配置 remotes）', params: ['name', 'remote'] },
  { type: 'prMerged', label: 'PR 已合并', hint: '仅协作关卡可用：房间内该 PR（留空=任意）已合并', params: ['number'] },
]

function metaOf(assertion: SpecAssertion): AssertionMeta {
  return TYPES.find((t) => t.type === assertion.type) ?? TYPES[0]!
}

function assertions(): SpecAssertion[] {
  return props.goal.assertions ?? []
}

function typeOptions(): { value: string; label: string; disabled?: boolean }[] {
  return TYPES.map((t) => ({
    value: t.type,
    label: t.label,
    disabled: t.type === 'prMerged' && props.mode !== 'collab',
  }))
}

function add(): void {
  props.goal.assertions = [...assertions(), { type: 'branchExists', name: '' }]
}

function remove(assertion: SpecAssertion): void {
  props.goal.assertions = assertions().filter((a) => a !== assertion)
}

/** 换类型时清掉旧参数，避免把 path/pattern 残留进 branchExists 这类断言。 */
function changeType(assertion: SpecAssertion, type: unknown): void {
  assertion.type = String(type)
  assertion.name = null
  assertion.path = null
  assertion.pattern = null
  assertion.remote = null
  assertion.number = null
}

function has(assertion: SpecAssertion, param: AssertionMeta['params'][number]): boolean {
  return metaOf(assertion).params.includes(param)
}
</script>

<template>
  <div class="assertions">
    <div v-for="(assertion, i) in assertions()" :key="i" class="assertion-row">
      <Select
        :value="assertion.type"
        size="small"
        class="assertion-type"
        :options="typeOptions()"
        @change="changeType(assertion, $event)"
      />
      <Input
        v-if="has(assertion, 'name')"
        :value="assertion.name ?? ''"
        size="small"
        class="assertion-input"
        placeholder="分支名"
        spellcheck="false"
        @update:value="assertion.name = $event"
      />
      <Input
        v-if="has(assertion, 'path')"
        :value="assertion.path ?? ''"
        size="small"
        class="assertion-input"
        placeholder="文件路径"
        spellcheck="false"
        @update:value="assertion.path = $event"
      />
      <Input
        v-if="has(assertion, 'pattern')"
        :value="assertion.pattern ?? ''"
        size="small"
        class="assertion-input mono"
        placeholder="正则，如 <<<<<<<"
        spellcheck="false"
        @update:value="assertion.pattern = $event"
      />
      <Input
        v-if="has(assertion, 'remote')"
        :value="assertion.remote ?? ''"
        size="small"
        class="assertion-remote"
        placeholder="origin"
        spellcheck="false"
        @update:value="assertion.remote = $event || null"
      />
      <InputNumber
        v-if="has(assertion, 'number')"
        :value="assertion.number ?? undefined"
        size="small"
        class="assertion-number"
        placeholder="PR 号"
        :min="1"
        @update:value="assertion.number = typeof $event === 'number' ? $event : null"
      />
      <Tooltip :title="metaOf(assertion).hint">
        <span class="assertion-help">?</span>
      </Tooltip>
      <Button type="text" size="small" danger @click="remove(assertion)">✕</Button>
    </div>

    <Button size="small" type="dashed" block @click="add">＋ 添加断言（校验图看不出来的目标）</Button>
  </div>
</template>

<style scoped>
.assertions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.assertion-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.assertion-type {
  flex: none;
  width: 132px;
}

.assertion-input {
  flex: 1;
  min-width: 90px;
}

.assertion-input.mono {
  font-family: 'Cascadia Code', Consolas, monospace;
  font-size: 12px;
}

.assertion-remote {
  flex: none;
  width: 90px;
  font-family: 'Cascadia Code', Consolas, monospace;
  font-size: 12px;
}

.assertion-number {
  flex: none;
  width: 90px;
}

.assertion-help {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 17px;
  height: 17px;
  border-radius: 50%;
  background: #eef2f7;
  color: #7c8aa0;
  font-size: 11px;
  cursor: help;
}
</style>
