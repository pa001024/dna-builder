<script setup lang="ts">
import type { RouteLocationRaw } from "vue-router"
import { openSChat } from "@/api/swindow"
import { env } from "@/env"

// 定义props
const props = defineProps<{
    to: RouteLocationRaw
    replace?: boolean
    activeClass?: string
    exactActiveClass?: string
    ariaCurrentValue?: string
}>()

// 继承RouterLink的所有emits
defineEmits(["click"])

function handleClick(event: MouseEvent, navigate: Function) {
    if (event.ctrlKey && env.isApp) {
        // 如果按住了Ctrl键，阻止默认导航行为，打开新窗口
        event.preventDefault()
        // 获取当前点击元素的href属性值
        const to = event.currentTarget as HTMLElement
        const href = to.getAttribute("href")?.replace("#", "") || ""
        // 调用openSChat函数打开新窗口
        openSChat(href)
    } else {
        // 否则执行默认导航
        navigate(event)
    }
}
defineOptions({ inheritAttrs: false })
</script>

<template>
    <router-link
        v-slot="{ isActive, href, navigate }"
        :to="to"
        :replace="replace"
        :active-class="activeClass"
        :exact-active-class="exactActiveClass"
        :aria-current-value="ariaCurrentValue"
        custom
    >
        <a :href="href" :class="isActive ? activeClass || 'active' : ''" @click="e => handleClick(e, navigate)" v-bind="$attrs">
            <slot />
        </a>
    </router-link>
</template>
