import { createRouter, createWebHistory } from 'vue-router'
import WorkbenchView from '@/views/WorkbenchView.vue'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'workbench', component: WorkbenchView },
    { path: '/rooms', name: 'rooms', component: () => import('@/views/RoomsView.vue') },
    { path: '/level-editor', name: 'level-editor', component: () => import('@/views/LevelEditorView.vue') },
    { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue'), meta: { guestOnly: true } },
  ],
})

// 认证是可选的（匿名沙盒/关卡照常可玩，CurrentUser 可选认证）：不硬拦工作台/房间。
// 仅当正式账号访问登录页时回跳，避免重复登录；游客放行——他们要走登录页的注册页签升级为正式账号。
router.beforeEach((to) => {
  const auth = useAuthStore()
  if (to.meta.guestOnly && auth.isAuthenticated && !auth.isGuest) {
    const redirect = to.query.redirect
    return typeof redirect === 'string' && redirect.startsWith('/') ? redirect : '/'
  }
  return true
})

export default router
