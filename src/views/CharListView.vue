<script setup lang="ts">
import { computed, ref } from "vue"
import { charData, LeveledChar } from "../data"
import { matchPinyin } from "../utils/pinyin-utils"

const tabs = ["全部", "输出", "同律武器", "武器伤害", "技能伤害", "辅助", "召唤物", "控制", "神智回复", "治疗", "最大生命", "防御", "护盾"]
const activeTab = ref(tabs[1])
const searchQuery = ref("")

// 元素颜色映射
const elementColors: Record<string, string> = {
    光: "from-yellow-400 to-yellow-600",
    暗: "from-gray-400 to-gray-700",
    水: "from-blue-400 to-blue-600",
    火: "from-red-400 to-red-600",
    雷: "from-purple-400 to-purple-600",
    风: "from-green-400 to-green-600",
}

// 元素边框颜色
const elementBorderColors: Record<string, string> = {
    光: "border-yellow-500",
    暗: "border-gray-500",
    水: "border-blue-500",
    火: "border-red-500",
    雷: "border-purple-500",
    风: "border-green-500",
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

// 卡片进入动画延迟
const getAnimationDelay = (index: number) => {
    return Math.min(index * 50, 500) // 最多延迟500ms
}
</script>

<template>
    <div class="flex flex-col h-full overflow-hidden bg-base-300">
        <!-- 顶部搜索和筛选区 -->
        <div class="flex-none bg-base-100 border-b border-base-200 shadow-sm p-4 space-y-3">
            <!-- 搜索框 -->
            <div class="relative">
                <input
                    v-model="searchQuery"
                    type="text"
                    :placeholder="$t('搜索角色名称、别名、阵营（支持拼音）...')"
                    class="input input-bordered w-full pl-10 pr-4 focus:input-primary transition-all"
                />
                <Icon icon="ri:search-line" class="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/50 w-5 h-5" />
            </div>

            <!-- 分类标签 -->
            <ScrollArea :vertical="false" horizontal>
                <div class="flex gap-2 pb-2">
                    <button
                        v-for="tab in tabs"
                        :key="tab"
                        class="btn btn-sm whitespace-nowrap transition-all duration-200"
                        :class="activeTab === tab ? 'btn-primary shadow-lg scale-105' : 'btn-ghost hover:bg-base-200'"
                        @click="activeTab = tab"
                    >
                        {{ $t(tab) }}
                    </button>
                </div>
            </ScrollArea>
        </div>

        <!-- 角色列表 -->
        <ScrollArea class="flex-1">
            <div v-if="filteredChars.length === 0" class="flex flex-col items-center justify-center h-full text-base-content/50 py-20">
                <Icon icon="ri:emotion-sad-line" class="w-16 h-16 mb-4" />
                <p class="text-lg">
                    {{ $t("没有找到匹配的角色") }}
                </p>
            </div>

            <div
                class="grid gap-4 p-4 grid-cols-[repeat(auto-fill,minmax(min(100%,160px),1fr))] sm:grid-cols-[repeat(auto-fill,minmax(min(100%,180px),1fr))] md:grid-cols-[repeat(auto-fill,minmax(min(100%,200px),1fr))]"
            >
                <div
                    v-for="(char, index) in filteredChars"
                    :key="`${char.id}-${activeTab}`"
                    class="group relative bg-base-100 rounded-xl overflow-hidden shadow-md hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 cursor-pointer border-2"
                    :class="[elementBorderColors[char.属性] || 'border-base-300']"
                    :style="{ animation: `fade-in-up 0.5s ease-out ${getAnimationDelay(index)}ms both` }"
                    @click="$router.push(`/char/${char.id}`)"
                >
                    <!-- 属性背景渐变 -->
                    <div
                        class="absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity duration-300 bg-linear-to-br"
                        :class="elementColors[char.属性] || 'from-gray-400 to-gray-600'"
                    />

                    <!-- 角色头像 -->
                    <div class="relative aspect-square overflow-hidden bg-base-200">
                        <ImageFallback
                            :src="LeveledChar.url(char.icon!)"
                            :alt="char.名称"
                            class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                            loading="lazy"
                        >
                            <Icon icon="ri:user-line" class="w-full h-full opacity-50" />
                        </ImageFallback>

                        <!-- 悬停时的遮罩 -->
                        <div class="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all duration-300" />
                    </div>

                    <!-- 角色信息 -->
                    <div class="p-3 space-y-2">
                        <!-- 名称 -->
                        <h3
                            class="inline-flex items-center gap-2 font-bold text-base truncate group-hover:text-primary transition-colors duration-200"
                        >
                            <img :src="LeveledChar.elementUrl(char.属性)" :alt="char.属性" class="h-8 w-4 object-cover" />
                            {{ $t(char.名称) }}
                        </h3>

                        <!-- 阵营 -->
                        <p v-if="char.阵营" class="text-xs text-base-content/60 truncate">
                            {{ $t(char.阵营) }}
                            {{ char.版本 }}
                        </p>

                        <!-- 标签 -->
                        <div class="flex flex-wrap gap-1">
                            <span
                                v-for="tag in (char.标签 || []).slice(0, 2)"
                                :key="tag"
                                class="badge badge-ghost badge-xs opacity-70 group-hover:opacity-100 transition-opacity"
                            >
                                {{ $t(tag) }}
                            </span>
                        </div>

                        <!-- 精通武器 -->
                        <div class="flex items-center gap-1 text-xs text-base-content/50">
                            <span>⚔️</span>
                            <span class="truncate">{{ char.精通?.map(item => $t(item)).join(" / ") }}</span>
                        </div>

                        <!-- 底部属性条 -->
                        <div class="grid grid-cols-2 gap-1 pt-2 border-t border-base-200">
                            <div class="flex items-center gap-1 text-xs text-base-content/70 group-hover:text-primary transition-colors">
                                <span>⚔️</span>
                                <span>{{ char.基础攻击 }}</span>
                            </div>
                            <div class="flex items-center gap-1 text-xs text-base-content/70 group-hover:text-success transition-colors">
                                <span>❤️</span>
                                <span>{{ char.基础生命 }}</span>
                            </div>
                        </div>
                    </div>

                    <!-- 悬停时的发光效果 -->
                    <div
                        class="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-300 ring-2 ring-primary/50"
                    />
                </div>
            </div>
        </ScrollArea>

        <!-- 底部统计信息 -->
        <div
            class="flex-none bg-base-100 border-t border-base-200 px-4 py-2 text-sm text-base-content/60 flex items-center justify-between"
        >
            <span
                >{{ $t("共") }} {{ filteredChars.length }}

                {{ $t("个角色") }}</span
            >
            <div class="text-xs text-base-content/60">未上线内容可能会发生改变</div>
            <span v-if="activeTab !== '全部'" class="badge badge-primary badge-sm">{{ activeTab }}</span>
        </div>
    </div>
</template>
