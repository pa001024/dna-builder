<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import { useRouter } from "vue-router"
import { type Build, recommendedBuildsQuery } from "@/api/graphql"
import { charData, LeveledChar } from "@/data"

const router = useRouter()

// 最近推荐构筑列表（最多展示 3 条）
const builds = ref<Build[]>([])
const loading = ref(false)
const failed = ref(false)

/**
 * @description 拉取最新的推荐构筑（服务端按时间倒序返回，已推荐标记）。
 */
async function fetchRecentBuilds() {
    loading.value = true
    failed.value = false
    try {
        const result = await recommendedBuildsQuery({ limit: 3 }, { requestPolicy: "network-only" })
        builds.value = result || []
    } catch (error) {
        console.error("获取最近构筑失败:", error)
        failed.value = true
    } finally {
        loading.value = false
    }
}

// 展示的构筑列表（最多 3 条）
const displayBuilds = computed(() => builds.value.slice(0, 3))

/**
 * @description 根据构筑的角色 ID 查找角色数据，用于展示头像与角色名。
 * @param build 构筑对象
 * @returns 角色数据（可能为 undefined）
 */
function charOf(build: Build) {
    return charData.find(char => char.id === build.charId)
}

/**
 * @description 跳转到对应构筑的分享页面（角色 / 构筑组合路由）。
 * @param build 被点击的构筑对象
 */
function openBuild(build: Build) {
    router.push({ name: "char-build-code", params: { charId: build.charId, buildId: build.id } })
}

onMounted(fetchRecentBuilds)
</script>

<template>
    <section>
        <!-- 章节头：序号 + 标签 + 标题 -->
        <div class="mb-4 flex items-center gap-3.5 animate-ef-rise motion-reduce:animate-none">
            <span
                class="inline-flex h-9 min-w-9 items-center justify-center rounded-xs bg-primary px-2 font-orbitron text-sm font-semibold tracking-wide text-primary-content tabular-nums"
            >
                03
            </span>
            <span class="text-[11px] font-semibold tracking-[0.3em] text-base-content/55 uppercase">BUILDS</span>
            <span class="text-[17px] font-semibold text-base-content">{{ $t("home.recentBuilds") }}</span>
            <span class="h-px min-w-8 flex-1 bg-base-content/10" aria-hidden="true" />
            <span v-if="displayBuilds.length > 0" class="text-[11px] font-medium text-base-content/50">
                {{ $t("home.recentBuildsCount", { count: displayBuilds.length }) }}
            </span>
        </div>

        <!-- 加载状态 -->
        <div v-if="loading" class="flex justify-center py-8">
            <span class="loading loading-spinner loading-lg" />
        </div>

        <!-- 空 / 失败状态 -->
        <div
            v-else-if="displayBuilds.length === 0 || failed"
            class="flex flex-col items-center justify-center gap-2 rounded-xs border border-dashed border-base-content/15 py-8 text-base-content/45"
        >
            <Icon icon="ri:hammer-line" class="h-7 w-7 opacity-50" />
            <span class="text-[13px]">{{ $t("home.recentBuildsEmpty") }}</span>
        </div>

        <!-- 构筑卡片列表 -->
        <div v-else class="space-y-2">
            <button
                v-for="build in displayBuilds"
                :key="build.id"
                type="button"
                class="group flex w-full items-center gap-3 rounded-xs border border-base-content/10 bg-base-100/60 p-3 text-left transition-colors duration-200 hover:border-primary/40"
                @click="openBuild(build)"
            >
                <!-- 角色头像 -->
                <span class="relative h-14 w-14 shrink-0 overflow-hidden rounded-xs bg-base-200">
                    <ImageFallback
                        :src="LeveledChar.url(charOf(build)?.icon)"
                        :alt="charOf(build)?.名称 || build.title"
                        class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
                        loading="lazy"
                    >
                        <Icon icon="ri:user-line" class="h-full w-full opacity-50" />
                    </ImageFallback>
                </span>

                <!-- 名称 + 描述 + 作者信息 -->
                <span class="flex min-w-0 flex-1 flex-col gap-1">
                    <span class="truncate text-[13px] font-semibold text-base-content transition-colors duration-200 group-hover:text-primary">
                        {{ build.title }}
                    </span>
                    <span v-if="build.desc" class="line-clamp-1 text-xs text-base-content/60">{{ build.desc }}</span>
                    <span class="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-base-content/45">
                        <span class="flex items-center gap-1">
                            <Icon icon="ri:user-line" class="h-3 w-3 shrink-0" />
                            <span class="truncate">{{ build.user?.name || build.user?.qq || "—" }}</span>
                        </span>
                        <span class="flex items-center gap-1 tabular-nums">
                            <Icon icon="ri:eye-line" class="h-3 w-3 shrink-0" />
                            {{ build.views }}
                        </span>
                        <span class="flex items-center gap-1 tabular-nums">
                            <Icon icon="ri:heart-line" class="h-3 w-3 shrink-0" />
                            {{ build.likes }}
                        </span>
                    </span>
                </span>

                <Icon icon="ri:arrow-right-line" class="h-4 w-4 shrink-0 text-base-content/30 transition-colors duration-200 group-hover:text-primary" />
            </button>
        </div>
    </section>
</template>
