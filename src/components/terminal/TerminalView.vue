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
let currentCwd = '~'
let accepting = true // 命令执行期间暂停接收输入

const CLEAR_SEQUENCE = '\x1b[2J\x1b[H'
interface GraphemeSegmenter {
  segment(value: string): Iterable<{ segment: string }>
}
const Segmenter = (Intl as unknown as {
  Segmenter?: new (locale?: string, options?: { granularity: 'grapheme' }) => GraphemeSegmenter
}).Segmenter
const graphemeSegmenter = Segmenter
  ? new Segmenter(undefined, { granularity: 'grapheme' })
  : null

function prompt(): string {
  return `\x1b[36marena:${currentCwd || '~'}$\x1b[0m `
}

function writePrompt(): void {
  term?.write(prompt())
}

function clearLine(): void {
  if (!term) return
  // 抹掉当前输入行内容，回到 prompt 后
  term.write('\r\x1b[K')
  writePrompt()
}

function splitGraphemes(value: string): string[] {
  if (graphemeSegmenter) {
    return Array.from(graphemeSegmenter.segment(value), ({ segment }) => segment)
  }
  return Array.from(value)
}

/** xterm 单元格宽度：组合符为 0，CJK/全角/emoji 为 2，其余为 1。 */
function codePointCellWidth(codePoint: number): 0 | 1 | 2 {
  if (
    codePoint === 0
    || codePoint === 0x200d
    || (codePoint >= 0x0300 && codePoint <= 0x036f)
    || (codePoint >= 0x1ab0 && codePoint <= 0x1aff)
    || (codePoint >= 0x1dc0 && codePoint <= 0x1dff)
    || (codePoint >= 0x20d0 && codePoint <= 0x20ff)
    || (codePoint >= 0xfe00 && codePoint <= 0xfe0f)
    || (codePoint >= 0xfe20 && codePoint <= 0xfe2f)
    || (codePoint >= 0x1f3fb && codePoint <= 0x1f3ff)
    || (codePoint >= 0xe0100 && codePoint <= 0xe01ef)
  ) return 0

  if (
    codePoint >= 0x1100 && (
      codePoint <= 0x115f
      || codePoint === 0x2329
      || codePoint === 0x232a
      || (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f)
      || (codePoint >= 0xac00 && codePoint <= 0xd7a3)
      || (codePoint >= 0xf900 && codePoint <= 0xfaff)
      || (codePoint >= 0xfe10 && codePoint <= 0xfe19)
      || (codePoint >= 0xfe30 && codePoint <= 0xfe6f)
      || (codePoint >= 0xff00 && codePoint <= 0xff60)
      || (codePoint >= 0xffe0 && codePoint <= 0xffe6)
      || (codePoint >= 0x1f000 && codePoint <= 0x1faff)
      || (codePoint >= 0x20000 && codePoint <= 0x3fffd)
    )
  ) return 2

  return 1
}

function graphemeCellWidth(grapheme: string): number {
  // 一个字素（组合字符、ZWJ emoji、旗帜）最多占 2 列，取其中最宽码点即可。
  return Math.max(1, ...Array.from(grapheme, (char) => codePointCellWidth(char.codePointAt(0)!)))
}

function eraseLastGrapheme(): void {
  if (!term || current.length === 0) return
  const graphemes = splitGraphemes(current)
  const removed = graphemes.pop()
  if (!removed) return
  current = graphemes.join('')
  term.write('\b \b'.repeat(graphemeCellWidth(removed)))
}

function submitCurrent(): void {
  if (!term) return
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
}

function appendText(text: string): void {
  if (!term || !text) return
  current += text
  term.write(text)
}

function showPreviousHistory(): void {
  if (!term || history.length === 0) return
  historyIdx = Math.min(historyIdx + 1, history.length - 1)
  current = history[historyIdx] ?? ''
  clearLine()
  term.write(current)
}

function showNextHistory(): void {
  if (!term) return
  if (historyIdx > 0) {
    historyIdx -= 1
    current = history[historyIdx] ?? ''
  } else {
    historyIdx = -1
    current = ''
  }
  clearLine()
  term.write(current)
}

function abortCurrent(): void {
  if (!term) return
  term.write('^C\r\n')
  current = ''
  historyIdx = -1
  writePrompt()
}

/**
 * xterm 的 IME 可能把“已确认的中文 + 回车”放在同一次 onData 回调中。
 * 因此不能因数据里含控制字符就整段丢弃，必须按顺序消费可见文本与控制序列。
 */
function onData(data: string): void {
  if (!term || !accepting) return

  let index = 0
  while (index < data.length && accepting) {
    const rest = data.slice(index)

    if (rest.startsWith('\x1b[A')) {
      showPreviousHistory()
      index += 3
      continue
    }
    if (rest.startsWith('\x1b[B')) {
      showNextHistory()
      index += 3
      continue
    }

    const codePoint = data.codePointAt(index)!
    const char = String.fromCodePoint(codePoint)

    if (char === '\r' || char === '\n') {
      submitCurrent()
      index += char.length
      continue
    }

    if (char === '\x7f' || char === '\b') {
      eraseLastGrapheme()
      index += char.length
      continue
    }

    if (char === '\x03') {
      abortCurrent()
      index += char.length
      continue
    }

    if (char === '\x1b') {
      // 当前行编辑尚不支持左右移动等序列；完整吞掉，避免残片被当作可见输入。
      const sequence = rest.match(/^\x1b(?:\[[0-9;?]*[ -/]*[@-~]|.)/)?.[0]
      index += sequence?.length ?? char.length
      continue
    }

    if (codePoint < 0x20) {
      index += char.length
      continue
    }

    let end = index + char.length
    while (end < data.length) {
      const next = data.codePointAt(end)!
      if (next < 0x20 || next === 0x7f) break
      end += String.fromCodePoint(next).length
    }
    appendText(data.slice(index, end))
    index = end
  }
}

/** 写回命令结果并给出新提示符（由上层在 store.exec 完成后调用）。 */
function normalizeOutput(text: string): string {
  return text.replace(/\r?\n/g, '\r\n')
}

function writeOutput(text: string): void {
  if (!term || !text) return
  const normalized = normalizeOutput(text)
  term.write(normalized)
  if (!normalized.endsWith('\r\n')) term.write('\r\n')
}

function writeStderr(text: string): void {
  if (!term || !text) return
  const normalized = normalizeOutput(text)
  term.write('\x1b[31m' + normalized + '\x1b[0m')
  if (!normalized.endsWith('\r\n')) term.write('\r\n')
}

function writeResult(res: CommandResponse): void {
  if (!term) return
  currentCwd = res.cwd || currentCwd
  if (res.stdout === CLEAR_SEQUENCE) {
    term.clear()
    term.write(CLEAR_SEQUENCE)
  } else {
    writeOutput(res.stdout)
  }
  writeStderr(res.stderr)
  accepting = true
  writePrompt()
}

/** 写回错误（网络/异常）并恢复输入。 */
function writeError(message: string): void {
  if (!term) return
  writeStderr(`错误：${message || '命令执行失败'}`)
  accepting = true
  writePrompt()
}

function writeSystem(message: string): void {
  term?.write('\x1b[90m' + message.replace(/\n/g, '\r\n') + '\x1b[0m\r\n')
}

function fallbackCopy(text: string): void {
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  textarea.remove()
}

async function copySelection(): Promise<void> {
  const selected = term?.getSelection() ?? ''
  if (!selected) return
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable')
    await navigator.clipboard.writeText(selected)
  } catch {
    fallbackCopy(selected)
  }
}

async function pasteFromClipboard(): Promise<void> {
  if (!term || !navigator.clipboard?.readText) return
  try {
    const text = await navigator.clipboard.readText()
    if (text) term.paste(text)
  } catch {
    // Clipboard permission may be unavailable; keep the terminal input unchanged.
  }
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
  currentCwd = '~'
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
  term.attachCustomKeyEventHandler((event) => {
    if (event.type !== 'keydown' || (!event.ctrlKey && !event.metaKey)) return true

    const key = event.key.toLowerCase()
    if (key === 'c' && term?.hasSelection()) {
      event.preventDefault()
      event.stopPropagation()
      void copySelection()
      return false
    }

    if (key === 'v') {
      event.preventDefault()
      event.stopPropagation()
      void pasteFromClipboard()
      return false
    }

    return true
  })
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
