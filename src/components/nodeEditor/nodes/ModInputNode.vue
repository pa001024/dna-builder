<script setup lang="ts">
import BaseNode from "./BaseNode.vue"
import { computed, ref } from "vue"
import { useNodeEditorStore } from "@/store/nodeEditor"
import { modData } from "@/data"
import { t } from "i18next"

const props = defineProps<{
    id: string
    data: any
    type: string
    selected: boolean
}>()

const store = useNodeEditorStore()

// MOD类型筛选
const modType = ref("角色")
const modTypes = ["全部", "角色", "近战", "远程", "同律近战", "同律远程"]
const modElm = ref("全部")
const modElms = ["全部", "火", "水", "雷", "风", "暗", "光"]

// 本地状态
const selectedMods = ref<(number | null)[]>(props.data.mods || [null])
const modLevels = ref<number[]>(props.data.modLevels || [10])

// 添加MOD槽位
function addModSlot() {
    selectedMods.value.push(null)
    modLevels.value.push(10)
    updateStore()
}

// 删除MOD槽位
function removeModSlot(index: number) {
    if (selectedMods.value.length > 1) {
        selectedMods.value.splice(index, 1)
        modLevels.value.splice(index, 1)
        updateStore()
    }
}

// 更新store
function updateStore() {
    store.updateNodeData(props.id, {
        mods: selectedMods.value,
        modLevels: modLevels.value,
    })
}

// MOD选项（实际数据）
const modOptions = computed(() => {
    // 使用实际的modData，并根据类型筛选
    return modData
        .filter(mod => {
            // 根据选中的modType进行筛选
            if (modType.value === "全部") {
                return true
            }
            // 根据选中的modElm进行筛选
            if (modElm.value === "全部") {
                return mod.类型 === modType.value
            }
            return mod.类型 === modType.value && (!mod.属性 || mod.属性 === modElm.value)
        })
        .map(mod => ({
            id: mod.id,
            name: `${t(mod.属性 || "")}${t(mod.系列)}${t(mod.名称)}(${mod.品质})`,
            type: mod.类型,
        }))
        .sort((a, b) => b.id - a.id)
})

// 更新MOD
function updateMod(index: number, value: number) {
    selectedMods.value[index] = value
    updateStore()
}

// 更新MOD等级
function updateModLevel(index: number, value: number) {
    modLevels.value[index] = value
    updateStore()
}
</script>

<template>
    <BaseNode v-bind="{ id, data, type, selected }">
        <div class="space-y-3">
            <!-- MOD类型筛选 -->
            <div class="space-y-2">
                <label class="text-sm text-base-content/60 block mb-1">MOD类型</label>
                <Select v-model="modType" class="w-full input input-sm">
                    <SelectItem v-for="modTypeItem in modTypes" :key="modTypeItem" :value="modTypeItem">
                        {{ modTypeItem }}
                    </SelectItem>
                </Select>
                <label class="text-sm text-base-content/60 block mb-1">MOD元素</label>
                <Select v-model="modElm" class="w-full input input-sm">
                    <SelectItem v-for="modElmItem in modElms" :key="modElmItem" :value="modElmItem">
                        {{ modElmItem }}
                    </SelectItem>
                </Select>
            </div>

            <!-- MOD选择列表 -->
            <div class="space-y-2">
                <div v-for="(_, index) in selectedMods" :key="index" class="space-y-1">
                    <div class="flex gap-2">
                        <Select
                            v-model="selectedMods[index]"
                            class="flex-1 input input-sm"
                            placeholder="选择MOD"
                            @update:model-value="updateMod(index, $event)"
                        >
                            <SelectItem v-for="option in modOptions" :key="option.id" :value="option.id">
                                {{ option.name }}
                            </SelectItem>
                        </Select>
                        <Select
                            v-model="modLevels[index]"
                            class="flex-1 input input-sm"
                            placeholder="选择等级"
                            @update:model-value="updateModLevel(index, $event)"
                        >
                            <SelectItem v-for="lv in 10" :key="lv" :value="lv">
                                {{ lv }}
                            </SelectItem>
                        </Select>
                        <button class="btn btn-sm btn-ghost btn-error" :disabled="selectedMods.length <= 1" @click="removeModSlot(index)">
                            <Icon icon="ri:delete-bin-2-fill" class="size-3" />
                        </button>
                    </div>
                </div>

                <!-- 添加MOD槽位按钮 -->
                <button class="btn btn-sm btn-outline w-full" @click="addModSlot">
                    <Icon icon="ri:add-line" class="mr-1" />
                    添加MOD槽位
                </button>
            </div>
        </div>
    </BaseNode>
</template>
