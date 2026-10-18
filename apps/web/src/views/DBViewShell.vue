<script lang="ts" setup>
import { type Component, onBeforeUnmount, onMounted, ref, shallowRef } from "vue"

/**
 * 资料库入口页外壳：先上骨架屏，再异步载入真实页面。
 *
 * DBView 的模块图会拉入整套游戏数据，冷启动时路由要等它加载完才会切换视图，
 * 这段时间旧页面一直是冻结的。外壳自身的依赖极轻，能立刻绘制骨架屏，
 * 让「点击 → 有反馈」的间隔接近 0，真实页面在其后加载并原地淡入。
 */

/**
 * 骨架屏被绘制出来的判定阈值（ms）。
 * 低于该值说明模块已在缓存中（同会话内再次进入），此时无需淡入——
 * 真实页面自带入场动画，多一层淡入反而显得迟钝。
 */
const SKELETON_PAINT_THRESHOLD = 80

/** 真实页面组件；为 null 时展示骨架屏 */
const dbView = shallowRef<Component | null>(null)

/** 切换时是否需要淡入真实页面（仅冷启动路径需要） */
const needsReveal = ref(false)

/** 是否已卸载：模块加载回来时不再写入状态 */
let unmounted = false

onMounted(async () => {
    const startedAt = performance.now()

    // 两帧之后仍未就绪，说明骨架屏确实上过屏
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            if (!unmounted && performance.now() - startedAt > SKELETON_PAINT_THRESHOLD) {
                needsReveal.value = true
            }
        })
    })

    const module = await import("./DBView.vue")

    if (unmounted) {
        return
    }

    dbView.value = module.default
})

onBeforeUnmount(() => {
    unmounted = true
})
</script>

<template>
    <div class="relative h-full w-full">
        <div v-if="dbView" class="h-full w-full" :class="needsReveal ? 'db-reveal' : ''">
            <component :is="dbView" />
        </div>

        <!-- 骨架屏始终垫在真实内容之上淡出：事件穿透，加载期间照常可交互 -->
        <Transition name="db-skeleton">
            <DBViewSkeleton v-if="!dbView" class="pointer-events-none absolute inset-0" />
        </Transition>
    </div>
</template>

<style scoped>
/*
 * 真实页面淡入：只动 opacity，不做位移，因此与骨架屏逐像素对齐，
 * 交叉淡出期间不会出现「骨架在上一份、内容偏下一份」的错位感。
 */
.db-reveal {
    animation: db-reveal 0.26s ease backwards;
}

@keyframes db-reveal {
    from {
        opacity: 0;
    }
}

/* 由外壳接管淡入时，页面内部的一次性入场动画让位，避免两段透明度叠加 */
.db-reveal :deep(.db-rise) {
    animation: none;
}

.db-skeleton-leave-active {
    transition: opacity 0.24s ease;
}

.db-skeleton-leave-to {
    opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
    .db-reveal {
        animation: none;
    }

    .db-skeleton-leave-active {
        transition: none;
    }
}
</style>
