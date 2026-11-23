<script lang="ts" setup>
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from "reka-ui"
import { computed, nextTick, ref, watch } from "vue"
import type { AiModelInfo } from "@/api/agent/models"

/**
 * 自定义模型的可输入下拉：主输入框保留手填能力，右侧箭头展开已获取的模型列表。
 */
const props = withDefaults(
    defineProps<{
        /** 从上游 `/models` 拿到的候选模型 */
        models: AiModelInfo[]
        /** 列表请求进行中 */
        loading?: boolean
        /** 主输入框占位文案 */
        placeholder?: string
    }>(),
    { loading: false, placeholder: "" }
)

const model = defineModel<string>({ default: "" })
const emit = defineEmits<{ refresh: [] }>()
const open = ref(false)
const query = ref("")
const searchInput = ref<HTMLInputElement | null>(null)

/** 模型列表弹层里的本地过滤：只在本弹层内生效，不改主输入框的值。 */
const filteredModels = computed(() => {
    const keyword = query.value.trim().toLowerCase()

    if (!keyword) {
        return props.models
    }

    return props.models.filter(
        item => item.id.toLowerCase().includes(keyword) || (item.ownedBy ?? "").toLowerCase().includes(keyword)
    )
})

/** 展开时清空上次搜索并聚焦搜索框。 */
watch(open, async value => {
    if (!value) {
        return
    }

    query.value = ""
    await nextTick()
    searchInput.value?.focus()
})

/**
 * 选中一个模型并收起列表。
 * @param id 模型 id
 */
function selectModel(id: string) {
    model.value = id
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
                    :title="$t('setting.aiModelPickerTitle')"
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
                    class="z-50 w-80 rounded-xs border border-base-content/15 bg-base-100/95 p-2 shadow-lg backdrop-blur-md"
                >
                    <div class="mb-1.5 flex items-center justify-between px-1">
                        <span class="text-xs font-semibold text-base-content/70">{{ $t("setting.aiModelPickerTitle") }}</span>
                        <button
                            type="button"
                            class="btn btn-ghost btn-xs h-6 min-h-0 gap-1 px-1.5 text-[11px]"
                            :disabled="loading"
                            @click="emit('refresh')"
                        >
                            <Icon icon="ri:refresh-line" class="size-3.5" :class="loading ? 'animate-spin' : ''" />
                            {{ $t("setting.aiFetchModels") }}
                        </button>
                    </div>
                    <input
                        ref="searchInput"
                        v-model="query"
                        type="text"
                        spellcheck="false"
                        autocomplete="off"
                        class="mb-1.5 w-full rounded-xs border border-base-content/10 bg-base-content/3 px-2 py-1 text-xs text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                        :placeholder="$t('setting.aiModelSearchPlaceholder')"
                    />
                    <div class="max-h-64 overflow-y-auto">
                        <button
                            v-for="item in filteredModels"
                            :key="item.id"
                            type="button"
                            class="flex w-full items-center gap-2 rounded-xs px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-base-content/5"
                            @click="selectModel(item.id)"
                        >
                            <span class="min-w-0 grow truncate">{{ item.id }}</span>
                            <Icon v-if="item.id === model" icon="radix-icons:check" class="size-3.5 shrink-0 text-primary" />
                        </button>
                        <div v-if="!filteredModels.length" class="px-2 py-4 text-center text-xs text-base-content/45">
                            {{ models.length ? $t("setting.aiModelNoMatch") : $t("setting.aiModelEmpty") }}
                        </div>
                    </div>
                </PopoverContent>
            </PopoverPortal>
        </PopoverRoot>
    </div>
</template>
