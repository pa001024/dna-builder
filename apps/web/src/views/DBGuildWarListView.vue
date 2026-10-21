<script lang="ts" setup>
import { computed } from "vue"
import { useInitialScrollToSelectedItem } from "@/composables/useInitialScrollToSelectedItem"
import { useSearchParam } from "@/composables/useSearchParam"
import { guildWarBossMap } from "@/data/d"
import type { GuildWarBoss } from "@/data/d/guildwar.data"
import { type GuildWarSlotState, getGuildWarActiveBossId, getGuildWarBossState } from "@/utils/guildwar"
import { matchPinyin } from "@/utils/pinyin-utils"

const nowTimestamp = Math.floor(Date.now() / 1000)

const SLOT_STATE_KEYS: Record<GuildWarSlotState, string> = {
    Active: "db-guildwar-detail.state_active",
    NotStarted: "db-guildwar-detail.state_not_started",
    Ended: "db-guildwar-detail.state_ended",
    Unopened: "db-guildwar-detail.state_unopened",
}

const SLOT_STATE_CLASSES: Record<GuildWarSlotState, string> = {
    Active: "text-success",
    NotStarted: "text-warning",
    Ended: "text-base-content/45",
    Unopened: "text-base-content/45",
}

const searchKeyword = useSearchParam<string>("kw", "")
const selectedBossId = useSearchParam<number>("id", getGuildWarActiveBossId(nowTimestamp))

const bossStates = computed(() => {
    const states = new Map<number, GuildWarSlotState>()
    for (const boss of guildWarBossMap.values()) {
        states.set(boss.id, getGuildWarBossState(boss.id, nowTimestamp))
    }
    return states
})

const selectedBoss = computed(() => {
    return selectedBossId.value ? guildWarBossMap.get(selectedBossId.value) || null : null
})

const filteredBosses = computed(() => {
    return Array.from(guildWarBossMap.values()).filter((boss: GuildWarBoss) => {
        if (searchKeyword.value === "") {
            return true
        } else {
            const q = searchKeyword.value
            if (`${boss.id}`.includes(q) || boss.name.includes(q) || boss.desc?.includes(q)) {
                return true
            } else {
                const nameMatch = matchPinyin(boss.name, q).match
                if (nameMatch) {
                    return true
                }
                if (boss.desc && matchPinyin(boss.desc, q).match) {
                    return true
                }
            }
        }
        return false
    })
})

function selectBoss(boss: GuildWarBoss | null) {
    selectedBossId.value = boss?.id || 0
}

useInitialScrollToSelectedItem({ selectedSelector: ".dbg-item-active" })
</script>

<template>
    <div class="h-full flex flex-col">
        <SplitView :desktop-ratio="1 / 2" :detail-open="Boolean(selectedBoss)" @collapse="selectBoss(null)">
            <template #master>
                <div
                    class="flex-1 flex min-h-0 flex-col overflow-hidden min-w-0"
                    :class="{ 'sm:border-r border-base-content/10': selectedBoss }"
                >
                    <div class="flex-none border-b border-base-content/15 px-4 pt-4 pb-3 stagger-rise">
                        <DbSearchBox
                            v-model="searchKeyword"
                            :placeholder="$t('db-guildwar-list.search_placeholder')"
                            :count="filteredBosses.length"
                        />
                    </div>

                    <ScrollArea class="flex-1">
                        <div class="p-3">
                            <div
                                v-if="filteredBosses.length === 0"
                                class="flex flex-col items-center justify-center py-20 text-base-content/45"
                            >
                                <Icon icon="ri:search-line" class="mb-4 h-12 w-12 opacity-40" />
                                <p class="text-sm">{{ $t("db-guildwar-list.no_match") }}</p>
                            </div>

                            <div v-else class="space-y-2">
                                <article
                                    v-for="(boss, index) in filteredBosses"
                                    :key="boss.id"
                                    class="group relative cursor-pointer overflow-hidden rounded-xs border backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.99] animate-ef-rise motion-reduce:animate-none"
                                    :class="
                                    selectedBossId === boss.id
                                        ? 'dbg-item-active border-primary/70 bg-primary/10'
                                        : 'border-base-content/15 bg-base-100/60 hover:border-primary/50'
                                "
                                    :style="{ animationDelay: `${Math.min(index * 30, 300)}ms` }"
                                    @click="selectBoss(boss)"
                                >
                                    <span
                                        class="absolute inset-y-0 left-0 z-10 w-[3px] bg-primary transition-opacity duration-200"
                                        :class="selectedBossId === boss.id ? 'opacity-100' : 'opacity-0'"
                                        aria-hidden="true"
                                    />
                                    <div class="flex items-start gap-3 p-3">
                                        <div class="min-w-0 flex-1">
                                            <h3
                                                class="truncate text-sm font-semibold transition-colors duration-200 group-hover:text-primary"
                                                :class="{ 'text-primary': selectedBossId === boss.id }"
                                            >
                                                {{ $t(boss.name) }}
                                            </h3>
                                            <p class="mt-1 line-clamp-2 text-xs leading-relaxed text-base-content/55">
                                                {{ $t(boss.desc) }}
                                            </p>
                                        </div>
                                        <div class="ml-2 flex shrink-0 flex-col items-end gap-1">
                                            <CopyID :id="boss.id" />
                                            <span
                                                class="text-[11px] font-semibold"
                                                :class="SLOT_STATE_CLASSES[bossStates.get(boss.id) ?? 'Ended']"
                                            >
                                                {{ $t(SLOT_STATE_KEYS[bossStates.get(boss.id) ?? 'Ended']) }}
                                            </span>
                                        </div>
                                    </div>
                                </article>
                            </div>
                        </div>
                    </ScrollArea>

                    <div class="flex-none border-t border-base-content/15 px-4 py-2.5">
                        <p class="text-center text-[11px] tracking-wide text-base-content/50">
                            {{ $t("common.total_count") }}
                            <b class="font-orbitron text-sm font-semibold text-primary">{{ filteredBosses.length }}</b>
                            {{ $t("db-guildwar-list.guildwar_count") }}
                        </p>
                    </div>
                </div>
            </template>
            <template #detail>
                <ScrollArea v-if="selectedBoss" class="min-h-0 min-w-0 flex-1">
                    <DBGuildWarDetailItem :key="selectedBossId" :boss="selectedBoss" />
                </ScrollArea>
            </template>
        </SplitView>
    </div>
</template>
