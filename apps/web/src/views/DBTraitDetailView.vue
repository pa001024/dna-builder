<script lang="ts" setup>
import { computed } from "vue"
import { useRoute } from "vue-router"
import { getCharTraitByName } from "@/utils/char-trait"

const route = useRoute()

const traitName = computed(() => decodeURIComponent(String(route.params.name ?? "")))
const trait = computed(() => (traitName.value ? getCharTraitByName(traitName.value) : null))
</script>

<template>
    <div class="h-full flex flex-col">
        <ScrollSpyLayout auto nav-kicker="DATABASE" v-if="trait" class="flex-1">
            <!-- 居中容器：与首页一致的纸面排版宽度 -->
            <div class="mx-auto max-w-6xl px-4 py-4 md:px-5">
                <div>
                    <DBTraitDetailItem :trait="trait" />
                </div>
            </div>
        </ScrollSpyLayout>

        <div v-else class="flex-1 flex items-center justify-center">
            <div class="text-base-content/70">{{ $t("db-trait-detail-view.not_found") }}</div>
        </div>
    </div>
</template>
