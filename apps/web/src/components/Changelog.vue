<script setup lang="ts">
import { onMounted, ref } from "vue"

// 版本条目：来自 public/versions.json
interface VersionEntry {
    version: string
    msg: string
}

const versions = ref<VersionEntry[]>([])
const loading = ref(false)

/**
 * @description 拉取版本更新日志（取最近 4 条非空记录）。
 */
async function fetchChangelog() {
    loading.value = true
    try {
        const response = await fetch("/versions.json")
        const data = (await response.json()) as VersionEntry[]
        versions.value = (data || []).filter(version => version?.msg).slice(0, 4)
    } catch (error) {
        console.error("获取更新日志失败:", error)
    } finally {
        loading.value = false
    }
}

onMounted(fetchChangelog)
</script>

<template>
    <section>
        <!-- 加载状态 -->
        <div v-if="loading" class="flex justify-center py-8">
            <span class="loading loading-spinner loading-lg" />
        </div>

        <!-- 空状态 -->
        <div
            v-else-if="versions.length === 0"
            class="flex flex-col items-center justify-center gap-2 rounded-xs border border-dashed border-base-content/15 py-8 text-base-content/45"
        >
            <Icon icon="ri:file-list-line" class="h-7 w-7 opacity-50" />
            <span class="text-[13px]">{{ $t("home.noupdate") }}</span>
        </div>

        <!-- 版本列表 -->
        <div v-else class="space-y-1.5">
            <div v-for="version in versions" :key="version.version" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3">
                <div class="font-orbitron text-[13px] font-semibold text-primary tabular-nums">{{ version.version }}</div>
                <ul class="mt-1.5 space-y-1">
                    <li v-for="item in version.msg.split(', ')" :key="item" class="flex items-start gap-1.5 text-xs text-base-content/65">
                        <span class="mt-1.25 h-1 w-1 shrink-0 rounded-full bg-primary/60" aria-hidden="true" />
                        <span class="min-w-0">{{ item }}</span>
                    </li>
                </ul>
            </div>
        </div>
    </section>
</template>
