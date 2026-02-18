<script setup lang="ts">
import { onMounted, onUnmounted } from "vue"
import { MIHAN_MISSIONS, MIHAN_TYPES, type MihanNotifyContext, useMihanNotify } from "../store/mihan"

const props = defineProps<{
    loadref?: (ref: MihanNotifyContext) => void
}>()

const mihanNotify = useMihanNotify()
// 导出ref
const mihanEnableNotify = mihanNotify.mihanEnableNotify
const mihanNotifyOnce = mihanNotify.mihanNotifyOnce
const mihanNotifyTypes = mihanNotify.mihanNotifyTypes
const mihanNotifyMissions = mihanNotify.mihanNotifyMissions
const mihanData = mihanNotify.mihanData
props.loadref?.(mihanNotify)

const handleVisibilityChange = () => {
    if (document.visibilityState === "visible") {
        mihanNotify.updateMihanData()
    }
}
onMounted(() => {
    document.addEventListener("visibilitychange", handleVisibilityChange)
})
onUnmounted(() => {
    document.removeEventListener("visibilitychange", handleVisibilityChange)
})
</script>
<template>
    <DNAMihanItem :missions="mihanNotify.isOutdated() ? [] : mihanData || []"
        :mihan-notify-missions="mihanNotifyMissions" />
    <div class="p-4 flex flex-col gap-2">
        <div class="text-lg font-bold pb-2">
            {{ $t("resizeableWindow.monitorSettings") }}

            <span class="text-xs opacity-80 cursor-pointer" @click="mihanNotify.showMihanNotification()">测试</span>
        </div>
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
            <label v-for="(type, val) in MIHAN_TYPES" :key="type" class="text-sm p-1 label">
                <input v-model="mihanNotifyTypes" :value="val" name="mihanTypes" type="checkbox"
                    class="toggle toggle-secondary" />
                {{ $t(type) }}
            </label>
        </div>
        <div v-if="mihanEnableNotify" class="flex gap-2 flex-wrap">
            <label v-for="mission in MIHAN_MISSIONS" :key="mission" class="text-sm p-1 label">
                <input v-model="mihanNotifyMissions" :value="mission" name="mihanMissions" type="checkbox"
                    class="toggle toggle-secondary" />
                {{ $t(mission) }}
            </label>
        </div>
    </div>
</template>
