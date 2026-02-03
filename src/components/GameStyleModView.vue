<script lang="ts" setup>
import { computed } from "vue"
import type { LeveledMod } from "@/data/leveled/LeveledMod"

const props = defineProps<{
    mods: (LeveledMod | null)[]
}>()

/**
 * 计算总耐受值
 */
const totalEndurance = computed(() => {
    return props.mods.reduce((sum, mod) => sum + (mod ? mod.耐受 : 0), 0)
})

/**
 * 计算耐受值百分比
 */
const endurancePercent = computed(() => {
    const maxEndurance = 117
    return Math.min((totalEndurance.value / maxEndurance) * 100, 100)
})

/**
 * 获取 Mod 品质对应的颜色
 */
function getQualityColor(quality: string): string {
    const colorMap: Record<string, string> = {
        金: "from-yellow-900 to-yellow-100",
        紫: "from-purple-900 to-purple-300",
        蓝: "from-blue-900 to-blue-300",
        绿: "from-green-900 to-green-300",
        白: "from-gray-900 to-gray-300",
    }
    return colorMap[quality] || "from-gray-900 to-gray-300"
}

/**
 * 获取 Mod 图标 URL
 */
function getModIcon(mod: LeveledMod): string {
    return mod.url || ""
}

/**
 * 卡片布局
 */
const cardLayout = {
    left: [
        [0, 2], // 第一行
        [6, 4], // 第二行
    ],
    right: [
        [3, 1], // 第一行
        [7, 5], // 第二行
    ],
    center: 8, // 中心卡片索引
}
</script>

<template>
    <div class="relative p-8 h-100 w-240 flex items-center justify-center" style="--spacing: min(0.4rem, calc(0.7vw / 2))">
        <!-- 左侧卡片 (两行两列) -->
        <div class="absolute left-8 top-1/2 transform -translate-y-1/2">
            <div v-for="(row, rowIndex) in cardLayout.left" :key="rowIndex" class="flex gap-4 mb-4">
                <div v-for="(index, colIndex) in row" :key="colIndex">
                    <div class="relative group" :class="{ 'translate-x-12': rowIndex === 0 }">
                        <!-- 特殊形状卡片 -->
                        <div class="relative w-28 h-44 m-3 my-1 transition-transform duration-300 hover:scale-105">
                            <!-- 背景层 -->
                            <div
                                class="absolute inset-0 bottom-8 transform -skew-x-15 rounded-2xl rounded-bl-md rounded-tr-md bg-linear-to-b game-style-mod-view-item"
                                :class="getQualityColor(mods[index]?.品质 || '白')"
                            ></div>

                            <!-- 内容层 -->
                            <div class="relative h-full" v-if="mods[index]">
                                <!-- 耐受值和极性标签 (左侧卡片在右上角) -->
                                <div class="absolute top-1 -right-3">
                                    <span class="text-white text-xs bg-black/80 px-1.5 py-0.5 rounded-full">
                                        {{ mods[index].耐受 }}
                                        <Icon class="inline-block mb-1" v-if="mods[index]!.极性" :icon="`po-${mods[index]!.极性!}`" />
                                    </span>
                                </div>

                                <!-- 图标 -->
                                <div class="flex justify-center translate-x-1 pt-2">
                                    <img :src="getModIcon(mods[index])" class="size-32 max-w-32 pointer-events-none" alt="" />
                                </div>

                                <!-- 等级 -->
                                <div class="absolute top-32 text-center text-lg -translate-x-2 flex items-center justify-center">
                                    <div v-for="i in 5" :key="i" class="scale-y-75 inline-block relative w-4 left-2">
                                        <span class="absolute size-3 left-0 inline-block bg-black rotate-45"></span>
                                        <span
                                            class="absolute size-2 top-0.5 left-0.5 inline-block rotate-45"
                                            :class="[i + 5 <= mods[index].等级 ? 'bg-white' : 'bg-gray-600']"
                                        ></span>
                                    </div>
                                </div>
                                <!-- 信息 -->
                                <div class="text-center -translate-x-6 font-semibold pt-3">
                                    <span>{{ mods[index].名称 }}</span>
                                    <span class="ml-2">+{{ mods[index].等级 }}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- 右侧卡片 (两行两列) -->
        <div class="absolute right-8 top-1/2 transform -translate-y-1/2">
            <div v-for="(row, rowIndex) in cardLayout.right" :key="rowIndex" class="flex gap-4 mb-4">
                <div v-for="(index, colIndex) in row" :key="colIndex">
                    <div class="relative group" :class="{ '-translate-x-12': rowIndex === 0 }">
                        <!-- 特殊形状卡片 -->
                        <div class="relative w-28 h-44 m-3 my-1 transition-transform duration-300 hover:scale-105">
                            <!-- 背景层 -->
                            <div
                                class="absolute inset-0 bottom-8 transform skew-x-15 rounded-2xl rounded-bl-md rounded-tr-md bg-linear-to-b game-style-mod-view-item"
                                :class="getQualityColor(mods[index]?.品质 || '白')"
                            ></div>

                            <!-- 内容层 -->
                            <div class="relative h-full" v-if="mods[index]">
                                <!-- 耐受值和极性标签 (右侧卡片在右上角) -->
                                <div class="absolute top-1 -left-3">
                                    <span class="text-white text-xs bg-black/80 px-1.5 py-0.5 rounded-full">
                                        {{ mods[index].耐受 }}
                                        <Icon class="inline-block mb-1" v-if="mods[index]!.极性" :icon="`po-${mods[index]!.极性!}`" />
                                    </span>
                                </div>

                                <!-- 图标 -->
                                <div class="flex justify-center translate-x-1 pt-2">
                                    <img :src="getModIcon(mods[index])" class="size-32 max-w-32 pointer-events-none" alt="" />
                                </div>

                                <!-- 等级 -->
                                <div
                                    v-if="mods[index].品质 === '金'"
                                    class="absolute top-32 text-center text-lg translate-x-6 flex items-center justify-center"
                                >
                                    <div v-for="i in 5" :key="i" class="scale-y-75 inline-block relative w-4 left-2">
                                        <span class="absolute size-3 left-0 inline-block bg-black rotate-45"></span>
                                        <span
                                            class="absolute size-2 top-0.5 left-0.5 inline-block rotate-45"
                                            :class="[i + 5 <= mods[index].等级 ? 'bg-white' : 'bg-gray-600']"
                                        ></span>
                                    </div>
                                </div>
                                <!-- 信息 -->
                                <div class="text-center translate-x-4 font-semibold pt-3">
                                    <span>{{ mods[index].名称 }}</span>
                                    <span class="ml-2">+{{ mods[index].等级 }}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- 中心区域 -->
        <div class="relative flex flex-col items-center">
            <!-- 弧形进度条 -->
            <div class="absolute -top-40">
                <svg class="w-52 h-24" viewBox="0 0 100 50">
                    <!-- 背景弧形 (120度) -->
                    <path
                        d="M25,35 A30,30 0 0,1 75,35"
                        fill="none"
                        stroke-linecap="round"
                        stroke="rgba(255, 255, 255, 0.3)"
                        stroke-width="4"
                    />
                    <!-- 进度弧形 (120度) -->
                    <path
                        d="M25,35 A30,30 0 0,1 75,35"
                        fill="none"
                        stroke="rgba(255, 255, 255, 0.9)"
                        stroke-width="4"
                        stroke-linecap="round"
                        :style="{
                            strokeDasharray: '62.83',
                            strokeDashoffset: `calc(62.83 - (62.83 * ${endurancePercent} / 100))`,
                            transition: 'stroke-dashoffset 0.5s ease-in-out',
                        }"
                    />
                </svg>
            </div>

            <!-- 耐受值显示 -->
            <div class="absolute -top-20 text-center">
                <div class="text-white text-lg font-bold">{{ totalEndurance }}/117</div>
                <div class="text-white/70 text-sm">耐受值</div>
            </div>

            <!-- 中心圆形卡片 -->
            <div
                class="relative rounded-full border-4 border-white/40 transform transition-all duration-300 hover:scale-105 hover:border-white/70"
            >
                <!-- 背景渐变 -->
                <div
                    class="absolute inset-0 bg-linear-to-b rounded-full"
                    :class="getQualityColor(mods[cardLayout.center]?.品质 || '白')"
                ></div>

                <!-- 弧形耐受值指示器 -->
                <div
                    v-if="mods[cardLayout.center]"
                    class="absolute -bottom-1 -right-1 w-8 h-8 bg-black/80 flex items-center justify-center rounded-full border-2 border-white/40"
                >
                    <!-- 耐受值和极性 -->
                    <span class="text-white text-xs whitespace-nowrap">
                        {{ mods[cardLayout.center]!.耐受 }}
                        <Icon
                            class="inline-block mb-1"
                            v-if="mods[cardLayout.center]?.极性"
                            :icon="`po-${mods[cardLayout.center]!.极性!}`"
                        />
                    </span>
                </div>

                <!-- 卡片内容 -->
                <div class="relative" v-if="mods[cardLayout.center]">
                    <!-- 图标 -->
                    <img :src="getModIcon(mods[cardLayout.center]!)" class="size-32 max-w-32 pointer-events-none" alt="" />
                </div>
            </div>
            <!-- 信息 -->
            <div v-if="mods[cardLayout.center]" class="text-center font-semibold pt-3">
                <span>{{ mods[cardLayout.center]?.名称 }}</span>
                <span class="ml-2">+{{ mods[cardLayout.center]?.等级 }}</span>
            </div>
        </div>
    </div>
</template>

<style scoped>
.game-style-mod-view-item {
    box-shadow:
        inset 0 -40px 60px -20px rgba(220, 200, 150, 0.2),
        0 0 4px 2px rgba(255, 255, 255, 0.1),
        0 0 3px 1px rgba(255, 255, 255, 0.15);
}
.transform-rotate-45-scale-y-60 {
    transform: rotate(45deg) scaleY(0.6);
}
</style>
