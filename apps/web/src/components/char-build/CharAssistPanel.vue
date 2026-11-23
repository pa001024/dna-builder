<script setup lang="ts">
import { computed, ref, watch } from "vue"
import TranscendAttrPanel from "@/components/transcend-build/TranscendAttrPanel.vue"
import TranscendCharPicker from "@/components/transcend-build/TranscendCharPicker.vue"
import TranscendSkillPanel from "@/components/transcend-build/TranscendSkillPanel.vue"
import { useGameText } from "@/composables/useGameText"
import { type CharAttr, type CharBuild, charMap, type LeveledSkill, type TranscendSideLoadout } from "@/data"
import type { AssistSide } from "@/data/teamResolver"

// 协战角色面板：等级 → 属性折叠 → 技能。全部状态由页面传入，面板不读写构筑存档

const props = defineProps<{
    side: AssistSide
    loadout: TranscendSideLoadout
    charSkills: LeveledSkill[]
    charBuild?: CharBuild | null
    attributes?: CharAttr
    /** 和鸣增益：属性面板显式传入，避免面板内部读老存档 */
    resonanceGain: number
    /** 角色选择器排除的主控 / 另一协战 id */
    excludeIds?: number[]
}>()

const emit = defineEmits<{
    (event: "update", patch: Partial<TranscendSideLoadout>): void
    (event: "select-char", charId: number): void
    (event: "import"): void
}>()

const { gt } = useGameText()

/** 属性折叠状态（与主控角色卡独立，默认展开与主控一致） */
const attrExpend = ref(true)
const pickerOpen = ref(false)

const charName = computed(() => {
    const char = charMap.get(props.loadout.charId)
    return char ? gt(char.名称) : ""
})

/** 等级草稿：松手（change）才写回，避免拖动期间每帧重建协战构筑 */
const draftLevel = ref(props.loadout.charLevel)
watch(
    () => props.loadout.charLevel,
    value => {
        if (value !== draftLevel.value) draftLevel.value = value
    }
)

function commitLevel(): void {
    emit("update", { charLevel: Math.max(1, Math.min(80, Math.round(Number(draftLevel.value) || 1))) })
}

function openPicker(): void {
    pickerOpen.value = true
}

function onSelectChar(charId: number): void {
    emit("select-char", charId)
}
</script>

<template>
    <div
        data-char-tab-panel="assist-char"
        :data-assist-side="side"
        class="rounded-xs border border-base-content/10 bg-base-100/70 p-3 shadow-sm backdrop-blur-sm space-y-3"
    >
        <template v-if="loadout.charId > 0">
            <SectionHeader :title="charName || $t('char-build.title')" no-animate compact>
                <template #trailing>
                    <div class="flex items-center gap-2">
                        <span class="font-orbitron text-sm font-semibold text-primary tabular-nums">Lv. {{ draftLevel }}</span>
                        <button
                            type="button"
                            class="btn btn-ghost btn-xs"
                            :title="$t('char-build.assist_import')"
                            data-assist-import
                            @click="emit('import')"
                        >
                            <Icon icon="ri:download-2-line" class="size-4" />
                        </button>
                        <button
                            type="button"
                            class="btn btn-ghost btn-xs"
                            :title="$t('char-build.select_character')"
                            data-assist-change-char
                            @click="openPicker"
                        >
                            <Icon icon="ri:exchange-line" class="size-4" />
                        </button>
                    </div>
                </template>
            </SectionHeader>
            <div class="flex items-center gap-2 p-1 text-sm">
                <div class="flex-1">
                    <input
                        v-model.number="draftLevel"
                        type="range"
                        class="range range-primary range-xs w-full"
                        min="1"
                        max="80"
                        step="1"
                        @change="commitLevel"
                    />
                </div>
            </div>
            <!-- 词条折叠：与主控角色卡同一 daisyUI collapse 结构与裁剪外扩 -->
            <div class="collapse p-1" :class="{ 'collapse-open': attrExpend }">
                <div class="collapse-content space-y-1 p-0 [overflow-clip-margin:12px]">
                    <TranscendAttrPanel
                        v-if="charBuild && attributes"
                        :attributes="attributes"
                        :char-build="charBuild"
                        :resonance-gain="resonanceGain"
                    />
                    <p v-else class="py-4 text-center text-[11px] text-base-content/40">
                        {{ $t("char-build.weapon_slot_empty_desc") }}
                    </p>
                </div>
            </div>
            <div
                class="flex cursor-pointer items-center justify-center p-2 transition-all duration-200 hover:bg-base-100/60"
                @click="attrExpend = !attrExpend"
            >
                <Icon icon="radix-icons:chevron-down" :class="{ 'rotate-180': attrExpend }" />
            </div>
            <TranscendSkillPanel
                :loadout="loadout"
                :char-skills="charSkills"
                :char-build="charBuild"
                :attributes="attributes"
                @update="emit('update', $event)"
            />
        </template>
        <div v-else class="flex flex-col items-center gap-2 rounded-xs border border-dashed border-base-content/25 p-4" data-assist-empty>
            <p class="text-xs text-base-content/50">{{ $t("char-build.select_character") }}</p>
            <button type="button" class="btn btn-sm" data-assist-select-char @click="openPicker">
                {{ $t("char-build.select_character") }}
            </button>
        </div>

        <TranscendCharPicker
            v-model:open="pickerOpen"
            :selected-id="loadout.charId"
            :exclude-ids="excludeIds"
            allow-empty
            title-key="char-build.select_character"
            @select="onSelectChar"
        />
    </div>
</template>
