<script lang="ts" setup>
type AchievementItem = (typeof import("@/data/d/achievement.data").default)[number]

const props = defineProps<{
    achievement: AchievementItem
}>()

/**
 * 将品质数字转换为中文标签。
 */
function getQualityLabel(quality: number): string {
    return ["", "铜", "银", "金"][quality] || `${quality}`
}

/**
 * 将品质数字转换为图标资源后缀。
 */
function getQualityIcon(quality: number): string {
    return ["", "Copper", "Silver", "Gold"][quality] || "Copper"
}
</script>

<template>
    <div class="p-3 space-y-3">
        <div class="p-3 flex items-center justify-between gap-3">
            <div>
                <SRouterLink :to="`/db/achievement/${achievement.id}`" class="text-lg font-bold link link-primary">
                    {{ $t(achievement.名称) }}
                </SRouterLink>
                <div class="text-sm text-base-content/70">ID: {{ achievement.id }}</div>
            </div>
            <img
                v-if="achievement.品质"
                :src="`/imgs/webp/Icon_Achievement_${getQualityIcon(achievement.品质)}.webp`"
                alt="品质"
                class="w-8 h-8"
            />
        </div>

        <div class="p-3 bg-base-200 rounded">
            <div class="text-xs text-base-content/70 mb-2">基本信息</div>
            <div class="space-y-2 text-sm">
                <div class="grid grid-cols-3 gap-2">
                    <div class="col-span-1 opacity-70">名称</div>
                    <div class="col-span-2 font-medium">{{ $t(achievement.名称) }}</div>
                </div>
                <div class="grid grid-cols-3 gap-2">
                    <div class="col-span-1 opacity-70">描述</div>
                    <div class="col-span-2">{{ $t(achievement.描述) }}</div>
                </div>
                <div class="grid grid-cols-3 gap-2">
                    <div class="col-span-1 opacity-70">分类</div>
                    <div class="col-span-2 font-medium">{{ $t(achievement.分类) }}</div>
                </div>
                <div class="grid grid-cols-3 gap-2">
                    <div class="col-span-1 opacity-70">版本</div>
                    <div class="col-span-2 font-medium">{{ achievement.版本 }}</div>
                </div>
                <div class="grid grid-cols-3 gap-2">
                    <div class="col-span-1 opacity-70">品质</div>
                    <div class="col-span-2 font-medium">{{ getQualityLabel(achievement.品质) }}</div>
                </div>
            </div>
        </div>

        <div class="p-3 bg-base-200 rounded">
            <div class="text-xs text-base-content/70 mb-2">奖励</div>
            <div class="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2 text-sm">
                <div v-for="(value, key) in achievement.奖励" :key="key" class="p-2 rounded bg-base-100 border border-base-300">
                    <div class="text-base-content/70">{{ $t(key) }}</div>
                    <div class="font-medium">x{{ value }}</div>
                </div>
            </div>
        </div>
    </div>
</template>
