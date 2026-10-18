<script setup lang="ts">
import { computed } from "vue"
import { useGameText } from "@/composables/useGameText"
import type { LeveledChar } from "@/data"
import { formatProp } from "@/util"
import { getElementSoftBgClass } from "@/utils/element-utils"

const BASE_KEYS = ["基础攻击", "基础生命", "基础护盾", "基础防御"] as const

const props = defineProps<{
    char: LeveledChar
    link?: string
    /** 无边框版本：内嵌进 ShowProps 时顶边渲染，不与 tooltip 描边叠框 */
    bare?: boolean
    /** 精通行覆盖：缺省时用角色自身的精通 + 额外精通 */
    mastery?: string[]
}>()

const { gt } = useGameText()
const detail = computed(() => props.char.getProperties())
const extraEntries = computed(() =>
    Object.entries(detail.value).filter(([key, val]) => val && !(BASE_KEYS as readonly string[]).includes(key))
)
const masteryLine = computed(() =>
    (props.mastery ?? [...(props.char.精通 ?? []), ...(props.char.额外精通 ?? [])]).map(gt).filter(Boolean).join(" · ")
)
const link = computed(() => props.link ?? `/db/char/${props.char.id}`)
</script>
<template>
    <div class="w-72 overflow-hidden rounded-xs bg-base-100 text-left" :class="bare ? '' : 'border border-base-content/10'">
        <div class="relative h-28 w-full overflow-hidden" :class="getElementSoftBgClass(char.属性) || 'bg-base-content/4'">
            <img :src="char.url" :alt="char.名称" class="absolute inset-0 h-full w-full object-cover" />
            <span
                class="absolute left-2 top-2 bg-base-content px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-base-100"
            >
                CHAR
            </span>
            <span
                class="absolute right-2 top-2 border border-base-content/25 bg-base-100/60 px-1.5 py-0.5 font-mono text-[9px] tabular-nums text-base-content/70 backdrop-blur-sm"
            >
                Lv.{{ char.等级 }}
            </span>
        </div>
        <div class="flex flex-col gap-2 p-3">
            <div class="flex items-center gap-2">
                <img :src="char.elementUrl" :alt="char.属性" class="size-5 shrink-0 object-contain" />
                <div class="min-w-0 flex-1">
                    <div class="truncate text-sm font-bold">
                        <SRouterLink :to="link" class="cursor-pointer hover:underline">{{ gt(char.名称) }}</SRouterLink>
                    </div>
                    <div class="truncate text-[11px] text-base-content/45">{{ gt(`${char.属性}属性`) }}</div>
                </div>
            </div>
            <div v-if="masteryLine" class="text-xs text-neutral-500">{{ masteryLine }}</div>
            <div class="grid grid-cols-2 gap-x-3 gap-y-1.5">
                <div v-for="key in BASE_KEYS" :key="key" class="flex items-center justify-between gap-2 text-sm">
                    <div class="whitespace-nowrap text-xs text-neutral-500">{{ gt(key) }}</div>
                    <div class="font-medium tabular-nums text-primary">{{ formatProp(key, char[key as keyof typeof char]) }}</div>
                </div>
            </div>
            <div v-for="[ key, val ] in extraEntries" :key="key" class="flex items-center justify-between gap-2 text-sm">
                <div class="whitespace-nowrap text-xs text-neutral-500">{{ gt(key) }}</div>
                <div class="font-medium text-primary">{{ formatProp(key, val) }}</div>
            </div>
            <div v-if="char.阵营" class="text-[11px] text-base-content/45">{{ gt(char.阵营) }}</div>
        </div>
    </div>
</template>
