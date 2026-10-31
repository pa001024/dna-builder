<script setup lang="ts">
import { t } from "i18next"
import { computed } from "vue"
import { charMap, LeveledCharHelper } from "@/data"
import { normalizeCharSkillLevels } from "@/data/charSettings"
import { charExtraExcelWeapon } from "@/data/d/charext.data"
import { useNodeEditorStore } from "@/store/nodeEditor"
import { getElementAccentColor, getElementSoftBgClass } from "@/utils/element-utils"
import BaseNode from "./BaseNode.vue"

const props = defineProps<{
    id: string
    data: any
    type: string
    selected: boolean
}>()

const store = useNodeEditorStore()

/** 角色数据与卡片展示信息 */
const char = computed(() => charMap.get(typeof props.data.charName === "string" ? props.data.charName : ""))
const charIcon = computed(() => (char.value ? LeveledCharHelper.idToUrl(char.value.id) : ""))
const charBg = computed(() => (char.value ? getElementSoftBgClass(char.value.属性) : "bg-base-content/4"))
const charAccent = computed(() => (char.value ? getElementAccentColor(char.value.属性) : undefined))
const charMeta = computed(() => {
    const item = char.value
    if (!item) return ""
    return [t(`${item.属性}属性`, item.属性), t(item.精通?.[0])].filter(Boolean).join(" · ")
})

// 本地状态
const charName = computed({
    get: () => props.data.charName,
    set: value => {
        const patch: Record<string, any> = { charName: value }
        // 切换角色后，旧角色的额外精通不再适用
        const nextChar = charMap.get(value)
        if (value !== props.data.charName && props.data.extraMastery && !nextChar?.额外精通?.includes(props.data.extraMastery)) {
            patch.extraMastery = ""
        }
        store.updateNodeData(props.id, patch)
    },
})

const charLevel = computed({
    get: () => props.data.charLevel,
    set: value => store.updateNodeData(props.id, { charLevel: value }),
})

/** 额外精通可选项：仅当前角色「额外精通」字段允许的武器类型 */
const extraMasteryOptions = computed(() => {
    const item = char.value
    if (!item?.额外精通?.length) return []
    return charExtraExcelWeapon.filter(entry => item.额外精通?.includes(entry.名称))
})

const extraMastery = computed({
    get: () => (typeof props.data.extraMastery === "string" && props.data.extraMastery ? props.data.extraMastery : "-"),
    set: value => store.updateNodeData(props.id, { extraMastery: value === "-" ? "" : value }),
})

/**
 * 编辑侧绑定变量分离：技能等级按 E/Q/被动三项分别绑定。
 * 老节点数据可能是单个数字，此处读时归一化为三元组再按索引读写，避免旧图打开即报错。
 */
const skillLevels = computed<[number, number, number]>({
    get: () => normalizeCharSkillLevels(props.data.charSkillLevel ?? props.data.skillLevel ?? 12),
    set: value => store.updateNodeData(props.id, { charSkillLevel: [...value] }),
})

/** 创建某一项技能等级的双向绑定（index: 0→E，1→Q，2→被动） */
function skillLevelAt(index: number) {
    return computed({
        get: () => skillLevels.value[index],
        set: value => {
            const next = [...skillLevels.value] as [number, number, number]
            next[index] = value
            skillLevels.value = next
        },
    })
}

const skillE = skillLevelAt(0)
const skillQ = skillLevelAt(1)
const skillPassive = skillLevelAt(2)

const hpPercent = computed({
    get: () => props.data.hpPercent,
    set: value => store.updateNodeData(props.id, { hpPercent: value }),
})

const resonanceGain = computed({
    get: () => props.data.resonanceGain,
    set: value => store.updateNodeData(props.id, { resonanceGain: value }),
})

const NUMBER_INPUT =
    "w-full rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-0.5 font-mono text-[12px] tabular-nums text-base-content outline-none transition-colors duration-150 focus:border-primary"
const UNDERLINE_SELECT =
    "w-full rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-0.5 text-[12px] text-base-content outline-none transition-colors duration-150 focus:border-primary"
</script>

<template>
    <BaseNode v-bind="{ id, data, type, selected }">
        <div class="w-75 max-w-full space-y-1.5">
            <!-- 角色名片：沿用资料库条目卡片的图像区 + 名称/属性层级 -->
            <div class="flex items-stretch gap-2 border border-base-content/10 bg-base-100/60 p-1.5">
                <div class="relative h-14 w-14 shrink-0 overflow-hidden" :class="charBg">
                    <img
                        v-if="charIcon"
                        :src="charIcon"
                        :alt="data.charName"
                        class="absolute inset-0 h-full w-full object-cover object-top"
                    />
                    <div v-else class="grid h-full place-items-center text-base-content/25">
                        <Icon icon="ri:user-line" class="size-5" />
                    </div>
                    <span class="absolute left-0 top-0 bg-base-content px-1 py-0.5 font-mono text-[8px] font-semibold uppercase tracking-[0.16em] text-base-100">
                        CHAR
                    </span>
                </div>
                <div class="min-w-0 flex-1">
                    <CharSelect v-model="charName" />
                    <div class="mt-1 flex items-center gap-1 text-[10px] text-base-content/45">
                        <span v-if="charAccent" class="size-1.5 shrink-0" :style="{ backgroundColor: charAccent }" />
                        <span class="truncate">{{ charMeta || "选择角色以查看属性" }}</span>
                    </div>
                </div>
            </div>

            <div class="grid grid-cols-2 gap-x-2 gap-y-1.5">
                <label class="block min-w-0">
                    <span class="mb-0.5 block text-[10px] text-base-content/45">{{ $t("char-build.level") }}</span>
                    <input v-model.number="charLevel" type="number" :class="NUMBER_INPUT" placeholder="80" />
                </label>
                <label class="block min-w-0">
                    <span class="mb-0.5 block text-[10px] text-base-content/45">{{ $t("weapon-detail.extraMastery") }}</span>
                    <Select v-model="extraMastery" :class="UNDERLINE_SELECT" :disabled="extraMasteryOptions.length === 0">
                        <SelectItem value="-">无</SelectItem>
                        <SelectItem v-for="item in extraMasteryOptions" :key="item.名称" :value="item.名称">
                            {{ item.名称 }}
                        </SelectItem>
                    </Select>
                </label>
            </div>

            <div>
                <div class="mb-0.5 text-[10px] text-base-content/45">{{ $t("char-build.skill_level") }}</div>
                <div class="grid grid-cols-3 gap-1.5">
                    <label class="block min-w-0">
                        <span class="mb-0.5 block text-[9px] text-base-content/40">E</span>
                        <input v-model.number="skillE" type="number" min="1" max="12" :class="NUMBER_INPUT" placeholder="12" />
                    </label>
                    <label class="block min-w-0">
                        <span class="mb-0.5 block text-[9px] text-base-content/40">Q</span>
                        <input v-model.number="skillQ" type="number" min="1" max="12" :class="NUMBER_INPUT" placeholder="12" />
                    </label>
                    <label class="block min-w-0">
                        <span class="mb-0.5 block text-[9px] text-base-content/40">{{ $t("被动") }}</span>
                        <input v-model.number="skillPassive" type="number" min="1" max="12" :class="NUMBER_INPUT" placeholder="12" />
                    </label>
                </div>
            </div>

            <div class="grid grid-cols-2 gap-x-2 gap-y-1.5">
                <label class="block min-w-0">
                    <span class="mb-0.5 block text-[10px] text-base-content/45">{{ $t("char-build.hp_percent") }}</span>
                    <Select v-model="hpPercent" :class="UNDERLINE_SELECT">
                        <SelectItem
                            v-for="hp in [
                                1,
                                ...Array(20)
                                    .keys()
                                    .map(i => (i + 1) * 5),
                            ]"
                            :key="hp"
                            :value="hp / 100"
                        >
                            {{ hp }}%
                        </SelectItem>
                    </Select>
                </label>
                <label class="block min-w-0">
                    <span class="mb-0.5 block text-[10px] text-base-content/45">{{ $t("char-build.resonance_gain") }}</span>
                    <Select v-model="resonanceGain" :class="UNDERLINE_SELECT">
                        <SelectItem v-for="rg in [0, 0.5, 1, 1.5, 2, 2.5, 3]" :key="rg" :value="rg">{{ rg * 100 }}%</SelectItem>
                    </Select>
                </label>
            </div>
        </div>
    </BaseNode>
</template>
