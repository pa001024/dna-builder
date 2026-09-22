<script setup lang="ts">
import { computed, ref } from "vue"
import { weaponData } from "@/data"
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
const selectedWeapon = ref(props.data.weapon || null)
const refineLevel = ref(props.data.refine ?? 5)
const weaponLevel = ref(props.data.level || 80)

// 近战武器选项
const weaponOptions = computed(() => {
    return weaponData.filter(weapon => weapon.类型[0] === "近战")
})

// 更新武器
function updateWeapon(value: number) {
    selectedWeapon.value = value
    store.updateNodeData(props.id, { weapon: value })
}

// 更新精炼等级
function updateRefineLevel(value: number) {
    refineLevel.value = value
    store.updateNodeData(props.id, { refine: value })
}

// 更新武器等级
function updateWeaponLevel(value: number) {
    weaponLevel.value = value
    store.updateNodeData(props.id, { level: value })
}
</script>

<template>
    <BaseNode v-bind="{ id, data, type, selected }">
        <div class="space-y-3">
            <!-- 近战武器选择 -->
            <div>
                <label class="text-sm text-base-content/60 block mb-1">{{ $t("node-editor.meleeWeaponInput.weapon") }}</label>
                <div class="space-y-2">
                    <Select
                        v-model="selectedWeapon"
                        class="w-full rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                        :placeholder="$t('node-editor.meleeWeaponInput.chooseWeapon')"
                        @update:model-value="updateWeapon($event)"
                    >
                        <SelectItem v-for="weapon in weaponOptions" :key="weapon.id" :value="weapon.id">
                            {{ $t(weapon.名称) }}
                        </SelectItem>
                    </Select>

                    <div class="grid grid-cols-2 gap-2">
                        <div>
                            <label class="text-xs text-base-content/60 block mb-1">{{ $t("node-editor.meleeWeaponInput.refineLevel") }}</label>
                            <Select
                                v-model="refineLevel"
                                class="flex-1 rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                                :placeholder="$t('node-editor.meleeWeaponInput.chooseLevel')"
                                @update:model-value="updateRefineLevel($event)"
                            >
                                <SelectItem v-for="lv in [0, 1, 2, 3, 4, 5]" :key="lv" :value="lv">
                                    {{ lv }}
                                </SelectItem>
                            </Select>
                        </div>
                        <div>
                            <label class="text-xs text-base-content/60 block mb-1">{{ $t("node-editor.meleeWeaponInput.weaponLevel") }}</label>
                            <input
                                v-model.number="weaponLevel"
                                type="number"
                                class="w-full rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary font-mono tabular-nums"
                                placeholder="80"
                                min="1"
                                max="90"
                                @change="updateWeaponLevel(weaponLevel)"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </BaseNode>
</template>
