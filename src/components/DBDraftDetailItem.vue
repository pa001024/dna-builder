<script lang="ts" setup>
import { computed } from "vue"
import type { Draft } from "../data/data-types"
import { modMap, weaponMap } from "../data/d/index"
import { LeveledMod } from "../data"

const props = defineProps<{
    draft: Draft
}>()

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
        return weaponMap.get(props.draft.p.toString())
    }
    return null
})
</script>

<template>
    <ScrollArea class="h-full">
        <div class="p-3 space-y-4">
            <div class="p-3">
                <div class="flex items-center gap-3 mb-3">
                    <div class="text-lg font-bold">
                        <RouterLink :to="`/db/draft/${draft.id}`" class="text-lg font-bold link link-primary">
                            图纸: {{ draft.n }}
                        </RouterLink>
                        <div class="text-xs opacity-70">ID: {{ draft.id }}</div>
                    </div>
                </div>

                <div class="flex flex-wrap gap-2 text-sm opacity-70 mb-3">
                    <span>{{ getTypeName(draft.t) }}</span>
                    <span v-if="draft.v">{{ draft.v }}版本</span>
                </div>

                <div class="p-3 bg-base-200 rounded mb-3">
                    <div class="text-xs text-base-content/70 mb-2">基本信息</div>
                    <div class="space-y-2 text-sm">
                        <div class="grid grid-cols-3 gap-2">
                            <div class="col-span-1 opacity-70">名称</div>
                            <div class="col-span-2 font-medium">{{ draft.n }}</div>
                        </div>
                        <div class="grid grid-cols-3 gap-2">
                            <div class="col-span-1 opacity-70">稀有度</div>
                            <div class="col-span-2 font-medium">
                                <Icon v-for="i in draft.r" :key="i" class="inline-block mr-1" icon="ri:star-fill" />
                            </div>
                        </div>
                        <div class="grid grid-cols-3 gap-2">
                            <div class="col-span-1 opacity-70">版本</div>
                            <div class="col-span-2 font-medium">{{ draft.v }}</div>
                        </div>
                        <div class="grid grid-cols-3 gap-2">
                            <div class="col-span-1 opacity-70">类型</div>
                            <div class="col-span-2 font-medium">{{ getTypeName(draft.t) }}</div>
                        </div>
                        <div class="grid grid-cols-3 gap-2">
                            <div class="col-span-1 opacity-70">铸造时间</div>
                            <div class="col-span-2 font-medium">{{ formatDuration(draft.d) }}</div>
                        </div>
                        <div class="grid grid-cols-3 gap-2">
                            <div class="col-span-1 opacity-70">产物数量</div>
                            <div class="col-span-2 font-medium">{{ draft.c }}</div>
                        </div>
                        <div class="grid grid-cols-3 gap-2">
                            <div class="col-span-1 opacity-70">批量制造</div>
                            <div class="col-span-2 font-medium">{{ draft.b ? "支持" : "不支持" }}</div>
                        </div>
                        <div class="grid grid-cols-3 gap-2">
                            <div class="col-span-1 opacity-70">无限制造</div>
                            <div class="col-span-2 font-medium">{{ draft.i ? "支持" : "不支持" }}</div>
                        </div>
                    </div>
                </div>

                <!-- 产物信息 -->
                <div v-if="product" class="p-3 bg-base-200 rounded mb-3">
                    <div class="text-xs text-base-content/70 mb-2">产物信息</div>
                    <div class="space-y-2 text-sm">
                        <div class="grid grid-cols-3 gap-2">
                            <div class="col-span-1 opacity-70">名称</div>
                            <div class="col-span-2 font-medium">{{ product.名称 }}</div>
                        </div>
                        <div class="grid grid-cols-3 gap-2">
                            <div class="col-span-1 opacity-70">ID</div>
                            <div class="col-span-2 font-medium">{{ draft.p }}</div>
                        </div>
                        <div v-if="'品质' in product" class="grid grid-cols-3 gap-2">
                            <div class="col-span-1 opacity-70">品质</div>
                            <div class="col-span-2 font-medium">{{ (product as any).品质 }}</div>
                        </div>
                        <div v-if="'类型' in product" class="grid grid-cols-3 gap-2">
                            <div class="col-span-1 opacity-70">类型</div>
                            <div class="col-span-2 font-medium">{{ (product as any).类型 }}</div>
                        </div>
                    </div>
                </div>

                <!-- 消耗资源 -->
                <div v-if="draft.x && draft.x.length > 0" class="p-3 bg-base-200 rounded">
                    <div class="text-xs text-base-content/70 mb-2">消耗资源</div>
                    <div class="grid grid-cols-2 gap-2">
                        <div class="flex justify-between items-center p-2 bg-base-300 rounded text-sm">
                            <span class="text-base-content/70">{{ $t("铜币") }}</span>
                            <span class="font-medium text-primary">{{ draft.m }}</span>
                        </div>
                        <template v-for="item in draft.x" :key="item.id">
                            <ShowProps
                                v-for="mod in [new LeveledMod(item.id)]"
                                :props="mod.getProperties()"
                                :title="`${$t(mod.系列)}${$t(mod.名称)}`"
                                :rarity="mod.品质"
                                :polarity="mod.极性"
                                :cost="mod.耐受"
                                :type="`${$t(mod.类型)}${mod.属性 ? `,${$t(mod.属性 + '属性')}` : ''}${mod.限定 ? `,${$t(mod.限定)}` : ''}`"
                                :effdesc="mod.效果"
                                v-if="item.t === 'Mod'"
                            >
                                <RouterLink
                                    :to="`/db/mod/${item.id}`"
                                    class="flex justify-between items-center p-2 bg-base-300 rounded text-sm"
                                >
                                    <span class="text-base-content/70">{{ item.n }}</span>
                                    <span class="font-medium text-primary">{{ item.c }}</span>
                                </RouterLink>
                            </ShowProps>
                            <div v-else class="flex justify-between items-center p-2 bg-base-300 rounded text-sm">
                                <span class="text-base-content/70">{{ item.n }}</span>
                                <span class="font-medium text-primary">{{ item.c }}</span>
                            </div>
                        </template>
                    </div>
                </div>
            </div>
        </div>
    </ScrollArea>
</template>
