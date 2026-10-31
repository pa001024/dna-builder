<script setup lang="ts">
import { Handle, Position } from "@vue-flow/core"
import { computed } from "vue"
import { PORT_META, type PortDef } from "@/utils/nodeEditorPorts"

const props = defineProps<{
    input?: PortDef
    output?: PortDef
}>()

const inputColor = computed(() => (props.input ? PORT_META[props.input.type].color : undefined))
const outputColor = computed(() => (props.output ? PORT_META[props.output.type].color : undefined))
</script>

<template>
    <div class="relative -mx-2 flex h-6 items-center gap-1.5 px-2">
        <Handle
            v-if="input"
            :id="input.id"
            type="target"
            :position="Position.Left"
            class="border! border-base-100!"
            :style="{ left: '-4px', top: '50%', transform: 'translateY(-50%)', background: inputColor }"
        />
        <span v-if="input" class="flex min-w-0 items-center gap-1 text-[10px] text-base-content/55">
            <span class="truncate">{{ input.label }}</span>
        </span>
        <span v-if="output" class="ml-auto flex min-w-0 items-center gap-1 text-[10px] text-base-content/55">
            <span class="truncate">{{ output.label }}</span>
        </span>
        <Handle
            v-if="output"
            :id="output.id"
            type="source"
            :position="Position.Right"
            class="border! border-base-100!"
            :style="{ right: '-4px', left: 'auto', top: '50%', transform: 'translateY(-50%)', background: outputColor }"
        />
    </div>
</template>
