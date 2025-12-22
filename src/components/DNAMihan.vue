<script setup lang="ts">
import { MihanNotify } from "../store/mihan"
const props = defineProps<{
    loadref?: (ref: MihanNotify) => void
}>()

const mihanNotify = new MihanNotify()
// 导出ref
const mihanEnableNotify = mihanNotify.mihanEnableNotify
const mihanNotifyOnce = mihanNotify.mihanNotifyOnce
const mihanNotifyTypes = mihanNotify.mihanNotifyTypes
const mihanNotifyMissions = mihanNotify.mihanNotifyMissions
const mihanData = mihanNotify.mihanData
props.loadref?.(mihanNotify)
</script>
<template>
    <DNAMihanItem :missions="mihanData || []" :mihanNotifyMissions="mihanNotifyMissions" />
    <div class="p-4 flex flex-col gap-2">
        <div class="text-lg font-bold pb-2">{{ $t("resizeableWindow.monitorSettings") }}</div>
        <div class="flex gap-2">
            <label class="text-sm p-1 label">
                <input v-model="mihanEnableNotify" type="checkbox" class="toggle toggle-secondary" />
                {{ $t("resizeableWindow.enableNotify") }}
            </label>
            <label v-if="mihanEnableNotify" class="text-sm p-1 label">
                <input v-model="mihanNotifyOnce" type="checkbox" class="toggle toggle-secondary" />
                {{ $t("resizeableWindow.onlyOnce") }}
            </label>
        </div>
        <div v-if="mihanEnableNotify" class="flex gap-2">
            <label v-for="(type, val) in MihanNotify.TYPES" :key="type" class="text-sm p-1 label">
                <input v-model="mihanNotifyTypes" :value="val" name="mihanTypes" type="checkbox" class="toggle toggle-secondary" />
                {{ type }}
            </label>
        </div>
        <div v-if="mihanEnableNotify" class="flex gap-2 flex-wrap">
            <label v-for="mission in MihanNotify.MISSIONS" :key="mission" class="text-sm p-1 label">
                <input
                    v-model="mihanNotifyMissions"
                    :value="mission"
                    name="mihanMissions"
                    type="checkbox"
                    class="toggle toggle-secondary"
                />
                {{ mission }}
            </label>
        </div>
    </div>
</template>
