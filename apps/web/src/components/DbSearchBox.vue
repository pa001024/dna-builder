<script lang="ts" setup>
import { useTranslation } from "i18next-vue"
import { computed } from "vue"

const searchKeyword = defineModel<string>({ required: true })

const props = withDefaults(
    defineProps<{
        placeholder?: string
        count?: number
        clearTitle?: string
    }>(),
    { placeholder: "", count: 0, clearTitle: "" }
)

const { t } = useTranslation()
const resolvedClearTitle = computed(() => props.clearTitle || t("common.clear"))

/**
 * 清空搜索关键词。
 */
function clearSearchKeyword() {
    searchKeyword.value = ""
}
</script>

<template>
    <div class="relative">
        <Icon icon="ri:search-line" class="absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-base-content/35" />
        <input
            v-model="searchKeyword"
            type="text"
            :placeholder="placeholder"
            class="w-full rounded-none border-b border-base-content/25 bg-transparent py-1.5 pl-7 pr-12 text-sm outline-none transition-colors duration-200 placeholder:text-base-content/35 focus:border-primary"
        />
        <button
            v-if="searchKeyword"
            type="button"
            :title="resolvedClearTitle"
            :aria-label="resolvedClearTitle"
            class="group absolute right-0 top-1/2 flex h-5 -translate-y-1/2 cursor-pointer items-center justify-end"
            @click="clearSearchKeyword"
        >
            <span class="font-mono text-[11px] text-base-content/40 group-hover:hidden">
                {{ count }}
            </span>
            <Icon icon="ri:close-line" class="hidden size-3.5 text-base-content/40 group-hover:block hover:text-primary" />
        </button>
        <span
            v-else
            class="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 font-mono text-[11px] text-base-content/40"
        >
            {{ count }}
        </span>
    </div>
</template>
