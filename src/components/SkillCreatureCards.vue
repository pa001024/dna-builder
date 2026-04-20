<script setup lang="ts">
import { computed } from "vue"
import type { SkillCreature } from "../data"

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
    <div class="grid grid-cols-1 gap-3">
        <div v-for="(card, index) in creatureCards" :key="index" class="rounded">
            <div class="text-xs text-base-content/70 mb-2">
                {{ titlePrefix ? `${titlePrefix}实体#${card.creature.id}` : `实体#${card.creature.id}` }}
            </div>
            <div class="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2 text-xs">
                <div
                    v-for="field in card.fields"
                    :key="field.key"
                    class="flex justify-between items-center p-2 bg-base-300 rounded text-sm"
                >
                    <span class="text-base-content/60">{{ $t(field.key) }}</span>
                    <span class="font-medium text-primary">{{ field.value }}</span>
                </div>
            </div>
        </div>
    </div>
</template>
