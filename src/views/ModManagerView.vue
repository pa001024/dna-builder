<script setup lang="ts">
import { env } from "@/env"
</script>

<template>
    <!-- 桌面端：完整 MOD 管理器（含本地管理页签）；web 端：在线商店列表页（卡片链接到 /mods/:id 详情路由） -->
    <GameModManager v-if="env.isApp" />
    <ModsListView v-else />
</template>
