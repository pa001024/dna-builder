<script setup lang="ts">
import { useTranslation } from "i18next-vue"
import { onMounted, ref } from "vue"
import { useRoute, useRouter } from "vue-router"
import { buildQuery } from "@/api/graphql"

/**
 * `/build/:id` 中转页：深链（`dobapp://open-build/<id>`）与短链共用。
 * 构筑归属的角色 id 只存在服务端，查到后一次 replace 到 `/char/:charId/:buildId`，
 * 与构筑列表点进分享构筑的落点一致。
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
        const build = await buildQuery({ id }, { requestPolicy: "network-only" })
        if (build) {
            await router.replace(`/char/${build.charId}/${build.id}`)
            return
        }
    } catch (error) {
        console.error("加载构筑失败", error)
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
