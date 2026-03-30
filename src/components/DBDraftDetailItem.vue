<script lang="ts" setup>
import { computed, ref } from "vue"
import { draftShopSourceMap } from "@/data/d/shop.data"
import { getDungeonName } from "@/utils/dungeon-utils"
import { getDraftDropInfo } from "@/utils/reward-utils"
import { draftDungeonMap, modMap, weaponMap } from "../data/d/index"
import type { Draft, Dungeon } from "../data/data-types"

const props = defineProps<{
    draft: Draft
}>()

// 展开的地下城ID
const expandedDungeonId = ref<number | null>(null)

// 切换地下城展开状态
function toggleDungeonExpand(dungeonId: number) {
    expandedDungeonId.value = expandedDungeonId.value === dungeonId ? null : dungeonId
}

// 将分钟数转换为00:00格式
function formatDuration(minutes: number): string {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`
}

// 获取类型名称
function getTypeName(type: string): string {
    const typeMap: Record<string, string> = {
        Mod: "魔之楔",
        Resource: "资源",
        CharAccessory: "角色配件",
        Weapon: "武器",
    }
    return typeMap[type] || type
}

// 获取产物信息
const product = computed(() => {
    if (props.draft.t === "Mod") {
        return modMap.get(props.draft.p)
    } else if (props.draft.t === "Weapon") {
        return weaponMap.get(props.draft.p)
    }
    return null
})

// 获取当前图纸的掉落来源
const draftDungeons = computed<Dungeon[]>(() => {
    return draftDungeonMap.get(props.draft.p) || []
})

const draftShopSource = computed(() => {
    return draftShopSourceMap.get(props.draft.id)
})

/**
 * 获取产物展示项的 ResourceCostItem 入参。
 * @returns 产物名称与值
 */
const productDisplay = computed(() => {
    if (props.draft.t === "Mod" || props.draft.t === "Weapon") {
        return {
            name: product.value?.名称 || props.draft.n,
            value: [props.draft.c, props.draft.p, props.draft.t] as [number, number, "Mod" | "Weapon"],
        }
    }

    return {
        name: product.value?.名称 || props.draft.n,
        value: props.draft.c,
    }
})
</script>

<template>
    <div class="p-3 space-y-3">
        <div class="p-3 flex items-center gap-3">
            <SRouterLink :to="`/db/draft/${draft.id}`" class="text-lg font-bold link link-primary"> 图纸: {{ draft.n }} </SRouterLink>
            <div class="text-xs opacity-70">ID: {{ draft.id }}</div>
        </div>

        <div class="p-3 bg-base-200 rounded">
            <div class="text-xs text-base-content/70 mb-2">基本信息</div>
            <div class="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                <div class="flex justify-between items-center p-2 bg-base-300 rounded text-sm">
                    <span class="text-base-content/70">稀有度</span>
                    <span class="font-medium text-primary">
                        <Icon v-for="i in draft.r" :key="i" class="inline-block mr-1" icon="ri:star-fill" />
                    </span>
                </div>
                <div class="flex justify-between items-center p-2 bg-base-300 rounded text-sm">
                    <span class="text-base-content/70">版本</span>
                    <span class="font-medium text-primary">
                        {{ draft.v }}
                    </span>
                </div>
                <div class="flex justify-between items-center p-2 bg-base-300 rounded text-sm">
                    <span class="text-base-content/70">类型</span>
                    <span class="font-medium text-primary">
                        {{ getTypeName(draft.t) }}
                    </span>
                </div>
                <div class="flex justify-between items-center p-2 bg-base-300 rounded text-sm">
                    <span class="text-base-content/70">铸造时间</span>
                    <span class="font-medium text-primary">
                        {{ formatDuration(draft.d) }}
                    </span>
                </div>
                <div class="flex justify-between items-center p-2 bg-base-300 rounded text-sm">
                    <span class="text-base-content/70">批量制造</span>
                    <span class="font-medium text-primary">
                        {{ draft.b ? "支持" : "不支持" }}
                    </span>
                </div>
                <div class="flex justify-between items-center p-2 bg-base-300 rounded text-sm">
                    <span class="text-base-content/70">无限制造</span>
                    <span class="font-medium text-primary">
                        {{ draft.i ? "支持" : "不支持" }}
                    </span>
                </div>
            </div>
        </div>

        <!-- 产物信息 -->
        <div class="p-3 bg-base-200 rounded">
            <div class="text-xs text-base-content/70 mb-2">产物</div>
            <ResourceCostItem :name="productDisplay.name" :value="productDisplay.value" />
        </div>

        <!-- 消耗资源 -->
        <div v-if="draft.x && draft.x.length > 0" class="p-3 bg-base-200 rounded">
            <div class="text-xs text-base-content/70 mb-2">消耗资源</div>
            <div class="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2 text-sm">
                <ResourceCostItem name="铜币" :value="draft.m" />
                <template v-for="item in draft.x" :key="item.id">
                    <ResourceCostItem :name="item.n" :value="item.t === 'Resource' ? item.c : [item.c, item.id, item.t]" />
                </template>
            </div>
        </div>

        <!-- 获取途径 -->
        <div v-if="draftShopSource" class="p-3 bg-base-200 rounded">
            <div class="text-xs text-base-content/70 mb-2">获取途径</div>
            <div class="space-y-2 text-sm">{{ draftShopSource.shop }} - {{ draftShopSource.cost }} x {{ draftShopSource.n }}</div>
        </div>

        <!-- 掉落来源 -->
        <div v-if="draftDungeons.length > 0" class="p-3 bg-base-200 rounded">
            <div class="text-xs text-base-content/70 mb-2">掉落来源</div>
            <div class="space-y-2 text-sm">
                <div v-for="dungeon in draftDungeons" :key="dungeon.id" class="space-y-2">
                    <div
                        @click="toggleDungeonExpand(dungeon.id)"
                        class="flex flex-col gap-1 p-2 bg-base-300 rounded hover:bg-base-content/10 transition-colors cursor-pointer"
                    >
                        <div class="flex justify-between items-center">
                            <div class="flex items-center gap-2">
                                <span class="font-medium">{{ getDungeonName(dungeon) }}</span>
                                <span v-if="dungeon.e" class="text-xs px-1.5 py-0.5 rounded bg-primary/20 text-primary">{{
                                    $t(dungeon.e)
                                }}</span>
                                <span class="text-xs text-base-content/70">ID: {{ dungeon.id }}</span>
                            </div>
                            <div class="flex items-center gap-2 text-base-content/70">
                                <span v-if="dungeon.lv" class="text-xs">Lv.{{ dungeon.lv }}</span>
                                <span class="text-xs">{{ dungeon.t }}</span>
                                <Icon
                                    :icon="expandedDungeonId === dungeon.id ? 'radix-icons:chevron-up' : 'radix-icons:chevron-down'"
                                    class="text-xs"
                                />
                            </div>
                        </div>
                        <!-- 显示掉落概率信息 -->
                        <div class="text-xs text-base-content/50">
                            <span v-if="getDraftDropInfo(dungeon, draft.id).pp" class="mr-2">
                                概率: {{ +(getDraftDropInfo(dungeon, draft.id).pp! * 100).toFixed(2) }}%
                            </span>
                            <span v-if="getDraftDropInfo(dungeon, draft.id).times">
                                期望: {{ +getDraftDropInfo(dungeon, draft.id).times!.toFixed(2) }}次
                            </span>
                        </div>
                    </div>
                    <!-- 展开的地下城详情 -->
                    <div v-if="expandedDungeonId === dungeon.id" class="p-3 bg-base-100 rounded border border-base-200">
                        <DBDungeonDetailItem :dungeon="dungeon" />
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
