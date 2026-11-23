<script lang="ts" setup>
import { computed } from "vue"
import { LeveledCharHelper, LeveledModHelper, LeveledWeaponHelper, resourceMap } from "@/data"
import type { Resource } from "@/data/d/resource.data"
import { getRewardDetailLink } from "@/utils/reward-link"

const props = withDefaults(
    defineProps<{
        /** 奖励类型（与奖励数据 `t` 同口径）：Resource / Pack / Mod / Weapon / Char */
        type?: string
        /** 奖励 ID */
        id?: number | string
        /** 悬停提示方向 */
        side?: "top" | "right" | "bottom" | "left"
    }>(),
    { type: "", id: 0, side: "top" }
)

/**
 * 数据表缺项时返回 undefined，避免单条异常奖励打断整棵奖励树渲染。
 * @param factory 构造逻辑
 * @returns 构造结果；抛错时返回 undefined
 */
function safeResolve<T>(factory: () => T): T | undefined {
    try {
        return factory()
    } catch {
        return undefined
    }
}

/**
 * 通过资源 ID 查找资源信息（与 ResourceCostItem / reward-link 的查找口径一致）。
 * @param id 资源 ID
 * @returns 资源数据
 */
function findResourceById(id: number | string): Resource | undefined {
    const direct = resourceMap.get(Number.isFinite(Number(id)) ? Number(id) : (id as string))
    if (direct) {
        return direct
    }

    const normalizedId = Number(id)
    return Number.isFinite(normalizedId) ? [...resourceMap.values()].find(item => item.id === normalizedId) : undefined
}

const resource = computed(() =>
    props.type === "Resource" || props.type === "Pack" ? findResourceById(props.id) : undefined
)

const mod = computed(() => (props.type === "Mod" ? safeResolve(() => LeveledModHelper.fromId(Number(props.id))) : undefined))

const weapon = computed(() =>
    props.type === "Weapon" ? safeResolve(() => LeveledWeaponHelper.fromId(props.id)) : undefined
)

const char = computed(() => (props.type === "Char" ? safeResolve(() => LeveledCharHelper.fromId(props.id)) : undefined))

const link = computed(() => getRewardDetailLink(props.type, props.id) || undefined)
</script>

<template>
    <!-- 触发内容需保持单根节点：各提示组件都用 as-child 把事件挂到该节点上 -->
    <ShowProps v-if="mod" :mod="mod" :link="link" :side="side">
        <slot />
    </ShowProps>
    <ShowProps v-else-if="weapon" :weapon="weapon" :link="link" :side="side">
        <slot />
    </ShowProps>
    <ShowProps v-else-if="char" :char="char" :link="link" :side="side">
        <slot />
    </ShowProps>
    <FullTooltip v-else-if="resource" :side="side">
        <template #tooltip>
            <div class="-mx-3.75 -my-2.5">
                <ResourceTooltip :resource="resource" :link="link" bare />
            </div>
        </template>
        <slot />
    </FullTooltip>
    <template v-else>
        <slot />
    </template>
</template>
