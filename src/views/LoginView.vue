<script setup lang="ts">
/**
 * 登录 / 注册页。认证流程保持统一，页面只负责舒适地收集信息与呈现即时反馈。
 */
import { computed, onUnmounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, Card, ConfigProvider, Input, Tabs, message } from 'ant-design-vue'
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  BranchesOutlined,
  CheckCircleFilled,
  LockOutlined,
  MailOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  UserOutlined,
} from '@ant-design/icons-vue'
import { useAuthStore } from '@/stores/auth'
import { sendCode as apiSendCode } from '@/api/auth'
import gitArenaLogo from '@/assets/git-arena.png'

const TabPane = Tabs.TabPane

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const authTheme = {
  token: {
    colorPrimary: '#16a34a',
    colorLink: '#15803d',
    colorText: '#18221d',
    colorTextSecondary: '#66736b',
    colorBorder: '#dce5df',
    borderRadius: 10,
    borderRadiusLG: 16,
    controlHeightLG: 46,
    fontFamily: '"Avenir Next", "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
  },
}

const activeTab = ref<'login' | 'register'>(auth.isGuest ? 'register' : 'login')
const submitting = ref(false)
const codeSending = ref(false)

const loginForm = reactive({ usernameOrEmail: '', password: '' })
const registerForm = reactive({ username: '', password: '', email: '', code: '' })

const codeCountdown = ref(0)
let codeTimer: ReturnType<typeof setInterval> | undefined

const loginErrors = reactive({ usernameOrEmail: '', password: '' })
const registerErrors = reactive({ username: '', password: '', email: '', code: '' })

function validateLoginUsername(value: string): string {
  return value.trim() ? '' : '请输入用户名或邮箱'
}

function validateLoginPassword(value: string): string {
  return value ? '' : '请输入密码'
}

function validateUsername(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length < 2) return '用户名至少 2 个字符'
  if (trimmed.length > 10) return '用户名最多 10 个字符'
  if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) return '仅支持字母、数字和下划线'
  return ''
}

const usernameIsValid = computed(() => !!registerForm.username.trim() && !registerErrors.username)

function validatePassword(value: string): string {
  if (!value) return '请输入密码'
  if (!/^[\x21-\x7E]+$/.test(value)) return '仅支持英文字母、数字和英文符号，不支持中文或空格'
  if (value.length < 6) return '密码至少 6 位'
  if (/^\d+$/.test(value)) return '密码不能是纯数字，请加入字母或符号'
  return ''
}

const passwordSecurity = computed(() => {
  const value = registerForm.password
  if (!value) {
    return { level: 'empty', label: '安全性提示', tip: '建议使用 8 位以上，并混合字母、数字和符号' }
  }

  const variety = [/[a-z]/.test(value), /[A-Z]/.test(value), /\d/.test(value), /[^a-zA-Z\d]/.test(value)]
    .filter(Boolean).length
  const score = (value.length >= 8 ? 1 : 0) + (value.length >= 12 ? 1 : 0) + variety

  if (!/^[\x21-\x7E]+$/.test(value)) {
    return { level: 'weak', label: '无效', tip: '请改用英文字母、数字或英文符号' }
  }
  if (/^\d+$/.test(value)) {
    return { level: 'weak', label: '较弱', tip: '纯数字容易被猜中，请加入字母或符号' }
  }
  if (score >= 5) {
    return { level: 'strong', label: '较强', tip: '组合较好，请避免使用姓名、生日等个人信息' }
  }
  if (score >= 3) {
    return { level: 'medium', label: '中等', tip: '可以增加长度，或加入大小写字母与特殊符号' }
  }
  return { level: 'weak', label: '较弱', tip: '已满足最低长度，建议使用字母、数字和符号组合' }
})

const passwordIsValid = computed(() => !!registerForm.password && !registerErrors.password)
const passwordSecuritySegments = computed(() => {
  if (passwordSecurity.value.level === 'strong') return 4
  if (passwordSecurity.value.level === 'medium') return 3
  return 1
})

function validateEmail(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return '请输入邮箱'
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? '' : '邮箱格式不正确'
}

function validateCode(value: string): string {
  return /^\d{6}$/.test(value.trim()) ? '' : '验证码为 6 位数字'
}

watch(() => loginForm.usernameOrEmail, (value) => {
  loginErrors.usernameOrEmail = validateLoginUsername(value)
})
watch(() => loginForm.password, (value) => {
  loginErrors.password = validateLoginPassword(value)
})
watch(() => registerForm.username, (value) => {
  registerErrors.username = validateUsername(value)
})
watch(() => registerForm.password, (value) => {
  registerErrors.password = validatePassword(value)
})
watch(() => registerForm.email, (value) => {
  registerErrors.email = validateEmail(value)
})
watch(() => registerForm.code, (value) => {
  registerErrors.code = validateCode(value)
})

function errMsg(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function redirectTarget(): string {
  const redirect = route.query.redirect
  return typeof redirect === 'string' && redirect.startsWith('/') ? redirect : '/'
}

async function onLogin(): Promise<void> {
  loginErrors.usernameOrEmail = validateLoginUsername(loginForm.usernameOrEmail)
  loginErrors.password = validateLoginPassword(loginForm.password)
  if (loginErrors.usernameOrEmail || loginErrors.password) return

  submitting.value = true
  try {
    await auth.login(loginForm.usernameOrEmail.trim(), loginForm.password)
    message.success('欢迎回来，登录成功')
    await router.replace(redirectTarget())
  } catch (error) {
    message.error(errMsg(error))
  } finally {
    submitting.value = false
  }
}

async function onRegister(): Promise<void> {
  registerErrors.username = validateUsername(registerForm.username)
  registerErrors.password = validatePassword(registerForm.password)
  registerErrors.email = validateEmail(registerForm.email)
  registerErrors.code = validateCode(registerForm.code)
  if (Object.values(registerErrors).some(Boolean)) return

  submitting.value = true
  try {
    const upgrading = auth.isGuest
    await auth.register({
      username: registerForm.username.trim(),
      password: registerForm.password,
      email: registerForm.email.trim(),
      code: registerForm.code.trim(),
    })
    message.success(upgrading ? '已升级为正式账号，学习进度已保留' : '注册成功，欢迎加入 git-arena')
    await router.replace(redirectTarget())
  } catch (error) {
    message.error(errMsg(error))
  } finally {
    submitting.value = false
  }
}

async function onSendCode(): Promise<void> {
  registerErrors.email = validateEmail(registerForm.email)
  if (registerErrors.email) {
    message.warning('请先填写正确的邮箱')
    return
  }

  codeSending.value = true
  try {
    await apiSendCode(registerForm.email.trim())
    message.success('验证码已发送，请查收邮箱')
    codeCountdown.value = 60
    if (codeTimer) clearInterval(codeTimer)
    codeTimer = setInterval(() => {
      codeCountdown.value -= 1
      if (codeCountdown.value <= 0 && codeTimer) {
        clearInterval(codeTimer)
        codeTimer = undefined
      }
    }, 1000)
  } catch (error) {
    message.error(errMsg(error))
  } finally {
    codeSending.value = false
  }
}

async function onGuest(): Promise<void> {
  if (auth.isGuest) {
    await router.replace(redirectTarget())
    return
  }

  submitting.value = true
  try {
    await auth.guest()
    message.success('已进入游客模式，临时账号将在 24 小时后过期')
    await router.replace(redirectTarget())
  } catch (error) {
    message.error(errMsg(error))
  } finally {
    submitting.value = false
  }
}

onUnmounted(() => {
  if (codeTimer) clearInterval(codeTimer)
})
</script>

<template>
  <ConfigProvider :theme="authTheme">
    <main class="auth-page">
      <div class="ambient ambient-one"></div>
      <div class="ambient ambient-two"></div>

      <RouterLink to="/" class="back-link" aria-label="返回工作台">
        <ArrowLeftOutlined />
        <span>返回工作台</span>
      </RouterLink>

      <div class="auth-shell">
        <section class="story-panel" aria-label="git-arena 产品介绍">
          <div class="story-grid"></div>

          <div class="story-content">
            <div class="brand-lockup">
              <span class="logo-wrap">
                <img :src="gitArenaLogo" alt="" class="brand-logo" />
              </span>
              <div>
                <p class="eyebrow">INTERACTIVE GIT LAB</p>
                <strong>git-arena</strong>
              </div>
            </div>

            <div class="story-copy">
              <span class="chapter-pill">从一次 commit 开始</span>
              <h1>让每一步 Git 操作，<br />都清晰可见。</h1>
              <p>
                在真实命令行与可视化提交图之间建立直觉，循序渐进地练习分支、合并与多人协作。
              </p>
            </div>

            <div class="feature-list">
              <div class="feature-item">
                <span class="feature-icon"><BranchesOutlined /></span>
                <div><strong>真实仓库</strong><small>每条命令都改变真实 Git 状态</small></div>
              </div>
              <div class="feature-item">
                <span class="feature-icon"><TeamOutlined /></span>
                <div><strong>协作演练</strong><small>练习推拉、冲突与 Pull Request</small></div>
              </div>
              <div class="feature-item">
                <span class="feature-icon"><ThunderboltOutlined /></span>
                <div><strong>即时反馈</strong><small>提交图随操作实时生长</small></div>
              </div>
            </div>
          </div>

          <div class="commit-map" aria-hidden="true">
            <div class="commit-line line-main"></div>
            <div class="commit-line line-branch"></div>
            <span class="commit-node node-one"></span>
            <span class="commit-node node-two"></span>
            <span class="commit-node node-three"></span>
            <span class="commit-node node-four"></span>
            <span class="commit-label label-head">HEAD → main</span>
            <span class="commit-label label-feature">feature/team</span>
          </div>

          <p class="story-footnote">真实命令 · 确定性提交图 · 协作训练</p>
        </section>

        <section class="form-panel">
          <Card class="auth-card" :bordered="false" :body-style="{ padding: 0 }">
            <div class="mobile-brand">
              <img :src="gitArenaLogo" alt="" />
              <span>git-arena</span>
            </div>

            <div class="form-heading">
              <p class="eyebrow">{{ activeTab === 'login' ? 'WELCOME BACK' : 'CREATE ACCOUNT' }}</p>
              <h2>{{ activeTab === 'login' ? '继续你的 Git 旅程' : auth.isGuest ? '保留这次学习旅程' : '创建你的学习档案' }}</h2>
              <p>
                {{ activeTab === 'login'
                  ? '登录后同步关卡进度、积分与协作记录。'
                  : auth.isGuest
                    ? '升级后，当前游客进度、积分与成就都会保留。'
                    : '只需一分钟，即可保存进度并加入协作房间。' }}
              </p>
            </div>

            <Tabs v-model:activeKey="activeTab" class="auth-tabs" :tab-bar-gutter="36" animated>
              <TabPane key="login" tab="账号登录">
                <form class="auth-form" novalidate @submit.prevent="onLogin">
                  <label class="field">
                    <span class="field-label">用户名或邮箱</span>
                    <Input
                      v-model:value="loginForm.usernameOrEmail"
                      class="auth-input"
                      size="large"
                      placeholder="输入用户名或邮箱"
                      autocomplete="username"
                      :status="loginErrors.usernameOrEmail ? 'error' : undefined"
                    >
                      <template #prefix><UserOutlined /></template>
                    </Input>
                    <span v-if="loginErrors.usernameOrEmail" class="field-message visible">
                      {{ loginErrors.usernameOrEmail }}
                    </span>
                  </label>

                  <label class="field">
                    <span class="field-label">密码</span>
                    <Input.Password
                      v-model:value="loginForm.password"
                      class="auth-input"
                      size="large"
                      placeholder="输入登录密码"
                      autocomplete="current-password"
                      :status="loginErrors.password ? 'error' : undefined"
                    >
                      <template #prefix><LockOutlined /></template>
                    </Input.Password>
                    <span v-if="loginErrors.password" class="field-message visible">
                      {{ loginErrors.password }}
                    </span>
                  </label>

                  <Button class="primary-action" type="primary" size="large" block html-type="submit" :loading="submitting">
                    登录并继续
                    <ArrowRightOutlined v-if="!submitting" />
                  </Button>
                </form>
              </TabPane>

              <TabPane key="register" :tab="auth.isGuest ? '升级账号' : '注册账号'">
                <form class="auth-form register-form" novalidate @submit.prevent="onRegister">
                  <div class="field-grid">
                    <label class="field">
                      <span class="field-label">用户名</span>
                      <Input
                        v-model:value="registerForm.username"
                        class="auth-input"
                        size="large"
                        placeholder="2–10 字符"
                        autocomplete="username"
                        :status="registerErrors.username ? 'error' : undefined"
                      >
                        <template #prefix><UserOutlined /></template>
                      </Input>
                      <Transition name="field-feedback">
                        <span
                          v-if="registerForm.username"
                          class="username-feedback"
                          :class="usernameIsValid ? 'is-valid' : 'is-invalid'"
                          aria-live="polite"
                        >
                          <CheckCircleFilled v-if="usernameIsValid" />
                          {{ usernameIsValid ? '用户名格式有效' : registerErrors.username }}
                        </span>
                      </Transition>
                    </label>

                    <label class="field">
                      <span class="field-label">密码</span>
                      <Input.Password
                        v-model:value="registerForm.password"
                        class="auth-input"
                        size="large"
                        placeholder="至少 6 位"
                        autocomplete="new-password"
                        :status="registerErrors.password ? 'error' : undefined"
                      >
                        <template #prefix><LockOutlined /></template>
                      </Input.Password>
                    </label>
                  </div>

                  <Transition name="password-feedback">
                    <div
                      v-if="registerForm.password"
                      class="password-feedback"
                      :class="[
                        passwordIsValid ? 'is-valid' : 'is-invalid',
                        `security-${passwordSecurity.level}`,
                      ]"
                      aria-live="polite"
                    >
                      <span class="password-status">
                        <CheckCircleFilled v-if="passwordIsValid" />
                        {{ passwordIsValid ? '密码格式有效' : registerErrors.password }}
                      </span>
                      <span class="feedback-separator">·</span>
                      <span class="security-compact">
                        <span class="security-meter" aria-hidden="true">
                          <span
                            v-for="segment in 4"
                            :key="segment"
                            :class="{ filled: segment <= passwordSecuritySegments }"
                          ></span>
                        </span>
                        安全性 {{ passwordSecurity.label }}
                      </span>
                      <span v-if="passwordIsValid && passwordSecurity.level !== 'strong'" class="security-tip">
                        · {{ passwordSecurity.tip }}
                      </span>
                    </div>
                  </Transition>

                  <label class="field">
                    <span class="field-label">邮箱</span>
                    <Input
                      v-model:value="registerForm.email"
                      class="auth-input"
                      size="large"
                      placeholder="name@example.com"
                      autocomplete="email"
                      :status="registerErrors.email ? 'error' : undefined"
                    >
                      <template #prefix><MailOutlined /></template>
                    </Input>
                    <span v-if="registerErrors.email" class="field-message visible">
                      {{ registerErrors.email }}
                    </span>
                  </label>

                  <label class="field">
                    <span class="field-label">邮箱验证码</span>
                    <div class="code-row">
                      <Input
                        v-model:value="registerForm.code"
                        class="auth-input"
                        size="large"
                        placeholder="6 位数字"
                        inputmode="numeric"
                        autocomplete="one-time-code"
                        :maxlength="6"
                        :status="registerErrors.code ? 'error' : undefined"
                      >
                        <template #prefix><SafetyCertificateOutlined /></template>
                      </Input>
                      <Button
                        class="code-button"
                        size="large"
                        :disabled="codeCountdown > 0"
                        :loading="codeSending"
                        @click="onSendCode"
                      >
                        {{ codeCountdown > 0 ? `${codeCountdown}s 后重试` : '获取验证码' }}
                      </Button>
                    </div>
                    <span v-if="registerErrors.code" class="field-message visible">
                      {{ registerErrors.code }}
                    </span>
                  </label>

                  <div v-if="auth.isGuest" class="progress-note">
                    <CheckCircleFilled />
                    <span>当前游客进度、积分和成就会自动迁移到新账号</span>
                  </div>

                  <Button class="primary-action" type="primary" size="large" block html-type="submit" :loading="submitting">
                    {{ auth.isGuest ? '升级并保留进度' : '创建账号并登录' }}
                    <ArrowRightOutlined v-if="!submitting" />
                  </Button>
                </form>
              </TabPane>
            </Tabs>

            <div class="guest-divider"><span>暂时不想注册？</span></div>
            <Button class="guest-action" size="large" block :loading="submitting" @click="onGuest">
              {{ auth.isGuest ? '继续当前游客体验' : '以游客身份快速体验' }}
              <span class="guest-hint">无需填写资料</span>
            </Button>

            <p class="privacy-copy">继续即表示你同意在教学沙盒中保存必要的账号与学习进度数据。</p>
          </Card>
        </section>
      </div>
    </main>
  </ConfigProvider>
</template>

<style scoped>
.auth-page {
  --ink: #18221d;
  --muted: #66736b;
  position: relative;
  display: grid;
  box-sizing: border-box;
  width: 100%;
  height: 100dvh;
  min-height: 100vh;
  place-items: center;
  overflow: hidden;
  padding: clamp(24px, 4vh, 40px) 40px;
  color: var(--ink);
  background: #f3f5f2;
  font-family: "Avenir Next", "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
}

.auth-page::before {
  position: absolute;
  inset: 0;
  background-image: radial-gradient(rgba(23, 43, 32, 0.08) 0.65px, transparent 0.65px);
  background-size: 18px 18px;
  content: '';
  opacity: 0.3;
  pointer-events: none;
}

.ambient {
  position: absolute;
  border-radius: 999px;
  filter: blur(10px);
  pointer-events: none;
}

.ambient-one {
  top: -180px;
  right: -100px;
  width: 440px;
  height: 440px;
  background: rgba(129, 230, 162, 0.2);
}

.ambient-two {
  bottom: -220px;
  left: 18%;
  width: 520px;
  height: 520px;
  background: rgba(255, 255, 255, 0.75);
}

.back-link {
  position: absolute;
  z-index: 3;
  top: 24px;
  left: 30px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 11px;
  border-radius: 10px;
  color: #526158;
  font-size: 13px;
  text-decoration: none;
  transition: color 160ms ease, background 160ms ease, transform 160ms ease;
}

.back-link:hover {
  color: #176b38;
  background: rgba(255, 255, 255, 0.72);
  transform: translateX(-2px);
}

.auth-shell {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: minmax(0, 1.08fr) minmax(440px, 0.92fr);
  width: min(1120px, 100%);
  height: min(760px, calc(100dvh - 48px));
  min-height: 0;
  max-height: 100%;
  overflow: hidden;
  border: 1px solid rgba(21, 44, 31, 0.08);
  border-radius: 30px;
  background: rgba(255, 255, 255, 0.86);
  box-shadow: 0 30px 80px rgba(37, 55, 44, 0.14), 0 8px 24px rgba(37, 55, 44, 0.06);
  backdrop-filter: blur(18px);
  animation: shell-enter 520ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
}

.story-panel {
  position: relative;
  min-width: 0;
  overflow: hidden;
  padding: 54px 58px 42px;
  color: #edf7f0;
  background: #13271d;
}

.story-panel::before {
  position: absolute;
  top: -110px;
  right: -100px;
  width: 360px;
  height: 360px;
  border: 1px solid rgba(88, 220, 131, 0.25);
  border-radius: 50%;
  box-shadow: 0 0 0 54px rgba(65, 170, 99, 0.055), 0 0 0 108px rgba(65, 170, 99, 0.035);
  content: '';
}

.story-grid {
  position: absolute;
  inset: 0;
  background-image: linear-gradient(rgba(197, 233, 208, 0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(197, 233, 208, 0.045) 1px, transparent 1px);
  background-size: 34px 34px;
  mask-image: linear-gradient(to bottom, black 20%, transparent 90%);
}

.story-content {
  position: relative;
  z-index: 2;
}

.brand-lockup {
  display: flex;
  align-items: center;
  gap: 13px;
}

.logo-wrap {
  display: grid;
  width: 48px;
  height: 48px;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 15px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 12px 26px rgba(0, 0, 0, 0.16);
}

.brand-logo {
  width: 38px;
  height: 38px;
  object-fit: contain;
}

.brand-lockup strong {
  display: block;
  color: #fff;
  font-size: 20px;
  letter-spacing: -0.02em;
}

.eyebrow {
  margin: 0 0 3px;
  color: #7da58b;
  font-family: "Cascadia Code", "SFMono-Regular", Consolas, monospace;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.16em;
}

.story-copy {
  margin-top: 74px;
}

.chapter-pill {
  display: inline-flex;
  align-items: center;
  padding: 6px 10px;
  border: 1px solid rgba(104, 220, 141, 0.22);
  border-radius: 999px;
  color: #91dfa9;
  background: rgba(59, 160, 91, 0.09);
  font-family: "Cascadia Code", Consolas, monospace;
  font-size: 11px;
}

.story-copy h1 {
  margin: 22px 0 18px;
  color: #f7fbf8;
  font-size: clamp(34px, 3.4vw, 48px);
  font-weight: 750;
  line-height: 1.18;
  letter-spacing: -0.045em;
}

.story-copy > p {
  max-width: 480px;
  margin: 0;
  color: #aebeb4;
  font-size: 15px;
  line-height: 1.85;
}

.feature-list {
  display: grid;
  gap: 16px;
  margin-top: 42px;
}

.feature-item {
  display: flex;
  align-items: center;
  gap: 13px;
}

.feature-icon {
  display: grid;
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  place-items: center;
  border: 1px solid rgba(115, 221, 148, 0.16);
  border-radius: 11px;
  color: #76dc96;
  background: rgba(54, 151, 85, 0.1);
}

.feature-item strong,
.feature-item small {
  display: block;
}

.feature-item strong {
  color: #eaf5ed;
  font-size: 13px;
  font-weight: 650;
}

.feature-item small {
  margin-top: 2px;
  color: #849b8c;
  font-size: 11px;
}

.commit-map {
  position: absolute;
  right: 32px;
  bottom: 58px;
  width: 190px;
  height: 140px;
  opacity: 0.7;
}

.commit-line {
  position: absolute;
  width: 3px;
  border-radius: 99px;
  background: #5ecb80;
}

.line-main {
  top: 7px;
  left: 32px;
  height: 124px;
}

.line-branch {
  top: 42px;
  left: 61px;
  width: 3px;
  height: 74px;
  transform: rotate(-52deg);
  transform-origin: top;
  background: #d1e7d7;
}

.commit-node {
  position: absolute;
  width: 13px;
  height: 13px;
  border: 3px solid #68d78a;
  border-radius: 50%;
  background: #13271d;
  box-shadow: 0 0 0 4px rgba(104, 215, 138, 0.08);
}

.node-one { top: 0; left: 27px; }
.node-two { top: 40px; left: 27px; }
.node-three { top: 82px; left: 27px; }
.node-four { top: 92px; left: 91px; border-color: #d4e9da; }

.commit-label {
  position: absolute;
  padding: 3px 7px;
  border-radius: 5px;
  font-family: "Cascadia Code", Consolas, monospace;
  font-size: 9px;
}

.label-head {
  top: -3px;
  left: 51px;
  color: #101e16;
  background: #6ee18f;
}

.label-feature {
  top: 90px;
  left: 115px;
  color: #b8c9bd;
  background: rgba(255, 255, 255, 0.08);
}

.story-footnote {
  position: absolute;
  z-index: 2;
  bottom: 38px;
  left: 58px;
  margin: 0;
  color: #657c6d;
  font-family: "Cascadia Code", Consolas, monospace;
  font-size: 10px;
  letter-spacing: 0.07em;
}

.form-panel {
  display: grid;
  min-width: 0;
  place-items: center;
  padding: 28px 48px;
  background: rgba(252, 253, 251, 0.96);
}

.auth-card {
  width: 100%;
  max-width: 430px;
  max-height: 100%;
  background: transparent;
  box-shadow: none;
}

.mobile-brand {
  display: none;
}

.form-heading {
  margin-bottom: 18px;
}

.form-heading h2 {
  margin: 8px 0 8px;
  color: var(--ink);
  font-size: 27px;
  font-weight: 730;
  line-height: 1.25;
  letter-spacing: -0.035em;
}

.form-heading > p:last-child {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.65;
}

.auth-tabs {
  width: 100%;
}

.auth-form {
  display: flex;
  flex-direction: column;
  padding-top: 4px;
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.field {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.field-label {
  margin-bottom: 7px;
  color: #3b4a41;
  font-size: 12px;
  font-weight: 650;
}

.auth-input {
  width: 100%;
}

.field-message {
  padding: 4px 3px 0;
  color: #d4380d;
  font-size: 11px;
  line-height: 16px;
}

.field-message.visible {
  color: #d4380d;
}

.username-feedback {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 3px 0;
  font-size: 10px;
  font-weight: 600;
  line-height: 16px;
}

.username-feedback.is-invalid {
  color: #d4380d;
}

.username-feedback.is-valid {
  color: #16803c;
}

.field-feedback-enter-active,
.field-feedback-leave-active {
  transition: opacity 140ms ease, transform 140ms ease;
}

.field-feedback-enter-from,
.field-feedback-leave-to {
  opacity: 0;
  transform: translateY(-2px);
}

.password-feedback {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 18px;
  margin: 3px 2px 8px;
  color: #7a867e;
  font-size: 10px;
  line-height: 1.45;
}

.password-status {
  flex: 0 0 auto;
  font-weight: 600;
}

.password-feedback.is-invalid .password-status {
  color: #d4380d;
}

.password-feedback.is-valid .password-status {
  color: #16803c;
}

.password-status svg {
  margin-right: 3px;
}

.feedback-separator {
  color: #c2cac4;
}

.security-compact {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 5px;
  color: #68746c;
}

.security-meter {
  display: inline-grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 2px;
  width: 34px;
  height: 3px;
}

.security-meter span {
  border-radius: 999px;
  background: #e5ebe6;
}

.security-weak .security-meter span.filled {
  background: #ff7875;
}

.security-medium .security-meter span.filled {
  background: #ffc53d;
}

.security-strong .security-meter span.filled {
  background: #52c41a;
}

.security-tip {
  min-width: 0;
  overflow: hidden;
  color: #929c95;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.password-feedback-enter-active,
.password-feedback-leave-active {
  transition: opacity 140ms ease, transform 140ms ease;
}

.password-feedback-enter-from,
.password-feedback-leave-to {
  opacity: 0;
  transform: translateY(-3px);
}

.code-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 9px;
}

.code-button {
  min-width: 112px;
  font-size: 12px;
}

.progress-note {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0 0 15px;
  padding: 10px 12px;
  border: 1px solid #ccebd5;
  border-radius: 10px;
  color: #247242;
  background: #f1fbf4;
  font-size: 12px;
  line-height: 1.55;
}

.progress-note svg {
  margin-top: 2px;
}

.primary-action {
  height: 48px;
  border: 0;
  margin-top: 20px;
  border-radius: 12px;
  font-weight: 650;
  box-shadow: 0 10px 22px rgba(22, 163, 74, 0.18);
}

.guest-divider {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 20px 0 14px;
  color: #96a098;
  font-size: 11px;
}

.guest-divider::before,
.guest-divider::after {
  flex: 1;
  height: 1px;
  background: #e6ebe7;
  content: '';
}

.guest-action {
  display: flex;
  height: 45px;
  align-items: center;
  justify-content: center;
  border-color: #dce5df;
  border-radius: 11px;
  color: #35473b;
  background: #fff;
  font-weight: 600;
}

.guest-hint {
  margin-left: 8px;
  color: #9aa49d;
  font-size: 10px;
  font-weight: 400;
}

.privacy-copy {
  margin: 14px 20px 0;
  color: #a0a8a2;
  font-size: 10px;
  line-height: 1.6;
  text-align: center;
}

@keyframes shell-enter {
  from { opacity: 0; transform: translateY(14px) scale(0.992); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

@media (max-width: 940px) {
  .auth-page {
    align-items: start;
    padding: 76px 22px 30px;
    overflow: auto;
  }

  .auth-shell {
    grid-template-columns: 1fr;
    width: min(560px, 100%);
    height: auto;
    min-height: auto;
    max-height: none;
    border-radius: 24px;
  }

  .story-panel {
    display: none;
  }

  .form-panel {
    padding: 30px 36px 34px;
  }

  .mobile-brand {
    display: flex;
    align-items: center;
    gap: 9px;
    margin-bottom: 26px;
    color: #21372a;
    font-size: 17px;
    font-weight: 750;
  }

  .mobile-brand img {
    width: 34px;
    height: 34px;
  }
}

@media (max-width: 520px) {
  .auth-page {
    display: block;
    padding: 64px 0 0;
    background: #fcfdfb;
  }

  .back-link {
    top: 14px;
    left: 14px;
  }

  .auth-shell {
    width: 100%;
    border: 0;
    border-radius: 0;
    box-shadow: none;
    backdrop-filter: none;
  }

  .form-panel {
    display: block;
    padding: 24px 22px 36px;
  }

  .form-heading h2 {
    font-size: 24px;
  }

  .field-grid {
    grid-template-columns: 1fr;
    gap: 0;
  }

  .code-row {
    grid-template-columns: minmax(0, 1fr) 104px;
  }

  .code-button {
    min-width: 0;
    padding-inline: 8px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .auth-shell {
    animation: none;
  }

  .back-link {
    transition: none;
  }
}
</style>
