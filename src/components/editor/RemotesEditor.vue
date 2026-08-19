<script setup lang="ts">
/**
 * 远程仓库编辑器（level-spec §3.1 remotes）：教 fetch/pull/push 类关卡的可视化配置。
 *
 * <p>initial 侧多一个 tracked 视角（"origin 真实指向 vs 本地已知"是远程教学的核心差异），
 * goal 侧只声明期望的远程指向。上限 2 个远程（origin + upstream 的 fork 工作流）。
 */
import { Button, Input, Select, Tooltip } from 'ant-design-vue'
import type { SpecRemote, SpecRemoteBranch } from '@/types/levelDraft'
import { commitSeqs, type GraphSpec } from './specModel'

const props = defineProps<{
  spec: GraphSpec
  variant: 'initial' | 'goal'
}>()

const REMOTE_NAMES = ['origin', 'upstream']

function remotes(): SpecRemote[] {
  return props.spec.remotes ?? []
}

function seqOptions(): { value: string; label: string }[] {
  return commitSeqs(props.spec).map((seq) => ({ value: seq, label: seq }))
}

function nameOptions(current: string): { value: string; label: string }[] {
  const used = new Set(remotes().map((r) => r.name))
  return REMOTE_NAMES
    .filter((n) => n === current || !used.has(n))
    .map((n) => ({ value: n, label: n }))
}

/** 新行的默认指向：最新提交（多数远程教学从"远程已有历史"出发）。 */
function latestSeq(): string {
  const seqs = commitSeqs(props.spec)
  return seqs.length ? seqs[seqs.length - 1]! : ''
}

function addRemote(): void {
  const used = new Set(remotes().map((r) => r.name))
  const name = REMOTE_NAMES.find((n) => !used.has(n))
  if (!name) return
  props.spec.remotes = [...remotes(), { name, branches: [{ name: 'main', target: latestSeq() }] }]
}

function removeRemote(remote: SpecRemote): void {
  props.spec.remotes = remotes().filter((r) => r !== remote)
}

function addBranchRow(remote: SpecRemote): void {
  remote.branches.push({ name: '', target: latestSeq() })
}

function removeBranchRow(remote: SpecRemote, row: SpecRemoteBranch): void {
  remote.branches = remote.branches.filter((b) => b !== row)
}

/** tracked 三态编码：'__sync'（缺省=已 fetch）/ seq / 'none'（本地未知）。 */
function trackedValue(row: SpecRemoteBranch): string {
  if (row.tracked === undefined || row.tracked === null) return '__sync'
  return row.tracked
}

function setTracked(row: SpecRemoteBranch, value: unknown): void {
  if (value === '__sync') delete row.tracked
  else row.tracked = String(value)
}

function trackedOptions(): { value: string; label: string }[] {
  return [
    { value: '__sync', label: '已同步（=远程指向）' },
    ...commitSeqs(props.spec).map((seq) => ({ value: seq, label: `本地停在 ${seq}` })),
    { value: 'none', label: '本地未知（未 fetch）' },
  ]
}
</script>

<template>
  <div class="remotes">
    <div v-for="remote in remotes()" :key="remote.name" class="remote-card">
      <div class="remote-head">
        <span class="remote-icon">☁</span>
        <Select
          :value="remote.name"
          class="remote-name"
          size="small"
          :options="nameOptions(remote.name)"
          @change="remote.name = String($event)"
        />
        <span class="remote-hint">远程仓库</span>
        <Button type="text" size="small" danger @click="removeRemote(remote)">移除</Button>
      </div>

      <div v-for="(row, i) in remote.branches" :key="i" class="remote-branch">
        <Input v-model:value="row.name" size="small" class="rb-name" placeholder="分支名" spellcheck="false" />
        <span class="rb-arrow">→</span>
        <Tooltip :title="`${remote.name} 上该分支的真实指向`">
          <Select
            v-model:value="row.target"
            size="small"
            class="rb-target"
            placeholder="远程指向"
            :options="seqOptions()"
          />
        </Tooltip>
        <Tooltip v-if="props.variant === 'initial'" title="本地 remote-tracking（origin/xx）看到的位置——教 fetch/pull 时让它落后于远程">
          <Select
            :value="trackedValue(row)"
            size="small"
            class="rb-tracked"
            :options="trackedOptions()"
            @change="setTracked(row, $event)"
          />
        </Tooltip>
        <Button type="text" size="small" danger @click="removeBranchRow(remote, row)">✕</Button>
      </div>

      <Button size="small" type="text" class="rb-add" @click="addBranchRow(remote)">＋ 远程分支</Button>
    </div>

    <Button
      v-if="remotes().length < 2"
      size="small"
      type="dashed"
      block
      @click="addRemote"
    >
      ＋ {{ remotes().length === 0 ? '配置远程仓库（教 fetch / pull / push 时用）' : '再加一个远程（fork 工作流）' }}
    </Button>
  </div>
</template>

<style scoped>
.remotes {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.remote-card {
  padding: 10px;
  border: 1px solid #f0e3d4;
  border-radius: 8px;
  background: #fffaf4;
}

.remote-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.remote-icon {
  color: #b55320;
}

.remote-name {
  width: 120px;
  font-family: 'Cascadia Code', Consolas, monospace;
}

.remote-hint {
  flex: 1;
  font-size: 11px;
  color: #b58a5f;
}

.remote-branch {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.rb-name {
  width: 110px;
  font-family: 'Cascadia Code', Consolas, monospace;
  font-size: 12px;
}

.rb-arrow {
  color: #c4a582;
  font-size: 12px;
}

.rb-target {
  width: 110px;
}

.rb-tracked {
  flex: 1;
  min-width: 150px;
}

.rb-add {
  color: #b58a5f;
}
</style>
