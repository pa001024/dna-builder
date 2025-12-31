<script setup lang="ts">
import { ref, reactive } from "vue"
import { buffMap } from "../data"
import { formatProp } from "../util"
import { useLocalStorage } from "@vueuse/core"

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
// 自定义BUFF
const customBuff = useLocalStorage("customBuff", [] as [string, number][])
function writeCustomBuff() {
    const buffObj = {
        名称: "自定义BUFF",
        描述: "自行填写",
    } as any
    customBuff.value.forEach((prop) => {
        buffObj[prop[0]] = prop[1]
    })
    buffMap.set("自定义BUFF", buffObj)
}

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

// 验证表单
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

// 添加新的自定义buff
const addBuff = () => {
    if (validateForm()) {
        // 检查是否已经存在相同属性的buff
        const existingIndex = customBuff.value.findIndex((buff) => buff[0] === newBuff.property)
        if (existingIndex !== -1) {
            // 如果存在，更新数值
            customBuff.value[existingIndex][1] += +newBuff.value
        } else {
            // 如果不存在，添加新buff
            customBuff.value.push([newBuff.property, +newBuff.value])
        }

        // 重置表单
        newBuff.property = ""
        newBuff.value = ""

        // 触发事件
        writeCustomBuff()
        emit("add", [newBuff.property, +newBuff.value])
        emit("submit", customBuff.value)
    }
}

// 移除自定义buff
const removeBuff = (index: number) => {
    customBuff.value.splice(index, 1)
    writeCustomBuff()
    emit("remove", index)
    emit("submit", customBuff.value)
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
                <div v-if="errors.property" class="text-xs text-error mt-1">{{ errors.property }}</div>
            </div>

            <div class="flex-1">
                <div class="text-xs text-gray-400 mb-1">数值</div>
                <input type="number" step="0.01" v-model="newBuff.value" class="input input-bordered w-full" placeholder="请输入数值" />
                <div v-if="errors.value" class="text-xs text-error mt-1">{{ errors.value }}</div>
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
