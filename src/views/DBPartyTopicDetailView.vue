<script lang="ts" setup>
import { computed, ref, watch } from "vue"
import { useRoute } from "vue-router"
import type { PartyTopic } from "@/data/d/partytopic.data"
import { getLocalizedPartyTopicDataByLanguage } from "@/data/d/story-locale"
import { useSettingStore } from "@/store/setting"

const route = useRoute()
const settingStore = useSettingStore()
const localizedPartyTopicData = ref<PartyTopic[]>([])

const partyTopicId = computed(() => Number(route.params.partyTopicId))

/**
 * 异步加载当前语言光阴集数据，并忽略过期请求结果。
 * @param language 设置语言代码
 */
async function loadLocalizedPartyTopicData(language: string): Promise<void> {
    const data = await getLocalizedPartyTopicDataByLanguage(language)
    if (settingStore.lang !== language) {
        return
    }
    localizedPartyTopicData.value = data
}

watch(
    () => settingStore.lang,
    async language => {
        await loadLocalizedPartyTopicData(language)
    },
    { immediate: true }
)

const partyTopic = computed(() => {
    return localizedPartyTopicData.value.find(item => item.id === partyTopicId.value)
})
</script>

<template>
    <ScrollArea class="h-full">
        <!-- 居中容器：与首页一致的纸面排版宽度 -->
        <div class="mx-auto max-w-6xl px-4 py-4 md:px-5">
            <template v-if="partyTopic">
                <div>
                    <DBPartyTopicDetailItem :party-topic="partyTopic" />
                </div>
            </template>

            <div v-else class="text-sm text-base-content/60">未找到光阴集</div>
        </div>
    </ScrollArea>
</template>
