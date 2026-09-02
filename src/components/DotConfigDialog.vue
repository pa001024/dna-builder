<script setup lang="ts">
import { computed } from "vue"
import type { DotFrequencySettings } from "@/composables/useCharSettings"
import { type CharBuild, type DotFrequencyResult, type DotSourceConfig } from "@/data/CharBuild"
import { format100 } from "@/util"

const props = defineProps<{
    charBuild: CharBuild
    dotSettings: DotFrequencySettings
}>()

defineEmits<{
    close: []
}>()

/**
 * DOT 频率分解（技能/近战/远程/同律），供滑块上限与频率分解展示。
 */
const dotFrequencies = computed<DotFrequencyResult>(() => {
    if (typeof props.charBuild.calculateDotFrequencies !== "function") {
        return { cap: 0, ownFreq: 0, otherFreq: 0, totalFreq: 0, sources: [] }
    }
    return props.charBuild.calculateDotFrequencies()
})

/**
 * 可配置来源（触发为 0 的来源无滑块，整块隐藏；未装备同律武器同理）。
 */
const visibleSources = computed(() => dotFrequencies.value.sources.filter(source => !source.hidden))

/**
 * 单来源命名空间对应的每秒 DOT 伤害（用于分量展示）。
 * @param type 来源类型
 * @returns 每秒 DOT 伤害
 */
function sourceDamage(type: DotSourceConfig["type"]): number {
    if (typeof props.charBuild.calculateDotDamage !== "function") return 0
    const namespace = type === "skill" ? "角色" : type === "melee" ? "melee" : type === "ranged" ? "ranged" : "同律"
    return props.charBuild.calculateDotDamage(namespace)
}

/**
 * 格式化频率：两位小数。
 * @param value 频率值
 * @returns 格式化字符串
 */
function formatFreq(value: number): string {
    return `${+value.toFixed(2)}`
}

/**
 * 触发百分比展示（触发为 1 时显示 100%；触发是概率值，不带 +/- 前缀）。
 * @param value 触发值
 * @returns 百分比字符串
 */
function formatTrigger(value: number): string {
    return format100(value)
}

/**
 * 来源展示名称。
 * @param type 来源类型
 * @returns 中文名称
 */
function sourceName(type: DotSourceConfig["type"]): string {
    if (type === "skill") return "技能DOT"
    if (type === "melee") return "近战DOT"
    if (type === "ranged") return "远程DOT"
    return "同律DOT"
}

/**
 * 来源命名空间展示名。
 * @param type 来源类型
 * @returns 命名空间名
 */
function sourceNamespace(type: DotSourceConfig["type"]): string {
    if (type === "skill") return "角色"
    if (type === "melee") return "melee"
    if (type === "ranged") return "ranged"
    return "同律"
}
</script>

<template>
    <div
        class="modal-box w-11/12 max-w-3xl max-h-[85vh] overflow-y-auto rounded-xs border border-base-content/15 bg-base-100/85 p-3 shadow-lg backdrop-blur-md"
    >
        <!-- 弹窗头：英文小标 + 中文标题 + 关闭按钮 -->
        <div class="flex items-center gap-2 pr-1">
            <SectionHeader no-animate compact kicker="DOT" title="DOT伤害计算" class="grow" />
            <button class="btn btn-sm btn-ghost btn-circle shrink-0" @click="$emit('close')">
                <Icon icon="radix-icons:cross2" />
            </button>
        </div>
        <p class="mt-1 text-[11px] tracking-wide text-base-content/55">
            公式：角色攻击 × 0.2 × 6 × 3 × (1 + 充盈威力) × 频率 × 抗性区（含属性穿透）
        </p>

        <!-- 各来源频率配置（无触发来源整块隐藏，不占位） -->
        <div class="mt-3 space-y-2">
            <div v-for="source in visibleSources" :key="source.type" class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5">
                <div class="flex items-baseline justify-between gap-2">
                    <span class="text-sm font-semibold">
                        {{ sourceName(source.type) }}
                        <span v-if="source.type !== 'skill'" class="ml-1 font-normal text-base-content/55">{{ source.label }}</span>
                    </span>
                    <span class="text-[11px] tracking-wide text-base-content/55">
                        触发
                        <span class="font-orbitron text-[13px] font-semibold text-primary tabular-nums">{{ formatTrigger(source.trigger) }}</span>
                        · 上限
                        <span class="font-orbitron text-[13px] font-semibold text-primary tabular-nums">{{ formatFreq(source.cap) }}</span> 次/秒
                    </span>
                </div>
                <div class="mt-2.5 flex items-center gap-3">
                    <input
                        v-model.number="dotSettings[source.type]"
                        type="text"
                        inputmode="decimal"
                        class="w-14 rounded-none border-b border-base-content/25 bg-transparent py-0.5 text-center font-orbitron text-[13px] font-semibold text-primary tabular-nums outline-none transition-colors duration-200 focus:border-primary"
                    />
                    <div class="grow">
                        <input
                            v-model.number="dotSettings[source.type]"
                            type="range"
                            class="range range-primary range-xs w-full"
                            :min="0"
                            :max="source.cap"
                            step="0.01"
                        />
                        <div class="mt-0.5 flex justify-between text-[10px] text-base-content/40">
                            <span>0</span>
                            <span class="font-orbitron tabular-nums text-primary">{{ formatFreq(source.freq) }} / {{ formatFreq(source.cap) }}</span>
                        </div>
                    </div>
                </div>
                <div class="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-base-content/55">
                    <span v-if="source.type !== 'skill' && source.otherElementCount > 0">
                        其余属性 <span class="font-orbitron tabular-nums text-primary">{{ source.otherElementCount }}</span> 种
                    </span>
                    <span v-if="source.type !== 'skill' && source.hasAdditionalDamage" class="text-primary">
                        追加伤害 &gt; 0（异常数量=1 时频率翻倍）
                    </span>
                    <span v-if="source.doubled" class="text-secondary">
                        频率翻倍 → <span class="font-orbitron tabular-nums">{{ formatFreq(source.effectiveFreq) }}</span> 次/秒
                    </span>
                    <span v-if="source.otherFreq > 0">
                        其余属性 <span class="font-orbitron tabular-nums">{{ formatFreq(source.otherFreq) }}</span> 次/秒
                    </span>
                    <span v-if="source.ownFreq > 0">
                        角色自身属性 <span class="font-orbitron tabular-nums">{{ formatFreq(source.ownFreq) }}</span> 次/秒
                    </span>
                </div>
            </div>
        </div>

        <!-- 频率分解汇总 -->
        <div class="mt-3 rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <div class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                <span class="text-[11px] tracking-wide text-base-content/60">角色自身属性 DOT 频率</span>
                <span class="font-orbitron text-[13px] font-semibold text-primary tabular-nums">{{ formatFreq(dotFrequencies.ownFreq) }} 次/秒</span>
            </div>
            <div class="mt-2 flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                <span class="text-[11px] tracking-wide text-base-content/60">其余属性 DOT 频率</span>
                <span class="font-orbitron text-[13px] font-semibold text-primary tabular-nums">{{ formatFreq(dotFrequencies.otherFreq) }} 次/秒</span>
            </div>
            <div class="mt-2 flex items-center justify-between gap-2 rounded-xs border border-primary/30 bg-primary/5 px-2.5 py-2">
                <span class="text-[11px] font-semibold tracking-wide text-base-content/80">总频率</span>
                <span class="font-orbitron text-[13px] font-semibold text-primary tabular-nums">{{ formatFreq(dotFrequencies.totalFreq) }} 次/秒</span>
            </div>
        </div>

        <!-- 各命名空间每秒 DOT 伤害（全部为每秒，语义由区块标题统一） -->
        <div class="mt-3 rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
            <SectionHeader no-animate compact kicker="DPS" title="每秒DOT伤害（按来源）" />
            <div class="mt-2 flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                <span class="text-[11px] tracking-wide text-base-content/60">全部来源</span>
                <DamageShow :value="charBuild.calculateDotDamage()" />
            </div>
            <div
                v-for="source in visibleSources"
                :key="source.type"
                class="mt-2 flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
            >
                <span class="text-[11px] tracking-wide text-base-content/60">{{ sourceNamespace(source.type) }}::DOT伤害</span>
                <DamageShow :value="sourceDamage(source.type)" />
            </div>
        </div>

        <div class="mt-3 flex justify-end">
            <button class="btn btn-sm btn-ghost" @click="$emit('close')">关闭</button>
        </div>
    </div>
</template>
