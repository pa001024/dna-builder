<script lang="ts" setup>
import { computed, ref } from "vue"
import { useGameText } from "@/composables/useGameText"
import { petMap } from "@/data"
import { type PetEntry, petToEntey } from "@/data/d/pet.data"
import { getPetQualityName, getPetTypeName } from "@/utils/pet-labels"
import { getRarityBadgeClass } from "@/utils/rarity-utils"

const props = defineProps<{
    entry: PetEntry
}>()

const { gt } = useGameText()

interface EntryPetSource {
    petId: number
    petName: string
    petType: number
    petIcon: string
    petDesc: string
    weight: number
}

const groupSourcePetsByWeight = ref(true)

/**
 * 将权重格式化为百分比文本。
 * @param weight 原始权重
 * @returns 格式化文本
 */
function formatWeight(weight: number): string {
    return `${weight.toFixed(3)}%`
}

/**
 * 收集会产出当前魔灵潜质的失活魔灵来源。
 */
const entryPetSources = computed<EntryPetSource[]>(() => {
    const sources: EntryPetSource[] = []

    for (const [petIdText, entryWeightMap] of Object.entries(petToEntey)) {
        const weight = entryWeightMap[props.entry.id]
        if (!weight) {
            continue
        }

        const petId = Number(petIdText)
        const pet = petMap.get(petId)
        if (!pet || pet.类型 !== 2) {
            continue
        }

        sources.push({
            petId,
            petName: pet.名称,
            petType: pet.类型,
            petIcon: pet.icon,
            petDesc: pet.描述,
            weight,
        })
    }

    return sources.sort((a, b) => b.weight - a.weight || a.petId - b.petId)
})

interface EntryPetSourceGroup {
    weight: number
    sources: EntryPetSource[]
}

const groupedEntryPetSources = computed<EntryPetSourceGroup[]>(() => {
    if (!groupSourcePetsByWeight.value) {
        return []
    }

    const groupMap = new Map<string, EntryPetSource[]>()
    for (const source of entryPetSources.value) {
        const key = source.weight.toFixed(6)
        if (!groupMap.has(key)) {
            groupMap.set(key, [])
        }
        groupMap.get(key)!.push(source)
    }

    return Array.from(groupMap.entries())
        .map(([key, sources]) => ({
            weight: Number(key),
            sources: [...sources].sort((a, b) => a.petId - b.petId),
        }))
        .sort((a, b) => b.weight - a.weight)
})
</script>

<template>
    <div class="stagger-rise space-y-3 p-3 sm:p-4">
        <!-- 详情头部：纸面 + primary 强调线 -->
        <header class="relative overflow-hidden border-b-2 border-primary pb-4">
            <!-- 引导线网格（装饰性，随主题明暗） -->
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
            <!-- 右上角斜切楔形 -->
            <span
                class="pointer-events-none absolute top-0 right-0 h-8 w-8 bg-primary [clip-path:polygon(100%_0,100%_100%,0_0)]"
                aria-hidden="true"
            />
            <p class="mb-2 inline-flex items-center gap-2 text-[10px] font-semibold tracking-[0.32em] text-primary uppercase">
                <span class="h-px w-6 bg-primary" aria-hidden="true" />
                Entry File
            </p>
            <div class="relative flex flex-wrap items-center gap-x-2 gap-y-1">
                <h2 class="truncate font-orbitron text-xl font-bold leading-tight tracking-tight text-base-content sm:text-2xl">
                    {{ $t(entry.name) }}
                </h2>
                <CopyID :id="entry.id" />
                <span class="ml-auto" :class="getRarityBadgeClass(entry.r)">
                    {{ $t(getPetQualityName(entry.r)) }}
                </span>
            </div>
            <div class="relative mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs text-base-content/60">
                <span>{{ $t("pet_detail.base_id") }}: {{ entry.bid }}</span>
                <span class="h-3 w-px bg-base-content/20" aria-hidden="true" />
                <span>{{ $t("pet_detail.name") }}: {{ $t(entry.name) }}</span>
                <span class="h-3 w-px bg-base-content/20" aria-hidden="true" />
                <span>{{ $t("pet_detail.rarity") }}: {{ $t(getPetQualityName(entry.r)) }}</span>
            </div>
        </header>

        <!-- 潜质图标 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <div class="flex justify-center items-center">
                <img :src="`/imgs/webp/T_Armory_Pet_Attr_${entry.icon}.webp`" class="w-24 object-cover rounded-xs" alt="" />
            </div>
        </section>

        <!-- 效果 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="EFFECT" :title="$t('pet_detail.effect')" />
            <div class="mt-2 rounded-xs border border-base-content/10 bg-base-content/3 p-2.5 text-sm leading-relaxed text-base-content/85">
                {{ gt(entry.desc) }}
            </div>
        </section>

        <!-- 下一级 -->
        <section v-if="entry.upid" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="NEXT" :title="$t('pet_detail.next_level')" />
            <div class="mt-2 flex items-center gap-2 text-sm">
                <SRouterLink :to="`/db/pet/${entry.upid}`" class="transition-colors duration-150 hover:text-primary">
                    {{ $t(entry.name) }}
                </SRouterLink>
                <CopyID :id="entry.upid" />
            </div>
        </section>

        <!-- 对应失活魔灵 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="SOURCE" :title="$t('pet_detail.corresponding_inactive')" />
            <div v-if="entryPetSources.length" class="mt-2 space-y-2">
                <div class="flex items-center justify-between gap-2">
                    <span class="text-[11px] tracking-wide text-base-content/55">{{ $t("pet_detail.group_by_weight") }}</span>
                    <input v-model="groupSourcePetsByWeight" type="checkbox" class="toggle toggle-primary toggle-sm" />
                </div>

                <template v-if="groupSourcePetsByWeight">
                    <div v-for="group in groupedEntryPetSources" :key="group.weight" class="space-y-1">
                        <div class="text-[11px] tabular-nums text-base-content/45 px-1">
                            {{ formatWeight(group.weight) }} · {{ group.sources.length }} {{ $t("pet_detail.count_suffix") }}
                        </div>
                        <div class="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-1.5">
                            <div
                                v-for="source in group.sources"
                                :key="source.petId"
                                class="rounded-xs border border-base-content/10 bg-base-content/3 p-2"
                            >
                                <div class="flex items-center justify-between gap-2">
                                    <div class="flex min-w-0 items-center gap-2">
                                        <img
                                            :src="`/imgs/webp/T_Head_Pet_${source.petIcon}.webp`"
                                            class="size-6 shrink-0 rounded-xs object-cover bg-base-content/3"
                                            alt=""
                                        />
                                        <SRouterLink
                                            :to="`/db/pet/${source.petId}`"
                                            class="truncate text-sm font-medium transition-colors duration-150 hover:text-primary"
                                        >
                                            {{ $t(source.petName) }}
                                        </SRouterLink>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </template>
                <template v-else>
                    <div
                        v-for="source in entryPetSources"
                        :key="source.petId"
                        class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5"
                    >
                        <div class="flex items-center justify-between gap-2">
                            <div class="flex min-w-0 items-center gap-2">
                                <img
                                    :src="`/imgs/webp/T_Head_Pet_${source.petIcon}.webp`"
                                    class="size-6 shrink-0 rounded-xs object-cover bg-base-content/3"
                                    alt=""
                                />
                                <SRouterLink
                                    :to="`/db/pet/${source.petId}`"
                                    class="truncate text-sm font-medium transition-colors duration-150 hover:text-primary"
                                >
                                    {{ $t(source.petName) }}
                                </SRouterLink>
                            </div>
                            <span class="shrink-0 font-mono text-[11px] tabular-nums text-base-content/55">{{
                                formatWeight(source.weight)
                            }}</span>
                        </div>
                        <div class="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-base-content/55">
                            <span>ID: {{ source.petId }}</span>
                            <span>{{ $t(getPetTypeName(source.petType)) }}</span>
                            <span class="truncate">{{ gt(source.petDesc) }}</span>
                        </div>
                    </div>
                </template>
            </div>
            <div v-else class="mt-2 text-sm text-base-content/70">{{ $t("pet_detail.no_sources") }}</div>
        </section>
    </div>
</template>
