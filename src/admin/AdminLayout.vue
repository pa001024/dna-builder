<script setup lang="ts">
/**
 * 后台管理布局组件
 * 实现页内菜单控制，显示admin下其他页面
 */
import { computed, ref } from "vue"
import { useRoute, useRouter } from "vue-router"
import { IconTypes } from "@/components/Icon.vue"

// 定义菜单选项
const menuItems: {
    name: string
    path: string
    icon: IconTypes
}[] = [
    {
        name: "首页",
        path: "/admin",
        icon: "ri:line-chart-line",
    },
    {
        name: "用户管理",
        path: "/admin/user",
        icon: "ri:team-line",
    },
    {
        name: "攻略管理",
        path: "/admin/guide",
        icon: "ri:book-line",
    },
    {
        name: "房间管理",
        path: "/admin/room",
        icon: "ri:home-line",
    },
    {
        name: "待办管理",
        path: "/admin/todo",
        icon: "ri:checkbox-circle-line",
    },
    {
        name: "构筑管理",
        path: "/admin/build",
        icon: "ri:hammer-line",
    },
    {
        name: "时间线管理",
        path: "/admin/timeline",
        icon: "ri:timeline-view",
    },
    {
        name: "脚本管理",
        path: "/admin/script",
        icon: "ri:code-s-slash-line",
    },
]

const route = useRoute()
const router = useRouter()
const collapsed = ref(false)

// 计算当前激活的菜单
const activeMenu = computed(() => {
    return menuItems.find(item => route.path === item.path)?.path || "/admin"
})

// 切换菜单折叠状态
const toggleCollapse = () => {
    collapsed.value = !collapsed.value
}

// 导航到指定路由
const navigateTo = (path: string) => {
    router.push(path)
}
</script>

<template>
    <div class="h-full w-full bg-base-200 flex flex-col">
        <!-- 顶部导航栏 -->
        <header class="bg-base-100 border-b border-base-300 px-4 py-3 flex items-center justify-between shadow-sm">
            <div class="flex items-center gap-3">
                <button class="btn btn-circle btn-ghost" aria-label="切换菜单" @click="toggleCollapse">
                    <Icon :icon="collapsed ? 'ri:menu-unfold-line' : 'ri:menu-fold-line'" />
                </button>
                <h1 class="text-xl font-bold text-base-content">后台管理</h1>
            </div>
            <div class="flex items-center gap-2">
                <span class="text-sm text-base-content/70">管理员</span>
                <div class="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <Icon icon="ri:admin-line" class="text-primary" />
                </div>
            </div>
        </header>

        <!-- 主内容区域 -->
        <div class="flex-1 flex overflow-hidden">
            <!-- 侧边菜单 -->
            <aside :class="['bg-base-100 border-r border-base-300 transition-all duration-300 ease-in-out', collapsed ? 'w-12' : 'w-56']">
                <ScrollArea class="h-full">
                    <nav class="py-4">
                        <ul>
                            <li v-for="item in menuItems" :key="item.path" class="group">
                                <button
                                    :class="[
                                        'flex items-center gap-3 px-3 py-2 w-full transition-all duration-200 truncate',
                                        'text-left font-medium',
                                        activeMenu === item.path
                                            ? 'bg-primary/10 text-primary border-r-4 border-primary'
                                            : 'text-base-content/70 hover:bg-base-200 hover:text-base-content',
                                    ]"
                                    @click="navigateTo(item.path)"
                                >
                                    <div class="flex items-center justify-center w-6 h-6">
                                        <Icon :icon="item.icon" :size="18" />
                                    </div>
                                    <span v-if="!collapsed" class="transition-opacity duration-200">
                                        {{ item.name }}
                                    </span>
                                </button>
                            </li>
                        </ul>
                    </nav>
                </ScrollArea>
            </aside>

            <!-- 内容区域 -->
            <ScrollArea class="flex-1">
                <router-view />
            </ScrollArea>
        </div>
    </div>
</template>

<style scoped>
/* 自定义滚动条样式 */
main::-webkit-scrollbar {
    width: 8px;
}

main::-webkit-scrollbar-track {
    background: transparent;
}

main::-webkit-scrollbar-thumb {
    background: rgb(var(--primary) / 0.2);
    border-radius: 4px;
}

main::-webkit-scrollbar-thumb:hover {
    background: rgb(var(--primary) / 0.3);
}
</style>
