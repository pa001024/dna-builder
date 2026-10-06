<script lang="ts" setup>
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from "reka-ui"
import { computed } from "vue"
import { getRaritySwatchClass } from "@/utils/rarity-utils"

export interface FilterSelectOption {
    value: string | number
    label: string
    swatch?: number | string
    dotClass?: string
}

const props = withDefaults(
    defineProps<{
        modelValue: string | number
        options: FilterSelectOption[]
        label: string
        clearValue?: string | number
        clearTitle?: string
        menuWidth?: string
    }>(),
    { clearValue: "" }
)

const emit = defineEmits<{ "update:modelValue": [value: string | number] }>()
const open = defineModel<boolean>("open", { default: false })

const isSelected = computed(() => props.modelValue !== props.clearValue)
const selectedOption = computed(() => props.options.find(option => option.value === props.modelValue))
const displayText = computed(() => (isSelected.value ? `${props.label}：${selectedOption.value?.label ?? ""}` : props.label))

function select(value: string | number) {
    emit("update:modelValue", value)
    open.value = false
}

function clear() {
    emit("update:modelValue", props.clearValue)
    open.value = false
}

function menuLabel(option: FilterSelectOption) {
    return option.value === props.clearValue ? `${props.label}：${option.label}` : option.label
}
</script>

<template>
    <PopoverRoot v-model:open="open">
        <div
            class="inline-flex h-6 items-center rounded-xs border transition-colors duration-150"
            :class="isSelected ? 'border-primary bg-primary' : 'border-base-content/20 hover:border-primary/50'"
        >
            <PopoverTrigger class="inline-flex h-full min-w-0 max-w-44 cursor-pointer items-center gap-1.5 pl-2 pr-1 outline-hidden">
                <span v-if="isSelected && selectedOption?.swatch" :class="getRaritySwatchClass(selectedOption.swatch)" />
                <span
                    v-else-if="isSelected && selectedOption?.dotClass"
                    class="inline-block size-2.5 shrink-0 rounded-xs border"
                    :class="selectedOption.dotClass"
                />
                <span class="truncate text-[11px]" :class="isSelected ? 'font-semibold text-primary-content' : 'text-base-content/55'">
                    {{ displayText }}
                </span>
                <Icon v-if="!isSelected" icon="radix-icons:chevron-down" class="size-3 shrink-0 text-base-content/40" />
            </PopoverTrigger>
            <button
                v-if="isSelected"
                type="button"
                class="inline-flex h-full shrink-0 cursor-pointer items-center px-1.5 text-primary-content transition-colors duration-150 hover:text-primary-content/60"
                :title="clearTitle"
                @click="clear"
            >
                <Icon icon="ri:close-line" class="size-3" />
            </button>
        </div>

        <PopoverPortal>
            <PopoverContent
                align="start"
                :side-offset="4"
                class="z-10000 max-h-72 min-w-32 overflow-y-auto rounded-xs border border-base-content/15 bg-base-100/95 p-1 shadow-lg backdrop-blur-md"
                :class="menuWidth ?? 'max-w-72'"
            >
                <button
                    v-for="option in options"
                    :key="option.value"
                    type="button"
                    class="flex w-full cursor-pointer items-center gap-2 rounded-xs px-2 py-1.5 text-left text-[11px] transition-colors duration-150 hover:bg-primary/10"
                    :class="option.value === modelValue ? 'font-semibold text-primary' : 'text-base-content/70'"
                    @click="select(option.value)"
                >
                    <span v-if="option.swatch" :class="getRaritySwatchClass(option.swatch)" />
                    <span
                        v-else-if="option.dotClass"
                        class="inline-block size-2.5 shrink-0 rounded-xs border"
                        :class="option.dotClass"
                    />
                    <span class="min-w-0 flex-1 truncate">{{ menuLabel(option) }}</span>
                    <Icon v-if="option.value === modelValue" icon="radix-icons:check" class="size-3.5 shrink-0 text-primary" />
                </button>
            </PopoverContent>
        </PopoverPortal>
    </PopoverRoot>
</template>
