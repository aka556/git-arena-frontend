<script setup lang="ts">
/**
 * 登录 / 注册页（CLAUDE.md §6.1 views）。承载 P1 用户体系的两条注册路径：
 * 只填用户名+密码直注；或补邮箱+验证码走邮箱验证。另提供游客一键体验（24h 临时账号）。
 *
 * <p>登录态由 auth store 持有（token 存 localStorage、请求头 Bearer 注入在 http.ts）。
 * 成功后回跳 ?redirect 指向页（默认工作台）。表单只做轻量必填校验，规则以后端为准（§7）。
 */
import { onUnmounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, Card, Input, Tabs, message } from 'ant-design-vue'
import { useAuthStore } from '@/stores/auth'
import { sendCode as apiSendCode } from '@/api/auth'

const TabPane = Tabs.TabPane

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const activeTab = ref<'login' | 'register'>(auth.isGuest ? 'register' : 'login')
const submitting = ref(false)

const loginForm = reactive({ usernameOrEmail: '', password: '' })
const registerForm = reactive({ username: '', password: '', email: '', code: '' })

/** 验证码倒计时（秒），>0 时按钮禁用。 */
const codeCountdown = ref(0)
let codeTimer: ReturnType<typeof setInterval> | undefined

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

function redirectTarget(): string {
  const r = route.query.redirect
  return typeof r === 'string' && r.startsWith('/') ? r : '/'
}

async function onLogin(): Promise<void> {
  if (!loginForm.usernameOrEmail.trim() || !loginForm.password) {
    message.warning('请输入用户名/邮箱与密码')
    return
  }
  submitting.value = true
  try {
    await auth.login(loginForm.usernameOrEmail.trim(), loginForm.password)
    message.success('登录成功')
    router.replace(redirectTarget())
  } catch (e) {
    message.error(errMsg(e))
  } finally {
    submitting.value = false
  }
}

async function onRegister(): Promise<void> {
  if (registerForm.username.trim().length < 2) {
    message.warning('用户名至少 2 个字符')
    return
  }
  if (registerForm.password.length < 6) {
    message.warning('密码至少 6 位')
    return
  }
  const email = registerForm.email.trim()
  const code = registerForm.code.trim()
  if (code && !email) {
    message.warning('填了验证码就需要一并填邮箱')
    return
  }
  submitting.value = true
  try {
    const upgrading = auth.isGuest
    await auth.register({
      username: registerForm.username.trim(),
      password: registerForm.password,
      email: email || undefined,
      code: code || undefined,
    })
    message.success(upgrading ? '已升级为正式账号，进度已保留' : '注册成功，已登录')
    router.replace(redirectTarget())
  } catch (e) {
    message.error(errMsg(e))
  } finally {
    submitting.value = false
  }
}

async function onSendCode(): Promise<void> {
  const email = registerForm.email.trim()
  if (!email) {
    message.warning('请先填写邮箱')
    return
  }
  try {
    await apiSendCode(email)
    message.success('验证码已发送（未配 SMTP 时见后端日志）')
    codeCountdown.value = 60
    codeTimer = setInterval(() => {
      codeCountdown.value -= 1
      if (codeCountdown.value <= 0 && codeTimer) {
        clearInterval(codeTimer)
        codeTimer = undefined
      }
    }, 1000)
  } catch (e) {
    message.error(errMsg(e))
  }
}

async function onGuest(): Promise<void> {
  submitting.value = true
  try {
    await auth.guest()
    message.success('已进入游客模式（24 小时临时账号）')
    router.replace(redirectTarget())
  } catch (e) {
    message.error(errMsg(e))
  } finally {
    submitting.value = false
  }
}

onUnmounted(() => {
  if (codeTimer) clearInterval(codeTimer)
})
</script>

<template>
  <div class="auth-page">
    <Card class="auth-card">
      <div class="brand">git-arena</div>
      <p class="subtitle">看懂 git · 练会协作</p>

      <Tabs v-model:activeKey="activeTab" centered>
        <TabPane key="login" tab="登录">
          <form class="form" @submit.prevent="onLogin">
            <Input
              v-model:value="loginForm.usernameOrEmail"
              size="large"
              placeholder="用户名或邮箱"
              autocomplete="username"
            />
            <Input
              v-model:value="loginForm.password"
              size="large"
              type="password"
              placeholder="密码"
              autocomplete="current-password"
            />
            <Button type="primary" size="large" block html-type="submit" :loading="submitting">
              登录
            </Button>
          </form>
        </TabPane>

        <TabPane key="register" tab="注册">
          <form class="form" @submit.prevent="onRegister">
            <Input
              v-model:value="registerForm.username"
              size="large"
              placeholder="用户名（2–32 位，字母/数字/下划线）"
              autocomplete="username"
            />
            <Input
              v-model:value="registerForm.password"
              size="large"
              type="password"
              placeholder="密码（至少 6 位）"
              autocomplete="new-password"
            />
            <Input v-model:value="registerForm.email" size="large" placeholder="邮箱（选填，用于邮箱验证）" />
            <div class="code-row">
              <Input v-model:value="registerForm.code" size="large" placeholder="邮箱验证码（选填）" />
              <Button size="large" :disabled="codeCountdown > 0" @click="onSendCode">
                {{ codeCountdown > 0 ? `${codeCountdown}s` : '获取验证码' }}
              </Button>
            </div>
            <p class="hint">只填用户名+密码即可注册；填邮箱并验证可用于找回与登录。</p>
            <p v-if="auth.isGuest" class="hint hint-keep">
              你正以游客身份体验，注册后当前进度、积分与成就将保留到新账号。
            </p>
            <Button type="primary" size="large" block html-type="submit" :loading="submitting">
              {{ auth.isGuest ? '升级为正式账号' : '注册并登录' }}
            </Button>
          </form>
        </TabPane>
      </Tabs>

      <div class="guest-row">
        <span class="or">或</span>
        <Button type="link" :loading="submitting" @click="onGuest">游客一键体验 →</Button>
      </div>
    </Card>
  </div>
</template>

<style scoped>
.auth-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: linear-gradient(135deg, #eef4ff 0%, #f8fafc 100%);
}
.auth-card {
  width: 380px;
  box-shadow: 0 8px 32px rgba(47, 128, 237, 0.12);
}
.brand {
  text-align: center;
  font-weight: 700;
  font-size: 22px;
  color: #2f80ed;
}
.subtitle {
  text-align: center;
  color: #98a2b3;
  font-size: 13px;
  margin: 4px 0 8px;
}
.form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.code-row {
  display: flex;
  gap: 8px;
}
.code-row :deep(.ant-input) {
  flex: 1;
}
.hint {
  font-size: 12px;
  color: #98a2b3;
  margin: -2px 0 2px;
}
.hint-keep {
  color: #2f80ed;
}
.guest-row {
  text-align: center;
  margin-top: 8px;
}
.or {
  color: #cbd5e1;
  font-size: 12px;
}
</style>
