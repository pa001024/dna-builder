<script setup lang="ts">
import { computed, reactive, watch } from "vue"
import PetEditor from "@/components/PetEditor.vue"
import TraitEditer from "@/components/TraitEditer.vue"
import type { CharSettings } from "@/composables/useCharSettings"
import { getEffectivePetLevel, getPetTraitByLevel, getTraitPetLevelBonus, normalizeTraitSlots, TRAIT_SLOT_COUNT, type TraitSlot } from "@/data/petTrait"
import { useNodeEditorStore } from "@/store/nodeEditor"
import BaseNode from "./BaseNode.vue"

const props = defineProps<{
    id: string
    data: any
    type: string
    selected: boolean
}>()

const store = useNodeEditorStore()

const local = reactive({
    petId: Number(props.data.petId) || 0,
    petLevel: Number.isFinite(Number(props.data.petLevel)) ? Number(props.data.petLevel) : 3,
    petCoverage: Number.isFinite(Number(props.data.petCoverage)) ? Number(props.data.petCoverage) : 1,
    petAutoCoverage: props.data.petAutoCoverage !== false,
    traits: normalizeTraitSlots(props.data.traits) as TraitSlot[],
})

const context = computed(() => store.getBuildContext(props.id))
const charBuild = computed(() => context.value?.charBuild)
const effectivePetLevel = computed(() => getEffectivePetLevel(local.petLevel, local.traits))
const petLevelBonus = computed(() => getTraitPetLevelBonus(local.traits))

const attributes = computed(() => {
    try {
        const attrs = charBuild.value?.calculateAttributes()
        return { petCd: attrs?.魔灵CD ?? 0, petCdReduce: attrs?.魔灵CD缩减 ?? 0 }
    } catch {
        return { petCd: 0, petCdReduce: 0 }
    }
})

const petSettings = computed(() => local as unknown as CharSettings)

watch(
    () => [props.data.petId, props.data.petLevel, props.data.petCoverage, props.data.petAutoCoverage, props.data.traits],
    () => {
        local.petId = Number(props.data.petId) || 0
        local.petLevel = Number.isFinite(Number(props.data.petLevel)) ? Number(props.data.petLevel) : 3
        local.petCoverage = Number.isFinite(Number(props.data.petCoverage)) ? Number(props.data.petCoverage) : 1
        local.petAutoCoverage = props.data.petAutoCoverage !== false
        local.traits = normalizeTraitSlots(props.data.traits) as TraitSlot[]
    },
    { deep: true }
)

/** 写回魔灵与潜质配置 */
function commit() {
    const next = {
        petId: local.petId,
        petLevel: local.petLevel,
        petCoverage: local.petCoverage,
        petAutoCoverage: local.petAutoCoverage,
        traits: local.traits.map(slot => (slot ? [...slot] : null)),
    }
    if (JSON.stringify(next) === JSON.stringify({
        petId: props.data.petId,
        petLevel: props.data.petLevel,
        petCoverage: props.data.petCoverage,
        petAutoCoverage: props.data.petAutoCoverage,
        traits: props.data.traits,
    })) return
    store.updateNodeData(props.id, next)
}

watch(local, commit, { deep: true })

/** 复制并补齐/裁剪潜质槽位为固定长度 */
function copyTraitSlots(traits: readonly TraitSlot[]): TraitSlot[] {
    return Array.from({ length: TRAIT_SLOT_COUNT }, (_, index) => normalizeTraitSlots([traits[index]])[0])
}

function selectTrait(index: number, bid: number, level: number) {
    if (!getPetTraitByLevel(bid, level)) return
    local.traits = copyTraitSlots(local.traits).map((slot, slotIndex) => {
        if (slotIndex === index) return [bid, level] as TraitSlot
        return slot && slot[0] === bid ? null : slot
    })
    commit()
}

function removeTrait(index: number) {
    const traits = copyTraitSlots(local.traits)
    traits[index] = null
    local.traits = traits
    commit()
}

function swapTraits(fromIndex: number, toIndex: number) {
    const traits = copyTraitSlots(local.traits)
    const temp = traits[fromIndex]
    traits[fromIndex] = traits[toIndex]
    traits[toIndex] = temp
    local.traits = traits
    commit()
}
</script>

<template>
    <BaseNode v-bind="{ id, data, type, selected }">
        <div class="w-150 max-w-full space-y-2">
            <template v-if="charBuild">
                <PetEditor
                    :char-settings="petSettings"
                    :char-build="charBuild"
                    :pet-cd="attributes.petCd"
                    :pet-cd-reduce="attributes.petCdReduce"
                    :pet-level="effectivePetLevel"
                    :pet-level-bonus="petLevelBonus"
                    @pet-change="commit"
                />
                <TraitEditer
                    :traits="local.traits"
                    :char-build="charBuild"
                    :pet-level="local.petLevel"
                    :pet-id="local.petId"
                    :pet-coverage="local.petCoverage"
                    :pet-auto-coverage="local.petAutoCoverage"
                    @select-trait="selectTrait"
                    @remove-trait="removeTrait"
                    @swap-traits="swapTraits"
                />
            </template>
            <div v-else class="text-[10px] text-base-content/45">连接核心节点后可配置魔灵与潜质</div>
        </div>
    </BaseNode>
</template>
