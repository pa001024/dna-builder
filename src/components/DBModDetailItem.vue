<script lang="ts" setup>
import { computed, ref, watch } from "vue"
import { getDungeonName } from "@/utils/dungeon-utils"
import { getModDropInfo } from "@/utils/reward-utils"
import { modDraftMap, modDungeonMap } from "../data/d/index"
import type { Draft, Dungeon, Mod } from "../data/data-types"
import { LeveledMod } from "../data/leveled/LeveledMod"
import { formatProp } from "../util"

const props = defineProps<{
    mod: Mod
}>()

// 当前等级
const currentLevel = ref(1)
const buffLv = ref(0)

// 创建LeveledMod实例
const leveledMod = computed(() => {
    return new LeveledMod(props.mod, currentLevel.value, buffLv.value)
})

// 监听mod变化，重置等级为新mod的等级上限
watch(
    () => props.mod,
    newMod => {
        currentLevel.value = LeveledMod.modQualityMaxLevel[newMod.品质] || 1
    }
)

// 根据品质获取颜色
function getQualityColor(quality: string): string {
    const colorMap: Record<string, string> = {
        白: "bg-gray-200 text-gray-800",
        绿: "bg-green-200 text-green-800",
        蓝: "bg-blue-200 text-blue-800",
        紫: "bg-purple-200 text-purple-800",
        金: "bg-yellow-200 text-yellow-800",
    }
    return colorMap[quality] || "bg-base-200 text-base-content"
}

// 处理效果描述中的极性
const formatEffDesc = (desc: string) => {
    const po = desc.match(/([DVOA])趋向/)
    if (!po) {
        return desc
    }
    const parts = desc.split(po[0])
    return [parts[0], po[1], parts[1]]
}

// 获取当前mod的图纸信息
const modDraft = computed<Draft | undefined>(() => {
    return modDraftMap.get(props.mod.id)
})

// 获取当前mod的掉落来源
const modDungeons = computed<Dungeon[]>(() => {
    return modDungeonMap.get(props.mod.id) || []
})

// 将分钟数转换为00:00格式
function formatDuration(minutes: number): string {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`
}
</script>

<template>
    <ScrollArea class="h-full">
        <div class="p-3 space-y-4">
            <div class="p-3">
                <div class="flex items-center gap-3 mb-3">
                    <SRouterLink :to="`/db/mod/${mod.id}`" class="text-lg font-bold link link-primary">
                        {{ $t(mod.系列) }}{{ $t(mod.名称) }}
                    </SRouterLink>
                    <span class="text-xs text-base-content/70">ID: {{ mod.id }}</span>
                    <div class="text-sm text-base-content/70 flex items-center gap-2">
                        <span class="px-1.5 py-0.5 rounded" :class="getQualityColor(leveledMod.品质)">
                            {{ $t(leveledMod.品质) }}
                        </span>
                        <div v-if="mod.极性 || mod.耐受" class="ml-auto badge badge-sm badge-soft gap-1 text-base-content/80">
                            {{ leveledMod.耐受 }}
                            <Icon v-if="mod.极性" :icon="`po-${mod.极性}`" />
                        </div>
                    </div>
                </div>

                <div class="flex justify-center items-center">
                    <img :src="leveledMod.url" class="w-24 object-cover rounded" />
                </div>

                <div class="flex flex-wrap gap-2 text-sm opacity-70 mb-3">
                    <span>{{ $t(leveledMod.类型) }}</span>
                    <span v-if="leveledMod.属性">{{ $t(`${leveledMod.属性}属性`) }}</span>
                    <span v-if="leveledMod.限定">{{ $t(leveledMod.限定) }}</span>
                </div>

                <!-- 等级调整 -->
                <div class="mb-3">
                    <div class="flex items-center gap-4">
                        <span class="text-sm min-w-12"
                            >Lv. <input v-model.number="currentLevel" type="text" class="w-12 text-center" />
                        </span>
                        <input
                            :key="leveledMod.id"
                            v-model.number="currentLevel"
                            type="range"
                            class="range range-primary range-xs grow"
                            :min="1"
                            :max="leveledMod.maxLevel"
                            step="1"
                        />
                    </div>
                </div>

                <div v-if="leveledMod.效果" class="p-3 bg-base-200 rounded mb-3">
                    <div class="text-xs text-base-content/70 mb-1">效果</div>
                    <div class="text-sm">
                        <span v-if="/(?:[DVOA])趋向/.test(leveledMod.效果)">
                            <template v-for="(part, index) in formatEffDesc(leveledMod.效果)" :key="index">
                                <span v-if="index !== 1">{{ part }}</span>
                                <span v-else>
                                    <Icon class="inline-block mx-1" :icon="`po-${part as 'A' | 'D' | 'V' | 'O'}`" />
                                    趋向
                                </span>
                            </template>
                        </span>
                        <span v-else>{{ leveledMod.效果 }}</span>
                    </div>
                </div>

                <div v-if="leveledMod.buff" class="p-3 bg-base-200 rounded mb-3">
                    <div class="text-xs text-base-content/70 mb-1">Buff</div>
                    <div class="space-y-2">
                        <!-- 等级调整 -->
                        <div v-if="leveledMod.buff.mx" class="flex items-center gap-4">
                            <span class="text-sm min-w-12">Lv. {{ buffLv }}</span>
                            <input
                                v-model.number="buffLv"
                                type="range"
                                class="range range-primary range-xs grow"
                                :min="leveledMod.buff.lx ?? 1"
                                :max="leveledMod.buff.mx ?? 1"
                                step="1"
                            />
                        </div>
                        <label v-else class="text-sm min-w-12">
                            <input v-model="buffLv" type="checkbox" class="toggle toggle-primary toggle-sm" />
                            启用
                        </label>
                    </div>
                </div>

                <div class="p-3 bg-base-200 rounded">
                    <div class="text-xs text-base-content/70 mb-2">属性</div>
                    <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
                        <div
                            v-for="[key, attr] in Object.entries(leveledMod.getProperties()).filter(([_, v]) => v)"
                            :key="key"
                            class="flex justify-between items-center p-2 bg-base-300 rounded text-sm"
                        >
                            <span class="text-base-content/70">{{ key }}</span>
                            <span class="font-medium text-primary">{{ formatProp(key, attr) }}</span>
                        </div>
                    </div>
                </div>

                <div v-if="leveledMod.生效" class="p-3 bg-base-200 rounded">
                    <div class="text-xs text-base-content/70 mb-2">条件属性</div>
                    <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
                        <div
                            v-for="[key, attr] in Object.entries(leveledMod.生效).filter(([k, v]) => k !== '条件' && v)"
                            :key="key"
                            class="flex justify-between items-center p-2 bg-base-300 rounded text-sm"
                        >
                            <span class="text-base-content/70">{{ key }}</span>
                            <span class="font-medium text-primary">{{ formatProp(key, attr) }}</span>
                        </div>
                    </div>
                </div>

                <!-- 图纸信息 -->
                <div v-if="modDraft" class="p-3 bg-base-200 rounded mt-2">
                    <div class="text-xs text-base-content/70 mb-2">图纸 (ID: {{ modDraft.id }})</div>
                    <div class="space-y-2 text-sm">
                        <div class="grid grid-cols-3 gap-2">
                            <div class="col-span-1 opacity-70">名称</div>
                            <div class="col-span-2 font-medium">
                                {{ modDraft.n }}
                            </div>
                        </div>
                        <div class="grid grid-cols-3 gap-2">
                            <div class="col-span-1 opacity-70">稀有度</div>
                            <div class="col-span-2 font-medium">
                                <Icon v-for="i in modDraft.r" :key="i" class="inline-block mr-1" icon="ri:star-fill" />
                            </div>
                        </div>
                        <div class="grid grid-cols-3 gap-2">
                            <div class="col-span-1 opacity-70">版本</div>
                            <div class="col-span-2 font-medium">
                                {{ modDraft.v }}
                            </div>
                        </div>
                        <div class="grid grid-cols-3 gap-2">
                            <div class="col-span-1 opacity-70">铸造时间</div>
                            <div class="col-span-2 font-medium">
                                {{ formatDuration(modDraft.d) }}
                            </div>
                        </div>
                        <div class="grid grid-cols-3 gap-2">
                            <div class="col-span-1 opacity-70">批量制造</div>
                            <div class="col-span-2 font-medium">
                                {{ modDraft.b ? "支持" : "不支持" }}
                            </div>
                        </div>
                        <div class="grid grid-cols-3 gap-2">
                            <div class="col-span-1 opacity-70">无限制造</div>
                            <div class="col-span-2 font-medium">
                                {{ modDraft.i ? "支持" : "不支持" }}
                            </div>
                        </div>
                        <div v-if="modDraft.x.length > 0" class="mt-3">
                            <div class="text-xs text-base-content/70 mb-1">消耗资源</div>
                            <div class="grid grid-cols-2 gap-2">
                                <div class="flex justify-between items-center p-2 bg-base-300 rounded text-sm">
                                    <span class="text-base-content/70">{{ $t("铜币") }}</span>
                                    <span class="font-medium text-primary">{{ modDraft.m }}</span>
                                </div>
                                <template v-for="item in modDraft.x" :key="item.id">
                                    <template v-if="item.t === 'Mod'">
                                        <ShowProps
                                            v-for="detailMod in [new LeveledMod(item.id)]"
                                            :key="detailMod.id"
                                            :props="detailMod.getProperties()"
                                            :title="`${$t(detailMod.系列)}${$t(detailMod.名称)}`"
                                            :rarity="detailMod.品质"
                                            :polarity="detailMod.极性"
                                            :cost="detailMod.耐受"
                                            :type="`${$t(detailMod.类型)}${detailMod.属性 ? `,${$t(detailMod.属性 + '属性')}` : ''}${detailMod.限定 ? `,${$t(detailMod.限定)}` : ''}`"
                                            :effdesc="detailMod.效果"
                                        >
                                            <SRouterLink
                                                :to="`/db/mod/${item.id}`"
                                                class="flex justify-between items-center p-2 bg-base-300 rounded text-sm"
                                            >
                                                <span class="text-base-content/70">{{ item.n }}</span>
                                                <span class="font-medium text-primary">{{ item.c }}</span>
                                            </SRouterLink>
                                        </ShowProps>
                                    </template>
                                    <div v-else class="flex justify-between items-center p-2 bg-base-300 rounded text-sm">
                                        <span class="text-base-content/70">{{ item.n }}</span>
                                        <span class="font-medium text-primary">{{ item.c }}</span>
                                    </div>
                                </template>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 掉落来源 -->
                <div v-if="modDungeons.length > 0" class="p-3 bg-base-200 rounded mt-2">
                    <div class="text-xs text-base-content/70 mb-2">掉落来源</div>
                    <div class="space-y-2 text-sm">
                        <FullTooltip v-for="dungeon in modDungeons" :key="dungeon.id" side="bottom">
                            <template #tooltip>
                                <DBDungeonDetailItem :dungeon="dungeon" />
                            </template>
                            <SRouterLink
                                :to="`/db/dungeon/${dungeon.id}`"
                                class="flex flex-col gap-1 p-2 bg-base-300 rounded hover:bg-base-content/10 transition-colors"
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
                                    </div>
                                </div>
                                <!-- 显示掉落概率信息 -->
                                <div class="text-xs text-base-content/50">
                                    <span v-if="getModDropInfo(dungeon, mod.id).pp" class="mr-2">
                                        概率: {{ +(getModDropInfo(dungeon, mod.id).pp! * 100).toFixed(2) }}%
                                    </span>
                                    <span v-if="getModDropInfo(dungeon, mod.id).times">
                                        期望: {{ +getModDropInfo(dungeon, mod.id).times!.toFixed(2) }}次
                                    </span>
                                </div>
                            </SRouterLink>
                        </FullTooltip>
                    </div>
                </div>
            </div>
        </div>
    </ScrollArea>
</template>
