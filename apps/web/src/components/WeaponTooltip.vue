<script setup lang="ts">
import { computed } from "vue"
import { useGameText } from "@/composables/useGameText"
import type { LeveledWeapon } from "@/data"
import { formatProp } from "@/util"

const BASE_KEYS = ["基础攻击", "基础暴击", "基础暴伤", "基础触发"] as const

const AMMO_KEYS = ["基础装填", "基础弹匣", "基础弹药"] as const

/** 副信息行已覆盖，不再重复展示 */
const HIDDEN_KEYS = ["伤害类型"] as const

const props = defineProps<{
    weapon: LeveledWeapon
    link?: string
    /** 无边框版本：内嵌进 ShowProps 时顶边渲染，不与 tooltip 描边叠框 */
    bare?: boolean
    /** 未生效属性（熔炼潜能关闭时）：对应行显示删除线 */
    ineffective?: ReadonlySet<string> | readonly string[]
}>()

const { gt, gpt } = useGameText()
const detail = computed(() => props.weapon.getProperties())
const hiddenKeys = computed(() => new Set<string>([...BASE_KEYS, ...AMMO_KEYS, ...HIDDEN_KEYS]))
const extraEntries = computed(() => Object.entries(detail.value).filter(([key, val]) => val && !hiddenKeys.value.has(key)))
const hasAmmo = computed(() => AMMO_KEYS.some(key => props.weapon[key]))
const ineffectiveSet = computed(() => new Set(props.ineffective ?? []))
const effectText = computed(() => gpt(props.weapon.效果, props.weapon.精炼, { stripFirstSentence: true }))
const typeLine = computed(() => [gt(props.weapon.类型), gt(props.weapon.类别)].filter(Boolean).join(" · "))
const link = computed(() => props.link ?? `/db/weapon/${props.weapon.id}`)
const refineLabel = computed(() => (props.weapon.hasForge ? gt("熔炼") : `${gt("精炼")}${props.weapon.精炼}`))
</script>
<template>
    <div class="w-72 overflow-hidden rounded-xs bg-base-100 text-left" :class="bare ? '' : 'border border-base-content/10'">
        <div class="relative h-24 w-full overflow-hidden bg-base-content/4">
            <img :src="weapon.url" :alt="weapon.名称" class="absolute inset-0 h-full w-full object-cover" />
            <span
                class="absolute left-2 top-2 bg-base-content px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-base-100"
            >
                WEAPON
            </span>
            <span
                class="absolute right-2 top-2 border border-base-content/25 bg-base-100/60 px-1.5 py-0.5 font-mono text-[9px] tabular-nums text-base-content/70 backdrop-blur-sm"
            >
                {{ refineLabel }}
                · Lv.{{ weapon.等级 }}
            </span>
        </div>
        <div class="flex flex-col gap-2 p-3">
            <div class="text-sm font-bold">
                <SRouterLink :to="link" class="cursor-pointer hover:underline">{{ gt(weapon.名称) }}</SRouterLink>
            </div>
            <div class="text-xs font-bold text-neutral-500">{{ typeLine }}</div>
            <div class="grid grid-cols-2 gap-x-3 gap-y-1.5">
                <div v-for="key in BASE_KEYS" :key="key" class="flex items-center justify-between gap-2 text-sm">
                    <div class="whitespace-nowrap text-xs text-neutral-500" :class="{ 'line-through': ineffectiveSet.has(key) }">
                        {{ gt(key) }}
                    </div>
                    <div class="font-medium tabular-nums text-primary" :class="{ 'line-through': ineffectiveSet.has(key) }">
                        {{ formatProp(key, weapon[key]) }}
                    </div>
                </div>
            </div>
            <div v-if="hasAmmo" class="grid grid-cols-2 gap-x-3 gap-y-1.5">
                <template v-for="key in AMMO_KEYS" :key="key">
                    <div v-if="weapon[key]" class="flex items-center justify-between gap-2 text-sm">
                    <div class="whitespace-nowrap text-xs text-neutral-500">{{ gt(key) }}</div>
                    <div class="font-medium tabular-nums text-primary">{{ formatProp(key, weapon[key]) }}</div>
                    </div>
                </template>
            </div>
            <div v-for="[key, val] in extraEntries" :key="key" class="flex items-center justify-between gap-2 text-sm">
                <div class="whitespace-nowrap text-xs text-neutral-500" :class="{ 'line-through': ineffectiveSet.has(key) }">
                    {{ gt(key) }}
                </div>
                <div class="font-medium text-primary" :class="{ 'line-through': ineffectiveSet.has(key) }">
                    {{ formatProp(key, val) }}
                </div>
            </div>
            <div v-if="weapon.射速 || weapon.基础弹匣" class="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-base-content/45">
                <span v-if="weapon.射速">{{ gt("射速") }} <span class="font-mono tabular-nums">{{ weapon.射速 }}/s</span></span>
                <span v-if="weapon.基础弹匣">{{ gt("弹匣") }} <span class="font-mono tabular-nums">{{ weapon.基础弹匣 }}</span></span>
                <span v-if="weapon.弹道类型">{{ gt(weapon.弹道类型) }}</span>
            </div>
            <div v-if="effectText" class="text-xs leading-5 text-neutral-500">{{ effectText }}</div>
            <div v-if="weapon.描述" class="text-[11px] leading-5 text-base-content/40">{{ gt(weapon.描述) }}</div>
        </div>
    </div>
</template>
