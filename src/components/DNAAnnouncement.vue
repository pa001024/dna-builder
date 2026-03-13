<script setup lang="ts">
import { useLocalStorage } from "@vueuse/core"
import { DNAAPI, DNAPostListBean } from "dna-api"
import { t } from "i18next"
import { onMounted, ref } from "vue"
import { useSettingStore } from "../store/setting"
import { useUIStore } from "../store/ui"

defineProps<{
    nobtn?: boolean
}>()
const setting = useSettingStore()
const ui = useUIStore()

let api: DNAAPI

const loading = ref(true)
const annPosts = useLocalStorage<DNAPostListBean[]>("dna.ann.annPosts", [])
const lastUpdateTime = useLocalStorage("dna.ann.lastUpdateTime", 0)

onMounted(async () => {
    const dnaApi = await setting.getDNAAPI()
    if (!dnaApi) {
        ui.showErrorMessage(t("chat.needLogin"))
        return
    }
    api = dnaApi
    await loadData()
})

async function loadData(force = false) {
    try {
        if (lastUpdateTime.value > 0 && ui.timeNow - lastUpdateTime.value < 1000 * 60 * 5 && !force) {
            loading.value = false
            return
        }
        loading.value = true
        const res = await api.getOtherMine()
        if (res.is_success && res.data) {
            annPosts.value = res.data.postList
            lastUpdateTime.value = ui.timeNow
        } else {
            ui.showErrorMessage(res.msg || t("dna-announcement.fetch_failed"))
        }
    } catch (e) {
        console.error(e)
        ui.showErrorMessage(t("dna-announcement.fetch_failed"))
    } finally {
        loading.value = false
    }
}

defineExpose({
    loadData,
    lastUpdateTime,
})
</script>
<template>
    <div class="space-y-4">
        <div v-if="!nobtn" class="flex justify-between items-center">
            <span class="text-xs text-gray-500">{{ $t("dna-announcement.last_updated") }}: {{ ui.timeDistancePassed(lastUpdateTime) }}</span>
            <Tooltip :tooltip="$t('dna-announcement.refresh')" side="bottom">
                <button class="btn btn-primary btn-square btn-sm" @click="loadData(true)">
                    <Icon icon="ri:refresh-line" />
                </button>
            </Tooltip>
        </div>
        <div v-if="loading" class="flex justify-center items-center h-full py-8">
            <span class="loading loading-spinner loading-lg" />
        </div>
        <div v-if="annPosts.length > 0" class="space-y-4">
            <DNAPostListItem v-for="post in annPosts" :key="post.postId" :post="post" />
        </div>
        <div v-else-if="!loading" class="flex justify-center items-center h-full">
            <div class="text-center">
                <p class="text-lg mb-4">{{ $t("dna-announcement.empty") }}</p>
            </div>
        </div>
    </div>
</template>
