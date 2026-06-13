<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from "vue"
import {
    formatBuffClipboardText,
    matchBuffOptionQuery,
    parseBuffClipboardText,
    parseCustomBuffSummary,
    splitBuffClipboardTokens,
} from "@/utils/buff-editor"
import { CharBuild } from "../data/CharBuild"
import type { CharBuildWorkerSnapshot } from "../data/CharBuild.worker"
import { LeveledBuff } from "../data/leveled"
import { useUIStore } from "../store/ui"
import { copyText, pasteText } from "../util"

interface BuffOption {
    label: string
    value: LeveledBuff
    lv: number
    limit?: string
    description?: string
}

interface BuffDisplayOption extends BuffOption {
    income: number
}
const props = defineProps<{
    buffOptions: BuffOption[]
    selectedBuffs: LeveledBuff[]
    charBuild?: CharBuild
    hiddenSupportBuffNames?: string[]
}>()
const ui = useUIStore()
const searchKeyword = ref("")
const incomeMap = ref<Record<string, number>>({})
const workerRef = shallowRef<Worker>()
let workerRequestId = 0

const emit = defineEmits<{
    toggleBuff: [buff: LeveledBuff]
    setBuffLv: [buff: LeveledBuff, level: number]
    replaceBuffs: [buffs: [string, number][]]
    replaceCustomBuff: [buffs: [string, number][]]
}>()

const toggleBuff = (buff: LeveledBuff) => {
    emit("toggleBuff", buff)
}

const setBuffLv = (buff: LeveledBuff, lv: number) => {
    emit("setBuffLv", buff, lv)
}

/**
 * 复制当前已选 BUFF 为逗号分隔字符串。
 */
async function copySelectedBuffs() {
    try {
        await copyText(formatBuffClipboardText(props.selectedBuffs, props.buffOptions))
        ui.showSuccessMessage("已复制BUFF")
    } catch (error) {
        ui.showErrorMessage("复制BUFF失败", error instanceof Error ? error.message : String(error))
    }
}

/**
 * 从剪贴板粘贴 BUFF 列表并替换当前选择。
 */
async function pasteBuffs() {
    try {
        const clipboardText = await pasteText()
        const parsedBuffs = parseBuffClipboardText(clipboardText)
        const clipboardTokens = splitBuffClipboardTokens(clipboardText)
        const customBuffToken = clipboardTokens.find(token => token.replace(/\s+/g, "").startsWith("自定义BUFF"))
        const nextBuffs = parsedBuffs
            .map(buff => {
                const option = props.buffOptions.find(item => item.label === buff.name)
                if (!option) return null
                const level = buff.level ?? option.lv ?? option.value.等级
                if (level <= 0) return null
                return [option.label, level] as [string, number]
            })
            .filter((buff): buff is [string, number] => buff !== null)
        const nextCustomBuff = customBuffToken ? parseCustomBuffSummary(customBuffToken) : null

        if (!nextBuffs.length) {
            ui.showErrorMessage("未识别到可粘贴的BUFF")
            return
        }

        emit("replaceBuffs", nextBuffs)
        if (nextCustomBuff) {
            emit("replaceCustomBuff", nextCustomBuff)
        }
        ui.showSuccessMessage("已粘贴BUFF")
    } catch (error) {
        ui.showErrorMessage("粘贴BUFF失败", error instanceof Error ? error.message : String(error))
    }
}

const sortedBuffs = computed(() => {
    const query = searchKeyword.value.trim()
    const selectedBuffNames = new Set(props.selectedBuffs.map(buff => buff.名称))
    const hiddenSupportNames = props.hiddenSupportBuffNames || []
    const filteredBuffs = props.buffOptions.filter(
        buff =>
            !selectedBuffNames.has(buff.label) &&
            !hiddenSupportNames.some(name => buff.label.includes(name)) &&
            matchBuffOptionQuery(buff, query)
    )
    if (!props.charBuild) return [...filteredBuffs]
    // 获取角色名称
    const charName = props.charBuild.char.名称 || ""

    return [...filteredBuffs].sort((a, b) => {
        // 最先是包含角色名称的BUFF; 然后按默认顺序排序
        const aHasCharName = a.label.includes(charName) || a.value.名称.includes(charName)
        const bHasCharName = b.label.includes(charName) || b.value.名称.includes(charName)

        // 如果一个包含角色名称，另一个不包含，则包含角色名称的排在前面
        if (aHasCharName && !bHasCharName) return -1
        if (!aHasCharName && bHasCharName) return 1

        // 否则保持默认顺序
        return 0
    })
})

const selectedBuffs = computed(() => {
    const query = searchKeyword.value.trim()
    return props.buffOptions.filter(buff => props.selectedBuffs.some(v => v.名称 === buff.label) && matchBuffOptionQuery(buff, query))
})

/**
 * 将当前构筑转换为 worker 可结构化克隆的快照。
 * @param charBuild 当前构筑
 * @returns worker 构筑快照
 */
function createWorkerSnapshot(charBuild: CharBuild): CharBuildWorkerSnapshot {
    const createModSnapshot = (mod: CharBuild["charMods"][number]) =>
        mod
            ? {
                  data: mod.originalModData,
                  level: mod.等级,
                  buffLv: mod.buffLv,
                  effect: mod.buff?._originalBuffData,
              }
            : null
    const createWeaponSnapshot = (weapon: CharBuild["meleeWeapon"]) => ({
        data: weapon._originalWeaponData,
        refine: weapon.精炼,
        level: weapon.等级,
        effectLv: weapon.effectLv,
        effect: weapon.buff?._originalBuffData,
        forgeEffective: weapon.forgeEffective,
    })

    return {
        char: {
            data: charBuild.char._originalCharData,
            level: charBuild.char.等级,
        },
        skillLevel: charBuild.skillLevel,
        hpPercent: charBuild.hpPercent,
        resonanceGain: charBuild.resonanceGain,
        auraMod: createModSnapshot(charBuild.auraMod || null),
        charMods: charBuild.charMods.map(createModSnapshot),
        meleeMods: charBuild.meleeMods.map(createModSnapshot),
        rangedMods: charBuild.rangedMods.map(createModSnapshot),
        skillMods: charBuild.skillMods.map(createModSnapshot),
        buffs: [...charBuild.buffs, ...charBuild.dynamicBuffs].map(buff => ({
            data: buff._originalBuffData,
            level: buff.等级,
        })),
        melee: createWeaponSnapshot(charBuild.meleeWeapon),
        ranged: createWeaponSnapshot(charBuild.rangedWeapon),
        baseName: charBuild.baseName,
        imbalance: charBuild.imbalance,
        enemy: {
            data: charBuild.enemy._baseData,
            level: charBuild.enemy.等级,
            isRouge: charBuild.enemy.isRouge,
            hpMultiplier: charBuild.enemy.hpMultiplier,
        },
        enemyId: charBuild.enemyId,
        enemyLevel: charBuild.enemyLevel,
        enemyResistance: charBuild.enemyResistance,
        targetFunction: charBuild.targetFunction,
        customVariables: charBuild.customVariables,
        timelineDPS: charBuild.timelineDPS,
        teamWeaponCategories: charBuild.teamWeaponCategories,
    }
}

function getIncomeKey(buff: BuffOption, minus: boolean) {
    return `${minus ? "minus" : "add"}:${buff.label}:${buff.lv}`
}

function getIncome(buff: BuffOption, minus: boolean) {
    return incomeMap.value[getIncomeKey(buff, minus)] ?? 0
}

const selectedBuffItems = computed<BuffDisplayOption[]>(() =>
    selectedBuffs.value.map(buff => ({
        ...buff,
        income: getIncome(buff, true),
    }))
)

const sortedBuffItems = computed<BuffDisplayOption[]>(() =>
    sortedBuffs.value.map(buff => ({
        ...buff,
        income: getIncome(buff, false),
    }))
)

/**
 * 将 Vue proxy 与类实例快照转为 worker 可克隆的普通 JSON 数据。
 * @param value 原始数据
 * @returns 普通数据
 */
function cloneForWorker<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T
}

/**
 * 刷新当前可见 BUFF 的收益。
 */
function refreshIncomes() {
    if (!props.charBuild) {
        incomeMap.value = {}
        return
    }
    const visibleBuffs = [
        ...selectedBuffs.value.map(buff => ({ ...buff, minus: true })),
        ...sortedBuffs.value.map(buff => ({ ...buff, minus: false })),
    ]
    const worker = workerRef.value || new Worker(new URL("../data/CharBuild.worker.ts", import.meta.url), { type: "module" })
    workerRef.value = worker
    const id = ++workerRequestId
    worker.onmessage = (event: MessageEvent<{ id: number; incomes?: Record<string, number>; error?: string }>) => {
        if (event.data.id !== workerRequestId) return
        if (event.data.error) {
            console.error("BUFF收益worker计算失败", event.data.error)
            return
        }
        incomeMap.value = event.data.incomes || {}
    }
    worker.postMessage(cloneForWorker({
        id,
        build: createWorkerSnapshot(props.charBuild),
        buffs: visibleBuffs.map(buff => ({
            key: getIncomeKey(buff, buff.minus),
            data: buff.value._originalBuffData,
            level: buff.value.等级,
            minus: buff.minus,
        })),
    }))
}

watch(
    () => [props.charBuild, selectedBuffs.value, sortedBuffs.value],
    () => refreshIncomes(),
    { immediate: true, deep: true }
)

onBeforeUnmount(() => {
    workerRef.value?.terminate()
})

/**
 * 获取已按当前构筑刷新动态属性的BUFF。
 * @param buff BUFF实例
 * @returns 展示用BUFF实例
 */
function getDisplayBuff(buff: LeveledBuff) {
    return props.charBuild?.prepareBuff(buff) || buff
}
</script>
<template>
    <div class="space-y-3">
        <div class="flex flex-wrap items-center gap-2">
            <input v-model="searchKeyword" type="search" class="input input-bordered input-sm flex-1 min-w-48" placeholder="搜索BUFF" />
            <button class="btn btn-sm" title="复制BUFF" @click="copySelectedBuffs">
                <Icon icon="ri:file-copy-line" class="size-4" />
            </button>
            <button class="btn btn-sm" title="粘贴BUFF" @click="pasteBuffs">
                <Icon icon="ri:clipboard-line" class="size-4" />
            </button>
        </div>
        <ScrollArea class="h-80">
            <transition-group name="list" tag="div" class="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
                <!-- 已选择的BUFF -->
                <BuffCell
                    v-for="buff in selectedBuffItems"
                    :key="buff.label"
                    :title="buff.label"
                    :buff="getDisplayBuff(buff.value)"
                    :lv="buff.lv"
                    selected
                    :income="buff.income"
                    @set-buff-lv="setBuffLv"
                    @click="toggleBuff(buff.value)"
                />
                <!-- 未选择的BUFF -->
                <BuffCell
                    v-for="buff in sortedBuffItems"
                    :key="buff.label"
                    :title="buff.label"
                    :buff="getDisplayBuff(buff.value)"
                    :lv="buff.lv"
                    :income="buff.income"
                    @set-buff-lv="setBuffLv"
                    @click="toggleBuff(buff.value)"
                />
            </transition-group>
        </ScrollArea>
    </div>
</template>
