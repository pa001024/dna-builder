<script lang="ts" setup>
import { useTranslation } from "i18next-vue"
import { computed, ref, watch } from "vue"
import { useGameText } from "@/composables/useGameText"
import type { DnaSeasonTalent } from "@/data/d/dnaseasonprogress.data"
import {
    stages,
    talentLevelUpCosts,
    talentMenus,
    talents,
} from "@/data/d/dnaseasonprogress.data"
import { cleanGameMarkup, formatTalentEffectValue, getTalentIconUrl, getTalentKindLabelKey } from "@/utils/transcendence-display"

const props = withDefaults(
    defineProps<{
        talent: DnaSeasonTalent
        /** 前后置节点行为：select = 页内切换（资料页保持树/筛选上下文），route = 跳独立详情路由 */
        navigation?: "select" | "route"
    }>(),
    { navigation: "route" }
)

const emit = defineEmits<{
    select: [id: number]
}>()

const { t } = useTranslation()
const { gt } = useGameText()

const talentMap = new Map(talents.map(talent => [talent.id, talent]))

const maxLevel = computed(() => Math.max(props.talent.maxLevel, 1))

/** 节点等级滑杆：切换节点时由外层的 key 重挂载，默认从 1 级开始 */
const level = ref(1)

watch(level, value => {
    const next = Math.min(Math.max(Math.round(value || 1), 1), maxLevel.value)

    if (next !== value) {
        level.value = next
    }
})

/** 阶段二/三上游只给了节点数据，没有开放时间与名称 */
const stageLocked = computed(() => !stages.some(stage => stage.id === props.talent.stageId))

const kindLabel = computed(() => t(getTalentKindLabelKey(props.talent.kind)))

const effectRows = computed(() =>
    props.talent.effects.map(effect => ({
        key: `${effect.index}-${effect.attr}`,
        label: gt(effect.attr),
        addTypeKey: effect.addType === "Rate" ? "db-transcendence.talent.add_type_rate" : "db-transcendence.talent.add_type_value",
        unlockLevel: effect.unlockLevel ?? 1,
        description: cleanGameMarkup(effect.description ? gt(effect.description) : ""),
        value: formatTalentEffectValue(effect, level.value),
    }))
)

const activateCost = computed(() => talentMenus.find(menu => menu.talentType === props.talent.kind)?.cost ?? {})

const nextLevelCost = computed(() => {
    if (level.value >= maxLevel.value) {
        return {}
    }

    return talentLevelUpCosts.find(cost => cost.level === level.value + 1)?.cost ?? {}
})

/** 前置/后续节点行：名称从 talents 主表反查，节点被裁剪时回退裸 id */
function resolveNode(id: number) {
    const talent = talentMap.get(id)

    return {
        id,
        name: talent ? gt(talent.name) : `#${id}`,
    }
}

const parentRows = computed(() => (props.talent.parentIds ?? []).map(resolveNode))
const childRows = computed(() => (props.talent.unlockChildren ?? []).map(resolveNode))
</script>

<template>
    <div class="stagger-rise space-y-3 p-3 sm:p-4">
        <!-- 天赋节点档案头：纸面 + primary 强调线 -->
        <header class="relative overflow-hidden border-b-2 border-primary pb-4">
            <div
                class="pointer-events-none absolute inset-0"
                style="
                    background-image:
                        linear-gradient(to right, color-mix(in oklab, var(--color-base-content) 7%, transparent) 1px, transparent 1px),
                        linear-gradient(to bottom, color-mix(in oklab, var(--color-base-content) 7%, transparent) 1px, transparent 1px);
                    background-size: 26px 26px;
                    mask-image: linear-gradient(to bottom, black, transparent 85%);
                "
                aria-hidden="true"
            />
            <span
                class="pointer-events-none absolute top-0 right-0 h-8 w-8 bg-primary [clip-path:polygon(100%_0,100%_100%,0_0)]"
                aria-hidden="true"
            />
            <div class="relative flex items-center gap-3.5">
                <div class="relative size-16 shrink-0 overflow-hidden rounded-xs border border-base-content/10 bg-base-content/5">
                    <ImageFallback :src="getTalentIconUrl(talent.icon)" :alt="gt(talent.name)" class="size-16 object-cover">
                        <span class="flex size-16 items-center justify-center font-orbitron text-xl font-semibold text-primary/60">
                            {{ gt(talent.name).slice(0, 1) }}
                        </span>
                    </ImageFallback>
                </div>
                <div class="min-w-0 flex-1">
                    <p class="mb-2 inline-flex items-center gap-2 text-[10px] font-semibold tracking-[0.32em] text-primary uppercase">
                        <span class="h-px w-6 bg-primary" aria-hidden="true" />
                        Talent Node
                    </p>
                    <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <SRouterLink
                            :to="`/db/transcendence/talent/${talent.id}`"
                            class="truncate text-xl leading-tight font-bold tracking-tight text-base-content transition-colors duration-150 hover:text-primary sm:text-2xl"
                        >
                            {{ gt(talent.name) }}
                        </SRouterLink>
                        <CopyID :id="talent.id" />
                    </div>
                    <div class="mt-2 flex flex-wrap items-center gap-1.5">
                        <span class="rounded-xs border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
                            {{ kindLabel }}
                        </span>
                        <span class="rounded-xs border border-base-content/15 px-1.5 py-0.5 font-orbitron text-[11px] text-base-content/60">
                            {{ $t("db-transcendence.talent.max_lv", { level: talent.maxLevel }) }}
                        </span>
                        <span v-if="stageLocked" class="rounded-xs border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[11px] text-warning">
                            {{ $t("db-transcendence.talent.stage_locked") }}
                        </span>
                    </div>
                </div>
            </div>
        </header>

        <!-- 节点说明 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="DESCRIPTION" :title="$t('common.description')" />
            <p class="text-sm leading-relaxed text-base-content/80">{{ gt(talent.desc) }}</p>
        </section>

        <!-- 等级滑杆：maxLevel=1 的节点没有可调等级，直接隐藏 -->
        <section v-if="maxLevel > 1" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader
                no-animate
                compact
                kicker="LEVEL"
                :title="$t('db-transcendence.talent.node_level')"
                :count="$t('db-transcendence.talent.level_of_max', { level, max: maxLevel })"
            />
            <div class="flex items-center gap-3">
                <input v-model.number="level" type="range" min="1" :max="maxLevel" step="1" class="range range-primary range-xs grow" />
                <input
                    v-model.number="level"
                    type="number"
                    min="1"
                    :max="maxLevel"
                    step="1"
                    class="w-16 rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 font-mono text-[13px] outline-none focus:border-primary"
                />
            </div>
        </section>

        <!-- 效果：数值随节点等级实时变化 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader
                no-animate
                compact
                kicker="EFFECTS"
                :title="$t('db-transcendence.talent.effects')"
                :count="effectRows.length"
            />
            <div class="space-y-1.5">
                <div
                    v-for="effect in effectRows"
                    :key="effect.key"
                    class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5"
                    :class="effect.value === null ? 'opacity-55' : ''"
                >
                    <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span class="text-[13px] font-medium text-base-content/85">{{ effect.label }}</span>
                        <span class="rounded-xs border border-base-content/15 px-1 text-[10px] leading-4 text-base-content/45">
                            {{ $t(effect.addTypeKey) }}
                        </span>
                        <span v-if="effect.value !== null" class="ml-auto font-orbitron text-[13px] font-semibold text-primary">
                            {{ effect.value }}
                        </span>
                        <span v-else class="ml-auto inline-flex items-center gap-1 text-[11px] text-base-content/45">
                            <Icon icon="ri:lock-line" class="size-3.5" />
                            {{ $t("db-transcendence.talent.locked_effect", { level: effect.unlockLevel }) }}
                        </span>
                    </div>
                    <p v-if="effect.description" class="mt-1 text-[11px] leading-relaxed text-base-content/45">{{ effect.description }}</p>
                </div>
                <p v-if="!effectRows.length" class="text-[11px] text-base-content/45">{{ $t("common.no_data") }}</p>
            </div>
        </section>

        <!-- 激活/升级成本 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="COST" :title="$t('db-transcendence.talent.activate_cost')" />
            <div class="space-y-2">
                <div class="flex flex-wrap items-center gap-1.5">
                    <ResourceCostItem v-for="(count, id) in activateCost" :key="id" :value="[count, id, 'Resource']" mini />
                </div>
                <div>
                    <p class="mb-1 text-[11px] text-base-content/50">
                        {{ level < maxLevel ? $t("db-transcendence.talent.levelup_cost", { level: level + 1 }) : $t("db-transcendence.talent.max_level_reached") }}
                    </p>
                    <div v-if="level < maxLevel" class="flex flex-wrap items-center gap-1.5">
                        <ResourceCostItem v-for="(count, id) in nextLevelCost" :key="id" :value="[count, id, 'Resource']" mini />
                    </div>
                </div>
            </div>
        </section>

        <!-- 前置/后续节点：资料页内切换选中，独立详情页跳路由 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="LINK" :title="$t('db-transcendence.talent.parents')" />
            <div class="flex flex-wrap gap-1.5">
                <template v-if="navigation === 'select'">
                    <button
                        v-for="node in parentRows"
                        :key="node.id"
                        type="button"
                        class="btn btn-xs whitespace-nowrap"
                        @click="emit('select', node.id)"
                    >
                        {{ node.name }}
                    </button>
                </template>
                <template v-else>
                    <SRouterLink v-for="node in parentRows" :key="node.id" :to="`/db/transcendence/talent/${node.id}`" class="btn btn-xs whitespace-nowrap">
                        {{ node.name }}
                    </SRouterLink>
                </template>
                <span v-if="!parentRows.length" class="text-[11px] text-base-content/40">{{ $t("common.none") }}</span>
            </div>
            <p class="mt-3 mb-1.5 text-[11px] text-base-content/50">{{ $t("db-transcendence.talent.children") }}</p>
            <div class="flex flex-wrap gap-1.5">
                <template v-if="navigation === 'select'">
                    <button
                        v-for="node in childRows"
                        :key="node.id"
                        type="button"
                        class="btn btn-xs whitespace-nowrap"
                        @click="emit('select', node.id)"
                    >
                        {{ node.name }}
                    </button>
                </template>
                <template v-else>
                    <SRouterLink v-for="node in childRows" :key="node.id" :to="`/db/transcendence/talent/${node.id}`" class="btn btn-xs whitespace-nowrap">
                        {{ node.name }}
                    </SRouterLink>
                </template>
                <span v-if="!childRows.length" class="text-[11px] text-base-content/40">{{ $t("common.none") }}</span>
            </div>
        </section>
    </div>
</template>