<script setup lang="ts">
/**
 * 后台管理布局：编号索引轨 + 内容区。
 * 菜单定义在 admin-menu.ts（与首页模块总览共用），编号即压平顺序；
 * 主色只用于当前项：左侧竖条 + 编号 + 文字。
 */
import { computed, ref } from "vue"
import { useRoute, useRouter } from "vue-router"
import { useUIStore } from "@/store/ui"
import { useUserStore } from "@/store/user"
import { ADMIN_MENU_FLAT, ADMIN_MENU_GROUPS, adminMenuNo } from "./admin-menu"

const route = useRoute()
const router = useRouter()
const user = useUserStore()
const ui = useUIStore()
const collapsed = ref(false)

/** 当前路由对应的菜单项（子路径也归属到所属模块） */
const activeItem = computed(() => {
    const matched = [...ADMIN_MENU_FLAT].filter(item => item.path !== "/admin").sort((a, b) => b.path.length - a.path.length)
    return matched.find(item => route.path === item.path || route.path.startsWith(`${item.path}/`)) ?? ADMIN_MENU_FLAT[0]
})

/** 当前管理员展示名（未登录时显示占位） */
const adminName = computed(() => user.name || user.email || "未登录")

function navigateTo(path: string) {
    router.push(path)
}

/**
 * @description 复制当前管理员 ID：后台按 ID 发货 / 排查时最常用的一次复制。
 */
async function copyAdminId() {
    const id = user.id || ""
    if (!id) {
        ui.showErrorMessage("当前登录信息里没有用户 ID")
        return
    }
    try {
        await navigator.clipboard.writeText(id)
        ui.showSuccessMessage("已复制用户 ID")
    } catch {
        ui.showErrorMessage("复制失败，请手动选中复制")
    }
}
</script>

<template>
    <div class="flex h-full w-full flex-col bg-base-300">
        <header class="flex h-12 shrink-0 items-center gap-3 border-b border-base-content/10 bg-base-100 px-4">
            <button
                class="grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-xs text-base-content/55 transition-colors duration-150 hover:bg-base-content/5 hover:text-primary"
                aria-label="切换菜单"
                @click="collapsed = !collapsed"
            >
                <Icon :icon="collapsed ? 'ri:menu-unfold-line' : 'ri:menu-fold-line'" class="h-4.25 w-4.25" />
            </button>
            <span class="h-4 w-px bg-base-content/15" aria-hidden="true" />
            <span class="flex items-center gap-1 font-orbitron text-[12px] font-semibold leading-none text-primary">
                ADMIN
                <span class="text-[9.5px] text-primary/50">/</span>
            </span>
            <nav class="flex min-w-0 items-center gap-2 text-[12.5px]">
                <button class="shrink-0 cursor-pointer text-base-content/45 transition-colors duration-150 hover:text-primary" @click="navigateTo('/admin')">
                    后台
                </button>
                <Icon icon="ri:arrow-right-s-line" class="h-3.5 w-3.5 shrink-0 text-base-content/20" />
                <span class="truncate font-semibold text-base-content">{{ activeItem?.name || "后台管理" }}</span>
                <span class="hidden shrink-0 font-orbitron text-[10px] tabular-nums text-base-content/30 sm:inline">
                    {{ activeItem ? adminMenuNo(activeItem.path) : "--" }}
                </span>
            </nav>
            <div class="ml-auto flex items-center gap-2 text-[11px] text-base-content/45">
                <span class="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
                <span class="max-w-40 truncate">{{ adminName }}</span>
                <span class="h-4 w-px bg-base-content/15" aria-hidden="true" />
                <button
                    class="inline-flex cursor-pointer items-center gap-1 rounded-xs px-1 py-0.5 text-base-content/45 transition-colors duration-150 hover:bg-base-content/5 hover:text-primary"
                    title="复制用户 ID"
                    @click="copyAdminId"
                >
                    <Icon icon="ri:file-copy-line" class="h-3.25 w-3.25" />
                    <span class="hidden font-orbitron text-[10px] tabular-nums md:inline">{{ user.id ? user.id.slice(0, 8) : "—" }}</span>
                </button>
            </div>
        </header>

        <div class="flex min-h-0 flex-1">
            <aside
                class="flex shrink-0 flex-col border-r border-base-content/10 bg-base-100 transition-[width] duration-200 ease-out"
                :class="collapsed ? 'w-14' : 'w-56'"
            >
                <ScrollArea class="h-full">
                    <nav class="py-2">
                        <template v-for="group in ADMIN_MENU_GROUPS" :key="group.name">
                            <p
                                v-if="!collapsed"
                                class="mt-3 mb-1 flex items-center gap-2 px-3 text-[9.5px] font-semibold tracking-[0.24em] text-base-content/30 uppercase first:mt-0"
                            >
                                {{ group.name }}
                                <span class="h-px flex-1 bg-base-content/10" aria-hidden="true" />
                            </p>
                            <span v-else class="mx-3 my-2 block h-px bg-base-content/10" aria-hidden="true" />
                            <button
                                v-for="item in group.items"
                                :key="item.path"
                                :title="collapsed ? item.name : undefined"
                                class="relative flex w-full cursor-pointer items-center gap-2.5 py-1.5 pr-3 pl-3 text-left text-[12.5px] transition-colors duration-150"
                                :class="
                                    activeItem?.path === item.path
                                        ? 'bg-primary/8 font-semibold text-base-content'
                                        : 'text-base-content/65 hover:bg-base-content/5 hover:text-base-content'
                                "
                                @click="navigateTo(item.path)"
                            >
                                <span
                                    v-if="activeItem?.path === item.path"
                                    class="absolute inset-y-0 left-0 w-0.5 bg-primary"
                                    aria-hidden="true"
                                />
                                <span
                                    class="w-4 shrink-0 font-orbitron text-[9.5px] tabular-nums"
                                    :class="activeItem?.path === item.path ? 'text-primary' : 'text-base-content/30'"
                                >
                                    {{ adminMenuNo(item.path) }}
                                </span>
                                <Icon :icon="item.icon" class="h-3.75 w-3.75 shrink-0 opacity-80" />
                                <span v-if="!collapsed" class="min-w-0 flex-1 truncate">{{ item.name }}</span>
                            </button>
                        </template>
                    </nav>
                </ScrollArea>
                <div v-if="!collapsed" class="shrink-0 border-t border-base-content/10 px-3 py-2 text-[10px] tracking-wide text-base-content/30">
                    {{ ADMIN_MENU_FLAT.length }} 个模块 · {{ ADMIN_MENU_GROUPS.length }} 组
                </div>
            </aside>

            <ScrollArea class="min-w-0 flex-1">
                <router-view />
            </ScrollArea>
        </div>
    </div>
</template>
