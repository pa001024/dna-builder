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
    /**
     * 形状行的形状名翻译键（方/圆/胶囊/未指定）。
     * 形状名与尺寸分开传，由模板用 $t 翻译，保证切换语言时能随渲染刷新。
     */
    shapeKey?: string
}

/**
 * 兼容不同实体形状字段，把形状名与尺寸拆开返回。
 * @param creature 实体对象
 * @returns shapeKey 为形状名翻译键，dims 为尺寸文本（未指定时为空串）
 */
function resolveShape(creature: SkillCreature): { shapeKey: string; dims: string } {
    const shape = creature.形状
    if (!shape) return { shapeKey: "skill-creature.unspecified", dims: "" }
    if (shape.类型 === "Box" || shape.BoxWidth !== undefined || shape.BoxHeight !== undefined || shape.BoxLength !== undefined) {
        return {
            shapeKey: "skill-creature.box",
            dims: `(${shape.BoxWidth || 0} × ${shape.BoxHeight || 0} × ${shape.BoxLength || 0})`,
        }
    }
    if (shape.类型 === "Sphere" || shape.SphereRadius !== undefined || shape.Radius !== undefined) {
        return { shapeKey: "skill-creature.circle", dims: `(r=${shape.SphereRadius ?? shape.Radius ?? 0})` }
    }
    if (shape.类型 === "Capsule" || shape.CapsuleRadius !== undefined || shape.CapsuleHeight !== undefined) {
        return { shapeKey: "skill-creature.capsule", dims: `(r=${shape.CapsuleRadius || 0},h=${shape.CapsuleHeight || 0})` }
    }
    return { shapeKey: "skill-creature.unspecified", dims: "" }
}

/**
 * 将实体对象预渲染成字段数组。
 * @param creature 实体对象
 * @returns 结构化字段数组
 */
function getCreatureFields(creature: SkillCreature): CreatureFieldItem[] {
    const shape = resolveShape(creature)
    const fields: CreatureFieldItem[] = [{ key: "skill-creature.shape", shapeKey: shape.shapeKey, value: shape.dims }]
    if (creature.时长 !== undefined) fields.push({ key: "skill-creature.lifetime", value: `${creature.时长}s` })
    if (creature.速度 !== undefined) fields.push({ key: "skill-creature.speed", value: `${+(creature.速度 / 100).toFixed(1)}m/s` })
    if (creature.射击间隔 !== undefined) fields.push({ key: "射击间隔", value: `${creature.射击间隔}s` })
    if (creature.特效循环间隔 !== undefined) fields.push({ key: "skill-creature.vfxLoopInterval", value: `${creature.特效循环间隔}s` })
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
    <div
        v-for="(card, index) in creatureCards"
        :key="index"
        class="flex items-stretch gap-3 rounded-xs border border-base-content/10 bg-base-content/3 p-2"
    >
        <div class="flex w-20 shrink-0 flex-col items-center justify-between gap-2">
            <div class="flex flex-col items-center gap-1.5 h-full">
                <div class="w-full flex-1 flex gap-1.5 justify-center items-center text-center text-[11px] wrap-break-word text-base-content/55">
                    <Icon icon="ri:box-1-line" class="size-4 text-primary/70" />
                    <span>{{ titlePrefix ? `${titlePrefix}${$t("skill-creature.entity")}` : $t("skill-creature.entity") }}</span>
                </div>
                <CopyID :id="card.creature.id ?? '-'" class="text-[10px]" />
            </div>
        </div>
        <div class="flex min-w-0 flex-1 flex-col justify-center gap-1">
            <div v-for="field in card.fields" :key="field.key" class="flex items-baseline justify-between gap-3 text-xs">
                <span class="truncate text-base-content/55">{{ $t(field.key) }}</span>
                <span class="shrink-0 font-semibold text-primary">{{ field.shapeKey ? `${$t(field.shapeKey)}${field.value}` : field.value }}</span>
            </div>
        </div>
    </div>
</template>
