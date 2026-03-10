<script setup lang="ts">
import { computed, reactive, ref } from "vue"
import { formatProp } from "../util"

// 获取所有可用的属性名
const properties = [
    "攻击",
    "生命",
    "护盾",
    "防御",
    "神智",
    "技能威力",
    "技能耐久",
    "技能效益",
    "技能范围",
    "昂扬",
    "背水",
    "增伤",
    "独立增伤",
    "武器伤害",
    "技能伤害",
    "神智回复",
    "暴击",
    "暴伤",
    "攻速",
    "多重",
    "追加伤害",
    "属性伤",
    "MOD属性",
    "属性穿透",
    "异常数量",
    "无视防御",
    "固定攻击",
    "技能速度",
    "召唤物范围",
    "召唤物攻速",
    "召唤物攻击",
    "召唤物伤害",
    "失衡易伤",
    "近战攻击",
    "近战暴击",
    "近战暴伤",
    "近战触发",
    "近战攻速",
    "近战范围",
    "近战增伤",
    "远程攻击",
    "远程攻速",
    "远程暴击",
    "远程暴伤",
    "远程触发",
    "远程多重",
    "远程增伤",
]
const props = defineProps<{
    buffs: [string, number][]
}>()

const customBuff = computed(() => props.buffs)

// 定义组件事件
const emit = defineEmits<{
    // 提交自定义buff列表，格式为[string, number][]
    submit: [buffs: [string, number][]]
    // 添加单个自定义buff
    add: [buff: [string, number]]
    // 移除单个自定义buff
    remove: [index: number]
}>()

// 本地状态
const newBuff = reactive({
    property: "",
    value: "",
})
const errors = ref({
    property: "",
    value: "",
})

/**
 * 验证新增自定义 BUFF 表单。
 * @returns 表单是否通过校验
 */
const validateForm = (): boolean => {
    let isValid = true

    // 验证属性选择
    if (!newBuff.property) {
        errors.value.property = "请选择一个属性"
        isValid = false
    } else {
        errors.value.property = ""
    }

    // 验证数值输入
    if (isNaN(+newBuff.value) || +newBuff.value === 0) {
        errors.value.value = "请输入一个非零数值"
        isValid = false
    } else {
        errors.value.value = ""
    }

    return isValid
}

/**
 * 复制一份可安全编辑的自定义 BUFF 列表。
 * @returns 新的自定义 BUFF 列表副本
 */
const cloneCustomBuffs = () => customBuff.value.map(([property, value]) => [property, value] as [string, number])

/**
 * 添加新的自定义 BUFF。
 * 如果属性已存在，则累加数值后回传给父级持久化。
 */
const addBuff = () => {
    if (validateForm()) {
        const nextBuff: [string, number] = [newBuff.property, +newBuff.value]
        const nextCustomBuff = cloneCustomBuffs()
        const existingIndex = nextCustomBuff.findIndex(buff => buff[0] === nextBuff[0])
        if (existingIndex !== -1) {
            nextCustomBuff[existingIndex][1] += nextBuff[1]
        } else {
            nextCustomBuff.push(nextBuff)
        }

        emit("add", nextBuff)
        emit("submit", nextCustomBuff)
        newBuff.property = ""
        newBuff.value = ""
    }
}

/**
 * 移除指定下标的自定义 BUFF。
 * @param index 需要移除的条目下标
 */
const removeBuff = (index: number) => {
    const nextCustomBuff = cloneCustomBuffs()
    nextCustomBuff.splice(index, 1)
    emit("remove", index)
    emit("submit", nextCustomBuff)
}
</script>

<template>
    <div class="transition-all duration-300 bg-base-200 rounded-xl p-4 shadow-lg">
        <!-- 添加新buff的表单 -->
        <div class="flex gap-3 mb-4">
            <div class="flex-1">
                <div class="text-xs text-gray-400 mb-1">属性</div>
                <Select
                    v-model="newBuff.property"
                    class="w-full inline-flex items-center justify-between input input-bordered input-md whitespace-nowrap"
                >
                    <SelectItem v-for="prop in properties" :key="prop" :value="prop">
                        {{ prop }}
                    </SelectItem>
                </Select>
                <div v-if="errors.property" class="text-xs text-error mt-1">
                    {{ errors.property }}
                </div>
            </div>

            <div class="flex-1">
                <div class="text-xs text-gray-400 mb-1">数值</div>
                <input v-model="newBuff.value" type="number" step="0.01" class="input input-bordered w-full" placeholder="请输入数值" />
                <div v-if="errors.value" class="text-xs text-error mt-1">
                    {{ errors.value }}
                </div>
            </div>

            <div class="flex items-end">
                <button class="btn btn-primary h-10" @click="addBuff">添加</button>
            </div>
        </div>

        <!-- 已添加的自定义buff列表 -->
        <div v-if="customBuff.length > 0" class="space-y-2">
            <div v-for="(buff, index) in customBuff" :key="index" class="flex items-center justify-between bg-base-100 p-3 rounded-lg">
                <div class="flex items-center gap-2">
                    <span class="font-medium">{{ buff[0] }}</span>
                    <span class="text-sm text-gray-600">{{ formatProp(buff[0], buff[1]) }}</span>
                </div>
                <button class="btn btn-error btn-sm" @click="removeBuff(index)">移除</button>
            </div>
        </div>

        <!-- 空状态提示 -->
        <div v-else class="text-center py-4 text-gray-500 text-sm">暂无自定义BUFF，请添加</div>
    </div>
</template>
