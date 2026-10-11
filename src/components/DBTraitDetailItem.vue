<script lang="ts" setup>
import { computed } from "vue"
import { LeveledChar } from "@/data"
import { charMap } from "@/data/d"
import { type CharTraitEntry, getCharTraitIconUrl, getCharTraitStyle } from "@/utils/char-trait"
import { getRarityGradientClass } from "@/utils/rarity-utils"

const props = defineProps<{
    trait: CharTraitEntry
}>()

const iconUrl = computed(() => getCharTraitIconUrl(props.trait.icon))
const style = computed(() => getCharTraitStyle(props.trait.tag))

/**
 * 所属角色的展示行：名字优先取 charMap（随语言包走），取不到回退目录快照。
 */
const ownerRows = computed(() =>
    props.trait.owners.map(owner => {
        const char = charMap.get(owner.charId)
        return {
            ...owner,
            displayName: char ? char.名称 : owner.charName,
            icon: char?.icon,
        }
    })
)
</script>

<template>
    <div class="stagger-rise space-y-3 p-3 sm:p-4">
        <!-- 特质档案头：纸面 + primary 强调线 -->
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
            <div class="relative flex items-center gap-3.5">
                <div class="relative size-16 shrink-0 overflow-hidden rounded-xs" :style="{ background: style.plate }">
                    <span
                        class="absolute inset-0"
                        :style="{ backgroundColor: style.glyph, mask: `url(${iconUrl}) no-repeat center/64%` }"
                        aria-hidden="true"
                    />
                    <span
                        v-if="style.glow"
                        class="pointer-events-none absolute inset-0"
                        :style="{ background: `radial-gradient(circle at 50% 45%, ${style.glow}, transparent 72%)` }"
                        aria-hidden="true"
                    />
                </div>
                <div class="min-w-0 flex-1">
                    <p class="mb-2 inline-flex items-center gap-2 text-[10px] font-semibold tracking-[0.32em] text-primary uppercase">
                        <span class="h-px w-6 bg-primary" aria-hidden="true" />
                        Trait File
                    </p>
                    <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <h2 class="truncate text-xl leading-tight font-bold tracking-tight text-base-content sm:text-2xl">
                            {{ $t(trait.name) }}
                        </h2>
                    </div>
                    <div class="mt-2 flex flex-wrap items-center gap-1.5">
                        <span
                            class="inline-flex rounded-xs border border-base-content/15 px-1.5 py-0.5 text-[11px] tracking-wide text-base-content/55"
                        >
                            {{ trait.tag }}
                        </span>
                        <span
                            class="inline-flex items-center gap-1 rounded-xs border border-primary/40 bg-primary/10 px-1.5 py-0.5 font-orbitron text-[11px] font-semibold text-primary"
                        >
                            {{ $t("db-trait-detail.owner_count", { count: trait.owners.length }) }}
                        </span>
                    </div>
                </div>
            </div>
        </header>

        <!-- 特质说明 -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="DESCRIPTION" :title="$t('db-trait-detail.description')" />
            <p class="text-sm leading-relaxed text-base-content/85">{{ $t(trait.desc) }}</p>
        </section>

        <!-- 所属角色（反向查询） -->
        <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="OWNERS" :title="$t('db-trait-detail.owners')" />
            <div class="grid grid-cols-1 gap-1.5 md:grid-cols-2">
                <SRouterLink
                    v-for="owner in ownerRows"
                    :key="owner.charId"
                    :to="`/db/char/${owner.charId}`"
                    class="group flex items-center gap-2.5 rounded-xs border border-base-content/10 bg-base-content/3 p-2.5 transition-colors duration-150 hover:border-primary/50"
                >
                    <!-- 角色头像（稀有度渐变底，与角色列表一致） -->
                    <div class="size-12 shrink-0 overflow-hidden rounded-xs bg-linear-15" :class="getRarityGradientClass(5)">
                        <img
                            :src="LeveledChar.url(owner.icon)"
                            :alt="$t(owner.displayName)"
                            class="h-full w-full object-cover object-top"
                        />
                    </div>
                    <div class="min-w-0 flex-1">
                        <div class="truncate text-sm font-semibold transition-colors duration-150 group-hover:text-primary">
                            {{ $t(owner.displayName) }}
                        </div>
                        <div class="mt-1 flex flex-wrap items-center gap-1">
                            <span
                                class="inline-flex items-center rounded-xs border border-primary/40 bg-primary/10 px-1.5 py-0.5 font-orbitron text-[11px] font-semibold text-primary"
                            >
                                Lv.{{ owner.level }}
                            </span>
                        </div>
                    </div>
                    <CopyID :id="owner.charId" />
                </SRouterLink>
            </div>
        </section>
    </div>
</template>
