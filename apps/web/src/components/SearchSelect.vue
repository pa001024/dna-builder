<script lang="ts" setup>
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from "reka-ui"
import { computed, nextTick, ref, watch } from "vue"
import { matchPinyin } from "@/utils/pinyin-utils"
import { getRaritySwatchClass } from "@/utils/rarity-utils"

export interface SearchSelectOption {
    value: string | number
    label: string
    swatch?: number | string
    dotClass?: string
    /** 选项计数，菜单右侧弱化展示；不参与选中态文本 */
    count?: number
}

defineOptions({ inheritAttrs: false })

const props = withDefaults(
    defineProps<{
        modelValue: string | number
        options: SearchSelectOption[]
        label: string
        clearValue?: string | number
        clearTitle?: string
        menuWidth?: string
        /** 搜索框占位文案，默认「搜索」 */
        searchPlaceholder?: string
    }>(),
    { clearValue: "", searchPlaceholder: "" }
)

const emit = defineEmits<{ "update:modelValue": [value: string | number] }>()
const open = defineModel<boolean>("open", { default: false })

const search = ref("")
/** 键盘导航高亮项在过滤结果中的下标 */
const activeIndex = ref(0)
const searchInput = ref<HTMLInputElement | null>(null)
const listRef = ref<HTMLElement | null>(null)

const isSelected = computed(() => props.modelValue !== props.clearValue)
const selectedOption = computed(() => props.options.find(option => option.value === props.modelValue))
const displayText = computed(() => (isSelected.value ? `${props.label}：${selectedOption.value?.label ?? ""}` : props.label))

/** 过滤：名称与值（ID）都支持中文直匹和拼音，空关键词保持原顺序 */
const filteredOptions = computed(() => {
    const query = search.value.trim()
    if (!query) return props.options
    return props.options.filter(option => matchPinyin(option.label, query).match || matchPinyin(String(option.value), query).match)
})

watch(open, async value => {
    search.value = ""
    if (!value) return
    activeIndex.value = Math.max(
        props.options.findIndex(option => option.value === props.modelValue),
        0
    )
    await nextTick()
    searchInput.value?.focus()
})

watch(activeIndex, async () => {
    await nextTick()
    listRef.value?.querySelector<HTMLElement>("[data-active='true']")?.scrollIntoView({ block: "nearest" })
})

function select(value: string | number) {
    emit("update:modelValue", value)
    open.value = false
}

function clear() {
    emit("update:modelValue", props.clearValue)
    open.value = false
}

function menuLabel(option: SearchSelectOption) {
    return option.value === props.clearValue ? `${props.label}：${option.label}` : option.label
}

function optionClass(option: SearchSelectOption, index: number) {
    return [
        option.value === props.modelValue ? "font-semibold text-primary" : "text-base-content/70",
        index === activeIndex.value ? "bg-primary/10" : "",
    ]
}

/** 搜索框打字后回到列表顶部，避免过滤后仍停在旧的滚动位置 */
function onSearchInput() {
    activeIndex.value = 0
    listRef.value?.scrollTo({ top: 0 })
}

/** 搜索框内键盘导航：上下移动高亮、回车选中；输入法组词期间不拦截 */
function onSearchKeydown(event: KeyboardEvent) {
    if (event.isComposing) return
    const length = filteredOptions.value.length
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault()
        if (!length) return
        activeIndex.value = (activeIndex.value + (event.key === "ArrowDown" ? 1 : -1) + length) % length
        return
    }
    if (event.key === "Enter") {
        event.preventDefault()
        const option = filteredOptions.value[activeIndex.value]
        if (option) select(option.value)
    }
}
</script>

<template>
    <PopoverRoot v-model:open="open">
        <div
            v-bind="$attrs"
            class="inline-flex h-6 items-center rounded-xs border transition-colors duration-150"
            :class="isSelected ? 'border-primary bg-primary' : 'border-base-content/20 hover:border-primary/50'"
            data-search-select
        >
            <PopoverTrigger class="inline-flex h-full min-w-0 max-w-44 cursor-pointer items-center gap-1.5 pl-2 pr-1 outline-hidden" data-search-select-trigger>
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
                class="z-10000 min-w-40 rounded-xs border border-base-content/15 bg-base-100/95 p-1 shadow-lg backdrop-blur-md"
                :class="menuWidth ?? 'max-w-72'"
            >
                <label class="relative mb-1 block">
                    <Icon icon="ri:search-line" class="absolute left-1.5 top-1/2 size-3 -translate-y-1/2 text-base-content/35" />
                    <input
                        ref="searchInput"
                        v-model="search"
                        type="text"
                        spellcheck="false"
                        autocomplete="off"
                        :placeholder="searchPlaceholder || $t('common.search')"
                        class="w-full rounded-xs border border-base-content/10 bg-base-content/5 py-1 pl-6 pr-2 text-[11px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                        @input="onSearchInput"
                        @keydown="onSearchKeydown"
                    />
                </label>

                <div ref="listRef" class="max-h-64 overflow-y-auto">
                    <button
                        v-for="(option, index) in filteredOptions"
                        :key="option.value"
                        type="button"
                        :data-active="index === activeIndex"
                        :data-search-select-value="option.value"
                        class="flex w-full cursor-pointer items-center gap-2 rounded-xs px-2 py-1.5 text-left text-[11px] transition-colors duration-150 hover:bg-primary/10"
                        :class="optionClass(option, index)"
                        @click="select(option.value)"
                    >
                        <span v-if="option.swatch" :class="getRaritySwatchClass(option.swatch)" />
                        <span v-else-if="option.dotClass" class="inline-block size-2.5 shrink-0 rounded-xs border" :class="option.dotClass" />
                        <span class="min-w-0 flex-1 truncate">{{ menuLabel(option) }}</span>
                        <span v-if="option.count !== undefined" class="shrink-0 text-[10px] tabular-nums text-base-content/40">{{ option.count }}</span>
                        <Icon v-if="option.value === modelValue" icon="radix-icons:check" class="size-3.5 shrink-0 text-primary" />
                    </button>
                </div>
                <p v-if="!filteredOptions.length" class="px-2 py-4 text-center text-[11px] text-base-content/40">
                    {{ $t("common.no_match") }}
                </p>
            </PopoverContent>
        </PopoverPortal>
    </PopoverRoot>
</template>
