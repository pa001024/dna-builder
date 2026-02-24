<script lang="ts" setup>
import { computed } from "vue"
import { useRoute } from "vue-router"
import { getLocalizedPartyTopicDataByLanguage } from "@/data/d/story-locale"
import { useSettingStore } from "@/store/setting"

const route = useRoute()
const settingStore = useSettingStore()

const partyTopicId = computed(() => Number(route.params.partyTopicId))
const partyTopic = computed(() => {
    const localizedPartyTopicData = getLocalizedPartyTopicDataByLanguage(settingStore.lang)
    return localizedPartyTopicData.find(item => item.id === partyTopicId.value)
})
</script>

<template>
    <ScrollArea class="h-full">
        <template v-if="partyTopic">
            <DBPartyTopicDetailItem :party-topic="partyTopic" class="flex-1" />
        </template>

        <div v-else class="p-4">
            <div class="text-base-content/70">未找到光阴集</div>
        </div>
    </ScrollArea>
</template>
