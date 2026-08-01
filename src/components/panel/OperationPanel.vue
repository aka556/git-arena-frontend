<script setup lang="ts">
/**
 * 图形化操作面板（CLAUDE.md §6.1 panel）。属"应用外壳"，用 Ant Design Vue 组件（§6.2）。
 *
 * <p><b>黄金法则（§3）</b>：每个按钮不直接改状态，而是产出与命令行<b>等价的命令字符串</b>，
 * emit('run', cmd) 交上层走与终端相同的执行链路。仓库重置属生命周期操作，单独 emit('reset')。
 */
import { ref } from 'vue'
import { Button, Input, Space, message } from 'ant-design-vue'

const props = defineProps<{ disabled?: boolean }>()
const emit = defineEmits<{ run: [command: string]; reset: [] }>()

const fileName = ref('')
const commitMessage = ref('')
const branchName = ref('')
const tagName = ref('')

function run(cmd: string): void {
  emit('run', cmd)
}

function touchFile(): void {
  const name = fileName.value.trim()
  if (!name) {
    message.warning('请输入文件名')
    return
  }
  run(`touch ${name}`)
  fileName.value = ''
}

function commit(): void {
  const msg = commitMessage.value.trim()
  if (!msg) {
    message.warning('请输入提交信息')
    return
  }
  // 用双引号包裹，解析层按引号切分（与终端等价）
  run(`git commit -m "${msg}"`)
  commitMessage.value = ''
}

/** 分支名校验：非空且不含空白（分支名不允许空格）。 */
function validBranch(): string | null {
  const name = branchName.value.trim()
  if (!name) {
    message.warning('请输入分支名')
    return null
  }
  if (/\s/.test(name)) {
    message.warning('分支名不能含空格')
    return null
  }
  return name
}

function createBranch(): void {
  const name = validBranch()
  if (name) run(`git branch ${name}`)
}

function createAndSwitch(): void {
  const name = validBranch()
  if (name) run(`git checkout -b ${name}`)
}

function switchTo(): void {
  const name = validBranch()
  if (name) run(`git switch ${name}`)
}

function mergeInto(): void {
  const name = validBranch()
  if (name) run(`git merge ${name}`)
}

/** 变基到 branchName 指定的上游分支。 */
function rebaseOnto(): void {
  const name = validBranch()
  if (name) run(`git rebase ${name}`)
}

/** 修正上一次提交：填了信息则改信息，否则沿用原信息。 */
function amend(): void {
  const msg = commitMessage.value.trim()
  run(msg ? `git commit --amend -m "${msg}"` : 'git commit --amend')
  commitMessage.value = ''
}

function createTag(): void {
  const name = tagName.value.trim()
  if (!name) {
    message.warning('请输入标签名')
    return
  }
  if (/\s/.test(name)) {
    message.warning('标签名不能含空格')
    return
  }
  run(`git tag ${name}`)
  tagName.value = ''
}
</script>

<template>
  <div class="panel">
    <div class="panel-section">
      <div class="panel-title">仓库</div>
      <Space wrap>
        <Button size="small" :disabled="props.disabled" @click="run('git init')">git init</Button>
        <Button size="small" :disabled="props.disabled" @click="emit('reset')">重置沙盒</Button>
      </Space>
    </div>

    <div class="panel-section">
      <div class="panel-title">文件</div>
      <Space.Compact>
        <Input
          v-model:value="fileName"
          size="small"
          placeholder="文件名，如 a.txt"
          :disabled="props.disabled"
          @press-enter="touchFile"
        />
        <Button size="small" :disabled="props.disabled" @click="touchFile">touch</Button>
      </Space.Compact>
    </div>

    <div class="panel-section">
      <div class="panel-title">暂存 / 提交</div>
      <Space wrap>
        <Button size="small" :disabled="props.disabled" @click="run('git add .')">git add .</Button>
      </Space>
      <Space.Compact class="panel-commit">
        <Input
          v-model:value="commitMessage"
          size="small"
          placeholder="提交信息"
          :disabled="props.disabled"
          @press-enter="commit"
        />
        <Button type="primary" size="small" :disabled="props.disabled" @click="commit">commit</Button>
        <Button size="small" :disabled="props.disabled" @click="amend">amend</Button>
      </Space.Compact>
    </div>

    <div class="panel-section">
      <div class="panel-title">分支 / 合并</div>
      <Space.Compact>
        <Input
          v-model:value="branchName"
          size="small"
          placeholder="分支名，如 feature"
          :disabled="props.disabled"
          @press-enter="createAndSwitch"
        />
        <Button size="small" :disabled="props.disabled" @click="createAndSwitch">新建并切换</Button>
      </Space.Compact>
      <Space wrap>
        <Button size="small" :disabled="props.disabled" @click="createBranch">branch</Button>
        <Button size="small" :disabled="props.disabled" @click="switchTo">switch</Button>
        <Button size="small" :disabled="props.disabled" @click="mergeInto">merge</Button>
        <Button size="small" :disabled="props.disabled" @click="rebaseOnto">rebase</Button>
        <Button size="small" :disabled="props.disabled" @click="run('git branch')">分支列表</Button>
      </Space>
    </div>

    <div class="panel-section">
      <div class="panel-title">标签</div>
      <Space.Compact>
        <Input
          v-model:value="tagName"
          size="small"
          placeholder="标签名，如 v1.0"
          :disabled="props.disabled"
          @press-enter="createTag"
        />
        <Button size="small" :disabled="props.disabled" @click="createTag">tag</Button>
      </Space.Compact>
    </div>

    <div class="panel-section">
      <div class="panel-title">查看</div>
      <Space wrap>
        <Button size="small" :disabled="props.disabled" @click="run('git status')">git status</Button>
        <Button size="small" :disabled="props.disabled" @click="run('git log')">git log</Button>
      </Space>
    </div>
  </div>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 12px;
}
.panel-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.panel-title {
  font-size: 12px;
  font-weight: 600;
  color: #667085;
}
.panel-commit {
  margin-top: 6px;
}
</style>
