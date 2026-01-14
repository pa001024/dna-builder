<script setup lang="ts">
// 后台管理首页组件
// 用于管理server中的数据
import { ref, onMounted } from "vue"
import { adminStatsQuery, recentActivitiesQuery } from "@/api/query"

// 统计数据
const stats = ref({
    totalUsers: 0,
    totalGuides: 0,
    totalRooms: 0,
    totalMessages: 0,
})

// 最近活动
const recentActivities = ref<
    Array<{
        id: string
        user: string
        action: string
        target: string
        time: string
    }>
>([])

// 加载状态
const loading = ref(false)

/**
 * 加载统计数据
 */
async function loadStats() {
    try {
        const data = await adminStatsQuery({}, { requestPolicy: "network-only" })
        if (data) {
            stats.value = data
        }
    } catch (error) {
        console.error("Failed to load stats:", error)
    }
}

/**
 * 加载最近活动
 */
async function loadRecentActivities() {
    try {
        const data = await recentActivitiesQuery({ limit: 5 }, { requestPolicy: "network-only" })
        if (data) {
            recentActivities.value = data
        }
    } catch (error) {
        console.error("Failed to load recent activities:", error)
    }
}

/**
 * 加载所有数据
 */
async function loadData() {
    loading.value = true
    await Promise.all([loadStats(), loadRecentActivities()])
    loading.value = false
}

// 组件挂载时加载数据
onMounted(() => {
    loadData()
})
</script>

<template>
    <div class="animate-fadeIn p-6 bg-base-200/50 min-h-screen">
        <!-- 统计卡片 - Bento Grid 风格 -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <!-- 用户数量 -->
            <div
                class="card bg-base-100 shadow-sm border border-base-300 p-6 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 cursor-pointer group relative"
                @click="$router.push('/admin/user')"
            >
                <div class="flex items-start justify-between">
                    <div class="flex-1">
                        <p class="text-sm font-medium text-base-content/70 mb-2">总用户数</p>
                        <h3 class="text-3xl font-bold text-base-content tracking-tight">{{ stats.totalUsers }}</h3>
                    </div>
                    <div
                        class="w-14 h-14 bg-linear-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-md group-hover:shadow-xl transition-shadow duration-300"
                    >
                        <span class="text-white text-2xl">
                            <Icon icon="ri:user-line" />
                        </span>
                    </div>
                </div>
                <!-- 装饰性渐变 -->
                <div class="absolute inset-0 bg-linear-to-br from-blue-500/5 to-transparent rounded-2xl pointer-events-none"></div>
            </div>

            <!-- 攻略数量 -->
            <div
                class="card bg-base-100 shadow-sm border border-base-300 p-6 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 cursor-pointer group relative"
                @click="$router.push('/admin/guide')"
            >
                <div class="flex items-start justify-between">
                    <div class="flex-1">
                        <p class="text-sm font-medium text-base-content/70 mb-2">总攻略数</p>
                        <h3 class="text-3xl font-bold text-base-content tracking-tight">{{ stats.totalGuides }}</h3>
                    </div>
                    <div
                        class="w-14 h-14 bg-linear-to-br from-emerald-500 to-emerald-600 rounded-xl flex items-center justify-center shadow-md group-hover:shadow-xl transition-shadow duration-300"
                    >
                        <span class="text-white text-2xl">
                            <Icon icon="ri:book-line" />
                        </span>
                    </div>
                </div>
            </div>

            <!-- 房间数量 -->
            <div
                class="card bg-base-100 shadow-sm border border-base-300 p-6 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 cursor-pointer group"
            >
                <div class="flex items-start justify-between">
                    <div class="flex-1">
                        <p class="text-sm font-medium text-base-content/70 mb-2">总房间数</p>
                        <h3 class="text-3xl font-bold text-base-content tracking-tight">{{ stats.totalRooms }}</h3>
                    </div>
                    <div
                        class="w-14 h-14 bg-linear-to-br from-violet-500 to-violet-600 rounded-xl flex items-center justify-center shadow-md group-hover:shadow-xl transition-shadow duration-300"
                    >
                        <span class="text-white text-2xl">
                            <Icon icon="ri:group-line" />
                        </span>
                    </div>
                </div>
            </div>

            <!-- 消息数量 -->
            <div
                class="card bg-base-100 shadow-sm border border-base-300 p-6 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 cursor-pointer group"
            >
                <div class="flex items-start justify-between">
                    <div class="flex-1">
                        <p class="text-sm font-medium text-base-content/70 mb-2">总消息数</p>
                        <h3 class="text-3xl font-bold text-base-content tracking-tight">{{ stats.totalMessages }}</h3>
                    </div>
                    <div
                        class="w-14 h-14 bg-linear-to-br from-amber-500 to-amber-600 rounded-xl flex items-center justify-center shadow-md group-hover:shadow-xl transition-shadow duration-300"
                    >
                        <span class="text-white text-2xl">
                            <Icon icon="ri:chat-thread-line" />
                        </span>
                    </div>
                </div>
            </div>
        </div>

        <!-- 最近活动和系统状态 -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <!-- 最近活动 -->
            <div class="lg:col-span-3 card bg-base-100 shadow-sm border border-base-300 p-8 hover:shadow-md transition-all duration-300">
                <div class="flex items-center justify-between mb-6">
                    <div>
                        <h3 class="text-xl font-semibold text-base-content">最近活动</h3>
                        <p class="text-sm text-base-content/70 mt-1">系统操作日志</p>
                    </div>
                </div>
                <div class="space-y-3">
                    <div
                        v-for="activity in recentActivities"
                        :key="activity.id"
                        class="flex gap-4 p-4 rounded-xl hover:bg-base-200/50 transition-all duration-200 group cursor-pointer border border-transparent hover:border-base-300"
                    >
                        <div
                            class="w-12 h-12 bg-base-200 rounded-xl flex items-center justify-center shrink-0 group-hover:bg-base-300 transition-colors duration-200"
                        >
                            <span class="text-base-content/70 text-lg group-hover:text-primary transition-colors duration-200">
                                <Icon icon="ri:user-line" />
                            </span>
                        </div>
                        <div class="flex-1 min-w-0">
                            <p class="text-sm text-base-content/85 leading-relaxed">
                                <span class="font-semibold text-base-content">{{ activity.user }}</span>
                                {{ activity.action }}
                                <span class="font-medium text-base-content/85">{{ activity.target }}</span>
                            </p>
                            <p class="text-xs text-base-content/70 mt-1.5 flex items-center gap-1.5">
                                <span class="ri:time-line text-base-content/50"></span>
                                {{ activity.time }}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
