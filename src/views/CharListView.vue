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
    <div class="flex h-full flex-col overflow-hidden bg-base-300">
        <ScrollArea class="flex-1">
            <div class="mx-auto flex min-h-full w-full max-w-7xl flex-col px-4 md:px-6 lg:px-8">
                <!-- 检索带：下划线搜索 + 计数状态 + 分类方章 -->
                <section class="cl-rise border-b border-base-content/15 py-7" style="animation-delay: 0.06s">
                    <div class="flex flex-col gap-5">
                        <div class="flex flex-col gap-3 lg:flex-row lg:items-end lg:gap-10">
                            <div class="relative w-full flex-1">
                                <Icon icon="ri:search-line" class="absolute left-0 top-1/2 h-5 w-5 -translate-y-1/2 text-base-content/35" />
                                <input
                                    v-model="searchQuery"
                                    type="text"
                                    :placeholder="$t('char-list.searchPlaceholder')"
                                    class="cl-search-input w-full py-2 pl-8 pr-4 text-sm"
                                />
                            </div>
                            <p class="shrink-0 font-mono text-xs tracking-wide text-base-content/45">
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
                                    class="cl-tab"
                                    :class="{ 'cl-tab-active': activeTab === tab }"
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
                        class="cl-rise flex flex-col items-center justify-center py-24 text-base-content/50"
                        style="animation-delay: 0.12s"
                    >
                        <Icon icon="ri:emotion-sad-line" class="mb-5 h-14 w-14 opacity-40" />
                        <p class="text-base">{{ $t("char-list.empty") }}</p>
                    </div>

                    <div
                        v-else
                        class="grid grid-cols-[repeat(auto-fill,minmax(min(100%,170px),1fr))] gap-4 md:grid-cols-[repeat(auto-fill,minmax(min(100%,190px),1fr))]"
                    >
                        <div
                            v-for="(char, index) in filteredChars"
                            :key="`${char.id}-${activeTab}`"
                            class="cl-card cl-rise group"
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
                                <span class="cl-card-index">{{ String(index + 1).padStart(2, "0") }}</span>
                                <span v-if="elementNames[char.属性]" class="cl-badge">{{ elementNames[char.属性] }}</span>

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

                                <!-- 阵营 + 版本：等宽行 -->
                                <p
                                    v-if="char.阵营 || char.版本"
                                    class="flex items-center justify-between gap-2 font-mono text-[0.625rem] uppercase tracking-[0.12em] text-base-content/40"
                                >
                                    <span v-if="char.阵营" class="truncate">{{ $t(char.阵营) }}</span>
                                    <span v-if="char.版本" class="shrink-0">v{{ char.版本 }}</span>
                                </p>

                                <!-- 标签 -->
                                <div class="flex flex-wrap gap-1">
                                    <span
                                        v-for="tag in (char.标签 || []).slice(0, 2)"
                                        :key="tag"
                                        class="cl-tag opacity-70 transition-opacity duration-200 group-hover:opacity-100"
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
                    class="cl-rise flex flex-wrap items-end justify-between gap-x-8 gap-y-3 border-t border-base-content/15 py-8"
                    style="animation-delay: 0.3s"
                >
                    <div class="flex items-baseline gap-3">
                        <span class="cl-numeral">{{ filteredChars.length }}</span>
                        <span class="font-mono text-xs uppercase tracking-[0.3em] text-base-content/45">{{
                            $t("char-list.totalSuffix")
                        }}</span>
                    </div>
                    <div class="flex flex-col items-end gap-1.5">
                        <span v-if="activeTab !== '全部'" class="cl-tab-mini">{{ $t(activeTab) }}</span>
                        <p class="font-mono text-[10px] uppercase tracking-[0.2em] text-base-content/40">
                            {{ $t("char-list.unreleasedHint") }}
                        </p>
                    </div>
                </footer>
            </div>
        </ScrollArea>
    </div>
</template>

<style scoped>
/* 页面级一次性入场动画：轻量上浮淡入，仅播放一次，不做循环装饰 */
.cl-rise {
    animation: cl-rise 0.55s cubic-bezier(0.22, 1, 0.36, 1) both;
}

@keyframes cl-rise {
    from {
        opacity: 0;
        transform: translateY(14px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

/* 幽灵大数字：低对比粗体，用作统计主锚点 */
.cl-numeral {
    font-size: clamp(2.25rem, 4vw, 3rem);
    line-height: 0.95;
    font-weight: 900;
    letter-spacing: -0.03em;
    font-variant-numeric: tabular-nums;
    color: color-mix(in srgb, var(--color-base-content) 18%, transparent);
}

/* 卡片幽灵序号：头像左上角低对比粗体数字，悬停时转主题色 */
.cl-card-index {
    position: absolute;
    top: 0.5rem;
    left: 0.5rem;
    z-index: 10;
    padding: 0.15rem 0.35rem;
    font-size: 1.5rem;
    line-height: 1;
    font-weight: 900;
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
    color: color-mix(in srgb, var(--color-base-content) 60%, transparent);
    background: color-mix(in srgb, var(--color-base-100) 55%, transparent);
    backdrop-filter: blur(2px);
    transition: color 0.2s ease;
}

.cl-card:hover .cl-card-index {
    color: color-mix(in srgb, var(--color-primary) 75%, transparent);
}

/* 等宽徽记：头像右上角小号字距大写 */
.cl-badge {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    z-index: 10;
    padding: 0.2rem 0.45rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
    font-size: 0.5625rem;
    letter-spacing: 0.25em;
    text-transform: uppercase;
    color: color-mix(in srgb, var(--color-base-content) 55%, transparent);
    background: color-mix(in srgb, var(--color-base-100) 55%, transparent);
    backdrop-filter: blur(2px);
    transition: color 0.2s ease;
}

.cl-card:hover .cl-badge {
    color: var(--color-primary);
}

/* 下划线式搜索输入：聚焦时以主题色强调 */
.cl-search-input {
    border: 0 !important;
    border-bottom: 1px solid color-mix(in srgb, var(--color-base-content) 25%, transparent) !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
    outline: none !important;
    transition: border-color 0.2s ease;
}

.cl-search-input:focus {
    border-bottom-color: var(--color-primary) !important;
}

/* 分类方章：直角细边框按钮，选中时主题色填充 */
.cl-tab {
    flex-shrink: 0;
    cursor: pointer;
    border: 1px solid color-mix(in srgb, var(--color-base-content) 20%, transparent);
    padding: 0.375rem 0.875rem;
    font-size: 0.75rem;
    color: color-mix(in srgb, var(--color-base-content) 60%, transparent);
    transition:
        color 0.2s ease,
        border-color 0.2s ease,
        background-color 0.2s ease;
}

.cl-tab:hover {
    border-color: color-mix(in srgb, var(--color-primary) 60%, transparent);
    color: var(--color-primary);
}

.cl-tab:active {
    transform: scale(0.97);
}

.cl-tab-active,
.cl-tab-active:hover {
    border-color: var(--color-primary);
    background: var(--color-primary);
    color: var(--color-primary-content);
    font-weight: 600;
}

/* 角色卡片：直角平面卡，悬停时元素色边框 + 上浮 + 克制阴影 */
.cl-card {
    position: relative;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    cursor: pointer;
    border: 1px solid color-mix(in srgb, var(--color-base-content) 15%, transparent);
    background: var(--color-base-100);
    transition:
        transform 0.3s cubic-bezier(0.22, 1, 0.36, 1),
        box-shadow 0.3s ease,
        border-color 0.2s ease;
}

.cl-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 16px 40px -16px color-mix(in srgb, var(--color-base-content) 22%, transparent);
}

.cl-card:active {
    transform: scale(0.985);
}

/* 信息标签：直角细边小字 */
.cl-tag {
    padding: 0.1rem 0.4rem;
    font-size: 0.625rem;
    letter-spacing: 0.08em;
    border: 1px solid color-mix(in srgb, var(--color-base-content) 16%, transparent);
    color: color-mix(in srgb, var(--color-base-content) 55%, transparent);
}

/* 页脚当前分类方章 */
.cl-tab-mini {
    border: 1px solid color-mix(in srgb, var(--color-primary) 60%, transparent);
    padding: 0.15rem 0.5rem;
    font-size: 0.625rem;
    letter-spacing: 0.2em;
    color: var(--color-primary);
}

/* 减少动态偏好：关闭入场动画 */
@media (prefers-reduced-motion: reduce) {
    .cl-rise {
        animation: none;
    }
}
</style>
