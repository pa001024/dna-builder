<script lang="ts" setup>
/**
 * 资料库入口页骨架屏：在真实页面（DBView）就绪前占位。
 *
 * 几何结构逐层复刻 DBView 的浏览态三段式——上段模块过滤条 + 模块网格、
 * 中段输入框、下段「本期新增」三组卡片；尺寸取自实际渲染测量值，
 * 因此骨架与真实内容同尺寸，切换时不产生布局位移。
 */

/** 模块网格的占位条目数：与 databaseItems 的入口数量保持一致 */
const MODULE_SKELETON_COUNT = 33

/** 过滤条上的占位 chip 宽度（px），长短交错以贴近真实文案宽度分布 */
const CHIP_WIDTHS = [46, 52, 60, 58, 72, 56, 64]

/**
 * “本期新增”分组的占位规格：跨列数与组内卡片数，与 wide 布局下
 * 角色 / 武器 / 魔之楔 的实际占格（2 / 3 / 3）一致。
 */
const LATEST_GROUPS = [
    { span: 2, cards: 2, cardColumns: 2 },
    { span: 3, cards: 3, cardColumns: 3 },
    { span: 3, cards: 3, cardColumns: 3 },
]
</script>

<template>
    <!-- 与 DBView 根容器同构：整屏不滚动，左栏在浏览态不存在 -->
    <div class="flex h-full min-h-0" aria-hidden="true">
        <div class="flex min-w-0 flex-1 flex-col">
            <!-- 上段：模块分类过滤条 + 模块卡片网格（内容贴住输入框，靠下显示） -->
            <section class="flex min-h-0 flex-1 flex-col">
                <div class="db-skeleton-scroll min-h-0 flex-1 overflow-y-auto">
                    <div class="flex min-h-full flex-col justify-end">
                        <div class="mx-auto w-full max-w-7xl px-4 pt-6 pb-4 md:px-6 lg:px-8">
                            <div class="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2">
                                <span class="db-skeleton-bar h-3 w-16 shrink-0" />

                                <div class="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                                    <span
                                        v-for="(width, index) in CHIP_WIDTHS"
                                        :key="index"
                                        class="db-skeleton-bar h-[30px] shrink-0"
                                        :style="{ width: `${width}px` }"
                                    />
                                </div>

                                <span class="db-skeleton-bar h-3 w-12 shrink-0" />
                            </div>

                            <ul class="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-2">
                                <li
                                    v-for="index in MODULE_SKELETON_COUNT"
                                    :key="index"
                                    class="flex items-center gap-2.5 border border-base-content/12 px-3 py-2.5"
                                >
                                    <span class="db-skeleton-bar size-4.5 shrink-0" />
                                    <!-- 撑到真实条目 text-sm 的行盒高度，行高才不会比真实列表少 2px -->
                                    <span class="flex h-5 min-w-0 flex-1 items-center">
                                        <span class="db-skeleton-bar h-3.5 w-full" />
                                    </span>
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>
            </section>

            <!-- 中段：输入框（结构复刻 DBAskBox：文本域区 + hairline 分隔的工具行） -->
            <section class="shrink-0 px-4 py-5 md:px-6 lg:px-8">
                <div class="mx-auto w-full max-w-7xl">
                    <div class="border border-base-content/15">
                        <div class="flex h-13 items-center px-4">
                            <span class="db-skeleton-bar h-4 w-[min(24rem,60%)]" />
                        </div>

                        <div class="flex items-center justify-between gap-3 border-t border-base-content/10 px-3 py-2">
                            <span class="db-skeleton-bar h-2.5 w-[min(18rem,45%)]" />
                            <span class="db-skeleton-bar size-8 shrink-0" />
                        </div>
                    </div>
                </div>
            </section>

            <!-- 下段：本期新增（宽屏 8 格单行，窄屏各模块独占一行） -->
            <section class="flex min-h-0 flex-1 flex-col">
                <div class="db-skeleton-scroll min-h-0 flex-1 overflow-y-auto">
                    <div class="flex min-h-full flex-col justify-end">
                        <div class="mx-auto w-full max-w-7xl px-4 pb-5 pt-4 md:px-6 lg:px-8">
                            <div class="grid grid-cols-1 gap-x-6 gap-y-5 md:grid-cols-8">
                                <div
                                    v-for="(group, index) in LATEST_GROUPS"
                                    :key="index"
                                    class="col-span-1"
                                    :class="group.span === 2 ? 'md:col-span-2' : 'md:col-span-3'"
                                >
                                    <!-- 组头行：高度对齐真实标题行的行盒（17px），hairline 与两侧文字同轴 -->
                                    <div class="flex min-h-[17px] flex-wrap items-center gap-x-6 gap-y-2">
                                        <div class="flex items-baseline gap-3">
                                            <span class="db-skeleton-bar h-2.5 w-12" />
                                            <span class="db-skeleton-bar h-2.5 w-14" />
                                        </div>

                                        <span class="h-px min-w-8 flex-1 bg-base-content/10" aria-hidden="true" />
                                    </div>

                                    <ul
                                        class="mt-3 grid grid-cols-4 gap-2"
                                        :class="group.cardColumns === 2 ? 'md:grid-cols-2' : 'md:grid-cols-3'"
                                    >
                                        <li
                                            v-for="card in group.cards"
                                            :key="card"
                                            class="flex flex-col overflow-hidden rounded-xs border border-base-content/10 bg-base-100/60"
                                        >
                                            <span class="db-skeleton-bar aspect-4/3 w-full" />
                                            <!-- 内容区行盒：标题 h-5 + 副信息 h-3.75，与真实卡片逐行对齐 -->
                                            <span class="flex flex-1 flex-col gap-1 p-2.5">
                                                <span class="flex h-5 items-center">
                                                    <span class="db-skeleton-bar h-3.5 w-3/4" />
                                                </span>
                                                <span class="flex h-3.75 items-center">
                                                    <span class="db-skeleton-bar h-2.5 w-1/2" />
                                                </span>
                                            </span>
                                        </li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    </div>
</template>

<style scoped>
/* 段内滚动容器：与 DBView 一致用细滚动条，隐藏后不影响骨架观感 */
.db-skeleton-scroll {
    scrollbar-width: thin;
    scrollbar-color: color-mix(in srgb, var(--color-base-content) 25%, transparent) transparent;
}

.db-skeleton-scroll::-webkit-scrollbar {
    width: 8px;
}

.db-skeleton-scroll::-webkit-scrollbar-thumb {
    background: color-mix(in srgb, var(--color-base-content) 22%, transparent);
}

.db-skeleton-scroll::-webkit-scrollbar-track {
    background: transparent;
}
</style>
