<script lang="ts" setup>
import type { NPC } from "@/data/d/npc.data"

const props = defineProps<{
    npc: NPC
}>()
</script>

<template>
    <div class="p-3 space-y-3">
        <!-- 详情头部 -->
        <div class="flex items-center justify-between">
            <div>
                <SRouterLink :to="`/db/npc/${npc.id}`" class="text-lg font-bold link link-primary">
                    {{ npc.name || `NPC ${npc.id}` }}
                </SRouterLink>
                <div class="text-sm text-base-content/70">ID: {{ npc.id }}</div>
            </div>
        </div>

        <!-- NPC 信息 -->
        <div class="card bg-base-100 border border-base-200 rounded p-3">
            <h3 class="font-bold mb-2">NPC 信息</h3>
            <div class="grid grid-cols-2 gap-2 text-sm">
                <div class="flex justify-between">
                    <span class="text-base-content/70">ID</span>
                    <span>{{ npc.id }}</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-base-content/70">名称</span>
                    <span>{{ npc.name || "未知" }}</span>
                </div>
                <div v-if="npc.camp" class="flex justify-between">
                    <span class="text-base-content/70">阵营</span>
                    <span>{{ npc.camp }}</span>
                </div>
                <div v-if="npc.type" class="flex justify-between">
                    <span class="text-base-content/70">类型</span>
                    <span>{{ npc.type }}</span>
                </div>
                <div v-if="npc.charId" class="flex justify-between">
                    <span class="text-base-content/70">角色 ID</span>
                    <span>{{ npc.charId }}</span>
                </div>
                <div v-if="npc.icon" class="flex justify-between">
                    <span class="text-base-content/70">图标</span>
                    <span>{{ npc.icon }}</span>
                </div>
            </div>
        </div>

        <!-- 对话信息 -->
        <div v-if="npc.talks && npc.talks.length" class="card bg-base-100 border border-base-200 rounded p-3">
            <h3 class="font-bold mb-2">对话信息 ({{ npc.talks.length }}条)</h3>
            <div class="space-y-3">
                <div v-for="talk in npc.talks.slice(0, 10)" :key="talk.id" class="p-2 bg-base-200 rounded hover:bg-base-300 transition-colors">
                    <div class="flex items-center justify-between mb-1">
                        <span class="text-sm font-medium">对话 ID: {{ talk.id }}</span>
                    </div>
                    <div class="text-xs">
                        <span class="font-medium text-primary mr-1">{{ npc.name || `NPC ${npc.id}` }}:</span>
                        {{ talk.content }}
                    </div>
                </div>
                <div v-if="npc.talks.length > 10" class="text-sm text-base-content/70 text-center">
                    ... 共 {{ npc.talks.length }} 条对话，仅显示前 10 条
                </div>
            </div>
        </div>
    </div>
</template>
