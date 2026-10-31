<script setup lang="ts">
import { computed, reactive, watch } from "vue"
import EffectSettings from "@/components/EffectSettings.vue"
import type { CharSettings } from "@/composables/useCharSettings"
import { useNodeEditorStore } from "@/store/nodeEditor"
import BaseNode from "./BaseNode.vue"

const props = defineProps<{
    id: string
    data: any
    type: string
    selected: boolean
}>()

const store = useNodeEditorStore()

const local = reactive({
    useGlobal: props.data.useGlobal === true,
    effectConfig: { ...(props.data.effectConfig ?? {}) } as Record<string, number>,
})

const context = computed(() => store.getBuildContext(props.id))
const charBuild = computed(() => context.value?.charBuild)
const mods = computed(() => charBuild.value?.modsWithWeapons ?? [])
const effectSettings = computed(() => local as unknown as CharSettings)

watch(
    () => [props.data.useGlobal, props.data.effectConfig],
    () => {
        local.useGlobal = props.data.useGlobal === true
        local.effectConfig = { ...(props.data.effectConfig ?? {}) }
    },
    { deep: true }
)

/** 写回特效配置 */
function commit() {
    const nextConfig = { ...local.effectConfig }
    const currentConfig = props.data.effectConfig ?? {}
    if (local.useGlobal === (props.data.useGlobal === true) && JSON.stringify(nextConfig) === JSON.stringify(currentConfig)) return
    store.updateNodeData(props.id, { useGlobal: local.useGlobal, effectConfig: nextConfig })
}

watch(local, commit, { deep: true })

function setUseGlobal(value: boolean) {
    local.useGlobal = value
    commit()
}
</script>

<template>
    <BaseNode v-bind="{ id, data, type, selected }">
        <div class="w-150 max-w-full">
            <EffectSettings
                v-if="charBuild"
                :mods="mods"
                :char-build="charBuild"
                :use-global="local.useGlobal"
                :char-settings="effectSettings"
                @update:use-global="setUseGlobal"
            />
            <div v-else class="text-[10px] text-base-content/45">连接核心节点后可配置特效等级</div>
        </div>
    </BaseNode>
</template>
