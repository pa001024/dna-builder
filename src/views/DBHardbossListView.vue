<script lang="ts" setup>
import { computed } from "vue"
import { useInitialScrollToSelectedItem } from "@/composables/useInitialScrollToSelectedItem"
import { useSearchParam } from "@/composables/useSearchParam"
import { monsterMap } from "@/data"
import { type HardBoss, hardBossMap } from "@/data/d/hardboss.data"
import { matchPinyin } from "@/utils/pinyin-utils"

const searchKeyword = useSearchParam<string>("kw", "")
const selectedBossId = useSearchParam<number>("id", 0)

// 根据 ID 获取选中的梦魇残声
const selectedBoss = computed(() => {
    return selectedBossId.value ? hardBossMap.get(selectedBossId.value) || null : null
})

// 按关键词筛选梦魇残声
const filteredBosses = computed(() => {
    return Array.from(hardBossMap.values()).filter((boss: HardBoss) => {
        if (searchKeyword.value === "") {
            return true
        } else {
            const q = searchKeyword.value
            const monsterName = boss.mid
                .map(id => monsterMap.get(id)?.n ?? "")
                .filter(Boolean)
                .join(" ")
            // 直接匹配（ID、名称、描述）
            if (`${boss.id}`.includes(q) || boss.name.includes(q) || boss.desc?.includes(q) || monsterName.includes(q)) {
                return true
            } else {
                // 拼音匹配（名称、描述）
                const nameMatch = matchPinyin(boss.name, q).match
                if (nameMatch) {
                    return true
                }
                if (boss.desc && matchPinyin(boss.desc, q).match) {
                    return true
                }
                if (monsterName && matchPinyin(monsterName, q).match) {
                    return true
                }
            }
        }
        return false
    })
})

function selectBoss(boss: HardBoss | null) {
    selectedBossId.value = boss?.id || 0
}

/**
 * 获取高难 Boss 图标。
 * @param boss 高难 Boss 数据
 * @returns 图标路径
 */
function getHardbossIcon(boss: HardBoss): string {
    return boss.icon ? `/imgs/webp/${boss.icon}.webp` : "/imgs/webp/T_Head_Empty.webp"
}

useInitialScrollToSelectedItem({ selectedSelector: ".dbh-item-active" })
</script>

<template>
    <div class="h-full flex flex-col">
        <div class="flex-1 flex min-h-0 flex-col sm:flex-row">
            <!-- 左侧列表面板 -->
            <div class="flex-1 flex flex-col overflow-hidden min-w-0" :class="{ 'sm:border-r border-base-content/10': selectedBoss }">
                <!-- 检索带：下划线搜索 + 计数 -->
                <div class="flex-none border-b border-base-content/15 px-4 pt-4 pb-3 stagger-rise">
                    <div class="relative">
                        <Icon icon="ri:search-line" class="absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-base-content/35" />
                        <input
                            v-model="searchKeyword"
                            type="text"
                            placeholder="搜索梦魇残声 ID/名称/描述/怪物名称（支持拼音）..."
                            class="w-full rounded-none border-b border-base-content/25 bg-transparent py-1.5 pl-7 pr-12 text-sm outline-none transition-colors duration-200 placeholder:text-base-content/35 focus:border-primary"
                        />
                        <span
                            class="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 font-mono text-[11px] tabular-nums text-base-content/40"
                        >
                            {{ filteredBosses.length }}
                        </span>
                    </div>
                </div>

                <!-- 梦魇残声列表 -->
                <ScrollArea class="flex-1">
                    <div class="p-3">
                        <!-- 空状态 -->
                        <div
                            v-if="filteredBosses.length === 0"
                            class="flex flex-col items-center justify-center py-20 text-base-content/45"
                        >
                            <Icon icon="ri:search-line" class="mb-4 h-12 w-12 opacity-40" />
                            <p class="text-sm">未找到匹配的梦魇残声</p>
                        </div>

                        <div v-else class="space-y-2">
                            <article
                                v-for="(boss, index) in filteredBosses"
                                :key="boss.id"
                                class="group relative cursor-pointer overflow-hidden rounded-xs border backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.99] animate-ef-rise motion-reduce:animate-none"
                                :class="
                                    selectedBossId === boss.id
                                        ? 'dbh-item-active border-primary/70 bg-primary/10'
                                        : 'border-base-content/15 bg-base-100/60 hover:border-primary/50'
                                "
                                :style="{ animationDelay: `${Math.min(index * 30, 300)}ms` }"
                                @click="selectBoss(boss)"
                            >
                                <!-- 左侧主色强调条：选中时显现 -->
                                <span
                                    class="absolute inset-y-0 left-0 z-10 w-0.75 bg-primary transition-opacity duration-200"
                                    :class="selectedBossId === boss.id ? 'opacity-100' : 'opacity-0'"
                                    aria-hidden="true"
                                />
                                <div class="flex items-start gap-3 p-3">
                                    <!-- Boss 图标 -->
                                    <div
                                        class="size-12 shrink-0 overflow-hidden rounded-xs border border-base-content/10 bg-base-content/3"
                                    >
                                        <img :src="getHardbossIcon(boss)" :alt="boss.name" class="h-full w-full object-cover object-top" />
                                    </div>
                                    <div class="min-w-0 flex-1">
                                        <!-- 名称行 -->
                                        <h3
                                            class="truncate text-sm font-semibold transition-colors duration-200 group-hover:text-primary"
                                            :class="{ 'text-primary': selectedBossId === boss.id }"
                                        >
                                            {{ $t(boss.name) }}
                                        </h3>
                                        <!-- 描述 -->
                                        <p class="mt-1 line-clamp-2 text-xs leading-relaxed text-base-content/55">
                                            {{ boss.desc }}
                                        </p>
                                    </div>
                                    <!-- 难度数 / 幽灵 ID -->
                                    <div class="ml-2 flex shrink-0 flex-col items-end gap-1">
                                        <span
                                            class="rounded-xs bg-primary/10 px-2 py-0.5 font-orbitron text-[11px] font-semibold tabular-nums text-primary"
                                        >
                                            {{ boss.diff.length }} 个难度
                                        </span>
                                        <CopyID :id="boss.id" />
                                    </div>
                                </div>
                            </article>
                        </div>
                    </div>
                </ScrollArea>

                <!-- 底部统计条 -->
                <div class="flex-none border-t border-base-content/15 px-4 py-2.5">
                    <p class="text-center text-[11px] tracking-wide text-base-content/50">
                        共
                        <b class="font-orbitron text-sm font-semibold tabular-nums text-primary">{{ filteredBosses.length }}</b> 个梦魇残声
                    </p>
                </div>
            </div>

            <!-- 收起详情手柄 -->
            <button
                v-if="selectedBoss"
                type="button"
                class="flex-none flex w-full cursor-pointer items-center justify-center border-base-content/15 py-1.5 text-base-content/40 transition-colors duration-150 hover:bg-base-content/5 hover:text-primary sm:w-9 sm:py-0 sm:border-l"
                title="收起详情"
                @click="selectBoss(null)"
            >
                <Icon icon="tabler:arrow-bar-to-right" class="h-6 w-6 rotate-90 sm:rotate-0" />
            </button>

            <!-- 右侧详情面板 -->
            <ScrollArea v-if="selectedBoss" class="min-w-0 flex-1">
                <DBHardbossDetailItem :key="selectedBossId" :boss="selectedBoss" />
            </ScrollArea>
        </div>
    </div>
</template>
