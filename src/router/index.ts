import { createRouter, createWebHistory } from 'vue-router'
import WorkbenchView from '@/views/WorkbenchView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'workbench', component: WorkbenchView },
    { path: '/rooms', name: 'rooms', component: () => import('@/views/RoomsView.vue') },
  ],
})

export default router
