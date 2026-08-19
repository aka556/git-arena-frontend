<script setup lang="ts">
/**
 * 模板选择弹窗：新建关卡从完整、互洽的蓝图起步（目标图即卡片预览），
 * 而不是面对空表单——这是"上手门槛"的第一道消解。
 */
import { Modal } from 'ant-design-vue'
import GitGraphView from '@/components/graph/GitGraphView.vue'
import { specToGraph } from '@/composables/useSpecGraph'
import { LEVEL_TEMPLATES, type LevelTemplate } from './levelTemplates'

const props = defineProps<{ open: boolean }>()

const emit = defineEmits<{
  'update:open': [open: boolean]
  pick: [template: LevelTemplate]
}>()

function pick(template: LevelTemplate): void {
  emit('pick', template)
  emit('update:open', false)
}
</script>

<template>
  <Modal
    :open="props.open"
    title="从模板开始创作"
    :footer="null"
    :width="880"
    @cancel="emit('update:open', false)"
  >
    <p class="tpl-lead">选一个起步蓝图——初始图、目标图、参考解已互洽，改成你的关卡即可发布。</p>
    <div class="tpl-grid">
      <button
        v-for="tpl in LEVEL_TEMPLATES"
        :key="tpl.id"
        type="button"
        class="tpl-card"
        @click="pick(tpl)"
      >
        <div class="tpl-preview">
          <GitGraphView :graph="specToGraph(tpl.level.goal.graph)" :fit="true" />
          <span class="tpl-preview-tag">目标图</span>
        </div>
        <div class="tpl-info">
          <strong>{{ tpl.name }}</strong>
          <p>{{ tpl.tagline }}</p>
          <div class="tpl-teaches">
            <span v-for="t in tpl.teaches" :key="t">{{ t }}</span>
          </div>
        </div>
      </button>
    </div>
  </Modal>
</template>

<style scoped>
.tpl-lead {
  margin: 0 0 14px;
  font-size: 13px;
  color: #6b7c90;
}

.tpl-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 12px;
}

.tpl-card {
  display: flex;
  flex-direction: column;
  padding: 0;
  overflow: hidden;
  border: 1px solid #e3e9f0;
  border-radius: 10px;
  background: #fff;
  text-align: left;
  cursor: pointer;
  transition: transform 150ms ease, box-shadow 150ms ease, border-color 150ms ease;
}

.tpl-card:hover {
  transform: translateY(-3px);
  border-color: #9db9e8;
  box-shadow: 0 12px 26px rgba(32, 54, 74, 0.12);
}

.tpl-preview {
  position: relative;
  height: 132px;
  border-bottom: 1px solid #eef2f7;
  background:
    radial-gradient(#e0e9f3 1px, transparent 1px) 0 0 / 14px 14px,
    #fbfdff;
}

.tpl-preview :deep(.graph-view) {
  background: transparent;
}

.tpl-preview-tag {
  position: absolute;
  top: 6px;
  right: 6px;
  padding: 1px 7px;
  border-radius: 4px;
  background: #49a97c;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
}

.tpl-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px 12px;
}

.tpl-info strong {
  font-size: 14px;
  color: #1b2a3a;
}

.tpl-info p {
  margin: 0;
  font-size: 12px;
  line-height: 1.55;
  color: #6b7c90;
}

.tpl-teaches {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
  margin-top: 3px;
}

.tpl-teaches span {
  padding: 1px 7px;
  border-radius: 999px;
  background: #eef2f7;
  color: #64748b;
  font-size: 10.5px;
}
</style>
