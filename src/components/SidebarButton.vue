<script setup lang="ts">
import { computed } from "vue"
import { RouterLink } from "vue-router"
import { useUIStore } from "../store/ui"

defineOptions({
    inheritAttrs: false,
})

const props = defineProps({
    // @ts-expect-error 内部属性 不需要类型检查
    ...RouterLink.props,
    tooltip: String,
    to: String,
})

const isExternalLink = computed(() => {
    return typeof props.to === "string" && props.to.startsWith("http")
})
const UI = useUIStore()
</script>
<template>
    <a v-if="isExternalLink" v-bind="$attrs" :href="props.to" target="_blank">
        <slot />
    </a>
    <router-link v-else v-slot="{ isActive, href, navigate }" v-bind="$props" :to="props.to" custom>
        <button
            class="w-full btn border-none justify-start min-h-fit h-fit flex-nowrap whitespace-nowrap px-0 gap-1"
            :class="isActive ? 'btn-secondary' : 'btn-ghost'"
            v-bind="$attrs"
            :href="href"
            @click="navigate"
        >
            <div class="flex flex-none w-10 h-10 items-center justify-center text-xl">
                <slot />
            </div>
            <div class="font-medium leading-none transition-opacity duration-200" :class="UI.sidebarExpand ? 'opacity-100' : 'opacity-0'">
                {{ props.tooltip }}
            </div>
        </button>
    </router-link>
</template>
