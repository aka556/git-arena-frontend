import { createApp } from 'vue'
import { createPinia } from 'pinia'

// antd 重置样式（§6.2：仅引入 reset，主题定制走 App.vue 的 ConfigProvider token）
import 'ant-design-vue/dist/reset.css'

import App from './App.vue'
import router from './router'
import { useAuthStore } from './stores/auth'

const app = createApp(App)

app.use(createPinia())
app.use(router)

// 先恢复登录会话（有 token 则拉 /me）再挂载，保证路由守卫与首屏拿到确定的登录态；
// 失败（无网络/token 失效）也不阻塞挂载——匿名态照常可玩（CurrentUser 可选认证）。
useAuthStore()
  .init()
  .finally(() => app.mount('#app'))
