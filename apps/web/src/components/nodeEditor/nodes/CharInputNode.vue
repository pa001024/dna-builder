<script setup lang="ts">
import { t } from "i18next"
import { computed } from "vue"
import { charMap, LeveledCharHelper } from "@/data"
import { normalizeCharSkillLevels } from "@/data/charSettings"
import { charExtraExcelWeapon } from "@/data/d/charext.data"
import { useNodeEditorStore } from "@/store/nodeEditor"
import { getElementAccentColor, getElementSoftBgClass } from "@/utils/element-utils"
import { getNodePorts } from "@/utils/nodeEditorPorts"
import BaseNode from "./BaseNode.vue"
import NodePortRow from "./NodePortRow.vue"
import NumberRowInput from "./NumberRowInput.vue"

const props = defineProps<{
    id: string
    data: any
    type: string
    selected: boolean
}>()

const store = useNodeEditorStore()

/** 沉浸查看：只保留角色名片，隐藏数值输入等控件 */
const focusMode = computed(() => props.data.focusMode === true)

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
    get: () => {
        const level = Number(props.data.charLevel)
        return Number.isFinite(level) ? level : 80
    },
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

const UNDERLINE_SELECT =
    "w-full rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-0.5 text-[12px] text-base-content outline-none transition-colors duration-150 focus:border-primary"

/** 数值参数端口是否已有连线：连线后手动输入框禁用，取值由上游决定 */
function isDriven(handleId: string) {
    return store.edges.some(edge => edge.target === props.id && edge.targetHandle === handleId)
}

const ports = computed(() => getNodePorts(props.type, props.data))
const paramPorts = computed(() => ports.value.inputs)
const outputPort = computed(() => ports.value.outputs[0])
</script>

<template>
    <BaseNode v-bind="{ id, data, type, selected }" :focusable="true">
        <template #ports>
            <!-- 展开时参数端口跟随各行，收起时回到端口区，保证收起后仍可接线 -->
            <NodePortRow :output="outputPort" />
            <template v-if="data.isCollapsed">
                <NodePortRow v-for="port in paramPorts" :key="port.id" :input="port" />
            </template>
        </template>
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

            <template v-if="!focusMode">
                <NumberRowInput
                    v-model="charLevel"
                    :label="$t('char-build.level')"
                    handle-id="charLevel"
                    :min="1"
                    :max="80"
                    :precision="0"
                    :disabled="isDriven('charLevel')"
                    :hint="isDriven('charLevel') ? '连线' : undefined"
                />
                <div class="flex h-6 items-center gap-1.5">
                    <span class="w-16 shrink-0 truncate text-[10px] leading-none text-base-content/45">
                        {{ $t("weapon-detail.extraMastery") }}
                    </span>
                    <Select
                        v-model="extraMastery"
                        :class="UNDERLINE_SELECT"
                        class="h-5 min-w-0 flex-1"
                        :disabled="extraMasteryOptions.length === 0"
                    >
                        <SelectItem value="-">无</SelectItem>
                        <SelectItem v-for="item in extraMasteryOptions" :key="item.名称" :value="item.名称">
                            {{ item.名称 }}
                        </SelectItem>
                    </Select>
                </div>

                <div class="space-y-0.5">
                    <div class="text-[10px] text-base-content/45">{{ $t("char-build.skill_level") }}</div>
                    <NumberRowInput
                        v-model="skillE"
                        label="E"
                        handle-id="skillE"
                        :min="1"
                        :max="12"
                        :precision="0"
                        :disabled="isDriven('skillE')"
                        :hint="isDriven('skillE') ? '连线' : undefined"
                    />
                    <NumberRowInput
                        v-model="skillQ"
                        label="Q"
                        handle-id="skillQ"
                        :min="1"
                        :max="12"
                        :precision="0"
                        :disabled="isDriven('skillQ')"
                        :hint="isDriven('skillQ') ? '连线' : undefined"
                    />
                    <NumberRowInput
                        v-model="skillPassive"
                        :label="$t('被动')"
                        handle-id="skillPassive"
                        :min="1"
                        :max="12"
                        :precision="0"
                        :disabled="isDriven('skillPassive')"
                        :hint="isDriven('skillPassive') ? '连线' : undefined"
                    />
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
            </template>
        </div>
    </BaseNode>
</template>
