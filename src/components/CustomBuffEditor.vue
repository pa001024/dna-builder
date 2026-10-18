<script setup lang="ts">
import { computed, reactive, ref } from "vue"
import { formatProp, roundBuffValue } from "@/util"

// 自定义 BUFF 可选属性：引擎实际消费的字段（CharBuild.characterBonusAttributes /
// getTotalBonus[Mul|Reduce] 查询 / calculateWeaponAttributes 前缀展开）+
// buff.data.ts 以直接键在用的字段。键名即实例属性名，按 BUFF 口径参与汇总。
// 注意：裸「攻击」/「增伤」只进角色面板，武器需用带前缀版本；
// 「攻击范围」系与神智回复系引擎不参与伤害计算，仅与 buff.data 原样对齐保留。
// 其中「神智回复」是持续性每 3 秒回复，已纳入角色属性汇总用于展示；「单次神智回复」是一次性回复，仅展示。
const properties = [
    // 角色基础
    "攻击",
    "生命",
    "护盾",
    "防御",
    "神智",
    "固定攻击",
    "固定生命",
    // 角色技能
    "技能威力",
    "技能耐久",
    "技能效益",
    "技能范围",
    "技能速度",
    "武器伤害",
    "技能伤害",
    "技能追伤",
    "技能倍率加数",
    "技能倍率乘数",
    "技能倍率赋值",
    // 角色乘区 / 穿透 / 承伤
    "增伤",
    "元素增伤",
    "物理增伤",
    "独立增伤",
    "技能独立增伤",
    "属性攻击",
    "属性穿透",
    "无视防御",
    "技能无视防御",
    "减伤",
    "昂扬",
    "背水",
    "失衡易伤",
    "追加伤害",
    "触发倍率",
    "物理",
    // 召唤物 / 充盈 / 异常
    "召唤物属性继承比例",
    "召唤物攻击速度",
    "召唤物范围",
    "召唤物伤害",
    "召唤物独立增伤",
    "充盈威力",
    "充盈转化",
    "召唤物攻击速度转化",
    "召唤物范围转化",
    "技能触发",
    "异常数量",
    // 伤害转化
    "转切割",
    "转贯穿",
    "转震荡",
    "转灾厄",
    "转充盈",
    "转属克",
    "转属逆",
    // MOD 属性（按角色属性生效，如水属性角色用「水MOD属性」；裸「MOD属性」无引擎效果，仅兼容旧存档）
    "MOD属性",
    "光MOD属性",
    "暗MOD属性",
    "水MOD属性",
    "火MOD属性",
    "雷MOD属性",
    "风MOD属性",
    // 通用武器（无前缀：对所有武器生效）
    "暴击",
    "暴伤",
    "触发",
    "攻速",
    "多重",
    "装填",
    "弹匣",
    "弹药",
    "武器倍率",
    // 攻击细分（裸：仅近战系〈近战 / 同律近战〉生效）
    "普攻增伤",
    "普攻独立增伤",
    "蓄力增伤",
    "蓄力独立增伤",
    "下落增伤",
    "下落独立增伤",
    "滑行增伤",
    "滑行独立增伤",
    // 近战武器
    "近战攻击",
    "近战暴击",
    "近战暴伤",
    "近战触发",
    "近战攻速",
    "近战多重",
    "近战增伤",
    "近战独立增伤",
    "近战装填",
    "近战弹匣",
    "近战弹药",
    "近战武器倍率",
    "近战普攻增伤",
    "近战普攻独立增伤",
    "近战蓄力增伤",
    "近战蓄力独立增伤",
    "近战下落增伤",
    "近战下落独立增伤",
    "近战滑行增伤",
    "近战滑行独立增伤",
    // 远程武器
    "远程攻击",
    "远程暴击",
    "远程暴伤",
    "远程触发",
    "远程攻速",
    "远程多重",
    "远程增伤",
    "远程独立增伤",
    "远程装填",
    "远程弹匣",
    "远程弹药",
    "远程武器倍率",
    "远程普攻增伤",
    "远程普攻独立增伤",
    "远程蓄力增伤",
    "远程蓄力独立增伤",
    "远程下落增伤",
    "远程下落独立增伤",
    "远程滑行增伤",
    "远程滑行独立增伤",
    // 同律近战武器
    "同律近战攻击",
    "同律近战暴击",
    "同律近战暴伤",
    "同律近战触发",
    "同律近战攻速",
    "同律近战多重",
    "同律近战增伤",
    "同律近战独立增伤",
    "同律近战装填",
    "同律近战弹匣",
    "同律近战弹药",
    "同律近战武器倍率",
    "同律近战普攻增伤",
    "同律近战普攻独立增伤",
    "同律近战蓄力增伤",
    "同律近战蓄力独立增伤",
    "同律近战下落增伤",
    "同律近战下落独立增伤",
    "同律近战滑行增伤",
    "同律近战滑行独立增伤",
    // 同律远程武器
    "同律远程攻击",
    "同律远程暴击",
    "同律远程暴伤",
    "同律远程触发",
    "同律远程攻速",
    "同律远程多重",
    "同律远程增伤",
    "同律远程独立增伤",
    "同律远程装填",
    "同律远程弹匣",
    "同律远程弹药",
    "同律远程武器倍率",
    "同律远程普攻增伤",
    "同律远程普攻独立增伤",
    "同律远程蓄力增伤",
    "同律远程蓄力独立增伤",
    "同律远程下落增伤",
    "同律远程下落独立增伤",
    "同律远程滑行增伤",
    "同律远程滑行独立增伤",
    // 魔灵
    "魔灵CD缩减",
    // 仅对齐 buff.data（引擎不参与伤害计算）：神智回复系 / 攻击范围系
    // 神智回复为持续性每 3 秒回复（已纳入角色属性），单次神智回复为一次性回复（仅展示）
    "神智回复",
    "单次神智回复",
    "攻击范围",
    "近战范围",
    "同律近战范围",
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
        // 输入与累加可能产生浮点尾差（如0.23499999），统一舍入到6位小数后再持久化
        const nextBuff: [string, number] = [newBuff.property, roundBuffValue(+newBuff.value)]
        const nextCustomBuff = cloneCustomBuffs()
        const existingIndex = nextCustomBuff.findIndex(buff => buff[0] === nextBuff[0])
        if (existingIndex !== -1) {
            nextCustomBuff[existingIndex][1] = roundBuffValue(nextCustomBuff[existingIndex][1] + nextBuff[1])
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
    <div class="rounded-xs border border-base-content/10 bg-base-100/70 backdrop-blur-sm shadow-sm p-4 transition-all duration-300">
        <!-- 添加新buff的表单 -->
        <div class="flex gap-3 mb-4">
            <div class="flex-1">
                <div class="text-xs text-base-content/60 mb-1">{{ $t("custom-buff-editor.attribute") }}</div>
                <Select
                    v-model="newBuff.property"
                    class="w-full min-w-0 rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
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
                <div class="text-xs text-base-content/60 mb-1">{{ $t("custom-buff-editor.value") }}</div>
                <input
                    v-model="newBuff.value"
                    type="number"
                    step="0.01"
                    class="w-full rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary font-mono tabular-nums"
                    :placeholder="$t('custom-buff-editor.value_placeholder')"
                />
                <div v-if="errors.value" class="text-xs text-error mt-1">
                    {{ errors.value }}
                </div>
            </div>

            <div class="flex items-end">
                <button class="btn btn-primary h-10" @click="addBuff">{{ $t("custom-buff-editor.add") }}</button>
            </div>
        </div>

        <!-- 已添加的自定义buff列表 -->
        <div v-if="customBuff.length > 0" class="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
            <div
                v-for="(buff, index) in customBuff"
                :key="index"
                class="flex items-center justify-between rounded-xs border border-base-content/10 bg-base-100/30 p-3"
            >
                <div class="flex items-center gap-2">
                    <span class="font-medium">{{ buff[0] }}</span>
                    <span class="text-sm text-base-content/60">{{ formatProp(buff[0], buff[1]) }}</span>
                </div>
                <button class="btn btn-ghost btn-error btn-sm" @click="removeBuff(index)">{{ $t("custom-buff-editor.remove") }}</button>
            </div>
        </div>

        <!-- 空状态提示 -->
        <div v-else class="py-4 text-center text-sm text-base-content/45">{{ $t("custom-buff-editor.empty_hint") }}</div>
    </div>
</template>
