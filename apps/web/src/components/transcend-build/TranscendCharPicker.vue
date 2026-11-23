<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { useGameText } from "@/composables/useGameText"
import { charData, LeveledChar } from "@/data"
import { getElementDisplayName } from "@/utils/element-utils"
import { matchPinyin } from "@/utils/pinyin-utils"

/**
 * 全屏角色选择器：卡片网格 + 搜索（中文/拼音），与武器选择的交互一致。
 * 协战场景可排除主控 / 另一协战，并提供「无」选项写回 0。
 * Teleport 到 body，避免被左栏 ScrollArea 裁剪。
 */

const props = defineProps<{
    open: boolean
    selectedId: number
    /** 不参与选择的角色 id（协战：排除主控与另一协战） */
    excludeIds?: number[]
    /** 是否在网格首位提供「无」（选中写回 0） */
    allowEmpty?: boolean
    /** 标题 i18n 键 */
    titleKey?: string
}>()

const emit = defineEmits<{
    (event: "update:open", value: boolean): void
    (event: "select", charId: number): void
}>()

const { gt } = useGameText()

const search = ref("")

watch(
    () => props.open,
    value => {
        if (value) search.value = ""
    }
)

/** 排除集合（主控 / 另一协战） */
const excluded = computed(() => new Set(props.excludeIds ?? []))

/** 过滤后的角色列表 */
const chars = computed(() => {
    const query = search.value.trim()
    const source = excluded.value.size ? charData.filter(char => !excluded.value.has(char.id)) : charData
    if (!query) return source
    return source.filter(char => char.名称.includes(query) || matchPinyin(char.名称, query))
})

/**
 * 选择角色并关闭。
 * @param charId 角色 id
 */
function select(charId: number): void {
    emit("select", charId)
    emit("update:open", false)
}
</script>

<template>
    <Teleport v-if="open" to="body">
        <dialog class="modal" :class="{ 'modal-open': open }" data-transcend-char-picker>
            <div class="modal-box relative h-11/12 max-w-11/12">
                <SectionHeader number="01" kicker="CHARACTER" :title="$t(titleKey || 'char-build.select_character')" no-animate compact>
                    <template #trailing>
                        <button class="btn btn-ghost btn-sm btn-square" @click="emit('update:open', false)">
                            <Icon bold icon="codicon:chrome-close" />
                        </button>
                    </template>
                </SectionHeader>
                <div class="border-b border-base-content/10 pb-2">
                    <input
                        v-model="search"
                        type="text"
                        class="w-full rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                        :placeholder="$t('transcend-build.search_placeholder')"
                    />
                </div>
                <ScrollArea class="h-[calc(92vh-8rem)] pt-3">
                    <div class="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3">
                        <button
                            v-if="allowEmpty"
                            type="button"
                            class="group/char relative flex aspect-3/4 w-full cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xs border bg-base-200/60 backdrop-blur-sm transition-colors duration-200"
                            :class="selectedId <= 0 ? 'border-primary' : 'border-dashed border-base-content/15 hover:border-primary/60'"
                            data-char-empty
                            @click="select(0)"
                        >
                            <Icon icon="ri:close-circle-line" class="size-8 text-base-content/30" />
                            <div class="absolute inset-x-0 bottom-0 bg-base-100/40 px-2 py-1.5 text-center backdrop-blur-sm">
                                <div class="truncate text-[12px] font-semibold text-base-content/75">{{ $t("common.none") }}</div>
                            </div>
                            <Icon v-if="selectedId <= 0" icon="ri:checkbox-circle-fill" class="absolute top-1.5 left-1.5 size-4 text-green-500" />
                        </button>
                        <button
                            v-for="char in chars"
                            :key="char.id"
                            type="button"
                            class="group/char relative flex aspect-3/4 w-full cursor-pointer flex-col overflow-hidden rounded-xs border bg-base-200/60 backdrop-blur-sm transition-colors duration-200"
                            :class="char.id === selectedId ? 'border-primary' : 'border-base-content/15 hover:border-primary/60'"
                            :data-char-id="char.id"
                            @click="select(char.id)"
                        >
                            <ImageFallback :src="LeveledChar.url(char.icon)" :alt="gt(char.名称)" class="h-full w-full object-cover object-top">
                                <Icon icon="ri:user-line" class="size-8 text-base-content/40" />
                            </ImageFallback>
                            <div class="absolute inset-x-0 bottom-0 bg-base-100/40 px-2 py-1.5 backdrop-blur-sm">
                                <div class="truncate text-[12px] font-semibold text-base-content/85">{{ gt(char.名称) }}</div>
                                <div class="truncate text-[10px] text-base-content/55">{{ getElementDisplayName(char.属性) }}</div>
                            </div>
                            <Icon v-if="char.id === selectedId" icon="ri:checkbox-circle-fill" class="absolute top-1.5 left-1.5 size-4 text-green-500" />
                        </button>
                    </div>
                </ScrollArea>
            </div>
            <div class="modal-backdrop" @click="emit('update:open', false)" />
        </dialog>
    </Teleport>
</template>
