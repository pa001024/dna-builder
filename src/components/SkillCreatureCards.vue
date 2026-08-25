<script setup lang="ts">
import { computed } from "vue"
import type { SkillCreature } from "@/data"

const props = defineProps<{
    creatures: SkillCreature[]
    titlePrefix?: string
}>()

interface CreatureFieldItem {
    key: string
    value: string | number
}

/**
 * 兼容不同实体形状字段，返回结构化形状文本。
 * @param creature 实体对象
 * @returns 形状文本
 */
function getShapeText(creature: SkillCreature) {
    const shape = creature.形状
    if (!shape) return "未指定"
    if (shape.类型 === "Box" || shape.BoxWidth !== undefined || shape.BoxHeight !== undefined || shape.BoxLength !== undefined) {
        return `方(${shape.BoxWidth || 0} × ${shape.BoxHeight || 0} × ${shape.BoxLength || 0})`
    }
    if (shape.类型 === "Sphere" || shape.SphereRadius !== undefined || shape.Radius !== undefined) {
        return `圆(r=${shape.SphereRadius ?? shape.Radius ?? 0})`
    }
    if (shape.类型 === "Capsule" || shape.CapsuleRadius !== undefined || shape.CapsuleHeight !== undefined) {
        return `胶囊(r=${shape.CapsuleRadius || 0},h=${shape.CapsuleHeight || 0})`
    }
    return "未指定"
}

/**
 * 将实体对象预渲染成字段数组。
 * @param creature 实体对象
 * @returns 结构化字段数组
 */
function getCreatureFields(creature: SkillCreature): CreatureFieldItem[] {
    const fields: CreatureFieldItem[] = [{ key: "形状", value: getShapeText(creature) }]
    if (creature.时长 !== undefined) fields.push({ key: "生命周期", value: `${creature.时长}s` })
    if (creature.速度 !== undefined) fields.push({ key: "速度", value: `${+(creature.速度 / 100).toFixed(1)}m/s` })
    if (creature.射击间隔 !== undefined) fields.push({ key: "射击间隔", value: `${creature.射击间隔}s` })
    if (creature.特效循环间隔 !== undefined) fields.push({ key: "特效循环间隔", value: `${creature.特效循环间隔}s` })
    if (creature.Vars) {
        Object.entries(creature.Vars).forEach(([key, value]) => {
            fields.push({ key, value: value as string | number })
        })
    }
    return fields
}

const creatureCards = computed(() =>
    props.creatures.map(creature => ({
        creature,
        fields: getCreatureFields(creature),
    }))
)
</script>

<template>
    <!-- 实体卡：内层小卡 + 属性格（db-style 二级分层） -->
    <div class="grid grid-cols-1 gap-2">
        <div
            v-for="(card, index) in creatureCards"
            :key="index"
            class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5"
        >
            <!-- 实体头：前缀名称 + 序号 -->
            <div class="mb-2 flex items-center gap-1.5 text-[11px] tracking-wide text-base-content/55">
                <Icon icon="ri:box-1-line" class="h-3.5 w-3.5 shrink-0 text-primary/70" />
                <span class="truncate">{{ titlePrefix ? `${titlePrefix}实体` : "实体" }}</span>
                <span class="shrink-0 font-mono text-[10px] tabular-nums text-base-content/40">#{{ card.creature.id }}</span>
            </div>

            <!-- 属性格：键值对小格 -->
            <div class="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2 text-xs">
                <div
                    v-for="field in card.fields"
                    :key="field.key"
                    class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                >
                    <span class="truncate text-base-content/60">{{ $t(field.key) }}</span>
                    <span class="shrink-0 font-semibold tabular-nums text-primary">{{ field.value }}</span>
                </div>
            </div>
        </div>
    </div>
</template>
