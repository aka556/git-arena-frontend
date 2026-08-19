<script setup lang="ts">
/**
 * 参考解编辑器（level-spec §6）：命令步骤 + writeFile 步骤的有序列表。
 *
 * <p>参考解与玩家输入走同一条 CommandService 白名单链路（§3 黄金法则），
 * 这里只负责把"逐步怎么做"编排成表单——冲突类关卡靠 writeFile 步骤模拟玩家改文件。
 */
import { Button, Input, Segmented, Textarea } from 'ant-design-vue'
import type { SolutionSpec, SolutionStep } from '@/types/levelDraft'

const props = defineProps<{
  solution: SolutionSpec
  /** collab 关卡无法单进程重放（§5.5），参考解可留空。 */
  collab?: boolean
}>()

const STEP_KINDS = [
  { label: '命令', value: 'run' },
  { label: '写文件', value: 'write' },
]

function kindOf(step: SolutionStep): string {
  return step.writeFile ? 'write' : 'run'
}

function setKind(step: SolutionStep, kind: unknown): void {
  if (kind === 'write') {
    delete step.run
    step.writeFile = step.writeFile ?? { path: '', content: '' }
  } else {
    delete step.writeFile
    step.run = step.run ?? ''
  }
}

function addRun(): void {
  props.solution.steps.push({ run: '' })
}

function addWrite(): void {
  props.solution.steps.push({ writeFile: { path: '', content: '' } })
}

function remove(index: number): void {
  props.solution.steps.splice(index, 1)
}

function move(index: number, delta: number): void {
  const target = index + delta
  if (target < 0 || target >= props.solution.steps.length) return
  const steps = props.solution.steps
  ;[steps[index], steps[target]] = [steps[target]!, steps[index]!]
}
</script>

<template>
  <div class="solution">
    <p v-if="props.collab" class="solution-note collab">
      协作关卡的通关需要多人交互，无法单进程重放——参考解可留空，发布时只检查「零步不通关」。
    </p>
    <p v-else class="solution-note">
      发布前的自证会逐步重放这些步骤并要求最终通关——参考解、初始图、目标图因此互洽。
    </p>

    <div v-for="(step, i) in props.solution.steps" :key="i" class="step-row">
      <span class="step-index">{{ i + 1 }}</span>
      <Segmented
        :value="kindOf(step)"
        :options="STEP_KINDS"
        size="small"
        class="step-kind"
        @change="setKind(step, $event)"
      />
      <div class="step-body">
        <Input
          v-if="kindOf(step) === 'run'"
          :value="step.run ?? ''"
          size="small"
          class="step-cmd"
          placeholder='git 命令，如 git merge feature'
          spellcheck="false"
          @update:value="step.run = $event"
        />
        <template v-else>
          <Input
            :value="step.writeFile?.path ?? ''"
            size="small"
            class="step-path"
            placeholder="文件路径"
            spellcheck="false"
            @update:value="step.writeFile && (step.writeFile.path = $event)"
          />
          <Textarea
            :value="step.writeFile?.content ?? ''"
            size="small"
            class="step-content"
            :auto-size="{ minRows: 1, maxRows: 5 }"
            placeholder="写入的完整内容（模拟玩家编辑文件）"
            spellcheck="false"
            @update:value="step.writeFile && (step.writeFile.content = $event)"
          />
        </template>
      </div>
      <div class="step-ops">
        <Button size="small" type="text" :disabled="i === 0" @click="move(i, -1)">↑</Button>
        <Button size="small" type="text" :disabled="i === props.solution.steps.length - 1" @click="move(i, 1)">↓</Button>
        <Button size="small" type="text" danger @click="remove(i)">✕</Button>
      </div>
    </div>

    <div class="step-add">
      <Button size="small" type="dashed" @click="addRun">＋ 命令步骤</Button>
      <Button size="small" type="dashed" @click="addWrite">＋ 写文件步骤</Button>
    </div>

    <Textarea
      :value="props.solution.notes ?? ''"
      class="solution-notes"
      :rows="2"
      placeholder="解法说明（可选）：给看答案的玩家讲清楚思路"
      @update:value="props.solution.notes = $event || null"
    />
  </div>
</template>

<style scoped>
.solution {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.solution-note {
  margin: 0;
  padding: 7px 10px;
  border-radius: 6px;
  background: #f0f6ff;
  color: #47637f;
  font-size: 12px;
}

.solution-note.collab {
  background: #fdf4e7;
  color: #8a5a1e;
}

.step-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.step-index {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 22px;
  height: 22px;
  margin-top: 1px;
  border-radius: 50%;
  background: #eef2f7;
  color: #64748b;
  font-family: 'Cascadia Code', Consolas, monospace;
  font-size: 11px;
  font-weight: 700;
}

.step-kind {
  flex: none;
}

.step-body {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 6px;
}

.step-cmd,
.step-path,
.step-content {
  font-family: 'Cascadia Code', Consolas, monospace;
  font-size: 12px;
}

.step-ops {
  display: flex;
  flex: none;
  gap: 0;
}

.step-add {
  display: flex;
  gap: 8px;
}

.solution-notes {
  font-size: 12.5px;
}
</style>
