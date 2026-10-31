<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue"
import DotConfigDialog from "@/components/DotConfigDialog.vue"
import type { DotFrequencySettings } from "@/composables/useCharSettings"
import { useNodeEditorStore } from "@/store/nodeEditor"
import BaseNode from "./BaseNode.vue"

const props = defineProps<{
    id: string
    data: any
    type: string
    selected: boolean
}>()

const store = useNodeEditorStore()

const defaultSettings: DotFrequencySettings = {
    skill: 0,
    melee: 0,
    ranged: 0,
    skillweapon: 0,
    forceOwnAdditionalDamage: false,
}

const settings = reactive<DotFrequencySettings>({ ...defaultSettings, ...(props.data.dotSettings ?? {}) })
if (!props.data.dotSettings) props.data.dotSettings = { ...settings }

watch(
    () => props.data.dotSettings,
    value => Object.assign(settings, defaultSettings, value ?? {}),
    { deep: true }
)

watch(
    settings,
    () => {
        const next = { ...settings }
        if (JSON.stringify(next) === JSON.stringify(props.data.dotSettings ?? {})) return
        store.updateNodeData(props.id, { dotSettings: next })
    },
    { deep: true }
)

const dotDialogShow = ref(false)
const context = computed(() => store.getBuildContext(props.id))
const charBuild = computed(() => context.value?.charBuild)

const sources = [
    { key: "skill", label: "技能" },
    { key: "melee", label: "近战" },
    { key: "ranged", label: "远程" },
    { key: "skillweapon", label: "同律" },
] as const

/** 频率展示：最多两位小数 */
function formatFrequency(value: number) {
    return `${+value.toFixed(2)}`
}
</script>

<template>
    <BaseNode v-bind="{ id, data, type, selected }">
        <div class="w-60 max-w-full space-y-1.5">
            <div class="grid grid-cols-2 gap-1 text-[10px]">
                <div
                    v-for="source in sources"
                    :key="source.key"
                    class="flex items-center justify-between border border-base-content/10 bg-base-content/4 px-1.5 py-0.5"
                >
                    <span class="text-base-content/45">{{ source.label }}</span>
                    <span class="font-mono tabular-nums text-base-content/75">{{ formatFrequency(settings[source.key]) }}</span>
                </div>
            </div>
            <div v-if="settings.forceOwnAdditionalDamage" class="text-[10px] text-base-content/40">已手动标记存在自身属性追加伤害</div>
            <button
                type="button"
                class="h-6 w-full cursor-pointer border border-base-content/15 bg-base-100 text-[10px] font-semibold text-base-content/70 transition-colors duration-150 hover:border-primary/50 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
                :disabled="!charBuild"
                @click="dotDialogShow = true"
            >
                DOT 频率设置
            </button>
            <div v-if="!charBuild" class="text-[10px] text-base-content/40">连接核心节点并选择角色后可查看频率分解</div>
            <div v-if="data.error" class="text-[10px] text-red-500">{{ data.error }}</div>
        </div>

        <Teleport to="body">
            <dialog class="modal" :class="{ 'modal-open': dotDialogShow }">
                <DotConfigDialog
                    v-if="dotDialogShow && charBuild"
                    :char-build="charBuild"
                    :dot-settings="settings"
                    @close="dotDialogShow = false"
                />
                <div class="modal-backdrop" @click="dotDialogShow = false" />
            </dialog>
        </Teleport>
    </BaseNode>
</template>
