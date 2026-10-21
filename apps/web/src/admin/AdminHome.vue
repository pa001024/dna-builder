<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import { adminStatsQuery, recentActivitiesQuery } from "@/api/graphql"
import type { IconTypes } from "@/components/Icon.vue"
import { formatDateTime } from "@/utils/time"
import AdminPageHeader from "./AdminPageHeader.vue"
import { ADMIN_MENU_GROUPS, adminMenuNo } from "./admin-menu"
import { ADMIN_BTN, ADMIN_EMPTY, ADMIN_NUM, ADMIN_NUM_UNIT, ADMIN_STAT_LABEL, ADMIN_STAT_VALUE } from "./admin-ui"

/** 统计数据（adminStats 的六个总量） */
const stats = ref({
    totalUsers: 0,
    totalGuides: 0,
    totalRooms: 0,
    totalMessages: 0,
    totalBuilds: 0,
    totalTimelines: 0,
})

/** 最近活动 */
const recentActivities = ref<
    Array<{
        id: string
        user: string
        action: string
        target: string
        time: number
    }>
>([])

const loading = ref(false)
const statsError = ref("")
const activitiesError = ref("")

/** 上次成功拉取的时间（只展示真实时间，加载失败时保留旧值） */
const lastLoadedAt = ref("")

/**
 * 六个台账口径：数值 + 后续模块页入口（顺序即索引编号，与侧栏一致）
 */
const counters = computed<Array<{ key: string; label: string; name: string; value: number; path: string; icon: IconTypes }>>(() => [
    { key: "totalUsers", label: "Users", name: "用户", value: stats.value.totalUsers, path: "/admin/user", icon: "ri:team-line" },
    { key: "totalGuides", label: "Guides", name: "攻略", value: stats.value.totalGuides, path: "/admin/guide", icon: "ri:book-line" },
    { key: "totalBuilds", label: "Builds", name: "构筑", value: stats.value.totalBuilds, path: "/admin/build", icon: "ri:hammer-line" },
    {
        key: "totalTimelines",
        label: "Timelines",
        name: "时间线",
        value: stats.value.totalTimelines,
        path: "/admin/timeline",
        icon: "ri:timeline-view",
    },
    { key: "totalRooms", label: "Rooms", name: "房间", value: stats.value.totalRooms, path: "/admin/room", icon: "ri:home-line" },
    {
        key: "totalMessages",
        label: "Messages",
        name: "消息",
        value: stats.value.totalMessages,
        path: "/admin/room",
        icon: "ri:chat-thread-line",
    },
])

/**
 * 台账总计：六个口径里可相加的内容量（用户数与消息数口径不同，不与内容量混算）
 */
const contentTotal = computed(() => stats.value.totalGuides + stats.value.totalBuilds + stats.value.totalTimelines)

/** 除首页外的 15 个模块入口（编号与侧栏索引轨一致） */
const moduleGroups = ADMIN_MENU_GROUPS.map(group => ({
    ...group,
    items: group.items.filter(item => item.path !== "/admin"),
})).filter(group => group.items.length > 0)

/**
 * 加载统计数据
 */
async function loadStats() {
    try {
        const data = await adminStatsQuery({}, { requestPolicy: "network-only" })
        if (data) {
            stats.value = data
        }
        statsError.value = ""
    } catch (error) {
        console.error("Failed to load stats:", error)
        statsError.value = "统计加载失败"
    }
}

/**
 * 加载最近活动
 */
async function loadRecentActivities() {
    try {
        const data = await recentActivitiesQuery({ limit: 12 }, { requestPolicy: "network-only" })
        if (data) {
            recentActivities.value = data
        }
        activitiesError.value = ""
    } catch (error) {
        console.error("Failed to load recent activities:", error)
        activitiesError.value = "活动加载失败"
    }
}

function formatActivityTime(timestamp: number): string {
    return formatDateTime(timestamp)
}

/**
 * 加载所有数据
 */
async function loadData() {
    loading.value = true
    try {
        await Promise.all([loadStats(), loadRecentActivities()])
        lastLoadedAt.value = new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    } finally {
        loading.value = false
    }
}

onMounted(() => {
    loadData()
})
</script>

<template>
    <div class="admin-page mx-auto flex min-h-full w-full max-w-390 flex-col px-5 pb-6">
        <AdminPageHeader kicker="Ledger" title="后台总览" description="六类内容的总量与系统最近动作。数值来自 adminStats，非估算。">
            <template #actions>
                <span v-if="lastLoadedAt" class="font-orbitron text-[10px] tabular-nums text-base-content/30">SYNC {{ lastLoadedAt }}</span>
                <button :class="ADMIN_BTN" :disabled="loading" @click="loadData">
                    <Icon icon="ri:refresh-line" :class="['h-3.25 w-3.25', loading ? 'animate-spin' : '']" />
                    <span>{{ loading ? "刷新中" : "刷新" }}</span>
                </button>
            </template>
        </AdminPageHeader>

        <!-- 主台账：连续表面 + 竖细线分栏 -->
        <div class="grid grid-cols-2 border-b border-base-content/10 md:grid-cols-3 xl:grid-cols-6">
            <component
                :is="counter.path ? 'button' : 'div'"
                v-for="(counter, index) in counters"
                :key="counter.key"
                class="group relative border-base-content/10 px-4 py-4 text-left transition-colors duration-150"
                :class="[
                    index % 2 === 1 ? 'border-l' : '',
                    index % 3 !== 0 ? 'md:border-l' : 'md:border-l-0',
                    index % 6 !== 0 ? 'xl:border-l' : 'xl:border-l-0',
                    index < 4 ? 'border-b xl:border-b-0' : '',
                    index < 2 ? 'border-b md:border-b' : '',
                    counter.path ? 'cursor-pointer hover:bg-base-content/4' : '',
                ]"
                @click="counter.path && $router.push(counter.path)"
            >
                <div class="flex items-center justify-between">
                    <span :class="ADMIN_STAT_LABEL">{{ counter.label }}</span>
                    <Icon
                        :icon="counter.icon as IconTypes"
                        class="h-3.5 w-3.5 text-base-content/20 transition-colors duration-150 group-hover:text-primary"
                    />
                </div>
                <div :class="ADMIN_STAT_VALUE">
                    <span :class="ADMIN_NUM">{{ counter.value.toLocaleString() }}</span>
                    <span :class="ADMIN_NUM_UNIT">{{ counter.name }}</span>
                </div>
                <span
                    class="absolute inset-x-4 bottom-0 h-px origin-left scale-x-0 bg-primary transition-transform duration-200 group-hover:scale-x-100"
                    aria-hidden="true"
                />
            </component>
        </div>

        <div class="flex flex-wrap items-center gap-x-6 gap-y-1 py-2.5 text-[10.5px] text-base-content/40">
            <span class="flex items-center gap-1.5">
                <span class="h-1 w-1 bg-primary" aria-hidden="true" />
                TOTAL CONTENT
                <b class="font-orbitron text-[11px] font-semibold text-base-content/75 tabular-nums">{{ contentTotal.toLocaleString() }}</b>
            </span>
            <span>攻略 + 构筑 + 时间线</span>
            <span class="ml-auto">点任一格进入对应模块</span>
        </div>

        <p v-if="statsError" class="mt-1 flex items-center gap-1.5 text-[11px] text-error">
            <Icon icon="ri:error-warning-line" class="h-3.25 w-3.25" />
            <span>{{ statsError }}</span>
        </p>

        <!-- 模块总览：与侧栏同一套编号，把「数字台账」接到「去哪改」 -->
        <section class="mt-5">
            <div class="mb-3 flex items-center gap-3">
                <span class="font-orbitron text-[11px] font-semibold tabular-nums text-primary">15</span>
                <span class="text-[10px] font-semibold tracking-[0.28em] text-base-content/40 uppercase">Modules</span>
                <h2 class="text-[15px] font-semibold text-base-content">模块总览</h2>
                <span class="h-px flex-1 bg-base-content/10" aria-hidden="true" />
                <span class="text-[10.5px] text-base-content/35">编号与侧栏索引轨一致</span>
            </div>

            <div class="grid grid-cols-1 gap-x-6 border-y border-base-content/10 sm:grid-cols-2 xl:grid-cols-3">
                <div v-for="(group, index) in moduleGroups" :key="group.name" class="border-base-content/10 py-3" :class="index > 0 ? 'xl:border-l xl:pl-6' : ''">
                    <p class="mb-2 flex items-center gap-2 text-[9.5px] font-semibold tracking-[0.22em] text-base-content/35 uppercase">
                        {{ group.name }}
                        <span class="h-px flex-1 bg-base-content/10" aria-hidden="true" />
                        <span class="font-orbitron text-[9.5px] tabular-nums text-base-content/25">{{ group.items.length }}</span>
                    </p>
                    <button
                        v-for="item in group.items"
                        :key="item.path"
                        class="group flex w-full cursor-pointer items-center gap-2.5 border-b border-base-content/6 px-1 py-1.5 text-left transition-colors duration-150 last:border-b-0 hover:bg-primary/6"
                        @click="$router.push(item.path)"
                    >
                        <span class="w-4 shrink-0 font-orbitron text-[9.5px] tabular-nums text-base-content/30">{{ adminMenuNo(item.path) }}</span>
                        <Icon :icon="item.icon" class="h-3.5 w-3.5 shrink-0 text-base-content/45 transition-colors duration-150 group-hover:text-primary" />
                        <span class="min-w-0 flex-1 truncate text-[12.5px] text-base-content/75 transition-colors duration-150 group-hover:text-base-content">
                            {{ item.name }}
                        </span>
                        <Icon
                            icon="ri:arrow-right-s-line"
                            class="h-3.5 w-3.5 shrink-0 text-base-content/15 transition-colors duration-150 group-hover:text-primary"
                        />
                    </button>
                </div>
            </div>
        </section>

        <!-- 最近活动：连续记录流，序号 + 动作 + 时间 -->
        <section class="mt-5">
            <div class="mb-2 flex items-center gap-3">
                <span class="font-orbitron text-[11px] font-semibold tabular-nums text-primary">{{ recentActivities.length }}</span>
                <span class="text-[10px] font-semibold tracking-[0.28em] text-base-content/40 uppercase">Activity</span>
                <h2 class="text-[15px] font-semibold text-base-content">最近动作</h2>
                <span class="h-px flex-1 bg-base-content/10" aria-hidden="true" />
            </div>

            <div class="divide-y divide-base-content/[0.07] border-y border-base-content/10">
                <div
                    v-for="(activity, index) in recentActivities"
                    :key="activity.id"
                    class="flex items-center gap-3 py-2.5 transition-colors duration-150 hover:bg-base-content/4"
                >
                    <span class="w-6 shrink-0 font-orbitron text-[10px] tabular-nums text-base-content/25">
                        {{ String(index + 1).padStart(2, "0") }}
                    </span>
                    <span class="min-w-0 flex-1 truncate text-[12px] text-base-content/70">
                        <b class="font-semibold text-base-content">{{ activity.user }}</b>
                        {{ activity.action }}
                        <span class="text-base-content/85">{{ activity.target }}</span>
                    </span>
                    <span class="shrink-0 font-orbitron text-[10.5px] tabular-nums text-base-content/35">
                        {{ formatActivityTime(activity.time) }}
                    </span>
                </div>

                <div v-if="!loading && recentActivities.length === 0" :class="ADMIN_EMPTY">
                    <Icon icon="ri:inbox-line" class="h-4 w-4 text-base-content/20" />
                    <span class="text-[12px] text-base-content/45">暂无活动记录</span>
                </div>
            </div>

            <p v-if="activitiesError" class="mt-2 flex items-center gap-1.5 text-[11px] text-error">
                <Icon icon="ri:error-warning-line" class="h-3.25 w-3.25" />
                <span>{{ activitiesError }}</span>
            </p>
        </section>
    </div>
</template>