<script setup lang="ts">
/**
 * 成长中心：将已落库的积分、成就、排行榜能力呈现为可达的 M4 UI 闭环。
 *
 * <p>本组件只负责展示与交互；查询状态由 Pinia engagement store 管理，通用外壳使用 Ant Design Vue（AGENTS.md §6.2）。
 */
import { computed, watch } from 'vue'
import { Alert, Button, Card, Drawer, Empty, Progress, Segmented, Spin, Table, Tag, message } from 'ant-design-vue'
import { useAuthStore } from '@/stores/auth'
import { useEngagementStore } from '@/stores/engagement'
import type { AchievementView, LeaderboardEntry, LeaderboardPeriod } from '@/types/engagement'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const auth = useAuthStore()
const engagement = useEngagementStore()

const achievementIcons: Record<string, string> = {
  commit: '📝',
  level: '🏁',
  conflict: '🧩',
  merge: '🔀',
}

const periodTabs: { key: LeaderboardPeriod; tab: string }[] = [
  { key: 'all', tab: '总榜' },
  { key: 'weekly', tab: '本周' },
  { key: 'monthly', tab: '本月' },
]

const columns = computed(() => [
  { title: '排名', dataIndex: 'rank', width: 72 },
  { title: '玩家', key: 'player' },
  {
    title: engagement.board.metric === 'window' ? '本期得分' : '积分',
    dataIndex: 'points',
    width: 96,
    align: 'right' as const,
  },
])

const boardCaption = computed(() => engagement.board.metric === 'window'
  ? '只统计该时间窗内新增的积分，扣分同样计入；无得分的玩家不上榜。'
  : '按账号累计积分排序；同分玩家并列。')

/** 时段榜读物化视图，最多滞后一个刷新周期，需如实告知而不是假装实时。 */
const refreshedHint = computed(() => {
  const at = engagement.board.refreshedAt
  if (!at) {
    return ''
  }
  return `榜单数据截至 ${new Date(at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}，每 5 分钟更新一次`
})

const unlockedProgress = computed(() => {
  const total = engagement.achievements.length
  return total === 0 ? 0 : Math.round((engagement.unlockedCount / total) * 100)
})

function displayName(entry: LeaderboardEntry): string {
  return entry.displayName || entry.username || `玩家 #${entry.userId}`
}

function iconOf(achievement: AchievementView): string {
  return achievement.icon ? (achievementIcons[achievement.icon] ?? '🏅') : '🏅'
}

async function refresh(): Promise<void> {
  await engagement.load()
}

async function onPeriodChange(next: string | number): Promise<void> {
  try {
    await engagement.switchPeriod(next as LeaderboardPeriod)
  } catch (error) {
    message.error(error instanceof Error ? error.message : String(error))
  }
}

// 每次打开都刷新，确保刚通关、扣提示分或解锁成就后无需重载页面即可看到最新状态。
watch(() => props.open, (open) => {
  if (open) {
    void refresh()
  }
})
</script>

<template>
  <Drawer
    :open="props.open"
    title="成长中心"
    placement="right"
    :width="680"
    @close="emit('update:open', false)"
  >
    <Spin :spinning="engagement.loading">
      <template v-if="auth.isAuthenticated">
        <div class="overview">
          <Card size="small" class="point-card">
            <div class="point-label">当前积分</div>
            <div class="point-value">{{ auth.user?.totalPoints ?? 0 }}</div>
            <div class="point-tip">通关、协作合并与成就都会积累积分；使用提示可能扣分。</div>
          </Card>
          <Card size="small" class="achievement-summary">
            <div class="summary-head">
              <span>已解锁成就</span>
              <strong>{{ engagement.unlockedCount }}/{{ engagement.achievements.length }}</strong>
            </div>
            <Progress :percent="unlockedProgress" size="small" :show-info="false" />
            <div class="summary-tip">成就奖励累计 {{ engagement.totalAchievementPoints }} 积分</div>
          </Card>
        </div>

        <section class="section">
          <div class="section-head">
            <h3>成就</h3>
            <Button size="small" @click="refresh">刷新</Button>
          </div>
          <Empty v-if="engagement.achievements.length === 0 && !engagement.loading" description="暂时没有可展示的成就" />
          <div v-else class="achievement-list">
            <div
              v-for="achievement in engagement.achievements"
              :key="achievement.id"
              class="achievement-item"
              :class="{ locked: !achievement.unlocked }"
            >
              <span class="achievement-icon">{{ iconOf(achievement) }}</span>
              <div class="achievement-copy">
                <div class="achievement-name">
                  {{ achievement.name }}
                  <Tag :color="achievement.unlocked ? 'green' : 'default'">
                    {{ achievement.unlocked ? '已解锁' : '未解锁' }}
                  </Tag>
                </div>
                <div class="achievement-desc">{{ achievement.description || '完成对应 Git 学习挑战即可解锁。' }}</div>
              </div>
              <span class="achievement-points">+{{ achievement.points }}</span>
            </div>
          </div>
        </section>
      </template>
      <Alert
        v-else
        class="login-tip"
        type="info"
        show-icon
        message="登录后可查看个人积分和成就"
        description="排行榜对所有玩家开放；登录后完成关卡、完成协作合并及使用提示都会即时计入个人成长记录。"
      />

      <section class="section leaderboard-section">
        <div class="section-head">
          <div>
            <h3>排行榜</h3>
            <p>{{ boardCaption }}</p>
          </div>
          <Button size="small" @click="refresh">刷新</Button>
        </div>
        <Segmented
          class="period-switch"
          :value="engagement.period"
          :options="periodTabs.map((tab) => ({ label: tab.tab, value: tab.key }))"
          @change="onPeriodChange"
        />
        <p v-if="refreshedHint" class="refreshed-hint">{{ refreshedHint }}</p>
        <Spin :spinning="engagement.boardLoading">
          <Table
            :columns="columns"
            :data-source="engagement.leaderboard"
            :pagination="false"
            :row-key="(entry: LeaderboardEntry) => entry.userId"
            size="small"
            :row-class-name="(entry: LeaderboardEntry) => entry.userId === auth.user?.id ? 'current-user-row' : ''"
            :scroll="{ y: 280 }"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'player'">
                <span class="player-name">{{ displayName(record as LeaderboardEntry) }}</span>
                <Tag v-if="(record as LeaderboardEntry).userId === auth.user?.id" color="blue">我</Tag>
              </template>
              <template v-else-if="column.dataIndex === 'rank'">
                <span class="rank">#{{ (record as LeaderboardEntry).rank }}</span>
              </template>
            </template>
          </Table>
          <Empty
            v-if="engagement.leaderboard.length === 0 && !engagement.loading && !engagement.boardLoading"
            :description="engagement.board.metric === 'window' ? '本期还没有人得分' : '还没有积分记录'"
          />
        </Spin>
      </section>
    </Spin>
  </Drawer>
</template>

<style scoped>
.overview {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.point-card,
.achievement-summary {
  min-height: 116px;
}
.point-label,
.summary-head {
  font-size: 13px;
  color: #667085;
}
.point-value {
  font-size: 30px;
  line-height: 1.2;
  font-weight: 700;
  color: #2f80ed;
  margin: 8px 0;
}
.point-tip,
.summary-tip,
.section-head p {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: #98a2b3;
}
.summary-head {
  display: flex;
  justify-content: space-between;
  margin-bottom: 14px;
}
.summary-head strong {
  color: #344054;
}
.section {
  margin-top: 24px;
}
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}
.section-head h3 {
  margin: 0;
  font-size: 15px;
  color: #344054;
}
.achievement-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.achievement-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid #d6e4ff;
  border-radius: 6px;
  background: #f6faff;
}
.achievement-item.locked {
  filter: grayscale(0.65);
  opacity: 0.72;
  background: #fafafa;
  border-color: #f0f0f0;
}
.achievement-icon {
  width: 28px;
  font-size: 21px;
  text-align: center;
}
.achievement-copy {
  flex: 1;
  min-width: 0;
}
.achievement-name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: #344054;
}
.achievement-name :deep(.ant-tag) {
  margin-inline-end: 0;
}
.achievement-desc {
  margin-top: 2px;
  font-size: 12px;
  line-height: 1.5;
  color: #667085;
}
.achievement-points {
  flex-shrink: 0;
  color: #27ae60;
  font-weight: 600;
  font-size: 13px;
}
.login-tip {
  margin-bottom: 20px;
}
.leaderboard-section {
  margin-top: 24px;
}
.period-switch {
  margin-bottom: 10px;
}
.refreshed-hint {
  margin: 0 0 8px;
  font-size: 12px;
  color: #98a2b3;
}
.player-name {
  margin-right: 6px;
  color: #344054;
}
.rank {
  color: #667085;
  font-variant-numeric: tabular-nums;
}
:deep(.current-user-row > td) {
  background: #e6f4ff !important;
}
@media (max-width: 560px) {
  .overview {
    grid-template-columns: 1fr;
  }
}
</style>
