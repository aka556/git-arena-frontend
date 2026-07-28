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
