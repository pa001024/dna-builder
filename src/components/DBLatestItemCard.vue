<script lang="ts" setup>
import { computed } from "vue"
import { useRouter } from "vue-router"
import { LeveledCharHelper, LeveledMod, LeveledWeaponHelper } from "@/data"
import type { Char, Mod, Weapon } from "@/data/data-types"

export type DBLatestItemKind = "char" | "weapon" | "mod"

export type DBLatestItem = { kind: "char"; item: Char } | { kind: "weapon"; item: Weapon } | { kind: "mod"; item: Mod }

const props = defineProps<{
    entry: DBLatestItem
}>()

const router = useRouter()

/**
 * 元素属性对应的强调色，用于卡片上的元素小方块。
 */
const elementColors: Record<string, string> = {
    光: "#f59e0b",
    暗: "#6b7280",
    水: "#3b82f6",
    火: "#ef4444",
    雷: "#8b5cf6",
    风: "#10b981",
}

/**
 * 元素属性对应的图像区淡渐变背景（仅角色与魔之楔使用）。
 */
const elementBgClasses: Record<string, string> = {
    光: "bg-linear-to-b from-yellow-500/25 to-yellow-100/10",
    暗: "bg-linear-to-b from-gray-600/25 to-gray-200/10",
    水: "bg-linear-to-b from-blue-500/25 to-blue-100/10",
    火: "bg-linear-to-b from-red-500/25 to-red-100/10",
    雷: "bg-linear-to-b from-violet-500/25 to-violet-100/10",
    风: "bg-linear-to-b from-emerald-500/25 to-emerald-100/10",
}

/**
 * 魔之楔品质对应的图像区淡渐变背景。
 */
const rarityBgClasses: Record<string, string> = {
    白: "bg-linear-to-b from-gray-400/25 to-gray-100/10",
    绿: "bg-linear-to-b from-green-500/25 to-green-100/10",
    蓝: "bg-linear-to-b from-blue-500/25 to-blue-100/10",
    紫: "bg-linear-to-b from-purple-500/25 to-purple-100/10",
    金: "bg-linear-to-b from-yellow-500/25 to-yellow-100/10",
    红: "bg-linear-to-b from-red-500/25 to-red-100/10",
}

/** 类型角标文字（CHAR / WEAPON / MOD） */
const kindLabel = computed(() => {
    return ({ char: "CHAR", weapon: "WEAPON", mod: "MOD" } as const)[props.entry.kind]
})

/** 物品名称 */
const name = computed(() => {
    return props.entry.item.名称
})

/** 版本角标文字，如 v1.5 */
const version = computed(() => {
    return props.entry.item.版本 ? `v${props.entry.item.版本}` : ""
})

/** 图标地址，按类型走各自的图片工具 */
const iconUrl = computed(() => {
    if (props.entry.kind === "char") {
        return LeveledCharHelper.idToUrl(props.entry.item.id)
    }
    if (props.entry.kind === "weapon") {
        return LeveledWeaponHelper.idToUrl(props.entry.item.id)
    }
    return LeveledMod.url(props.entry.item.icon)
})

/** 图像区背景：角色按元素、魔之楔按品质、武器用中性底 */
const imageBgClass = computed(() => {
    if (props.entry.kind === "char") {
        return elementBgClasses[props.entry.item.属性] || ""
    }
    if (props.entry.kind === "mod") {
        return rarityBgClasses[props.entry.item.品质] || ""
    }
    return "bg-base-content/4"
})

/** 副信息：角色为“属性 · 精通”，武器为“类型 · 伤害类型”，魔之楔为“系列 · 类型” */
const meta = computed(() => {
    if (props.entry.kind === "char") {
        return [props.entry.item.属性, props.entry.item.精通?.[0]].filter(Boolean).join(" · ")
    }
    if (props.entry.kind === "weapon") {
        return [props.entry.item.类型[0], props.entry.item.伤害类型].filter(Boolean).join(" · ")
    }
    return [props.entry.item.系列, props.entry.item.类型].filter(Boolean).join(" · ")
})

/** 元素强调色（仅角色与魔之楔） */
const accent = computed(() => {
    if (props.entry.kind === "char") {
        return elementColors[props.entry.item.属性]
    }
    if (props.entry.kind === "mod") {
        return props.entry.item.属性 ? elementColors[props.entry.item.属性] : undefined
    }
    return undefined
})

/** 详情页路由 */
const targetPath = computed(() => {
    if (props.entry.kind === "char") {
        return `/db/char/${props.entry.item.id}`
    }
    if (props.entry.kind === "weapon") {
        return `/db/weapon/${props.entry.item.id}`
    }
    return `/db/mod/${props.entry.item.id}`
})
</script>

<template>
    <!-- 外层卡片语言：直角细边框 + 半透明毛玻璃底，hover 主色描边轻浮起 -->
    <button
        type="button"
        class="group flex w-full cursor-pointer flex-col overflow-hidden rounded-xs border border-base-content/10 bg-base-100/60 text-left backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[0.98]"
        @click="router.push(targetPath)"
    >
        <div class="relative aspect-4/3 w-full overflow-hidden" :class="imageBgClass">
            <img
                :src="iconUrl"
                :alt="name"
                class="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-110"
            />

            <span
                class="absolute left-2 top-2 bg-base-content px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-base-100"
            >
                {{ kindLabel }}
            </span>

            <span
                v-if="version"
                class="absolute right-2 top-2 border border-base-content/25 bg-base-100/60 px-1.5 py-0.5 font-mono text-[9px] tracking-[0.12em] text-base-content/70 backdrop-blur-sm"
            >
                {{ version }}
            </span>
        </div>

        <div class="flex flex-1 flex-col gap-1 p-2.5">
            <h4 class="truncate text-sm font-semibold text-base-content transition-colors duration-200 group-hover:text-primary">
                {{ name }}
            </h4>
            <div class="flex items-center gap-1.5 text-[10px] text-base-content/45">
                <span v-if="accent" class="size-1.5 shrink-0" :style="{ backgroundColor: accent }" />
                <span class="truncate">{{ meta }}</span>
            </div>
        </div>
    </button>
</template>
