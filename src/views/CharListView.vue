<script setup lang="ts">
import { computed, ref } from "vue"
import { charData, LeveledChar } from "@/data"
import { matchPinyin } from "@/utils/pinyin-utils"

const tabs = ["全部", "输出", "同律武器", "武器伤害", "技能伤害", "辅助", "召唤物", "控制", "神智回复", "治疗", "最大生命", "防御", "护盾"]
const activeTab = ref(tabs[1])
const searchQuery = ref("")

// 元素颜色映射（悬停渐变）
const elementColors: Record<string, string> = {
    光: "from-yellow-400 to-yellow-600",
    暗: "from-gray-400 to-gray-700",
    水: "from-blue-400 to-blue-600",
    火: "from-red-400 to-red-600",
    雷: "from-purple-400 to-purple-600",
    风: "from-green-400 to-green-600",
}

// 元素悬停边框颜色（卡片悬停时以元素色强调）
const elementHoverBorders: Record<string, string> = {
    光: "hover:border-yellow-500/70",
    暗: "hover:border-gray-500/70",
    水: "hover:border-blue-500/70",
    火: "hover:border-red-500/70",
    雷: "hover:border-purple-500/70",
    风: "hover:border-green-500/70",
}

// 元素英文徽记（纯装饰，配合等宽大写徽记的造型语言）
const elementNames: Record<string, string> = {
    光: "Light",
    暗: "Dark",
    水: "Water",
    火: "Fire",
    雷: "Thunder",
    风: "Wind",
}

// 过滤后的角色列表
const filteredChars = computed(() => {
    let filtered = charData.filter(c => activeTab.value === "全部" || c.标签?.includes(activeTab.value))

    if (searchQuery.value) {
        const query = searchQuery.value
        filtered = filtered.filter(c => {
            // 直接中文匹配
            if (c.名称.includes(query) || c.别名?.includes(query) || c.阵营?.includes(query)) {
                return true
            }
            // 拼音匹配（全拼/首字母）
            const nameMatch = matchPinyin(c.名称, query)
            if (nameMatch.match) return true
            const aliasMatch = c.别名 ? matchPinyin(c.别名, query) : false
            if (aliasMatch && aliasMatch.match) return true
            const factionMatch = c.阵营 ? matchPinyin(c.阵营, query) : false
            if (factionMatch && factionMatch.match) return true
            return false
        })
    }

    return filtered
})

/**
 * 计算卡片入场动画的延迟时间，按序错开浮现。
 * @param index 角色下标
 * @returns 延迟毫秒数（封顶 500ms）
 */
const getAnimationDelay = (index: number) => {
    return Math.min(index * 50, 500)
}
</script>

<template>
    <div class="flex h-full flex-col overflow-hidden">
        <ScrollArea class="flex-1">
            <div class="mx-auto flex min-h-full w-full max-w-7xl flex-col px-4 md:px-6 lg:px-8">
                <!-- 检索带：下划线搜索 + 计数状态 + 分类方章 -->
                <section class="animate-ef-rise border-b border-base-content/15 py-7" style="animation-delay: 0.06s">
                    <div class="flex flex-col gap-5">
                        <div class="flex flex-col gap-3 lg:flex-row lg:items-end lg:gap-10">
                            <div class="relative w-full flex-1">
                                <Icon icon="ri:search-line" class="absolute left-0 top-1/2 h-5 w-5 -translate-y-1/2 text-base-content/35" />
                                <input
                                    v-model="searchQuery"
                                    type="text"
                                    :placeholder="$t('char-list.searchPlaceholder')"
                                    class="w-full rounded-none border-0 border-b border-base-content/25 bg-transparent py-2 pl-8 pr-4 text-sm shadow-none outline-none transition-colors duration-200 placeholder:text-base-content/35 focus:border-primary"
                                />
                            </div>
                            <p class="shrink-0 text-xs tracking-wide text-base-content/45">
                                {{ $t(`tag.${activeTab}`, $t(activeTab)) }} · {{ filteredChars.length }}
                                {{ $t("char-list.totalSuffix") }}
                            </p>
                        </div>

                        <!-- 分类方章 -->
                        <ScrollArea :vertical="false" horizontal>
                            <div class="flex gap-2 pb-1">
                                <button
                                    v-for="tab in tabs"
                                    :key="tab"
                                    type="button"
                                    class="shrink-0 cursor-pointer whitespace-nowrap border px-3.5 py-1.5 text-xs transition-colors duration-200 active:scale-[0.97]"
                                    :class="
                                        activeTab === tab
                                            ? 'border-primary bg-primary font-semibold text-primary-content'
                                            : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                                    "
                                    @click="activeTab = tab"
                                >
                                    {{ $t(`tag.${tab}`, $t(tab)) }}
                                </button>
                            </div>
                        </ScrollArea>
                    </div>
                </section>

                <!-- 角色索引 -->
                <main class="flex-1 py-8 md:py-10">
                    <div
                        v-if="filteredChars.length === 0"
                        class="flex flex-col items-center justify-center py-24 text-base-content/50 animate-ef-rise motion-reduce:animate-none"
                        style="animation-delay: 0.12s"
                    >
                        <Icon icon="ri:emotion-sad-line" class="mb-5 h-14 w-14 opacity-40" />
                        <p class="text-base">{{ $t("char-list.empty") }}</p>
                    </div>

                    <div
                        v-else
                        class="grid grid-cols-[repeat(auto-fill,minmax(min(100%,140px),1fr))] gap-4 md:grid-cols-[repeat(auto-fill,minmax(min(100%,190px),1fr))]"
                    >
                        <div
                            v-for="(char, index) in filteredChars"
                            :key="`${char.id}-${activeTab}`"
                            class="animate-ef-rise group relative flex cursor-pointer flex-col overflow-hidden border border-base-content/15 bg-base-100/50 backdrop-blur-sm [transition:transform_0.3s_cubic-bezier(0.22,1,0.36,1),box-shadow_0.3s_ease,border-color_0.2s_ease] hover:-translate-y-1 hover:[box-shadow:0_16px_40px_-16px_color-mix(in_srgb,var(--color-base-content)_22%,transparent)] active:scale-[0.985]"
                            :class="elementHoverBorders[char.属性]"
                            :style="{ animationDelay: `${getAnimationDelay(index)}ms` }"
                            @click="$router.push(`/char/${char.id}`)"
                        >
                            <!-- 元素色条：悬停时显现 -->
                            <div
                                class="absolute inset-x-0 top-0 z-10 h-0.5 bg-linear-to-r opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                                :class="elementColors[char.属性] || 'from-gray-400 to-gray-600'"
                            />

                            <!-- 角色头像 -->
                            <div class="relative aspect-square overflow-hidden bg-base-200">
                                <ImageFallback
                                    :src="LeveledChar.url(char.icon!)"
                                    :alt="char.名称"
                                    class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                                    loading="lazy"
                                >
                                    <Icon icon="ri:user-line" class="h-full w-full opacity-50" />
                                </ImageFallback>

                                <!-- 幽灵序号 + 元素徽记 -->
                                <span
                                    class="absolute left-2 top-2 z-10 bg-base-100/55 px-[0.35rem] py-[0.15rem] text-2xl font-black leading-none tracking-[-0.02em] tabular-nums text-base-content/60 backdrop-blur-[2px] transition-colors duration-200 group-hover:text-primary/75"
                                >
                                    {{ String(index + 1).padStart(2, "0") }}
                                </span>
                                <span
                                    v-if="elementNames[char.属性]"
                                    class="absolute right-2 top-2 z-10 bg-base-100/55 px-[0.45rem] py-[0.2rem] font-mono text-[9px] uppercase tracking-[0.25em] text-base-content/55 backdrop-blur-[2px] transition-colors duration-200 group-hover:text-primary"
                                >
                                    {{ elementNames[char.属性] }}
                                </span>

                                <!-- 悬停遮罩 -->
                                <div class="absolute inset-0 bg-black/0 transition-all duration-300 group-hover:bg-black/20" />
                            </div>

                            <!-- 角色信息 -->
                            <div class="flex flex-1 flex-col gap-2.5 p-3.5">
                                <!-- 名称 -->
                                <h3
                                    class="flex items-center gap-2 text-base font-bold transition-colors duration-200 group-hover:text-primary"
                                >
                                    <img :src="LeveledChar.elementUrl(char.属性)" :alt="char.属性" class="h-8 w-4 shrink-0 object-cover" />
                                    <span class="truncate">{{ $t(char.名称) }}</span>
                                </h3>

                                <!-- 阵营 + 版本：元信息行 -->
                                <p
                                    v-if="char.阵营 || char.版本"
                                    class="flex items-center justify-between gap-2 text-[0.625rem] tracking-wide text-base-content/40"
                                >
                                    <span v-if="char.阵营" class="truncate">{{ $t(char.阵营) }}</span>
                                    <span v-if="char.版本" class="shrink-0 tabular-nums">v{{ char.版本 }}</span>
                                </p>

                                <!-- 标签 -->
                                <div class="flex flex-wrap gap-1">
                                    <span
                                        v-for="tag in (char.标签 || []).slice(0, 2)"
                                        :key="tag"
                                        class="border border-base-content/15 px-[0.4rem] py-[0.1rem] text-[10px] tracking-[0.08em] text-base-content/55 opacity-70 transition-opacity duration-200 group-hover:opacity-100"
                                    >
                                        {{ $t(`tag.${tag}`, $t(tag)) }}
                                    </span>
                                </div>

                                <!-- 精通武器 -->
                                <div class="flex items-center gap-1.5 text-xs text-base-content/50">
                                    <Icon icon="ri:sword-line" class="h-3.5 w-3.5 shrink-0" />
                                    <span class="truncate">{{ char.精通?.map(item => $t(item)).join(" / ") }}</span>
                                </div>

                                <!-- 底部属性条 -->
                                <div class="mt-auto grid grid-cols-2 gap-1 border-t border-base-content/10 pt-2.5">
                                    <div
                                        class="flex items-center gap-1.5 text-xs text-base-content/70 transition-colors duration-200 group-hover:text-primary"
                                    >
                                        <Icon icon="ri:sword-line" class="h-3.5 w-3.5 shrink-0" />
                                        <span class="tabular-nums">{{ char.基础攻击 }}</span>
                                    </div>
                                    <div
                                        class="flex items-center gap-1.5 text-xs text-base-content/70 transition-colors duration-200 group-hover:text-success"
                                    >
                                        <Icon icon="ri:heart-pulse-line" class="h-3.5 w-3.5 shrink-0" />
                                        <span class="tabular-nums">{{ char.基础生命 }}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </main>

                <!-- 统计页脚：幽灵大数字 + 等宽小字 -->
                <footer
                    class="animate-ef-rise flex flex-wrap items-end justify-between gap-x-8 gap-y-3 border-t border-base-content/15 py-8"
                    style="animation-delay: 0.3s"
                >
                    <div class="flex items-baseline gap-3">
                        <span
                            class="text-[clamp(2.25rem,4vw,3rem)] font-black leading-[0.95] tracking-[-0.03em] tabular-nums text-base-content/18"
                        >
                            {{ filteredChars.length }}
                        </span>
                        <span class="text-xs text-base-content/45">{{ $t("char-list.totalSuffix") }}</span>
                    </div>
                    <div class="flex flex-col items-end gap-1.5">
                        <span
                            v-if="activeTab !== '全部'"
                            class="border border-primary/60 px-2 py-[0.15rem] text-[10px] tracking-[0.2em] text-primary"
                        >
                            {{ $t(activeTab) }}
                        </span>
                        <p class="text-[10px] tracking-wide text-base-content/40">
                            {{ $t("char-list.unreleasedHint") }}
                        </p>
                    </div>
                </footer>
            </div>
        </ScrollArea>
    </div>
</template>
