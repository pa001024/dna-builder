<script setup lang="ts">
import { useTranslation } from "i18next-vue"
import { HoverCardContent, HoverCardPortal, HoverCardRoot, HoverCardTrigger } from "reka-ui"
import { computed, onBeforeUnmount, ref } from "vue"
import { type LevelUpPlanKind, useLevelUpPlan } from "@/composables/useLevelUpPlan"
import { charMap, LeveledChar, LeveledMod, LeveledWeapon, modMap, weaponMap } from "@/data"
import { formatModName } from "@/data/leveled/LeveledMod"

const props = withDefaults(
    defineProps<{
        /** 养成目标种类 */
        kind: LevelUpPlanKind
        /** 角色 / 武器 / 魔之楔 id */
        id: number
        /** 魔之楔一次添加的件数 */
        count?: number
    }>(),
    { count: 1 }
)

const emit = defineEmits<{
    /** 成功加入养成计划时触发 */
    added: [kind: LevelUpPlanKind, id: number]
    /** 从养成计划移除时触发 */
    removed: [kind: LevelUpPlanKind, id: number]
}>()

const plan = useLevelUpPlan()
const { t } = useTranslation()

/** 计算器页签口径：chars / weapons / mods */
const tabMap = { char: "chars", weapon: "weapons", mod: "mods" } as const

/** hover 面板「前往计算器」的跳转地址，定位到当前种类页签 */
const jumpTo = computed(() => `/levelup?tab=${tabMap[props.kind]}`)

const isAdded = computed(() => plan.has(props.kind, props.id))

/** 刚添加的短暂成功态：按钮变色 + 飘字，1.6s 后回到常态 */
const justAdded = ref(false)
/** 刚移除的短暂反馈态：显示“已移除”，1.2s 后回到常态 */
const justRemoved = ref(false)
const burstKey = ref(0)
const burstText = ref("+1")
let resetTimer: number | null = null

onBeforeUnmount(() => {
    if (resetTimer) {
        clearTimeout(resetTimer)
        resetTimer = null
    }
})

/**
 * 短暂展示添加 / 移除反馈态，到时自动回到常态。
 * @param flag 反馈态开关
 * @param ms 展示时长（毫秒）
 */
function flash(flag: typeof justAdded, ms: number) {
    flag.value = true
    burstKey.value++
    if (resetTimer) clearTimeout(resetTimer)
    resetTimer = window.setTimeout(() => {
        justAdded.value = false
        justRemoved.value = false
        resetTimer = null
    }, ms)
}

/**
 * 点击主按钮：未添加则加入计划并播添加动画，已在计划中则移除。
 * 跳转计算器走 hover 面板里的链接。
 */
function handleClick() {
    if (isAdded.value) {
        plan.remove(props.kind, props.id)
        burstText.value = "-1"
        flash(justRemoved, 1200)
        emit("removed", props.kind, props.id)
        return
    }
    plan.add(props.kind, props.id, props.count)
    burstText.value = "+1"
    flash(justAdded, 1600)
    emit("added", props.kind, props.id)
}

const buttonClass = computed(() => {
    if (justRemoved.value) return "border-base-content/15 bg-base-content/5 text-base-content/50 hover:border-primary/50 hover:text-primary"
    if (isAdded.value || justAdded.value)
        return "border-success/50 bg-success/10 text-success hover:border-error/60 hover:bg-error/10 hover:text-error"
    return "border-base-content/15 text-base-content/60 hover:border-primary/50 hover:text-primary"
})

/** 三态文案键：移除反馈 > 已添加 > 添加 */
const labelKey = computed(() =>
    justRemoved.value ? "levelup-plan.removed" : isAdded.value || justAdded.value ? "levelup-plan.added" : "levelup-plan.add"
)

/** 三态图标：移除反馈 / 已添加 / 添加 */
const buttonIcon = computed(() =>
    justRemoved.value ? "ri:close-line" : isAdded.value || justAdded.value ? "ri:check-line" : "ri:add-line"
)

/** hover 面板单行 */
interface PlanRow {
    id: number
    name: string
    icon: string
    sub: string
    to: string
}

const charRows = computed<PlanRow[]>(() => {
    const rows: PlanRow[] = []
    for (const item of plan.chars.value) {
        const data = charMap.get(item.id)
        if (!data) continue
        rows.push({
            id: item.id,
            name: t(data.名称),
            icon: LeveledChar.url(data.icon),
            sub: `Lv.${item.config.currentLevel}→${item.config.targetLevel}`,
            to: `/db/char/${item.id}`,
        })
    }
    return rows
})

const weaponRows = computed<PlanRow[]>(() => {
    const rows: PlanRow[] = []
    for (const item of plan.weapons.value) {
        const data = weaponMap.get(item.id)
        if (!data) continue
        rows.push({
            id: item.id,
            name: t(data.名称),
            icon: LeveledWeapon.url(data.icon),
            sub: `Lv.${item.config.currentLevel}→${item.config.targetLevel} · ${item.config.currentRefine}→${item.config.targetRefine}`,
            to: `/db/weapon/${item.id}`,
        })
    }
    return rows
})

const modRows = computed<PlanRow[]>(() => {
    const rows: PlanRow[] = []
    for (const item of plan.mods.value) {
        const data = modMap.get(item.id)
        if (!data) continue
        rows.push({
            id: item.id,
            name: formatModName(data.系列, data.名称, t),
            icon: LeveledMod.url(data.icon),
            sub: `Lv.${item.config.currentLevel}→${item.config.targetLevel} ×${item.config.count}`,
            to: `/db/mod/${item.id}`,
        })
    }
    return rows
})

/** hover 面板每类最多预览条数 */
const PREVIEW_LIMIT = 4

const sections = computed(() => {
    const defs = [
        { kind: "char" as const, label: "角色", rows: charRows.value },
        { kind: "weapon" as const, label: "武器", rows: weaponRows.value },
        { kind: "mod" as const, label: "魔之楔", rows: modRows.value },
    ]
    return defs
        .filter(def => def.rows.length > 0)
        .map(def => ({ ...def, preview: def.rows.slice(0, PREVIEW_LIMIT), overflow: Math.max(def.rows.length - PREVIEW_LIMIT, 0) }))
})
</script>

<template>
    <HoverCardRoot :open-delay="200" :close-delay="150" enable-touch>
        <HoverCardTrigger as-child>
            <span class="relative inline-flex">
                <button
                    type="button"
                    class="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-xs border px-2.5 text-xs transition-all duration-200 active:scale-95"
                    :class="buttonClass"
                    :aria-label="$t(labelKey)"
                    @click="handleClick"
                >
                    <Icon :icon="buttonIcon" class="text-sm" :class="justAdded || justRemoved ? 'animate-add-pop' : ''" />
                    {{ $t(labelKey) }}
                </button>
                <span v-if="justAdded || justRemoved" :key="burstKey" class="add-burst" :class="{ 'add-burst-remove': justRemoved }" aria-hidden="true">{{ burstText }}</span>
            </span>
        </HoverCardTrigger>

        <HoverCardPortal>
            <HoverCardContent
                side="bottom"
                align="start"
                :side-offset="8"
                class="z-50 max-h-80 w-72 overflow-auto rounded-xs border border-base-content/15 bg-base-100/90 p-3 shadow-lg backdrop-blur-md"
            >
                <div class="flex items-baseline justify-between gap-2">
                    <p class="text-xs font-medium text-base-content/85">
                        {{ $t("levelup-plan.title") }}
                        <span class="ml-1 font-orbitron tabular-nums text-primary">{{ plan.totalCount }}</span>
                    </p>
                    <SRouterLink :to="jumpTo" class="inline-flex shrink-0 items-center gap-1 text-xs text-primary hover:underline">
                        {{ $t("levelup-plan.view_calculator") }}
                        <Icon icon="ri:arrow-right-up-line" class="text-xs" />
                    </SRouterLink>
                </div>

                <div v-if="sections.length" class="mt-2 flex flex-col gap-2.5">
                    <div v-for="section in sections" :key="section.kind">
                        <p class="mb-1 text-[11px] tracking-wide text-base-content/50">
                            {{ section.label }} · {{ section.rows.length }}
                        </p>
                        <ul class="flex flex-col gap-0.5">
                            <li v-for="row in section.preview" :key="`${section.kind}-${row.id}`">
                                <SRouterLink
                                    :to="row.to"
                                    class="flex items-center gap-2 rounded-xs px-1.5 py-1 transition-colors duration-150 hover:bg-primary/10"
                                >
                                    <img :src="row.icon" :alt="row.name" class="size-7 shrink-0 rounded-xs object-cover" />
                                    <span class="min-w-0 flex-1 truncate text-xs">{{ row.name }}</span>
                                    <span class="shrink-0 text-[10px] tabular-nums text-base-content/45">{{ row.sub }}</span>
                                </SRouterLink>
                            </li>
                        </ul>
                        <p v-if="section.overflow > 0" class="mt-0.5 px-1.5 text-[11px] text-base-content/40">
                            {{ $t("levelup-plan.more", { count: section.overflow }) }}
                        </p>
                    </div>
                </div>
                <div v-else class="flex flex-col items-center gap-2 py-4">
                    <Icon icon="ri:inbox-line" class="text-2xl text-base-content/25" />
                    <p class="text-xs text-base-content/50">{{ $t("levelup-plan.empty") }}</p>
                </div>

                <SRouterLink
                    :to="jumpTo"
                    class="mt-2.5 flex h-7 items-center justify-center gap-1.5 rounded-xs bg-primary text-xs font-semibold text-primary-content transition-colors duration-150 hover:bg-primary/85"
                >
                    <Icon icon="ri:calculator-line" class="text-sm" />
                    {{ $t("levelup-plan.view_calculator") }}
                </SRouterLink>
            </HoverCardContent>
        </HoverCardPortal>
    </HoverCardRoot>
</template>

<style scoped>
@keyframes add-pop {
    0% {
        transform: scale(1);
    }
    40% {
        transform: scale(1.35);
    }
    100% {
        transform: scale(1);
    }
}

.animate-add-pop {
    animation: add-pop 0.35s ease;
}

@keyframes add-burst-rise {
    0% {
        opacity: 0;
        transform: translate(-50%, 0) scale(0.6);
    }
    20% {
        opacity: 1;
    }
    100% {
        opacity: 0;
        transform: translate(-50%, -28px) scale(1);
    }
}

.add-burst {
    position: absolute;
    left: 50%;
    top: 0;
    pointer-events: none;
    font-size: 12px;
    font-weight: 700;
    color: var(--color-primary);
    animation: add-burst-rise 0.9s ease-out forwards;
}

.add-burst-remove {
    color: var(--color-base-content);
    opacity: 0.6;
}
</style>
