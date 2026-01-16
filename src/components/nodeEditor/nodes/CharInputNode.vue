<script setup lang="ts">
import { computed } from "vue"
import { useNodeEditorStore } from "@/store/nodeEditor"
import BaseNode from "./BaseNode.vue"

const props = defineProps<{
    id: string
    data: any
    type: string
    selected: boolean
}>()

const store = useNodeEditorStore()

// 本地状态
const charName = computed({
    get: () => props.data.charName,
    set: value => store.updateNodeData(props.id, { charName: value }),
})

const charLevel = computed({
    get: () => props.data.charLevel,
    set: value => store.updateNodeData(props.id, { charLevel: value }),
})

const charSkillLevel = computed({
    get: () => props.data.charSkillLevel,
    set: value => store.updateNodeData(props.id, { charSkillLevel: value }),
})

const hpPercent = computed({
    get: () => props.data.hpPercent,
    set: value => store.updateNodeData(props.id, { hpPercent: value }),
})

const resonanceGain = computed({
    get: () => props.data.resonanceGain,
    set: value => store.updateNodeData(props.id, { resonanceGain: value }),
})
</script>

<template>
    <BaseNode v-bind="{ id, data, type, selected }">
        <div class="space-y-2">
            <div>
                <label class="text-sm text-base-content/60 block mb-1">角色</label>
                <CharSelect v-model="charName" />
            </div>

            <div>
                <label class="text-sm text-base-content/60 block mb-1">等级</label>
                <input v-model.number="charLevel" type="number" class="input input-bordered input-sm w-full" placeholder="80" />
            </div>

            <div>
                <label class="text-sm text-base-content/60 block mb-1">技能等级</label>
                <input v-model.number="charSkillLevel" type="number" class="input input-bordered input-sm w-full" placeholder="12" />
            </div>

            <div>
                <label class="text-sm text-base-content/60 block mb-1">{{ $t("char-build.hp_percent") }}</label>
                <Select
                    v-model="hpPercent"
                    class="flex-1 inline-flex items-center justify-between input input-bordered input-sm whitespace-nowrap"
                >
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
            </div>

            <div>
                <label class="text-sm text-base-content/60 block mb-1">{{ $t("char-build.resonance_gain") }}</label>
                <Select
                    v-model="resonanceGain"
                    class="flex-1 inline-flex items-center justify-between input input-bordered input-sm whitespace-nowrap"
                >
                    <SelectItem v-for="rg in [0, 0.5, 1, 1.5, 2, 2.5, 3]" :key="rg" :value="rg"> {{ rg * 100 }}% </SelectItem>
                </Select>
            </div>
        </div>
    </BaseNode>
</template>
