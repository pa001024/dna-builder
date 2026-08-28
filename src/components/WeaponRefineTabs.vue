<script setup lang="ts">
/**
 * 武器熔炼等级切换方章
 * 以 v-model 绑定当前熔炼等级（0~5），样式与 CharSkillShow 的技能切换方章保持一致。
 */
const model = defineModel<number>({ default: 0 })

/** 熔炼等级展示文案：数字 / 罗马数字 */
const REFINE_LABELS = ["0", "I", "II", "III", "IV", "V"] as const
</script>

<template>
    <div class="mt-2 flex items-center">
        <span class="mr-1 shrink-0 text-xs text-base-content/55 min-w-20">熔炼</span>
        <div class="ml-3 grid grid-cols-6 items-center gap-1.5 grow">
            <button
                v-for="(label, index) in REFINE_LABELS"
                :key="label"
                type="button"
                class="cursor-pointer whitespace-nowrap rounded-xs border px-2.5 py-1 font-orbitron text-xs tabular-nums transition-colors duration-150 active:scale-[0.97] min-w-8"
                :class="
                    model === index
                        ? 'border-primary bg-primary font-semibold text-primary-content'
                        : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                "
                @click="model = index"
            >
                {{ label }}
            </button>
        </div>
    </div>
</template>
