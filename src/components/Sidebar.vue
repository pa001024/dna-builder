<script setup lang="ts">
import { ref, watchEffect } from "vue"
import gsap from "gsap"
import { useTranslation } from "i18next-vue"
import SidebarButton from "./SidebarButton.vue"
import { useState } from "../util"
import { useUIStore } from "../store/ui"

const { t } = useTranslation()
const target = ref<HTMLDivElement | null>(null)

const UI = useUIStore()
const [expand, setExpand] = useState(UI, "sidebarExpand")
watchEffect(() => {
    if (target.value) gsap.to(target.value, { duration: 0.3, width: expand.value ? "13rem" : "3.5rem", ease: "back" })
})
</script>
<template>
    <div class="flex h-full">
        <div ref="target" class="flex flex-col space-y-1 py-2 px-2 h-full">
            <button class="w-full btn btn-ghost border-none justify-start min-h-fit h-auto flex-nowrap whitespace-nowrap px-0 gap-1 overflow-hidden" @click="setExpand(!expand)">
                <span class="flex-none w-10 h-8 items-center justify-center text-lg text-base-content/50 swap swap-flip" :class="{ 'swap-active': expand }">
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
                <div v-else-if="tab.show !== false" class="flex-1" data-tauri-drag-region></div>
            </template>
        </div>
    </div>
</template>
