<script setup lang="ts">
import { computed, ref } from "vue"
import { buffData, buffMap } from "@/data"
import { useNodeEditorStore } from "@/store/nodeEditor"
import { matchPinyin } from "@/utils/pinyin-utils"
import BaseNode from "./BaseNode.vue"

const props = defineProps<{
    id: string
    data: any
    type: string
    selected: boolean
}>()

interface BuffOption {
    label: string
    value: string
    description?: string
    limit?: string
    lx: number
    mx: number
}

const store = useNodeEditorStore()

// 本地状态 - 变长数组模式
const selectedBuffNames = ref<string[]>(props.data.buffs || [""])
const buffLevels = ref<number[]>(props.data.buffLevels || [1])

// Buff类型筛选
const buffType = ref("")

// 从 buffMap 生成 buffOptions
const buffOptions = computed<BuffOption[]>(() => {
    const options: BuffOption[] = buffData.map(buff => {
        return {
            label: buff.名称,
            value: buff.名称,
            description: buff.描述 || "",
            limit: buff.限定 || undefined,
            lx: buff.lx ?? 1,
            mx: buff.mx || 1,
        }
    })

    if (!buffType.value) {
        return options
    }
    // 根据选中的buffType进行筛选
    return options.filter(option => {
        return (
            option.label.includes(buffType.value) ||
            matchPinyin(option.label, buffType.value).match ||
            selectedBuffNames.value.includes(option.value)
        )
    })
})

// 更新store
function updateStore() {
    store.updateNodeData(props.id, {
        buffs: selectedBuffNames.value,
        buffLevels: buffLevels.value,
    })
}

// 添加BUFF槽位
function addBuffSlot() {
    selectedBuffNames.value.push("")
    buffLevels.value.push(1)
    updateStore()
}

// 删除BUFF槽位
function removeBuffSlot(index: number) {
    if (selectedBuffNames.value.length > 1) {
        selectedBuffNames.value.splice(index, 1)
        buffLevels.value.splice(index, 1)
        updateStore()
    }
}

// 更新BUFF
function updateBuff(index: number, value: string) {
    selectedBuffNames.value[index] = value
    updateStore()
}

// 更新BUFF等级
function updateBuffLevel(index: number, value: number) {
    buffLevels.value[index] = value
    updateStore()
}

function buffDesc(buffName: string) {
    const buff = buffMap.get(buffName)
    return buff?.描述 || ""
}
</script>

<template>
    <BaseNode :id="id" :data="data" :type="type" :selected="selected">
        <div class="space-y-3">
            <!-- Buff类型筛选 -->
            <div>
                <label class="text-sm text-base-content/60 block mb-1">搜索(支持拼音)</label>
                <input v-model="buffType" type="text" class="flex-1 input input-sm" placeholder="输入Buff名称或拼音" />
            </div>

            <!-- Buff选择列表 -->
            <div class="space-y-2">
                <div v-for="(buffName, index) in selectedBuffNames" :key="index" class="space-y-1">
                    <div class="flex gap-2">
                        <Select
                            v-model="selectedBuffNames[index]"
                            class="flex-1 input input-sm"
                            placeholder="选择Buff"
                            @update:model-value="updateBuff(index, $event)"
                        >
                            <SelectItem v-for="option in buffOptions" :key="option.value" :value="option.value">
                                {{ option.label }}
                            </SelectItem>
                        </Select>
                        <input
                            v-model.number="buffLevels[index]"
                            type="number"
                            class="input input-sm w-20"
                            :min="buffOptions.find(option => option.value === buffName)?.lx ?? 0"
                            :max="buffOptions.find(option => option.value === buffName)?.mx ?? 0"
                            @change="updateBuffLevel(index, buffLevels[index])"
                        /><button
                            class="btn btn-xs btn-ghost btn-error"
                            :disabled="selectedBuffNames.length <= 1"
                            @click="removeBuffSlot(index)"
                        >
                            <Icon icon="ri:delete-bin-2-fill" class="size-3" />
                        </button>
                    </div>
                    <div class="text-xs text-base-content/60 max-w-64">
                        {{ buffDesc(buffName) }}
                    </div>
                </div>

                <!-- 添加Buff槽位按钮 -->
                <button class="btn btn-sm btn-outline w-full" @click="addBuffSlot">添加Buff槽位</button>
            </div>
        </div>
    </BaseNode>
</template>
