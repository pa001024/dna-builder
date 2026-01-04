<script lang="ts" setup>
import { computed } from "vue"
import { getRewardDetails } from "../utils/reward-utils"

// 定义组件接收的Props
interface Props {
    rewardId: number
}

const props = defineProps<Props>()

// 使用computed获取奖励根节点
const rewardRoot = computed(() => {
    return getRewardDetails(props.rewardId)
})

// 获取掉落模式文本
function getDropModeText(mode: string): string {
    const modeMap: Record<string, string> = {
        Independent: "独立",
        Weight: "权重",
        Fixed: "固定",
        Gender: "性别",
        Level: "等级",
        Once: "一次",
        Sequence: "序列",
    }

    return modeMap[mode] || mode
}

// 获取奖励类型文本
function getRewardTypeText(type: string): string {
    const typeMap: Record<string, string> = {
        Char: "角色",
        CharAccessory: "角色饰品",
        Drop: "掉落物",
        HeadFrame: "头像框",
        HeadSculpture: "头像",
        Mod: "魔之楔",
        Pet: "魔灵",
        Resource: "资源",
        Reward: "奖励组",
        Skin: "角色皮肤",
        Title: "称号",
        TitleFrame: "称号框",
        Walnut: "胡桃",
        Weapon: "武器",
        WeaponAccessory: "武器饰品",
        WeaponSkin: "武器皮肤",
    }

    return typeMap[type] || type
}
</script>

<template>
    <div class="space-y-1">
        <!-- 递归奖励显示 -->
        <template v-for="item in rewardRoot?.child || []" :key="`${item.id}-${item.t}`">
            <div class="flex items-start gap-2 text-xs">
                <span
                    class="w-2 h-2 rounded-full shrink-0 mt-1"
                    :class="item.t === 'Drop' ? 'bg-warning' : item.t === 'Reward' ? 'bg-error' : 'bg-info'"
                ></span>
                <div class="flex-1">
                    <div class="flex items-center gap-2">
                        <span>
                            {{ item.d ? "图纸:" : ""
                            }}{{ (item.n && $t(item.n)) || (item.t === "Reward" ? `奖励组 ${item.id}` : `ID: ${item.id}`) }}
                            <span class="text-xs text-base-content/50">({{ $t(getRewardTypeText(item.t)) }})</span>
                        </span>
                        <span v-if="item.c" class="text-base-content/70">x{{ item.c }}</span>
                        <span v-if="item.p" class="text-base-content/70">
                            ({{ item.p < 1 ? `概率:${(item.p * 100).toFixed(2)}%` : `权重:${item.p}` }})
                        </span>
                        <!-- 显示掉落模式 -->
                        <span
                            v-if="item.t === 'Reward'"
                            class="text-xs px-1.5 py-0.5 rounded"
                            :class="
                                getDropModeText(item.m || '') === '独立'
                                    ? 'bg-success text-success-content'
                                    : 'bg-warning text-warning-content'
                            "
                        >
                            {{ getDropModeText(item.m || "") }}
                        </span>
                    </div>
                    <!-- 递归显示子奖励 -->
                    <div v-if="item.child && item.child.length" class="pl-4 mt-1 space-y-1">
                        <template v-for="childItem in item.child" :key="`${childItem.id}-${childItem.t}`">
                            <div class="flex items-start gap-2 text-xs">
                                <span
                                    class="w-2 h-2 rounded-full shrink-0 mt-1"
                                    :class="childItem.t === 'Drop' ? 'bg-warning' : childItem.t === 'Reward' ? 'bg-error' : 'bg-info'"
                                ></span>
                                <div class="flex-1">
                                    <div class="flex items-center gap-2">
                                        <span>
                                            {{ $t(childItem.d ? "图纸:" : "") }}
                                            {{
                                                (childItem.n && $t(childItem.n)) ||
                                                (childItem.t === "Reward" ? `奖励组 ${childItem.id}` : `ID: ${childItem.id}`)
                                            }}
                                            <span class="text-xs text-base-content/50">({{ getRewardTypeText(childItem.t) }})</span>
                                        </span>
                                        <span v-if="childItem.c" class="text-base-content/70">x{{ childItem.c }}</span>
                                        <span v-if="childItem.p" class="text-base-content/70"
                                            >({{
                                                childItem.p < 1 ? `概率:${(childItem.p * 100).toFixed(2)}%` : `权重:${childItem.p}`
                                            }})</span
                                        >
                                        <!-- 显示掉落模式 -->
                                        <span
                                            v-if="childItem.t === 'Reward'"
                                            class="text-xs px-1.5 py-0.5 rounded"
                                            :class="
                                                getDropModeText(childItem.m || '') === '独立'
                                                    ? 'bg-success text-success-content'
                                                    : 'bg-warning text-warning-content'
                                            "
                                        >
                                            {{ getDropModeText(childItem.m || "") }}
                                        </span>
                                    </div>
                                    <!-- 再次递归显示子奖励（最多支持两层嵌套，如需更多可继续添加） -->
                                    <div v-if="childItem.child && childItem.child.length" class="pl-4 mt-1 space-y-1">
                                        <template
                                            v-for="grandChildItem in childItem.child"
                                            :key="`${grandChildItem.id}-${grandChildItem.t}`"
                                        >
                                            <div class="flex items-start gap-2 text-xs">
                                                <span
                                                    class="w-2 h-2 rounded-full shrink-0 mt-1"
                                                    :class="
                                                        grandChildItem.t === 'Drop'
                                                            ? 'bg-warning'
                                                            : grandChildItem.t === 'Reward'
                                                              ? 'bg-error'
                                                              : 'bg-info'
                                                    "
                                                ></span>
                                                <div class="flex-1">
                                                    <div class="flex items-center gap-2">
                                                        <span
                                                            >{{ grandChildItem.d ? "图纸:" : ""
                                                            }}{{
                                                                (grandChildItem.n && $t(grandChildItem.n)) ||
                                                                (grandChildItem.t === "Reward"
                                                                    ? `奖励组 ${grandChildItem.id}`
                                                                    : `ID: ${grandChildItem.id}`)
                                                            }}
                                                            <span class="text-xs text-base-content/50"
                                                                >({{ getRewardTypeText(grandChildItem.t) }})</span
                                                            ></span
                                                        >
                                                        <span v-if="grandChildItem.c" class="text-base-content/70"
                                                            >x{{ grandChildItem.c }}</span
                                                        >
                                                        <span v-if="grandChildItem.p" class="text-base-content/70"
                                                            >({{
                                                                grandChildItem.p < 1
                                                                    ? `概率:${(grandChildItem.p * 100).toFixed(2)}%`
                                                                    : `权重:${grandChildItem.p}`
                                                            }})</span
                                                        >
                                                        <!-- 显示掉落模式 -->
                                                        <span
                                                            v-if="grandChildItem.t === 'Reward'"
                                                            class="text-xs px-1.5 py-0.5 rounded"
                                                            :class="
                                                                getDropModeText(grandChildItem.m || '') === '独立'
                                                                    ? 'bg-success text-success-content'
                                                                    : 'bg-warning text-warning-content'
                                                            "
                                                        >
                                                            {{ getDropModeText(grandChildItem.m || "") }}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </template>
                                    </div>
                                </div>
                            </div>
                        </template>
                    </div>
                </div>
            </div>
        </template>
    </div>
</template>
