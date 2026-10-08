<script setup lang="ts">
import { computed } from "vue"
import { normalizeCharSkillLevels } from "@/data/charSettings"
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
</script>

<template>
    <BaseNode v-bind="{ id, data, type, selected }">
        <div class="space-y-2">
            <div>
                <label class="text-sm text-base-content/60 block mb-1">{{ $t("角色") }}</label>
                <CharSelect v-model="charName" />
            </div>

            <div>
                <label class="text-sm text-base-content/60 block mb-1">{{ $t("char-build.level") }}</label>
                <input v-model.number="charLevel" type="number" class="w-full rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary font-mono tabular-nums" placeholder="80" />
            </div>

            <div>
                <label class="text-sm text-base-content/60 block mb-1">{{ $t("char-build.skill_level") }}</label>
                <div class="grid grid-cols-3 gap-2">
                    <label class="block">
                        <span class="text-xs text-base-content/50">E</span>
                        <input v-model.number="skillE" type="number" min="1" max="12" class="w-full rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary font-mono tabular-nums" placeholder="12" />
                    </label>
                    <label class="block">
                        <span class="text-xs text-base-content/50">Q</span>
                        <input v-model.number="skillQ" type="number" min="1" max="12" class="w-full rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary font-mono tabular-nums" placeholder="12" />
                    </label>
                    <label class="block">
                        <span class="text-xs text-base-content/50">{{ $t("被动") }}</span>
                        <input v-model.number="skillPassive" type="number" min="1" max="12" class="w-full rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary font-mono tabular-nums" placeholder="12" />
                    </label>
                </div>
            </div>

            <div>
                <label class="text-sm text-base-content/60 block mb-1">{{ $t("char-build.hp_percent") }}</label>
                <Select
                    v-model="hpPercent"
                    class="flex-1 rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
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
                    class="flex-1 rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                >
                    <SelectItem v-for="rg in [0, 0.5, 1, 1.5, 2, 2.5, 3]" :key="rg" :value="rg"> {{ rg * 100 }}% </SelectItem>
                </Select>
            </div>
        </div>
    </BaseNode>
</template>
