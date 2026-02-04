<script setup lang="ts">
import { computed } from "vue"
import type { BuffAttr, BuffBody, BuffDot, EffectAttr, Skill } from "../data/data-types"

// 组件属性
const props = defineProps<{
    skill?: Skill // 技能对象
    lv: number // 等级
}>()

const e = computed(() => props.skill?.e)
const b = computed(() => props.skill?.b)
const p = computed(() => props.skill?.p)

/**
 * 格式化数值或数值数组
 * @param value 数值或数值数组
 * @returns 格式化后的字符串
 */
const formatValue = (value: number | number[]): string => {
    if (Array.isArray(value)) {
        return value[props.lv - 1].toString()
    }
    return value.toString()
}

/**
 * 格式化 BuffDot 数组
 * @param dot BuffDot对象
 * @returns 格式化后的字符串
 */
const formatBuffDot = (dot: BuffDot): string => {
    const parts: string[] = []
    if (dot.d) parts.push(`延迟:${dot.d}`)
    if (dot.it) parts.push(`间隔:${dot.it}`)
    if (dot.t) parts.push(`类型:${dot.t}`)
    if (dot.v !== undefined) parts.push(`值:${dot.v}`)
    if (dot.r !== undefined)
        parts.push(`倍率:${Array.isArray(dot.r) ? `[${dot.r.map((r: number) => r.toFixed(2)).join(", ")}]` : dot.r.toFixed(2)}`)
    if (dot.c !== undefined) parts.push(`条件:${dot.c}`)
    return parts.join(", ")
}

/**
 * 格式化 BuffAttr 数组
 * @param attrs BuffAttr数组
 * @returns 格式化后的字符串
 */
const formatBuffAttrs = (attrs: BuffAttr[]): string => {
    return attrs
        .map(attr => {
            const parts: string[] = []
            if (attr.k) parts.push(`${attr.k}`)
            if (attr.v !== undefined) parts.push(`:${formatValue(attr.v)}`)
            if (attr.t) parts.push(`(${attr.t})`)
            if (attr.z) parts.push(`[${attr.z}]`)
            return parts.join("")
        })
        .join(", ")
}

/**
 * 格式化 EffectAttr 数组
 * @param effect EffectAttr对象
 * @returns 格式化后的字符串
 */
const formatEffectAttr = (effect: EffectAttr): string => {
    const parts: string[] = []

    if (effect.fn) parts.push(`函数:${effect.fn}`)
    if (effect.ba) parts.push(`基础属性:${effect.ba}`)
    if (effect.r !== undefined) parts.push(`倍率:${formatValue(effect.r)}`)
    if (effect.v !== undefined) parts.push(`值:${formatValue(effect.v)}`)
    if (effect.co) parts.push(`条件:${effect.co}`)
    if (effect.Dilation !== undefined) parts.push(`时间膨胀:${effect.Dilation}`)
    if (effect.Duration !== undefined) parts.push(`持续时间:${effect.Duration}`)
    if (effect.Delay !== undefined) parts.push(`延迟:${effect.Delay}`)
    if (effect.dt) parts.push(`伤害类型:${effect.dt}`)
    if (effect.tp !== undefined) parts.push(`触发概率:${effect.tp}`)
    if (effect.ai !== undefined) parts.push(`允许技能威力:${effect.ai}`)
    if (effect.as !== undefined) parts.push(`允许技能持续:${effect.as}`)
    if (effect.BuffType) parts.push(`Buff类型:${effect.BuffType}`)
    if (effect.LastTimeValue) parts.push(`持续时间值:${effect.LastTimeValue}`)
    if (effect.FixLocation) parts.push(`固定位置`)
    if (effect.MaxSummonCount) parts.push(`最大召唤数:${effect.MaxSummonCount}`)
    if (effect.LifeTime) parts.push(`生命时间:${effect.LifeTime}`)
    if (effect.RefreshRule) parts.push(`刷新规则:${effect.RefreshRule}`)
    if (effect.Camp) parts.push(`阵营:${effect.Camp}`)
    if (effect.dot) parts.push(`Dot:[${effect.dot.map(d => formatBuffDot(d)).join("; ")}]`)
    if (effect.t) parts.push(`属性:[${formatBuffAttrs(effect.t)}]`)
    if (effect.cid) parts.push(`创造物ID:[${effect.cid}]`)
    if (effect.si) {
        const shape = effect.si.st
        let shapeName = ""
        let shapeParam = ""
        switch (shape) {
            case "Sphere":
                shapeName = "圆"
                shapeParam = `r=${effect.si.r}`
                break
            case "Box":
                shapeName = "方"
                shapeParam = `w=${effect.si.w},h=${effect.si.h},l=${effect.si.l}`
                break
            case "Capsule":
                shapeName = "胶囊"
                shapeParam = `r=${effect.si.r},h=${effect.si.h}`
                break
        }
        parts.push(`形状:${shapeName}(${shapeParam})`)
    }
    if (effect.tg) parts.push(`tag:${effect.tg}`)
    if (effect.sp !== undefined) parts.push(`速度:${effect.sp}`)
    effect.aura?.forEach(aura => {
        parts.push(`光环(${aura.range},${aura.camp}):[${formatBuffBody(aura.t)}]`)
    })

    return parts.join(" | ")
}

/**
 * 格式化 BuffBody 数组
 * @param buffBody BuffBody对象
 * @returns 格式化后的字符串
 */
const formatBuffBody = (buffBody: BuffBody): string => {
    const parts: string[] = []

    if (buffBody.fn) parts.push(`函数:${buffBody.fn}`)
    if (buffBody.dot) parts.push(`Dot:[${buffBody.dot.map(d => formatBuffDot(d)).join("; ")}]`)
    if (buffBody.t) parts.push(`属性:[${formatBuffAttrs(buffBody.t)}]`)
    if (buffBody.aura) parts.push(`光环:${buffBody.aura.length}个`)

    return parts.join(" | ")
}
</script>

<template>
    <div class="space-y-4 text-sm">
        <!-- 效果 (e) -->
        <div v-if="e && e.length > 0" class="flex flex-col gap-2">
            <h3 class="font-bold text-base-content/80 border-b border-base-300 pb-1">效果 (SkillEffect)</h3>
            <div v-for="(effect, index) in e" :key="index" class="bg-base-100 rounded-md p-2 border border-base-200">
                <div class="text-xs text-primary font-medium mb-1">ID: {{ effect.id }}</div>
                <div v-if="effect.t && effect.t.length > 0" class="flex flex-col gap-1">
                    <div
                        v-for="(attr, idx) in effect.t"
                        :key="idx"
                        class="text-xs bg-base-200/50 p-1.5 rounded hover:bg-base-200/80 transition-colors"
                    >
                        {{ formatEffectAttr(attr) }}
                        <div v-if="attr.pe !== undefined" class="text-xs text-secondary font-medium">
                            <div
                                v-for="(value, key) in attr.pe"
                                :key="key"
                                class="bg-base-200/50 p-1.5 rounded hover:bg-base-200/80 transition-colors"
                            >
                                <span class="font-medium">{{ key }}:</span>
                                <span class="ml-2">{{ formatValue(value!) }}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Buff (b) -->
        <div v-if="b && b.length > 0" class="flex flex-col gap-2">
            <h3 class="font-bold text-base-content/80 border-b border-base-300 pb-1">增益 (Buff)</h3>
            <div v-for="(buff, index) in b" :key="index" class="bg-base-100 rounded-md p-2 border border-base-200">
                <div class="text-xs text-primary font-medium mb-1">ID: {{ buff.id }}</div>
                <div v-if="buff.t && buff.t.length > 0" class="flex flex-col gap-1">
                    <div
                        v-for="(body, idx) in buff.t"
                        :key="idx"
                        class="text-xs bg-base-200/50 p-1.5 rounded hover:bg-base-200/80 transition-colors"
                    >
                        {{ formatBuffBody(body) }}
                    </div>
                </div>
            </div>
        </div>

        <!-- 被动 (p) -->
        <div v-if="p && p.length > 0" class="flex flex-col gap-2">
            <h3 class="font-bold text-base-content/80 border-b border-base-300 pb-1">被动 (PassiveEffect)</h3>
            <div v-for="(passive, index) in p" :key="index" class="bg-base-100 rounded-md p-2 border border-base-200">
                <div class="text-xs text-primary font-medium mb-1">ID: {{ passive.id }}</div>
                <div v-if="passive.v" class="text-xs space-y-1">
                    <div
                        v-for="(value, key) in passive.v"
                        :key="key"
                        class="bg-base-200/50 p-1.5 rounded hover:bg-base-200/80 transition-colors"
                    >
                        <span class="font-medium">{{ key }}:</span>
                        <span class="ml-2">{{ formatValue(value) }}</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- 无数据提示 -->
        <div v-if="!e?.length && !b?.length && !p?.length" class="text-xs text-base-content/50 text-center py-4">暂无详细数据</div>
    </div>
</template>
