<script setup lang="ts">
import { ref, watchEffect } from "vue"
import gsap from "gsap"
import { useTranslation } from "i18next-vue"
import SidebarButton from "./SidebarButton.vue"
import { useState } from "../util"
import { useUIStore } from "../store/ui"

const { t } = useTranslation()
const target = ref<HTMLDivElement | null>(null)
const mobileDrawerOpen = ref(false)

const UI = useUIStore()
const [expand, setExpand] = useState(UI, "sidebarExpand")
watchEffect(() => {
    if (target.value) gsap.to(target.value, { duration: 0.3, width: expand.value ? "13rem" : "3.5rem", ease: "back" })
})

function closeMobileDrawer() {
    mobileDrawerOpen.value = false
}
</script>
<template>
    <!-- 桌面端侧边栏 -->
    <div class="h-full hidden sm:flex">
        <div ref="target" class="flex flex-col space-y-1 py-2 px-2 h-full">
            <button
                class="w-full btn btn-ghost border-none justify-start min-h-fit h-auto flex-nowrap whitespace-nowrap px-0 gap-1 overflow-hidden"
                @click="setExpand(!expand)"
            >
                <span
                    class="flex-none w-10 h-8 items-center justify-center text-lg text-base-content/50 swap swap-flip"
                    :class="{ 'swap-active': expand }"
                >
                    <Icon icon="tabler:arrow-bar-to-left" class="swap-on" />
                    <Icon icon="tabler:arrow-bar-to-right" class="swap-off" />
                </span>
                <div class="font-medium text-xs text-base-content/50 leading-none">
                    {{ t("main.btn_collapse_menu") }}
                </div>
            </button>
            <template v-for="tab in UI.tabs" :key="tab.name">
                <SidebarButton v-if="tab.name && tab.show !== false" :to="tab.path" :tooltip="t(`${tab.name}.title`)">
                    <Icon v-if="tab.icon" :icon="tab.icon" />
                    <span v-else>{{ t(`${tab.name}.title`) }}</span>
                </SidebarButton>
            </template>
            <div class="flex-1" data-tauri-drag-region></div>
            <SidebarButton to="/login" :tooltip="t(`login.title`)">
                <Icon icon="la:user" />
            </SidebarButton>
            <SidebarButton to="/setting" :tooltip="t(`setting.title`)">
                <Icon icon="ri:settings-3-line" />
            </SidebarButton>
        </div>
    </div>

    <!-- 移动端抽屉式导航 - 使用daisyUI drawer -->
    <div class="sm:hidden">
        <!-- daisyUI drawer -->
        <input id="my-drawer-1" type="checkbox" class="drawer-toggle" v-model="mobileDrawerOpen" />
        <div class="drawer-side z-50">
            <!-- 抽屉头部 -->
            <label for="my-drawer-1" aria-label="close sidebar" class="drawer-overlay"></label>
            <ul class="menu bg-base-100 min-h-full w-72 p-4">
                <li>
                    <h2 class="menu-title text-lg font-bold pb-2">DNA Builder</h2>
                </li>
                <li><div class="divider my-2"></div></li>
                <!-- 导航菜单 -->
                <template v-for="tab in UI.tabs" :key="tab.name">
                    <li v-if="tab.name && tab.show !== false && tab.path">
                        <RouterLink
                            :to="tab.path"
                            @click="closeMobileDrawer"
                            class="flex items-center gap-3 p-3 rounded-lg hover:bg-base-200 transition-colors"
                        >
                            <Icon v-if="tab.icon" :icon="tab.icon" class="w-6 h-6" />
                            <span class="font-medium">{{ t(`${tab.name}.title`) }}</span>
                        </RouterLink>
                    </li>
                </template>
                <li><div class="divider my-2"></div></li>
                <!-- 底部操作 -->
                <li>
                    <RouterLink
                        to="/login"
                        @click="closeMobileDrawer"
                        class="flex items-center gap-3 p-3 rounded-lg hover:bg-base-200 transition-colors"
                    >
                        <Icon icon="la:user" class="w-6 h-6" />
                        <span class="font-medium">{{ t(`login.title`) }}</span>
                    </RouterLink>
                </li>
                <li>
                    <RouterLink
                        to="/setting"
                        @click="closeMobileDrawer"
                        class="flex items-center gap-3 p-3 rounded-lg hover:bg-base-200 transition-colors"
                    >
                        <Icon icon="ri:settings-3-line" class="w-6 h-6" />
                        <span class="font-medium">{{ t(`setting.title`) }}</span>
                    </RouterLink>
                </li>
            </ul>
        </div>

        <!-- 移动端菜单按钮 -->
        <label for="my-drawer-1" class="fixed bottom-4 left-4 z-50 btn btn-circle btn-primary shadow-lg drawer-button">
            <Icon icon="ri:settings-3-line" class="w-6 h-6" />
        </label>
    </div>
</template>
