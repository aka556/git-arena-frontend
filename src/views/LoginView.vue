<script setup lang="ts">
/**
 * 登录 / 注册页。承载 P1 用户体系：注册必须填邮箱+验证码。
 *
 * <p>实时校验在输入即刻检查（字段下方文字提示，不阻塞提交）；表单校验以
 * Bean Validation + 后端为准，前端实时校验只做即时反馈与过早提交拦截。
 * 密码可见切换由 InputPassword 原生的 eye 图标提供。
 */
import { computed, onUnmounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, Card, Input, Tabs, message } from 'ant-design-vue'
import {
  UserOutlined,
  MailOutlined,
  LockOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons-vue'
import { useAuthStore } from '@/stores/auth'
import { sendCode as apiSendCode } from '@/api/auth'

const TabPane = Tabs.TabPane

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const activeTab = ref<'login' | 'register'>(auth.isGuest ? 'register' : 'login')
const submitting = ref(false)
/** 发送验证码按钮的 loading 态，防止连续点击。 */
const codeSending = ref(false)

const loginForm = reactive({ usernameOrEmail: '', password: '' })
const registerForm = reactive({ username: '', password: '', email: '', code: '' })

/** 验证码倒计时（秒），>0 时按钮禁用。 */
const codeCountdown = ref(0)
let codeTimer: ReturnType<typeof setInterval> | undefined

// ── 登录实时校验 ──

const loginErrors = reactive({
  usernameOrEmail: '',
  password: '',
})

watch(
  () => loginForm.usernameOrEmail,
  (v) => {
    loginErrors.usernameOrEmail = v.trim() ? '' : '请输入用户名或邮箱'
  },
)
watch(
  () => loginForm.password,
  (v) => {
    loginErrors.password = v ? '' : '请输入密码'
  },
)

// ── 注册实时校验 ──

const registerErrors = reactive({
  username: '',
  password: '',
  email: '',
  code: '',
})

watch(
  () => registerForm.username,
  (v) => {
    const trimmed = v.trim()
    if (trimmed.length < 2) {
      registerErrors.username = '用户名至少 2 个字符'
    } else if (trimmed.length > 32) {
      registerErrors.username = '用户名最多 32 个字符'
    } else if (!/^[a-zA-Z0-9_\u4e00-\u9fa5]+$/.test(trimmed)) {
      registerErrors.username = '仅支持字母、数字、下划线与中文'
    } else {
      registerErrors.username = ''
    }
  },
)
watch(
  () => registerForm.password,
  (v) => {
    registerErrors.password = v.length < 6 ? '密码至少 6 位' : ''
  },
)
watch(
  () => registerForm.email,
  (v) => {
    const trimmed = v.trim()
    if (!trimmed) {
      registerErrors.email = '请输入邮箱'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      registerErrors.email = '邮箱格式不正确'
    } else {
      registerErrors.email = ''
    }
  },
)
watch(
  () => registerForm.code,
  (v) => {
    registerErrors.code = v.trim().length === 6 ? '' : '验证码为 6 位数字'
  },
)

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

function redirectTarget(): string {
  const r = route.query.redirect
  return typeof r === 'string' && r.startsWith('/') ? r : '/'
}

async function onLogin(): Promise<void> {
  // 触发所有校验
  loginErrors.usernameOrEmail = loginForm.usernameOrEmail.trim() ? '' : '请输入用户名或邮箱'
  loginErrors.password = loginForm.password ? '' : '请输入密码'
  if (loginErrors.usernameOrEmail || loginErrors.password) return
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
  // 二次触发实时校验确保所有错误已更新
  if (registerErrors.username || registerErrors.password || registerErrors.email || registerErrors.code) {
    return
  }
  if (!registerForm.email.trim() || !registerForm.code.trim()) {
    message.warning('请完整填写邮箱与验证码')
    return
  }
  submitting.value = true
  try {
    const upgrading = auth.isGuest
    await auth.register({
      username: registerForm.username.trim(),
      password: registerForm.password,
      email: registerForm.email.trim(),
      code: registerForm.code.trim(),
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
  if (!email || registerErrors.email) {
    message.warning('请先填写正确的邮箱')
    return
  }
  codeSending.value = true
  try {
    await apiSendCode(email)
    message.success('验证码已发送，请查收邮箱')
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
  } finally {
    codeSending.value = false
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
            <div class="field">
              <Input
                v-model:value="loginForm.usernameOrEmail"
                size="large"
                placeholder="用户名或邮箱"
                autocomplete="username"
              >
                <template #prefix>
                  <UserOutlined />
                </template>
              </Input>
              <p v-if="loginErrors.usernameOrEmail" class="field-error">
                {{ loginErrors.usernameOrEmail }}
              </p>
            </div>
            <div class="field">
              <Input.Password
                v-model:value="loginForm.password"
                size="large"
                placeholder="密码"
                autocomplete="current-password"
              >
                <template #prefix>
                  <LockOutlined />
                </template>
              </Input.Password>
              <p v-if="loginErrors.password" class="field-error">
                {{ loginErrors.password }}
              </p>
            </div>
            <Button type="primary" size="large" block html-type="submit" :loading="submitting">
              登录
            </Button>
          </form>
        </TabPane>

        <TabPane key="register" tab="注册">
          <form class="form" @submit.prevent="onRegister">
            <div class="field">
              <Input
                v-model:value="registerForm.username"
                size="large"
                placeholder="用户名（2–32 位，字母/数字/下划线）"
                autocomplete="username"
              >
                <template #prefix>
                  <UserOutlined />
                </template>
              </Input>
              <p v-if="registerErrors.username" class="field-error">
                {{ registerErrors.username }}
              </p>
            </div>
            <div class="field">
              <Input.Password
                v-model:value="registerForm.password"
                size="large"
                placeholder="密码（至少 6 位）"
                autocomplete="new-password"
              >
                <template #prefix>
                  <LockOutlined />
                </template>
              </Input.Password>
              <p v-if="registerErrors.password" class="field-error">
                {{ registerErrors.password }}
              </p>
            </div>
            <div class="field">
              <Input
                v-model:value="registerForm.email"
                size="large"
                placeholder="邮箱（用于注册与登录验证）"
              >
                <template #prefix>
                  <MailOutlined />
                </template>
              </Input>
              <p v-if="registerErrors.email" class="field-error">
                {{ registerErrors.email }}
              </p>
            </div>
            <div class="field">
              <div class="code-row">
                <Input
                  v-model:value="registerForm.code"
                  size="large"
                  placeholder="邮箱验证码（6 位数字）"
                >
                  <template #prefix>
                    <SafetyCertificateOutlined />
                  </template>
                </Input>
                <Button
                  size="large"
                  :disabled="codeCountdown > 0"
                  :loading="codeSending"
                  @click="onSendCode"
                >
                  {{ codeCountdown > 0 ? `${codeCountdown}s` : '获取验证码' }}
                </Button>
              </div>
              <p v-if="registerErrors.code" class="field-error">
                {{ registerErrors.code }}
              </p>
            </div>
            <p class="hint">邮箱与验证码为必填项，用于登录与账号找回。</p>
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
  width: 400px;
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
  gap: 8px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.field-error {
  font-size: 12px;
  color: #eb5757;
  margin: 0 0 0 4px;
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