<script setup lang="ts">
// 后台管理首页组件
// 用于管理server中的数据
import { ref } from "vue"

// 统计数据
const stats = ref({
    totalUsers: 1234,
    totalGuides: 567,
    totalRooms: 89,
    totalMessages: 12345,
})

// 最近活动
const recentActivities = ref([
    { id: 1, user: "管理员", action: "删除了用户", target: "test@example.com", time: "2分钟前" },
    { id: 2, user: "管理员", action: "添加了攻略", target: "新角色攻略", time: "15分钟前" },
    { id: 3, user: "系统", action: "服务重启", target: "API服务", time: "1小时前" },
    { id: 4, user: "用户", action: "登录系统", target: "user@example.com", time: "2小时前" },
])
</script>

<template>
    <div class="animate-fadeIn p-6">
        <!-- 统计卡片 -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <!-- 用户数量 -->
            <div
                class="bg-gradient-to-br from-white to-blue-50 rounded-2xl shadow-md border border-gray-100 p-6 hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1"
            >
                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-sm font-medium text-gray-500">总用户数</p>
                        <h3 class="text-3xl font-bold text-gray-800 mt-1">{{ stats.totalUsers }}</h3>
                    </div>
                    <div
                        class="w-14 h-14 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-xl flex items-center justify-center shadow-sm"
                    >
                        <span class="text-blue-600 text-2xl ri:user-line"></span>
                    </div>
                </div>
                <div class="mt-4 flex items-center text-sm">
                    <span class="text-green-500 font-medium flex items-center">
                        <span class="ri:arrow-up-right-line mr-1"></span>
                        12.5%
                    </span>
                    <span class="text-gray-500 ml-2">较上月</span>
                </div>
            </div>

            <!-- 攻略数量 -->
            <div
                class="bg-gradient-to-br from-white to-green-50 rounded-2xl shadow-md border border-gray-100 p-6 hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1"
            >
                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-sm font-medium text-gray-500">总攻略数</p>
                        <h3 class="text-3xl font-bold text-gray-800 mt-1">{{ stats.totalGuides }}</h3>
                    </div>
                    <div
                        class="w-14 h-14 bg-gradient-to-br from-green-100 to-emerald-100 rounded-xl flex items-center justify-center shadow-sm"
                    >
                        <span class="text-green-600 text-2xl ri:book-line"></span>
                    </div>
                </div>
                <div class="mt-4 flex items-center text-sm">
                    <span class="text-green-500 font-medium flex items-center">
                        <span class="ri:arrow-up-right-line mr-1"></span>
                        8.3%
                    </span>
                    <span class="text-gray-500 ml-2">较上月</span>
                </div>
            </div>

            <!-- 房间数量 -->
            <div
                class="bg-gradient-to-br from-white to-purple-50 rounded-2xl shadow-md border border-gray-100 p-6 hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1"
            >
                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-sm font-medium text-gray-500">总房间数</p>
                        <h3 class="text-3xl font-bold text-gray-800 mt-1">{{ stats.totalRooms }}</h3>
                    </div>
                    <div
                        class="w-14 h-14 bg-gradient-to-br from-purple-100 to-violet-100 rounded-xl flex items-center justify-center shadow-sm"
                    >
                        <span class="text-purple-600 text-2xl ri:group-line"></span>
                    </div>
                </div>
                <div class="mt-4 flex items-center text-sm">
                    <span class="text-red-500 font-medium flex items-center">
                        <span class="ri:arrow-down-right-line mr-1"></span>
                        2.1%
                    </span>
                    <span class="text-gray-500 ml-2">较上月</span>
                </div>
            </div>

            <!-- 消息数量 -->
            <div
                class="bg-gradient-to-br from-white to-yellow-50 rounded-2xl shadow-md border border-gray-100 p-6 hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1"
            >
                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-sm font-medium text-gray-500">总消息数</p>
                        <h3 class="text-3xl font-bold text-gray-800 mt-1">{{ stats.totalMessages }}</h3>
                    </div>
                    <div
                        class="w-14 h-14 bg-gradient-to-br from-yellow-100 to-amber-100 rounded-xl flex items-center justify-center shadow-sm"
                    >
                        <span class="text-yellow-600 text-2xl ri:chat-3-line"></span>
                    </div>
                </div>
                <div class="mt-4 flex items-center text-sm">
                    <span class="text-green-500 font-medium flex items-center">
                        <span class="ri:arrow-up-right-line mr-1"></span>
                        15.2%
                    </span>
                    <span class="text-gray-500 ml-2">较上月</span>
                </div>
            </div>
        </div>

        <!-- 最近活动和系统状态 -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <!-- 最近活动 -->
            <div
                class="lg:col-span-2 bg-white rounded-2xl shadow-md border border-gray-100 p-6 hover:shadow-lg transition-all duration-300"
            >
                <div class="flex items-center justify-between mb-6">
                    <h3 class="text-xl font-semibold text-gray-800">最近活动</h3>
                    <a href="#" class="text-sm text-blue-600 hover:text-blue-800 transition-colors flex items-center gap-1 group">
                        <span>查看全部</span>
                        <span class="ri:arrow-right-line group-hover:translate-x-1 transition-transform"></span>
                    </a>
                </div>
                <div class="space-y-4">
                    <div
                        v-for="activity in recentActivities"
                        :key="activity.id"
                        class="flex gap-4 p-4 rounded-xl hover:bg-gray-50 transition-all duration-200 shadow-sm hover:shadow-md"
                    >
                        <div
                            class="w-12 h-12 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm"
                        >
                            <span class="text-blue-600 text-lg ri:user-line"></span>
                        </div>
                        <div class="flex-1 min-w-0">
                            <p class="text-sm text-gray-800">
                                <span class="font-medium text-blue-600">{{ activity.user }}</span>
                                {{ activity.action }}
                                <span class="font-medium">{{ activity.target }}</span>
                            </p>
                            <p class="text-xs text-gray-500 mt-1 flex items-center gap-1">
                                <span class="ri:time-line"></span>
                                {{ activity.time }}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 系统状态 -->
            <div class="bg-white rounded-2xl shadow-md border border-gray-100 p-6 hover:shadow-lg transition-all duration-300">
                <h3 class="text-xl font-semibold text-gray-800 mb-6">系统状态</h3>
                <div class="space-y-6">
                    <!-- 服务状态 -->
                    <div>
                        <div class="flex items-center justify-between mb-2">
                            <p class="text-sm font-medium text-gray-700">服务状态</p>
                            <span
                                class="inline-flex items-center px-4 py-1.5 rounded-full text-xs font-medium bg-green-100 text-green-800 shadow-sm"
                            >
                                <span class="w-2.5 h-2.5 bg-green-500 rounded-full mr-2 animate-pulse"></span>
                                运行中
                            </span>
                        </div>
                        <div class="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                            <div
                                class="bg-gradient-to-r from-green-400 to-emerald-500 h-full rounded-full animate-pulse"
                                style="width: 100%"
                            ></div>
                        </div>
                    </div>

                    <!-- 数据库连接 -->
                    <div>
                        <div class="flex items-center justify-between mb-2">
                            <p class="text-sm font-medium text-gray-700">数据库连接</p>
                            <span
                                class="inline-flex items-center px-4 py-1.5 rounded-full text-xs font-medium bg-green-100 text-green-800 shadow-sm"
                            >
                                <span class="w-2.5 h-2.5 bg-green-500 rounded-full mr-2 animate-pulse"></span>
                                已连接
                            </span>
                        </div>
                        <div class="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                            <div
                                class="bg-gradient-to-r from-green-400 to-emerald-500 h-full rounded-full animate-pulse"
                                style="width: 100%"
                            ></div>
                        </div>
                    </div>

                    <!-- API响应时间 -->
                    <div>
                        <div class="flex items-center justify-between mb-2">
                            <p class="text-sm font-medium text-gray-700">API响应时间</p>
                            <span class="text-sm font-medium text-green-600">23ms</span>
                        </div>
                        <div class="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                            <div class="bg-gradient-to-r from-green-400 to-emerald-500 h-full rounded-full" style="width: 95%"></div>
                        </div>
                    </div>

                    <!-- 内存使用 -->
                    <div>
                        <div class="flex items-center justify-between mb-2">
                            <p class="text-sm font-medium text-gray-700">内存使用</p>
                            <span class="text-sm font-medium text-yellow-600">65%</span>
                        </div>
                        <div class="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                            <div class="bg-gradient-to-r from-yellow-400 to-amber-500 h-full rounded-full" style="width: 65%"></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
