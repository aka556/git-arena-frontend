<script setup lang="ts">
/**
 * 应用根组件。用 antd ConfigProvider 统一主题 design token（§6.2：主题定制走 token，禁止散落覆盖 .ant-*）。
 */
import { ConfigProvider } from 'ant-design-vue'

const theme = {
  token: {
    colorPrimary: '#2f80ed',
    borderRadius: 4,
  },
}
</script>

<template>
  <ConfigProvider :theme="theme">
    <RouterView />
  </ConfigProvider>
</template>

<style>
html,
body,
#app {
  margin: 0;
  height: 100%;
}
</style>
