<script setup lang="ts">
import { LeveledBuff } from "@/data/leveled"
import { format100 } from "@/util"

const props = defineProps<{
    buff: LeveledBuff
    lv: number
    selected?: boolean
    income: number
    title?: string
    /** 覆盖率（0-1，仅选中且父级提供时显示覆盖率控件） */
    coverage?: number
    /** 显式描述（特效行传入的国际化熔炼/效果文案，仅在 buff 无自带手写描述时展示） */
    description?: string
    /** BUFF 是否被已装备 MOD 禁用（数据 `禁用` 命中）：名称加删除线且不产生收益 */
    disabled?: boolean
    /** 禁用该 BUFF 的 MOD 名称（用于悬停提示） */
    disabledBy?: string
}>()
const emit = defineEmits<{
    setBuffLv: [buff: LeveledBuff, level: number]
    setBuffCoverage: [buff: LeveledBuff, coverage: number]
}>()

const setBuffLv = (buff: LeveledBuff, lv: number) => {
    emit("setBuffLv", buff, lv)
}
</script>
<template>
    <div class="flex">
        <ShowProps
            side="top"
            :props="buff.getProperties()"
            :attr="buff.dynamicAttr"
            :code="buff.code"
            :applicable-skill="buff.技能"
            :title="title"
            :note="disabled ? (disabledBy ? $t('buff-editor.disabled_by', { mod: disabledBy }) : $t('buff-editor.disabled')) : undefined"
        >
            <div
                class="flex flex-1 flex-col gap-2 rounded-xs border border-base-content/10 bg-base-100/70 p-3 cursor-pointer hover:border-primary/40 transition-colors duration-200"
                :class="{
                    ' border-primary bg-primary/5 shadow-sm shadow-primary/10 hover:border-primary': selected,
                }"
            >
                <div class="flex min-h-8 items-start gap-2">
                    <div class="flex min-w-0 flex-1 items-start gap-1.5 text-sm font-medium leading-snug">
                        <Icon
                            v-if="selected"
                            icon="ri:checkbox-circle-fill"
                            class="mt-0.5 size-3.5 shrink-0 text-primary"
                        />
                        <span class="wrap-break-word" :class="{ 'line-through decoration-base-content/50': disabled }">
                            {{ $t(buff.名称) }}
                        </span>
                    </div>
                    <div v-if="income" class="shrink-0 text-right">
                        <div class="text-[10px] font-medium tracking-[0.12em] text-base-content/40">
                            {{ $t("char-build.income") }}
                        </div>
                        <div class="mt-1 font-orbitron text-[13px] font-semibold leading-none text-primary tabular-nums">
                            {{ format100(income) }}
                        </div>
                    </div>
                </div>
                <div v-if="buff.描述 || description" class="text-xs leading-5 text-base-content/55">
                    {{ buff.描述 ? $t(buff.描述) : description }}
                </div>
                <div
                    v-if="buff.mx || (selected && coverage !== undefined)"
                    class="mt-auto flex items-center gap-2 border-t border-base-content/10 pt-2"
                >
                    <div v-if="buff.mx" class="flex items-center gap-1.5">
                        <span class="font-orbitron text-[10px] tracking-wide text-base-content/40">Lv.</span>
                        <NumberInput
                            v-if="selected"
                            :model-value="lv"
                            :min="buff.lx || 0"
                            :max="buff.mx"
                            @update:model-value="setBuffLv(buff, $event)"
                        />
                        <span v-else class="font-orbitron text-xs font-medium text-base-content/70 tabular-nums">{{ lv }}</span>
                    </div>
                    <div v-if="selected && coverage !== undefined" class="ml-auto shrink-0">
                        <CoverageDialog
                            :coverage="coverage"
                            :title="$t('char-build.coverage')"
                            :hint="$t('char-build.set_buff_coverage')"
                            @update-coverage="emit('setBuffCoverage', buff, $event)"
                        />
                    </div>
                </div>
            </div>
        </ShowProps>
    </div>
</template>
