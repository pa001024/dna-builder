<script setup lang="ts">
import { computed } from "vue"
import { useNodeEditorStore } from "@/store/nodeEditor"
import { getNodePorts } from "@/utils/nodeEditorPorts"
import AttributeOutputList from "./AttributeOutputList.vue"
import BaseNode from "./BaseNode.vue"
import NodePortRow from "./NodePortRow.vue"
import VectorResultTable from "./VectorResultTable.vue"

const props = defineProps<{
    id: string
    data: any
    type: string
    selected: boolean
}>()
const store = useNodeEditorStore()

// 计算武器属性

type WeaponSlot = "melee" | "ranged" | "skill"

const SLOT_OPTIONS = [
    { value: "melee", label: "近战" },
    { value: "ranged", label: "远程" },
    { value: "skill", label: "同律" },
] as const

/** 同律仅在构筑有独立同律武器（非 inherit）时出现；已手选同律时保留以便撤销 */
const slotOptions = computed(() =>
    SLOT_OPTIONS.filter(option => option.value !== "skill" || props.data.hasSkillWeapon || props.data.weaponSlot === "skill")
)

/** 构筑默认武器槽 → 按钮值；未手选槽位时高亮默认武器 */
const AUTO_SLOT: Record<string, WeaponSlot> = { 近战: "melee", 远程: "ranged", 同律: "skill" }

const activeSlot = computed<WeaponSlot>(() => {
    const slot = props.data.weaponSlot
    if (slot === "melee" || slot === "ranged" || slot === "skill") return slot
    return AUTO_SLOT[props.data.weaponSlotAuto as string] ?? "melee"
})

/**
 * 切换武器槽：未手选时沿用构筑默认武器，选定后该节点固定取对应武器面板。
 * @param slot 武器槽
 */
function setSlot(slot: WeaponSlot) {
    store.updateNodeData(props.id, { weaponSlot: slot })
}

// 计算角色属性
const weaponAttrs = computed<Record<string, number> | null>(() => props.data.result)

const ports = computed(() => getNodePorts(props.type, props.data))
const buildInput = computed(() => ports.value.inputs[0])
const attrsOutput = computed(() => ports.value.outputs[0])
</script>

<template>
    <BaseNode :id="id" :data="data" :type="type" :selected="selected">
        <template #ports>
            <NodePortRow :input="buildInput" :output="attrsOutput" />
        </template>
        <div class="w-55 max-w-full text-[11px]">
            <div class="mb-1 flex items-center gap-1">
                <button
                    v-for="option in slotOptions"
                    :key="option.value"
                    type="button"
                    class="h-5 cursor-pointer border px-1.5 text-[10px] font-semibold transition-colors duration-150 active:scale-[0.97]"
                    :class="
                        activeSlot === option.value
                            ? 'border-primary/40 bg-primary/15 text-primary'
                            : 'border-base-content/10 bg-base-100 text-base-content/60 hover:border-primary/30 hover:text-primary'
                    "
                    :title="`${option.label}武器面板`"
                    @click="setSlot(option.value)"
                >
                    {{ option.label }}
                </button>
            </div>
            <div v-if="data.error" class="text-[11px] text-error">{{ data.error }}</div>
            <div v-else-if="!weaponAttrs" class="text-[11px] text-base-content/45">{{ $t("node-editor.weaponAttr.waiting") }}</div>
            <AttributeOutputList
                kind="weapon"
                :values="weaponAttrs"
                :vectors="data.attributeVectorValues"
                :char-build="data.charBuild"
                :weapon-slot="data.weaponSlot"
            />
        </div>
        <VectorResultTable v-if="data.vectorResult" :vector="data.vectorResult" />
    </BaseNode>
</template>
