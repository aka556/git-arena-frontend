<script setup lang="ts">
/**
 * 关卡指引抽屉（antd 外壳区，§6.2）：关卡说明 + 分级提示。
 *
 * <p>提示逐级使用：后端写 user_hint_usage 记录使用，同一提示只计一次；使用提示不扣分。
 */
import { computed, ref } from 'vue'
import { Button, Drawer, Empty, Tag, message } from 'ant-design-vue'
import { useSessionStore } from '@/stores/session'
import { useAuthStore } from '@/stores/auth'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const store = useSessionStore()
const auth = useAuthStore()
const revealing = ref(false)

const hints = computed(() => store.levelDetail?.hints ?? [])
const revealed = computed(() => hints.value.slice(0, store.revealedHints))
const remaining = computed(() => hints.value.length - store.revealedHints)

async function onReveal(): Promise<void> {
  if (!auth.isAuthenticated) {
    message.warning('请先登录后使用提示')
    return
  }
  revealing.value = true
  try {
    await store.revealNextHint()
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error))
  } finally {
    revealing.value = false
  }
}
</script>

<template>
  <Drawer
    :open="props.open"
    title="关卡指引"
    placement="right"
    :width="380"
    @close="emit('update:open', false)"
  >
    <template v-if="store.levelDetail">
      <div class="hint-section-title">
        目标
        <span class="status-tag" :class="store.levelDetail.status">
          {{ store.levelDetail.status === 'completed' ? '已通关' : store.levelDetail.status === 'in_progress' ? '进行中' : store.levelDetail.status === 'locked' ? '锁定' : '未开始' }}
        </span>
        <span v-if="store.levelDetail.attempts > 0" class="attempts">
          尝试 {{ store.levelDetail.attempts }} 次
        </span>
      </div>
      <p class="level-desc">{{ store.levelDetail.description || '让「当前图」变成「目标图」。' }}</p>

      <div class="hint-section-title">
        提示
        <span class="hint-progress">{{ revealed.length }}/{{ hints.length }}</span>
      </div>

      <Empty v-if="hints.length === 0" description="本关没有提示，相信你自己" />

      <template v-else>
        <div v-for="hint in revealed" :key="hint.tier" class="hint-item">
          <Tag color="blue">第 {{ hint.tier }} 级</Tag>
          <span class="hint-body">{{ hint.body }}</span>
        </div>

        <Button v-if="remaining > 0" block class="hint-reveal" :loading="revealing" @click="onReveal">
          查看下一条提示
        </Button>
        <p v-else class="hint-done">提示已全部展示。</p>
      </template>
    </template>
    <Empty v-else description="先开始一个关卡" />
  </Drawer>
</template>

<style scoped>
.hint-section-title {
  font-size: 13px;
  font-weight: 600;
  color: #344054;
  margin: 12px 0 8px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.status-tag {
  font-size: 12px;
  padding: 2px 6px;
  border-radius: 999px;
  color: #fff;
}
.status-tag.completed {
  background: #27ae60;
}
.status-tag.in_progress {
  background: #f2994a;
}
.status-tag.locked {
  background: #9b51e0;
}
.status-tag.unlocked {
  background: #2f80ed;
}
.attempts {
  font-size: 12px;
  color: #98a2b3;
}
.hint-section-title:first-child {
  margin-top: 0;
}
.hint-progress {
  font-weight: 400;
  font-size: 12px;
  color: #98a2b3;
}
.level-desc {
  font-size: 13px;
  color: #475467;
  line-height: 1.7;
  margin: 0 0 4px;
  white-space: pre-wrap;
}
.hint-item {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 8px 10px;
  margin-bottom: 8px;
  background: #f8fafc;
  border: 1px solid #eef1f5;
  border-radius: 6px;
}
.hint-item :deep(.ant-tag) {
  flex-shrink: 0;
  margin-top: 1px;
}
.hint-body {
  font-size: 13px;
  color: #344054;
  line-height: 1.6;
}
.hint-reveal {
  margin-top: 4px;
}
.hint-done {
  font-size: 12px;
  color: #98a2b3;
  text-align: center;
  margin: 8px 0 0;
}
</style>
