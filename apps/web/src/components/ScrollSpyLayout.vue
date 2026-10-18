<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue"
import type { ScrollSpyNavItem } from "@/components/ScrollSpyNav.vue"
import { useScrollSpy } from "@/composables/useScrollSpy"

const props = withDefaults(
    defineProps<{
        /** 显式模式：调用方直接给出目录项（同 Setting.vue 原用法）；与 auto 互斥，优先使用 */
        items?: ScrollSpyNavItem[]
        /** 自动模式：从内容区里的 <section> 自动发现目录（标题取 h2 / kicker / data-scroll-title） */
        auto?: boolean
        /** 目录顶部的大写英文小标，如 "SETTINGS" / "DATABASE"；缺省时不渲染头部区 */
        navKicker?: string
        /** 小标下的说明文字；缺省时不渲染 */
        navDescription?: string
    }>(),
    {
        items: undefined,
        auto: false,
        navKicker: undefined,
        navDescription: undefined,
    }
)

/**
 * 自动发现的约定（仅 auto 模式）：
 * - 内容区内的每个 <section> 默认成为一个目录项，标题按 data-scroll-title > h2 > span.uppercase(kicker) 依次取值；
 * - 取不到标题的 section（如纯占位提示）自动跳过，不进目录；
 * - v-for 批量生成的重复 section（如多难度奖励组）请自行加 data-scroll-nav-ignore 退出；
 * - 无 SectionHeader 的 section（如 AniTabs 页签组）请手写 data-scroll-section + data-scroll-title 注解。
 */
const contentRef = ref<HTMLElement | null>(null)
const { activeKey, scrollToKey, refresh } = useScrollSpy(contentRef)

/** 自动模式下发现到的目录项 */
const discoveredItems = ref<ScrollSpyNavItem[]>([])
/** 生效的目录：显式优先，缺省时用自动发现的结果 */
const resolvedItems = computed(() => props.items ?? (props.auto ? discoveredItems.value : []))

/** 合帧用的 rAF 句柄（自动发现的防抖） */
let discoverFrame: number | null = null
/** 内容变化观察器：异步补齐 / 条件渲染的区块出现后重建目录 */
let contentObserver: MutationObserver | null = null

/**
 * 读取单个区块的目录标题。
 * @param section 内容区内的 section 元素
 * @returns 目录标题，取不到时为空串
 */
function sectionTitleOf(section: HTMLElement): string {
    // 手写注解优先：无 SectionHeader 的区块靠它进目录
    const explicit = section.dataset.scrollTitle?.trim()
    if (explicit) {
        return explicit
    }
    // SectionHeader 有中文标题时渲染 h2
    const heading = section.querySelector("h2")?.textContent?.trim()
    if (heading) {
        return heading
    }
    // 只有 kicker 的区块（如 LEVEL / DESCRIPTION）用英文小标兜底
    return section.querySelector("span.uppercase")?.textContent?.trim() ?? ""
}

/**
 * 由标题生成稳定的区块键名（中文标题保留原字，仅把分隔符归一化）。
 * @param title 目录标题
 * @param index 兜底序号（标题为空或归一化后为空时用）
 * @returns 键名基底（调用方负责重名加后缀）
 */
function slugifyTitle(title: string, index: number): string {
    const slug = title
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 24)
    return slug || `section-${index}`
}

/**
 * 扫描内容区重建目录：已有 data-scroll-section 的沿用，无标题的跳过，
 * 其余按标题分配键名并写回 data-scroll-section（供 useScrollSpy 定位）。
 */
function discoverSections() {
    const root = contentRef.value
    if (!root) {
        return
    }
    //  opt-out 的子树（如 v-for 重复组）整块跳过
    const sections = Array.from(root.querySelectorAll<HTMLElement>("section")).filter(
        section => !section.closest("[data-scroll-nav-ignore]")
    )
    /** 已占用的键名计数：先占先得，重名者加 -2 / -3 后缀 */
    const usedKeys = new Map<string, number>()
    const next: ScrollSpyNavItem[] = []
    sections.forEach((section, index) => {
        const title = sectionTitleOf(section)
        const existingKey = section.dataset.scrollSection?.trim() ?? ""
        if (existingKey) {
            usedKeys.set(existingKey, (usedKeys.get(existingKey) ?? 0) + 1)
            next.push({ key: existingKey, title: title || existingKey })
            return
        }
        // 无标题的占位区块不进目录
        if (!title) {
            return
        }
        const base = slugifyTitle(title, index)
        const count = usedKeys.get(base) ?? 0
        usedKeys.set(base, count + 1)
        const key = count === 0 ? base : `${base}-${count + 1}`
        section.dataset.scrollSection = key
        next.push({ key, title })
    })
    // 无变化时不赋值，避免目录闪烁与多余重渲染
    const signature = next.map(item => `${item.key}|${item.title}`).join("\n")
    const prevSignature = discoveredItems.value.map(item => `${item.key}|${item.title}`).join("\n")
    if (signature !== prevSignature) {
        discoveredItems.value = next
    }
    refresh()
}

/**
 * 把自动发现合到下一帧：MutationObserver 一次批量变更多次回调，
 * 且每帧只扫一次 DOM 即可。
 */
function scheduleDiscover() {
    if (discoverFrame !== null) {
        return
    }
    discoverFrame = window.requestAnimationFrame(() => {
        discoverFrame = null
        discoverSections()
    })
}

onMounted(() => {
    // 首扫建目录（含高亮校正）；之后靠观察器跟进异步 / 条件区块
    discoverSections()
    const root = contentRef.value
    if (root) {
        // 只观察结构与文本：键名写回走 attribute，不在观察集内，不会自循环
        contentObserver = new MutationObserver(scheduleDiscover)
        contentObserver.observe(root, { childList: true, subtree: true, characterData: true })
    }
})

onBeforeUnmount(() => {
    contentObserver?.disconnect()
    contentObserver = null
    if (discoverFrame !== null) {
        window.cancelAnimationFrame(discoverFrame)
        discoverFrame = null
    }
})

/**
 * 对外暴露：contentEl 供调用方做程序化滚动（如 Setting 的重置卡片定位），
 * activeKey / scrollToKey / refresh 与 useScrollSpy 同义。
 */
defineExpose({ contentEl: contentRef, activeKey, scrollToKey, refresh })
</script>

<template>
    <!-- 左右分栏：窄屏时目录收成内容区上方的横向标签条，md 起移到左侧；两栏各自独立滚动 -->
    <div class="h-full min-h-0 w-full flex flex-col overflow-hidden md:flex-row">
        <ScrollSpyNav
            :items="resolvedItems"
            :active-key="activeKey"
            :kicker="navKicker"
            :description="navDescription"
            @select="scrollToKey"
        />

        <div ref="contentRef" class="min-h-0 min-w-0 flex-1 overflow-y-auto">
            <slot />
        </div>
    </div>
</template>
