<script setup lang="ts">
/**
 * xterm 终端（CLAUDE.md §6.1 terminal）。承载真实命令输入观感：行编辑、历史、回显。
 *
 * <p>本组件只管"终端视图与输入"。命令不在此执行——回车后 emit('submit', line)，由上层经 store 走
 * 统一命令链路（§3 黄金法则），再调用暴露的 writeResult/writeError 把输出写回终端。
 */
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import type { CommandResponse } from '@/types/gitGraph'

const emit = defineEmits<{ submit: [command: string] }>()

const container = ref<HTMLDivElement | null>(null)
let term: Terminal | null = null
let fit: FitAddon | null = null
let resizeObserver: ResizeObserver | null = null

let current = ''
const history: string[] = []
let historyIdx = -1
let accepting = true // 命令执行期间暂停接收输入

const PROMPT = '\x1b[36marena$\x1b[0m '

function writePrompt(): void {
  term?.write(PROMPT)
}

function clearLine(): void {
  if (!term) return
  // 抹掉当前输入行内容，回到 prompt 后
  term.write('\r\x1b[K')
  writePrompt()
}

function onData(data: string): void {
  if (!term || !accepting) return

  if (data === '\r') {
    term.write('\r\n')
    const line = current.trim()
    current = ''
    historyIdx = -1
    if (line.length === 0) {
      writePrompt()
      return
    }
    history.unshift(line)
    accepting = false // 等 writeResult/writeError 回来再放行
    emit('submit', line)
    return
  }

  if (data === '\x7f' || data === '\b') {
    // Backspace / DEL
    if (current.length > 0) {
      current = current.slice(0, -1)
      term.write('\b \b')
    }
    return
  }

  if (data === '\x03') {
    // Ctrl+C：放弃当前行
    term.write('^C\r\n')
    current = ''
    writePrompt()
    return
  }

  if (data === '\x1b[A') {
    // ↑ 历史
    if (history.length > 0) {
      historyIdx = Math.min(historyIdx + 1, history.length - 1)
      current = history[historyIdx] ?? ''
      clearLine()
      term.write(current)
    }
    return
  }
  if (data === '\x1b[B') {
    // ↓ 历史
    if (historyIdx > 0) {
      historyIdx -= 1
      current = history[historyIdx] ?? ''
    } else {
      historyIdx = -1
      current = ''
    }
    clearLine()
    term.write(current)
    return
  }

  // 过滤其它控制序列，仅接收可见字符
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f]/.test(data)) return
  current += data
  term.write(data)
}

/** 写回命令结果并给出新提示符（由上层在 store.exec 完成后调用）。 */
function writeResult(res: CommandResponse): void {
  if (!term) return
  if (res.stdout) term.write(res.stdout.replace(/\n/g, '\r\n') + '\r\n')
  if (res.stderr) term.write('\x1b[31m' + res.stderr.replace(/\n/g, '\r\n') + '\x1b[0m\r\n')
  accepting = true
  writePrompt()
}

/** 写回错误（网络/异常）并恢复输入。 */
function writeError(message: string): void {
  if (!term) return
  term.write('\x1b[31m' + message.replace(/\n/g, '\r\n') + '\x1b[0m\r\n')
  accepting = true
  writePrompt()
}

function writeSystem(message: string): void {
  term?.write('\x1b[90m' + message.replace(/\n/g, '\r\n') + '\x1b[0m\r\n')
}

function focus(): void {
  term?.focus()
}

/** 首屏/新会话：打印欢迎行并给出首个提示符。 */
function boot(lines: string[]): void {
  if (!term) return
  lines.forEach((l) => writeSystem(l))
  accepting = true
  current = ''
  writePrompt()
}

/** 外部（图形面板）提交命令：在当前提示符后回显命令并暂停输入，等 writeResult 收尾。 */
function submitExternal(cmd: string): void {
  if (!term) return
  term.write(cmd + '\r\n')
  current = ''
  accepting = false
}

defineExpose({ writeResult, writeError, writeSystem, boot, submitExternal, focus })

onMounted(() => {
  if (!container.value) return
  term = new Terminal({
    convertEol: true,
    cursorBlink: true,
    fontSize: 13,
    fontFamily: 'Consolas, "Courier New", monospace',
    theme: { background: '#1e1e1e', foreground: '#e6e6e6' },
  })
  fit = new FitAddon()
  term.loadAddon(fit)
  term.open(container.value)
  fit.fit()
  term.onData(onData)

  resizeObserver = new ResizeObserver(() => fit?.fit())
  resizeObserver.observe(container.value)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  term?.dispose()
  term = null
})
</script>

<template>
  <div ref="container" class="terminal-host"></div>
</template>

<style scoped>
.terminal-host {
  width: 100%;
  height: 100%;
  background: #1e1e1e;
  padding: 6px;
  box-sizing: border-box;
}
</style>
