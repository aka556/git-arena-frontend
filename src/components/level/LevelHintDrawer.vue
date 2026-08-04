<script setup lang="ts">
/**
 * 关卡指引抽屉（antd 外壳区，§6.2）：关卡说明 + 分级提示。
 *
 * <p>提示<b>逐级揭示</b>（P2 提示系统的 M2 前端形态）：已看过的保持展开，下一条要主动点开——
 * 先自己想、卡住再看。揭示状态在 store（开始/重开关卡归零）。costPoints 仅作展示，
 * 扣分要等积分系统（P1 用户体系之后）上线。
 */
import { computed } from 'vue'
import { Button, Drawer, Empty, Tag } from 'ant-design-vue'
import { useSessionStore } from '@/stores/session'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const store = useSessionStore()

const hints = computed(() => store.levelDetail?.hints ?? [])
const revealed = computed(() => hints.value.slice(0, store.revealedHints))
const remaining = computed(() => hints.value.length - store.revealedHints)
const nextCost = computed(() => hints.value[store.revealedHints]?.costPoints ?? 0)
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
      <div class="hint-section-title">目标</div>
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

        <Button v-if="remaining > 0" block class="hint-reveal" @click="store.revealNextHint()">
          查看下一条提示
          <span v-if="nextCost > 0" class="hint-cost">（将来消耗 {{ nextCost }} 积分）</span>
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
.hint-cost {
  font-size: 12px;
  color: #98a2b3;
}
.hint-done {
  font-size: 12px;
  color: #98a2b3;
  text-align: center;
  margin: 8px 0 0;
}
</style>
