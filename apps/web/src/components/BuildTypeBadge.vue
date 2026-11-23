<script setup lang="ts">
import { useTranslation } from "i18next-vue"
import type { BuildType } from "@/composables/useBuildSummaries"

defineProps<{ buildType?: BuildType }>()
const { t } = useTranslation()
</script>

<template>
    <div v-if="buildType === 'transcend'" class="badge badge-sm badge-secondary" data-build-type>
        {{ t("build-info.type_transcend") }}
    </div>
</template>
