<script setup lang="ts">
import { useWindowSize } from "@vueuse/core"
import { gsap } from "gsap"
import { t } from "i18next"
import { computed, nextTick, onMounted, ref } from "vue"
import type { IconTypes } from "@/components/Icon.vue"

const { width } = useWindowSize()

// 帮助内容类型定义
interface HelpStep {
    titleKey: string
    descKey: string
    badge?: "primary" | "secondary" | "accent" | "success"
}

interface HelpSection {
    id: string
    titleKey: string
    descKey: string
    icon: IconTypes
    color: string
    steps?: HelpStep[]
    features?: string[]
    controls?: string[]
    categories?: {
        titleKey: string
        features: string[]
    }[]
}

// 帮助内容配置（数据驱动）
const helpSections = ref<HelpSection[]>([
    {
        id: "char-build",
        titleKey: "char-build.title",
        descKey: "char-build.desc",
        icon: "ri:hammer-line",
        color: "primary",
        steps: [
            { titleKey: "help.step1", descKey: "help.charBuildStep1", badge: "primary" },
            { titleKey: "help.step2", descKey: "help.charBuildStep2", badge: "secondary" },
            { titleKey: "help.step3", descKey: "help.charBuildStep3", badge: "accent" },
            { titleKey: "help.step4", descKey: "help.charBuildStep4", badge: "success" },
        ],
        features: [
            "help.charBuildFeature1",
            "help.charBuildFeature2",
            "help.charBuildFeature3",
            "help.charBuildFeature4",
            "help.charBuildFeature5",
        ],
    },
    {
        id: "inventory",
        titleKey: "inventory.title",
        descKey: "inventory.desc",
        icon: "ri:box-1-line",
        color: "secondary",
        steps: [
            { titleKey: "help.step1", descKey: "help.inventoryStep1", badge: "primary" },
            { titleKey: "help.step2", descKey: "help.inventoryStep2", badge: "primary" },
            { titleKey: "help.step3", descKey: "help.inventoryStep3", badge: "primary" },
        ],
    },
    {
        id: "timeline",
        titleKey: "timeline.title",
        descKey: "timeline.desc",
        icon: "ri:timeline-view",
        color: "accent",
        steps: [
            { titleKey: "help.step1", descKey: "help.timelineStep1", badge: "primary" },
            { titleKey: "help.step2", descKey: "help.timelineStep2", badge: "primary" },
            { titleKey: "help.step3", descKey: "help.timelineStep3", badge: "primary" },
        ],
    },
    {
        id: "game-launcher",
        titleKey: "game-launcher.title",
        descKey: "game-launcher.desc",
        icon: "ri:rocket-2-line",
        color: "warning",
        steps: [
            { titleKey: "help.step1", descKey: "help.gameLauncherStep1", badge: "primary" },
            { titleKey: "help.step2", descKey: "help.gameLauncherStep2", badge: "primary" },
            { titleKey: "help.step3", descKey: "help.gameLauncherStep3", badge: "primary" },
            { titleKey: "help.step4", descKey: "help.gameLauncherStep4", badge: "primary" },
        ],
    },
    {
        id: "achievement",
        titleKey: "achievement.title",
        descKey: "achievement.desc",
        icon: "ri:trophy-line",
        color: "success",
        features: ["help.achievementFeature1", "help.achievementFeature2", "help.achievementFeature3", "help.achievementFeature4"],
    },
    {
        id: "setting",
        titleKey: "setting.title",
        descKey: "setting.desc",
        icon: "ri:settings-3-line",
        color: "neutral",
        categories: [
            {
                titleKey: "setting.appearance",
                features: [
                    "help.settingFeature1",
                    "help.settingFeature2",
                    "help.settingFeature3",
                    "help.settingFeature4",
                    "help.settingFeature5",
                ],
            },
            {
                titleKey: "setting.other",
                features: ["help.settingFeature6", "help.settingFeature7", "help.settingFeature8"],
            },
        ],
    },
])

// 轮播状态
const currentIndex = ref(0)
const carouselRef = ref<HTMLElement | null>(null)
const isAnimating = ref(false)

// 判断是否为移动端
const isMobile = computed(() => width.value < 1024)

// 当前卡片样式（用于透视效果）
const currentCardStyle = computed(() => {
    if (isMobile.value) return {}
    return {
        transform: "translateX(-50%) scale(1)",
        opacity: 1,
        zIndex: 30,
        left: "50%",
    }
})

// 前一张卡片样式
const prevCardStyle = (index: number) => {
    if (isMobile.value) return { display: "none" }
    const distance = currentIndex.value - index
    if (distance < 1 || distance > 2) return { display: "none" }
    const scale = 0.9 - (distance - 1) * 0.05
    const x = 50 - (distance - 1) * 35
    const opacity = distance > 1 ? 0 : 1
    return {
        transform: `translateX(-${x}%) scale(${scale})`,
        opacity,
        zIndex: 20 - (distance - 1),
        pointerEvents: "none" as const,
        left: "0%",
    }
}

// 后一张卡片样式（仅显示一张）
const nextCardStyle = (index: number) => {
    if (isMobile.value) return { display: "none" }
    const distance = index - currentIndex.value
    if (distance < 1 || distance > 2) return { display: "none" }
    const scale = 0.9 - (distance - 1) * 0.05
    const x = -50 - (distance - 1) * 35
    const opacity = distance > 0 ? 0 : 1
    return {
        transform: `translateX(-${x}%) scale(${scale})`,
        opacity,
        zIndex: 25 - (distance - 1),
        pointerEvents: "none" as const,
        left: "100%",
    }
}

// 导航到指定卡片
const goToSlide = async (index: number) => {
    if (index === currentIndex.value || isAnimating.value) return
    if (index < 0 || index >= helpSections.value.length) return

    isAnimating.value = true

    await gsap.to(carouselRef.value, {
        x: `${-index * 100}%`,
        duration: 0.6,
        ease: "power2.out",
    })

    currentIndex.value = index
    isAnimating.value = false
}

// 下一张
const nextSlide = () => goToSlide(currentIndex.value + 1)

// 上一张
const prevSlide = () => goToSlide(currentIndex.value - 1)

// 键盘导航
const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === "ArrowLeft") prevSlide()
    if (e.key === "ArrowRight") nextSlide()
}

// 触摸滑动支持
let touchStartX = 0
const handleTouchStart = (e: TouchEvent) => {
    touchStartX = e.touches[0].clientX
}

const handleTouchEnd = (e: TouchEvent) => {
    const touchEndX = e.changedTouches[0].clientX
    const diff = touchStartX - touchEndX
    const threshold = 50

    if (diff > threshold) nextSlide()
    if (diff < -threshold) prevSlide()
}

// 入场动画
onMounted(() => {
    window.addEventListener("keydown", handleKeydown)

    nextTick(() => {
        // 动画卡片元素
        const cards = document.querySelectorAll(".carousel-card")
        if (cards.length > 0) {
            gsap.from(cards, {
                y: 50,
                opacity: 0,
                duration: 0.6,
                stagger: 0.1,
                ease: "power2.out",
                delay: 0.2,
            })
        }
    })
})

// 获取徽章颜色类
const getBadgeClass = (badge?: string) => {
    if (!badge) return "badge-neutral"
    return `badge-${badge}`
}
</script>

<template>
    <div class="h-full bg-linear-to-br from-base-200 via-base-100 to-base-200 overflow-hidden min-h-0 flex flex-col">
        <!-- 轮播容器 -->
        <div class="flex-1 relative w-full max-w-7xl mx-auto px-4 py-8" :class="{ 'overflow-y-auto': isMobile }">
            <!-- 导航箭头（桌面） -->
            <button
                v-if="!isMobile"
                class="absolute left-8 top-1/2 -translate-y-1/2 z-200 btn btn-circle btn-lg btn-ghost btn-primary shadow-lg hover:scale-110 transition-transform -translate-x-1/2"
                :disabled="currentIndex === 0"
                @click="prevSlide"
            >
                <Icon icon="ri:arrow-left-line" class="w-6 h-6" />
            </button>
            <button
                v-if="!isMobile"
                class="absolute right-8 top-1/2 -translate-y-1/2 z-200 btn btn-circle btn-lg btn-ghost btn-primary shadow-lg hover:scale-110 transition-transform translate-x-1/2"
                :disabled="currentIndex === helpSections.length - 1"
                @click="nextSlide"
            >
                <Icon icon="ri:arrow-right-line" class="w-6 h-6" />
            </button>

            <!-- 卡片容器 -->
            <div class="relative overflow-hidden py-8" @touchstart="handleTouchStart" @touchend="handleTouchEnd">
                <!-- 移动端：单卡片轮播 -->
                <div
                    v-if="isMobile"
                    ref="carouselRef"
                    class="flex transition-transform duration-500 ease-out"
                    :style="{ transform: `translateX(-${currentIndex * 100}%)` }"
                >
                    <div v-for="section in helpSections" :key="section.id" class="carousel-card shrink-0 w-full px-2">
                        <div class="bg-base-100 rounded-2xl shadow-2xl overflow-hidden border border-base-300">
                            <!-- 卡片头部 -->
                            <div class="bg-linear-to-r from-primary/10 to-primary/5 p-6 border-b border-base-200">
                                <div class="flex items-center gap-4">
                                    <div
                                        class="w-16 h-16 rounded-xl bg-linear-to-br from-primary to-primary/70 flex items-center justify-center shadow-lg"
                                    >
                                        <Icon :icon="section.icon" class="w-8 h-8 text-primary-content" />
                                    </div>
                                    <div>
                                        <h2 class="text-2xl font-bold text-base-content">
                                            {{ t(section.titleKey) }}
                                        </h2>
                                        <p class="text-sm opacity-70 mt-1">
                                            {{ t(section.descKey) }}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <!-- 卡片内容 -->
                            <div class="p-6 space-y-6">
                                <!-- 流程步骤 -->
                                <div v-if="section.steps" class="space-y-4">
                                    <h3 class="text-lg font-bold flex items-center gap-2">
                                        <Icon icon="ri:more-line" class="w-5 h-5 text-primary" />
                                        {{ t("help.workflow") }}
                                    </h3>
                                    <div class="space-y-3">
                                        <div
                                            v-for="(step, idx) in section.steps"
                                            :key="idx"
                                            class="flex items-start gap-3 p-4 bg-base-200/50 rounded-xl hover:bg-base-200 transition-colors"
                                        >
                                            <div :class="['badge', 'badge-lg', getBadgeClass(step.badge)]">
                                                {{ idx + 1 }}
                                            </div>
                                            <div class="flex-1">
                                                <h4 class="font-bold text-base-content">
                                                    {{ t(step.titleKey) }}
                                                </h4>
                                                <p class="text-sm opacity-70 mt-1">
                                                    {{ t(step.descKey) }}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <!-- 功能特性 -->
                                <div v-if="section.features" class="space-y-4">
                                    <h3 class="text-lg font-bold flex items-center gap-2">
                                        <Icon icon="ri:star-line" class="w-5 h-5 text-primary" />
                                        {{ t("help.features") }}
                                    </h3>
                                    <ul class="space-y-2">
                                        <li
                                            v-for="(feature, idx) in section.features"
                                            :key="idx"
                                            class="flex items-start gap-2 p-3 bg-base-200/50 rounded-lg hover:bg-base-200 transition-colors"
                                        >
                                            <Icon icon="ri:checkbox-circle-fill" class="w-5 h-5 text-success shrink-0 mt-0.5" />
                                            <span class="text-sm">{{ t(feature) }}</span>
                                        </li>
                                    </ul>
                                </div>

                                <!-- 操作控制 -->
                                <div v-if="section.controls" class="space-y-4">
                                    <h3 class="text-lg font-bold flex items-center gap-2">
                                        <Icon icon="ri:gamepad-line" class="w-5 h-5 text-primary" />
                                        {{ t("help.controls") }}
                                    </h3>
                                    <ul class="space-y-2">
                                        <li
                                            v-for="(control, idx) in section.controls"
                                            :key="idx"
                                            class="flex items-start gap-2 p-3 bg-base-200/50 rounded-lg hover:bg-base-200 transition-colors"
                                        >
                                            <Icon icon="ri:checkbox-circle-fill" class="w-5 h-5 text-info shrink-0 mt-0.5" />
                                            <span class="text-sm">{{ t(control) }}</span>
                                        </li>
                                    </ul>
                                </div>

                                <!-- 分类功能（如设置） -->
                                <div v-if="section.categories" class="space-y-4">
                                    <div v-for="(category, catIdx) in section.categories" :key="catIdx" class="space-y-3">
                                        <h3 class="text-lg font-bold flex items-center gap-2">
                                            <Icon icon="ri:settings-3-line" class="w-5 h-5 text-primary" />
                                            {{ t(category.titleKey) }}
                                        </h3>
                                        <ul class="space-y-2">
                                            <li
                                                v-for="(feature, featIdx) in category.features"
                                                :key="featIdx"
                                                class="flex items-start gap-2 p-3 bg-base-200/50 rounded-lg hover:bg-base-200 transition-colors"
                                            >
                                                <Icon icon="ri:checkbox-circle-fill" class="w-5 h-5 text-success shrink-0 mt-0.5" />
                                                <span class="text-sm">{{ t(feature) }}</span>
                                            </li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 桌面端：3D 透视效果 -->
                <div v-else class="relative h-150 flex items-center justify-center overflow-hidden">
                    <div
                        v-for="(section, index) in helpSections"
                        :key="section.id"
                        class="carousel-card absolute inset-0 flex items-center justify-center transition-all duration-500 ease-out"
                        :style="
                            index === currentIndex ? currentCardStyle : index < currentIndex ? prevCardStyle(index) : nextCardStyle(index)
                        "
                    >
                        <div
                            class="bg-base-100 rounded-2xl shadow-2xl overflow-hidden border border-base-300 w-full max-w-3xl max-h-125 flex flex-col"
                        >
                            <!-- 卡片头部 -->
                            <div :class="['bg-linear-to-r p-6 border-b border-base-200', `from-${section.color}/10 to-${section.color}/5`]">
                                <div class="flex items-center gap-4">
                                    <div
                                        :class="[
                                            'w-16 h-16 rounded-xl bg-linear-to-br flex items-center justify-center shadow-lg',
                                            `from-${section.color} to-${section.color}/70`,
                                        ]"
                                    >
                                        <Icon :icon="section.icon" class="w-8 h-8 text-white" />
                                    </div>
                                    <div>
                                        <h2 class="text-2xl font-bold text-base-content">
                                            {{ t(section.titleKey) }}
                                        </h2>
                                        <p class="text-sm opacity-70 mt-1">
                                            {{ t(section.descKey) }}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <!-- 卡片内容 -->
                            <div class="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                                <!-- 流程步骤 -->
                                <div v-if="section.steps" class="space-y-4">
                                    <h3 class="text-lg font-bold flex items-center gap-2">
                                        <Icon icon="ri:more-line" class="w-5 h-5" :class="`text-${section.color}`" />
                                        {{ t("help.workflow") }}
                                    </h3>
                                    <div class="space-y-3">
                                        <div
                                            v-for="(step, idx) in section.steps"
                                            :key="idx"
                                            class="flex items-start gap-3 p-4 bg-base-200/50 rounded-xl hover:bg-base-200 transition-colors"
                                        >
                                            <div :class="['badge', 'badge-lg', getBadgeClass(step.badge)]">
                                                {{ idx + 1 }}
                                            </div>
                                            <div class="flex-1">
                                                <h4 class="font-bold text-base-content">
                                                    {{ t(step.titleKey) }}
                                                </h4>
                                                <p class="text-sm opacity-70 mt-1">
                                                    {{ t(step.descKey) }}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <!-- 功能特性 -->
                                <div v-if="section.features" class="space-y-4">
                                    <h3 class="text-lg font-bold flex items-center gap-2">
                                        <Icon icon="ri:star-line" class="w-5 h-5" :class="`text-${section.color}`" />
                                        {{ t("help.features") }}
                                    </h3>
                                    <ul class="space-y-2">
                                        <li
                                            v-for="(feature, idx) in section.features"
                                            :key="idx"
                                            class="flex items-start gap-2 p-3 bg-base-200/50 rounded-lg hover:bg-base-200 transition-colors"
                                        >
                                            <Icon icon="ri:checkbox-circle-fill" class="w-5 h-5 text-success shrink-0 mt-0.5" />
                                            <span class="text-sm">{{ t(feature) }}</span>
                                        </li>
                                    </ul>
                                </div>

                                <!-- 操作控制 -->
                                <div v-if="section.controls" class="space-y-4">
                                    <h3 class="text-lg font-bold flex items-center gap-2">
                                        <Icon icon="ri:gamepad-line" class="w-5 h-5" :class="`text-${section.color}`" />
                                        {{ t("help.controls") }}
                                    </h3>
                                    <ul class="space-y-2">
                                        <li
                                            v-for="(control, idx) in section.controls"
                                            :key="idx"
                                            class="flex items-start gap-2 p-3 bg-base-200/50 rounded-lg hover:bg-base-200 transition-colors"
                                        >
                                            <Icon icon="ri:checkbox-circle-fill" class="w-5 h-5 text-info shrink-0 mt-0.5" />
                                            <span class="text-sm">{{ t(control) }}</span>
                                        </li>
                                    </ul>
                                </div>

                                <!-- 分类功能 -->
                                <div v-if="section.categories" class="space-y-4">
                                    <div v-for="(category, catIdx) in section.categories" :key="catIdx" class="space-y-3">
                                        <h3 class="text-lg font-bold flex items-center gap-2">
                                            <Icon icon="ri:settings-3-line" class="w-5 h-5" :class="`text-${section.color}`" />
                                            {{ t(category.titleKey) }}
                                        </h3>
                                        <ul class="space-y-2">
                                            <li
                                                v-for="(feature, featIdx) in category.features"
                                                :key="featIdx"
                                                class="flex items-start gap-2 p-3 bg-base-200/50 rounded-lg hover:bg-base-200 transition-colors"
                                            >
                                                <Icon icon="ri:checkbox-circle-fill" class="w-5 h-5 text-success shrink-0 mt-0.5" />
                                                <span class="text-sm">{{ t(feature) }}</span>
                                            </li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 导航指示点 -->
            <div class="flex items-center justify-center gap-2 mt-8">
                <button
                    v-for="(section, index) in helpSections"
                    :key="index"
                    :class="[
                        'w-3 h-3 rounded-full transition-all duration-300',
                        index === currentIndex ? `w-8 bg-${section.color} scale-110` : 'bg-base-300 hover:bg-base-400',
                    ]"
                    @click="goToSlide(index)"
                />
            </div>

            <!-- 滑动提示（移动端） -->
            <div v-if="isMobile" class="text-center mt-4 opacity-60 text-sm">
                <Icon icon="ri:drag-move-line" class="w-5 h-5 inline-block mr-1" />
                {{ t("help.swipeHint") || "滑动切换" }}
            </div>
        </div>

        <!-- 页脚 -->
        <div class="text-center py-6 opacity-50 text-sm">
            <p>DNA Builder</p>
        </div>
    </div>
</template>
