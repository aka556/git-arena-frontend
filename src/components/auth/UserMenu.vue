<script setup lang="ts">
/**
 * 顶栏用户菜单（§6.3 化身层的退化形态：单人处以头像色点具身当前用户）。
 * 已登录显示化身+名字+下拉（退出；游客可去注册）；未登录显示「登录/注册」入口。
 *
 * <p>登出后停留原页并回落匿名态（工作台/沙盒匿名可玩），由各页监听 auth 状态自行刷新用户相关数据。
 */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Avatar, Button, Dropdown, message } from 'ant-design-vue'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const loginLink = computed(() => ({ path: '/login', query: { redirect: route.fullPath } }))
const initial = computed(() => {
  const name = auth.user?.displayName || auth.user?.username || '?'
  return name.slice(0, 1).toUpperCase()
})

async function onLogout(): Promise<void> {
  await auth.logout()
  message.success('已退出登录')
}

function toRegister(): void {
  router.push({ path: '/login', query: { redirect: route.fullPath } })
}
</script>

<template>
  <div class="user-menu">
    <template v-if="auth.isAuthenticated">
      <Dropdown placement="bottomRight">
        <span class="trigger">
          <Avatar :size="24" :style="{ backgroundColor: auth.user?.avatarColor || '#2f80ed' }">
            {{ initial }}
          </Avatar>
          <span class="name">{{ auth.user?.displayName || auth.user?.username }}</span>
          <span v-if="auth.isGuest" class="guest-tag">游客</span>
        </span>
        <template #overlay>
          <div class="overlay">
            <div class="overlay-user">
              <div class="overlay-name">{{ auth.user?.displayName || auth.user?.username }}</div>
              <div v-if="auth.user?.email" class="overlay-email">{{ auth.user?.email }}</div>
              <div class="overlay-points">积分 {{ auth.user?.totalPoints ?? 0 }}</div>
            </div>
            <Button v-if="auth.isGuest" type="link" size="small" block @click="toRegister">
              注册正式账号
            </Button>
            <Button type="link" size="small" block danger @click="onLogout">退出登录</Button>
          </div>
        </template>
      </Dropdown>
    </template>
    <RouterLink v-else :to="loginLink" class="login-link">登录 / 注册</RouterLink>
  </div>
</template>

<style scoped>
.user-menu {
  display: inline-flex;
  align-items: center;
}
.trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  padding: 2px 4px;
}
.name {
  font-size: 13px;
  color: #344054;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.guest-tag {
  font-size: 11px;
  color: #f2994a;
  background: #fff4e8;
  border-radius: 3px;
  padding: 0 4px;
}
.login-link {
  font-size: 13px;
  color: #2f80ed;
}
.overlay {
  background: #fff;
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  padding: 8px;
  min-width: 160px;
}
.overlay-user {
  padding: 4px 8px 8px;
  border-bottom: 1px solid #f0f0f0;
  margin-bottom: 4px;
}
.overlay-name {
  font-weight: 600;
  font-size: 13px;
  color: #101828;
}
.overlay-email {
  font-size: 12px;
  color: #98a2b3;
}
.overlay-points {
  font-size: 12px;
  color: #2f80ed;
  margin-top: 2px;
}
</style>
