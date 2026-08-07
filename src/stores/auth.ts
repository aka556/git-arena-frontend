/**
 * 认证 store（§6.2：业务状态入 Pinia）。持有登录 token 与当前用户，是前端唯一的登录态来源。
 *
 * <p>token 落 localStorage（经 api/token.ts），刷新后由 {@link init} 用 /me 恢复会话；
 * 请求头的 Bearer 注入在 http.ts 拦截器完成，本 store 只管状态与动作。
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { RegisterPayload, UserView } from '@/types/auth'
import { getToken, setToken } from '@/api/token'
import * as authApi from '@/api/auth'

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(getToken())
  const user = ref<UserView | null>(null)
  /** 是否已尝试恢复会话（init 完成）——路由守卫据此避免在恢复前误判未登录。 */
  const ready = ref(false)

  const isAuthenticated = computed(() => !!token.value && !!user.value)
  const isGuest = computed(() => user.value?.guest === true)

  function apply(res: { token: string; user: UserView }): void {
    token.value = res.token
    setToken(res.token)
    user.value = res.user
  }

  function clear(): void {
    token.value = null
    setToken(null)
    user.value = null
  }

  /** 启动时恢复会话：有 token 则拉 /me，失败（失效/被吊销）即清空。 */
  async function init(): Promise<void> {
    if (token.value) {
      try {
        user.value = await authApi.fetchMe()
      } catch {
        clear()
      }
    }
    ready.value = true
  }

  async function login(usernameOrEmail: string, password: string): Promise<void> {
    apply(await authApi.login(usernameOrEmail, password))
  }

  async function register(payload: RegisterPayload): Promise<void> {
    apply(await authApi.register(payload))
  }

  async function guest(): Promise<void> {
    apply(await authApi.guest())
  }

  async function logout(): Promise<void> {
    try {
      await authApi.logout()
    } finally {
      clear()
    }
  }

  return { token, user, ready, isAuthenticated, isGuest, init, login, register, guest, logout }
})
