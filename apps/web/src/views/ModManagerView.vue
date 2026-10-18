<script setup lang="ts">
import { env } from "@/env"
// unplugin-vue-components 只扫描 src/components，views 目录下的页面不会自动注册：
// 这里必须显式 import，否则 <ModsListView> 解析失败、web 端整页空白
import ModsListView from "@/views/ModsListView.vue"
</script>

<template>
    <!-- 桌面端：完整 MOD 管理器（含本地管理页签）；web 端：在线商店列表页（卡片链接到 /mods/:id 详情路由） -->
    <GameModManager v-if="env.isApp" />
    <ModsListView v-else />
</template>
