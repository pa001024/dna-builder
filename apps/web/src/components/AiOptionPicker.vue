<script lang="ts" setup>
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from "reka-ui"
import { ref } from "vue"

/**
 * 可手填的选项下拉：保留自由输入，右侧箭头展开候选值。
 */
const props = withDefaults(
    defineProps<{
        /** 候选值（来自上游模型元数据） */
        options: string[]
        /** 输入框占位文案 */
        placeholder?: string
        /** 没有候选值时的提示 */
        emptyText?: string
        /** 列表首项「使用默认」的文案；传空则不显示该项 */
        defaultLabel?: string
    }>(),
    { placeholder: "", emptyText: "", defaultLabel: "" }
)

const model = defineModel<string>({ default: "" })
const open = ref(false)

/**
 * 选中候选项并收起列表。
 * @param value 选项值；空串表示清空覆盖
 */
function pick(value: string) {
    model.value = value
    open.value = false
}
</script>

<template>
    <div class="flex min-w-0 items-center gap-1">
        <input
            v-model="model"
            type="text"
            spellcheck="false"
            autocomplete="off"
            :placeholder="placeholder"
            class="min-w-0 grow rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
        />
        <PopoverRoot v-model:open="open">
            <PopoverTrigger as-child>
                <button
                    type="button"
                    class="btn btn-ghost btn-xs h-6 min-h-0 w-6 shrink-0 p-0 text-base-content/50"
                    :title="$t('setting.aiReasoningEffort')"
                >
                    <Icon
                        icon="radix-icons:chevron-down"
                        class="size-3.5 transition-transform duration-150"
                        :class="open ? 'rotate-180' : ''"
                    />
                </button>
            </PopoverTrigger>
            <PopoverPortal>
                <PopoverContent
                    side="bottom"
                    align="end"
                    :side-offset="6"
                    class="z-50 w-56 rounded-xs border border-base-content/15 bg-base-100/95 p-1 shadow-lg backdrop-blur-md"
                >
                    <button
                        v-if="defaultLabel"
                        type="button"
                        class="flex w-full items-center gap-2 rounded-xs px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-base-content/5"
                        @click="pick('')"
                    >
                        <span class="min-w-0 grow truncate text-base-content/70">{{ defaultLabel }}</span>
                        <Icon v-if="!model" icon="radix-icons:check" class="size-3.5 shrink-0 text-primary" />
                    </button>
                    <button
                        v-for="option in props.options"
                        :key="option"
                        type="button"
                        class="flex w-full items-center gap-2 rounded-xs px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-base-content/5"
                        @click="pick(option)"
                    >
                        <span class="min-w-0 grow truncate">{{ option }}</span>
                        <Icon v-if="model === option" icon="radix-icons:check" class="size-3.5 shrink-0 text-primary" />
                    </button>
                    <div v-if="!props.options.length" class="px-2 py-3 text-center text-xs leading-relaxed text-base-content/45">
                        {{ emptyText }}
                    </div>
                </PopoverContent>
            </PopoverPortal>
        </PopoverRoot>
    </div>
</template>
