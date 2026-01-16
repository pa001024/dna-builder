<script setup lang="ts">
import { computed, ref } from "vue"
import { monsterData } from "@/data"
import { LeveledMonster } from "@/data/leveled"
import { useNodeEditorStore } from "@/store/nodeEditor"
import { formatBigNumber } from "@/util"
import BaseNode from "./BaseNode.vue"

const props = defineProps<{
    id: string
    data: any
    type: string
    selected: boolean
}>()

interface EnemyOption {
    label: string
    value: number
    type?: string
}

const store = useNodeEditorStore()

// 本地状态
const enemyId = ref<number>(props.data.enemyId || 0)
const enemyLevel = ref<number>(props.data.enemyLevel || 80)
const enemyResistance = ref<number>(props.data.enemyResistance || 0)

// 从 monsterMap 生成敌人选项
const enemyOptions = computed<EnemyOption[]>(() => {
    const options: EnemyOption[] = monsterData.map(monster => ({
        label: monster.n,
        value: monster.id,
        type: monster.t,
    }))

    // 按敌人名称排序
    return options
})

// 当前选中的敌人
const selectedEnemy = computed(() => {
    return new LeveledMonster(enemyId.value, enemyLevel.value)
})

// 更新store
function updateStore() {
    store.updateNodeData(props.id, {
        enemyId: enemyId.value,
        enemyLevel: enemyLevel.value,
        enemyResistance: enemyResistance.value,
    })
}

// 更新敌人
function updateEnemy(value: number) {
    enemyId.value = value
    updateStore()
}

// 更新敌人等级
function updateEnemyLevel(value: number) {
    enemyLevel.value = value
    updateStore()
}

// 更新敌人抗性
function updateEnemyResistance(value: number) {
    enemyResistance.value = value
    updateStore()
}

const imbalance = computed({
    get: () => props.data.imbalance,
    set: value => store.updateNodeData(props.id, { imbalance: value }),
})
</script>

<template>
    <BaseNode :id="id" :data="data" :type="type" :selected="selected">
        <div class="space-y-3">
            <!-- 敌人选择 -->
            <div>
                <label class="text-sm text-base-content/60 block mb-1">敌人</label>
                <Select v-model="enemyId" class="w-full input input-sm" @change="updateEnemy(enemyId)">
                    <SelectItem v-for="option in enemyOptions" :key="option.value" :value="option.value">
                        {{ option.label }} {{ option.type ? `(${option.type})` : "" }}
                    </SelectItem>
                </Select>
            </div>

            <!-- 敌人等级 -->
            <div>
                <label class="text-sm text-base-content/60 block mb-1">敌人等级</label>
                <input
                    v-model.number="enemyLevel"
                    type="number"
                    class="input input-sm w-full"
                    min="1"
                    max="180"
                    @change="updateEnemyLevel(enemyLevel)"
                />
            </div>

            <!-- 敌人抗性 -->
            <div>
                <label class="text-sm text-base-content/60 block mb-1">敌人抗性</label>
                <input
                    v-model.number="enemyResistance"
                    type="number"
                    class="input input-sm w-full"
                    min="0"
                    max="1"
                    step="0.1"
                    @change="updateEnemyResistance(enemyResistance)"
                />
            </div>

            <div class="flex-1">
                <div class="px-2 text-xs text-gray-400 mb-1">
                    {{ $t("失衡") }}
                </div>
                <div class="p-0.5">
                    <input v-model="imbalance" type="checkbox" class="toggle toggle-secondary" />
                </div>
            </div>

            <!-- 敌人属性显示 -->
            <div class="p-2 bg-base-200 rounded">
                <div class="text-xs text-base-content/60 mb-2">敌人属性（当前等级）</div>
                <div class="grid grid-cols-2 gap-2 text-sm">
                    <div><span class="font-medium">血量:</span> {{ formatBigNumber(selectedEnemy.hp) }}</div>
                    <div><span class="font-medium">防御:</span> {{ selectedEnemy.def }}</div>
                    <div><span class="font-medium">攻击:</span> {{ selectedEnemy.atk }}</div>
                    <div><span class="font-medium">战姿:</span> {{ selectedEnemy.tn }}</div>
                </div>
            </div>
        </div>
    </BaseNode>
</template>
