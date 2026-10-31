<script setup lang="ts">
import { useTranslation } from "i18next-vue"
import { onMounted, ref } from "vue"
import { useRoute, useRouter } from "vue-router"
import { graphQuery } from "@/api/graphql"

/**
 * `/graph/:id` 中转页：短链落点，查到图后 replace 到节点图编辑页 `/flow/:graphId`，
 * 与分享节点图卡片的「载入」落点一致（对标 `/build/:id` → `/char/:charId/:buildId`）。
 */
const route = useRoute()
const router = useRouter()
const { t } = useTranslation()

const failed = ref(false)

onMounted(async () => {
    const id = typeof route.params.id === "string" ? route.params.id : ""
    if (!id) {
        failed.value = true
        return
    }
    try {
        const graph = await graphQuery({ id }, { requestPolicy: "network-only" })
        if (graph) {
            await router.replace(`/flow/${graph.id}`)
            return
        }
    } catch (error) {
        console.error("加载节点图失败", error)
    }
    failed.value = true
})
</script>

<template>
    <div class="flex h-full min-h-96 flex-col items-center justify-center">
        <span v-if="!failed" class="loading loading-spinner loading-lg text-primary" />
        <p class="mt-4 text-base-content/60">{{ failed ? t("char-build.load_build_failed") : t("common.loading") }}</p>
        <RouterLink v-if="failed" to="/" class="btn btn-primary mt-6">
            <Icon icon="ri:home-line" class="size-6" />
            <span>{{ t("notfound.back_home") }}</span>
        </RouterLink>
    </div>
</template>
