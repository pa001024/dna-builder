<script setup lang="ts">
import BaseNode from "./BaseNode.vue"
import { computed } from "vue"
import { useNodeEditorStore } from "@/store/nodeEditor"
import { charData } from "@/data"

const props = defineProps<{
    id: string
    data: any
    type: string
    selected: boolean
}>()

const store = useNodeEditorStore()

// 角色选项（示例数据，后续从实际数据源获取）
const charOptions = computed(() => charData.map(char => ({ id: char.id, name: char.名称 })))

// 本地状态
const charName = computed({
    get: () => props.data.charName,
    set: value => store.updateNodeData(props.id, { charName: value }),
})

const charLevel = computed({
    get: () => props.data.charLevel,
    set: value => store.updateNodeData(props.id, { charLevel: value }),
})
</script>

<template>
    <BaseNode v-bind="{ id, data, type, selected }">
        <div class="space-y-2">
            <div>
                <label class="text-sm text-base-content/60 block mb-1">角色</label>
                <Select v-model="charName" class="input input-sm w-full" placeholder="选择角色">
                    <SelectItem v-for="char in charOptions" :key="char.id" :value="char.id">
                        {{ char.name }}
                    </SelectItem>
                </Select>
            </div>

            <div>
                <label class="text-sm text-base-content/60 block mb-1">等级</label>
                <input v-model.number="charLevel" type="number" class="input input-bordered input-sm w-full" placeholder="80" />
            </div>
        </div>
    </BaseNode>
</template>
