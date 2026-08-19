<script setup lang="ts">
/**
 * 通关匹配策略（level-spec §5.2）：六个开关配教学化文案，默认值与后端一致。
 *
 * <p>开启 compareWorkingDir 时补充三态路径集合的录入（goal.graph.workingDir，§5.1）。
 */
import { computed } from 'vue'
import { Select, Switch } from 'ant-design-vue'
import type { GoalSpec, MatchPolicy } from '@/types/levelDraft'

const props = defineProps<{
  goal: GoalSpec
}>()

interface PolicyRow {
  key: keyof MatchPolicy
  label: string
  desc: string
  fallback: boolean
}

const ROWS: PolicyRow[] = [
  { key: 'compareHead', fallback: true, label: '校验 HEAD 指向', desc: '要求 HEAD 的类型与落点都一致（含是否游离）' },
  { key: 'compareWorkingDir', fallback: false, label: '校验工作区三态', desc: '比较 staged / modified / untracked 三个路径集合' },
  { key: 'ignoreMessages', fallback: true, label: '忽略提交信息', desc: '关闭后会逐个比对提交 message（会把关卡做得很死）' },
  { key: 'allowExtraCommits', fallback: false, label: '允许多余提交', desc: '玩家可以多提交几个，只要目标结构在其中' },
  { key: 'allowExtraBranches', fallback: false, label: '允许多余分支', desc: '目标之外的本地分支不算失败' },
  { key: 'allowExtraTags', fallback: false, label: '允许多余标签', desc: '目标之外的标签不算失败' },
]

function policyValue(row: PolicyRow): boolean {
  const match = props.goal.match
  const value = match?.[row.key]
  return value == null ? row.fallback : value
}

function setPolicy(row: PolicyRow, value: boolean): void {
  props.goal.match = props.goal.match ?? {}
  // 与默认值相同就还原为缺省，保存出的 spec 只保留作者的显式选择
  if (value === row.fallback) delete props.goal.match[row.key]
  else props.goal.match[row.key] = value
}

const compareWorkingDir = computed(() => policyValue(ROWS[1]!))

function wdSet(key: 'staged' | 'modified' | 'untracked'): string[] {
  return props.goal.graph.workingDir?.[key] ?? []
}

function setWdSet(key: 'staged' | 'modified' | 'untracked', value: unknown): void {
  const paths = Array.isArray(value) ? value.map(String) : []
  const wd = props.goal.graph.workingDir ?? {}
  wd[key] = paths
  props.goal.graph.workingDir = wd
}

const WD_KEYS = [
  { key: 'staged' as const, label: 'staged（已暂存）' },
  { key: 'modified' as const, label: 'modified（已修改）' },
  { key: 'untracked' as const, label: 'untracked（未追踪）' },
]
</script>

<template>
  <div class="policy">
    <div v-for="row in ROWS" :key="row.key" class="policy-row">
      <Switch size="small" :checked="policyValue(row)" @change="setPolicy(row, Boolean($event))" />
      <div class="policy-text">
        <span class="policy-label">
          {{ row.label }}
          <i v-if="policyValue(row) === row.fallback" class="policy-default">默认</i>
        </span>
        <span class="policy-desc">{{ row.desc }}</span>
      </div>
    </div>

    <div v-if="compareWorkingDir" class="policy-wd">
      <p class="policy-wd-tip">三个集合都留空 = 要求工作区干净（最常用：逼玩家把改动提交掉）。</p>
      <div v-for="entry in WD_KEYS" :key="entry.key" class="policy-wd-row">
        <span class="policy-wd-label">{{ entry.label }}</span>
        <Select
          :value="wdSet(entry.key)"
          mode="tags"
          size="small"
          class="policy-wd-input"
          placeholder="输入路径回车添加"
          :open="false"
          @change="setWdSet(entry.key, $event)"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.policy {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.policy-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.policy-text {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
}

.policy-label {
  font-size: 13px;
  font-weight: 600;
  color: #334155;
}

.policy-default {
  margin-left: 6px;
  font-style: normal;
  font-size: 10px;
  color: #98a2b3;
}

.policy-desc {
  font-size: 12px;
  color: #8a97a6;
}

.policy-wd {
  padding: 10px;
  border: 1px dashed #cfdae6;
  border-radius: 8px;
  background: #f8fafd;
}

.policy-wd-tip {
  margin: 0 0 8px;
  font-size: 12px;
  color: #6b7c90;
}

.policy-wd-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.policy-wd-label {
  flex: none;
  width: 150px;
  font-family: 'Cascadia Code', Consolas, monospace;
  font-size: 11px;
  color: #4c5d70;
}

.policy-wd-input {
  flex: 1;
}
</style>
