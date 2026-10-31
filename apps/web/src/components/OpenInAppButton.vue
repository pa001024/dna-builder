<script setup lang="ts">
import { useTranslation } from "i18next-vue"
import { computed } from "vue"
import { env } from "@/env"
import { deepLinkFor, deepLinkPathFor } from "@/utils/deep-link"
import type { IconTypes } from "./Icon.vue"

const props = withDefaults(
    defineProps<{
        /** 内容类型：build（分享构筑）/ graph（分享节点图）/ dye（染色方案，缺 id 时指向画廊）。 */
        kind?: "build" | "graph" | "dye"
        /** 内容 id（路由 params 可直传，数组取首个；dye 可省略）。 */
        id?: string | number | string[] | null
        /** 显式深链（覆盖 kind/id，仅接受 `dobapp:` 开头）。 */
        to?: string
        /** 前置图标，缺省为外链图标。 */
        icon?: IconTypes
        /** 图标尺寸类，调用方按所在工具栏口径覆盖（如 `size-5 sm:size-4`）。 */
        iconClass?: string
    }>(),
    { icon: "ri:external-link-line", iconClass: "size-4" }
)

const { t } = useTranslation()

/** Web 端可点的深链：桌面端（App 内）不渲染；拼不出或非深链时也不渲染。 */
const href = computed(() => {
    const explicit = props.to?.trim()
    if (explicit) {
        return deepLinkPathFor(explicit) ? explicit : null
    }
    return deepLinkFor(props.kind, props.id)
})

const visible = computed(() => !env.isApp && !!href.value)
const label = computed(() => t("deep-link.open_in_app"))
</script>

<template>
    <a v-if="visible" :href="href!" :title="label" class="inline-flex cursor-pointer items-center gap-1">
        <Icon :icon="icon" :class="iconClass" />
        <span><slot>{{ label }}</slot></span>
    </a>
</template>
