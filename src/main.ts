import { createApp } from 'vue'
import { createPinia } from 'pinia'

// antd 重置样式（§6.2：仅引入 reset，主题定制走 App.vue 的 ConfigProvider token）
import 'ant-design-vue/dist/reset.css'

import App from './App.vue'
import router from './router'

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')
