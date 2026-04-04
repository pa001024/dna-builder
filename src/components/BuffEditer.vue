<script setup lang="ts">
import { computed, ref } from "vue"
import {
    formatBuffClipboardText,
    matchBuffOptionQuery,
    parseBuffClipboardText,
    parseCustomBuffSummary,
    splitBuffClipboardTokens,
} from "@/utils/buff-editor"
import { CharBuild } from "../data/CharBuild"
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
const props = defineProps<{
    buffOptions: BuffOption[]
    selectedBuffs: LeveledBuff[]
    charBuild?: CharBuild
    hiddenSupportBuffNames?: string[]
}>()
const ui = useUIStore()
const searchKeyword = ref("")

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
                    v-for="buff in selectedBuffs"
                    :key="buff.label"
                    :title="buff.label"
                    :buff="buff.value"
                    :lv="buff.lv"
                    selected
                    :income="charBuild?.calcIncome(buff.value, true) || 0"
                    @set-buff-lv="setBuffLv"
                    @click="toggleBuff(buff.value)"
                />
                <!-- 未选择的BUFF -->
                <BuffCell
                    v-for="buff in sortedBuffs"
                    :key="buff.label"
                    :title="buff.label"
                    :buff="buff.value"
                    :lv="buff.lv"
                    :income="charBuild?.calcIncome(buff.value, false) || 0"
                    @set-buff-lv="setBuffLv"
                    @click="toggleBuff(buff.value)"
                />
            </transition-group>
        </ScrollArea>
    </div>
</template>
