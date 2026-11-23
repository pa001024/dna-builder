<script lang="ts" setup>
import { useRoute } from "vue-router"

const route = useRoute()
</script>

<template>
    <div class="h-full flex flex-col">
        <DBTranscendenceNav />
        <div class="flex flex-1 items-center justify-center p-6">
            <div class="max-w-sm rounded-xs border border-base-content/10 bg-base-100/60 p-6 text-center backdrop-blur-sm">
                <Icon icon="ri:error-warning-line" class="mx-auto size-9 text-primary/40" />
                <p class="mt-3 text-sm text-base-content/70">{{ $t("db-transcendence.detail.not_found") }}</p>
                <p class="mt-1 break-all font-mono text-[10px] text-base-content/35">{{ route.fullPath }}</p>
            </div>
        </div>
    </div>
</template>
