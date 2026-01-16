<script lang="ts" setup>
import { LeveledMod } from "../data"
import { RewardItem as RewardItemType } from "../utils/reward-utils"

// 递归
defineOptions({
    name: "RewardItem",
})

// 定义组件接收的Props
interface Props {
    reward: RewardItemType
}

defineProps<Props>()

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
        Walnut: "密函",
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
        <template v-for="item in reward?.child || []" :key="`${item.id}-${item.t}`">
            <div class="flex items-start gap-2 text-xs">
                <span
                    class="w-2 h-2 rounded-full shrink-0 mt-1"
                    :class="item.dp ? 'bg-warning' : item.t === 'Reward' ? 'bg-error' : 'bg-info'"
                />
                <div class="flex-1">
                    <div class="flex items-center gap-2">
                        <span>
                            {{ item.dp ? "掉落物: " : "" }}
                            {{ item.d ? "图纸: " : "" }}
                            <ShowProps
                                v-for="mod in [new LeveledMod(item.id)]"
                                v-if="item.t === 'Mod'"
                                :key="mod.id"
                                :props="mod.getProperties()"
                                :title="`${$t(mod.系列)}${$t(mod.名称)}`"
                                :rarity="mod.品质"
                                :polarity="mod.极性"
                                :cost="mod.耐受"
                                :type="`${$t(mod.类型)}${mod.属性 ? `,${$t(mod.属性 + '属性')}` : ''}${mod.限定 ? `,${$t(mod.限定)}` : ''}`"
                                :effdesc="mod.效果"
                            >
                                <RouterLink :to="`/db/mod/${item.id}`" class="text-xs hover:text-primary hover:underline">{{
                                    (item.n && $t(item.n)) || `ID: ${item.id}`
                                }}</RouterLink>
                            </ShowProps>
                            <span v-else>{{
                                (item.n && $t(item.n)) || (item.t === "Reward" ? `奖励组 ${item.id}` : `ID: ${item.id}`)
                            }}</span>
                            <span class="text-xs text-base-content/50">({{ $t(getRewardTypeText(item.t)) }})</span>
                        </span>
                        <span v-if="item.c" class="text-base-content/70">x{{ item.c }}</span>
                        <span v-if="item.p" class="text-base-content/70">
                            ({{ `权重:${item.p}` }}
                            {{ item.pp ? `比例:${+(item.pp * 100).toFixed(2)}%` : "" }}
                            {{ item.times ? `每个期望:${+item.times.toFixed(2)}次` : "" }}
                            )
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
                            <span v-if="item.totalP"> 总容量 {{ item.totalP }}</span>
                        </span>
                    </div>
                    <!-- 递归显示子奖励 -->
                    <div v-if="item.child && item.child.length" class="pl-4 mt-1 space-y-1">
                        <RewardItem :reward="item" />
                    </div>
                </div>
            </div>
        </template>
    </div>
</template>
