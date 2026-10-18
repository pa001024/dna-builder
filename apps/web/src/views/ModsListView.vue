<template>
    <div class="h-full flex flex-col min-h-0">
        <!-- 页头（首页设计语言：纸面 + 主色强调线 + 引导网格 + 斜切楔形） -->
        <header class="relative flex-none overflow-hidden border-b-2 border-primary bg-base-100">
            <!-- 引导线网格（装饰性，随主题明暗） -->
            <div
                class="pointer-events-none absolute inset-0"
                style="
                    background-image:
                        linear-gradient(to right, color-mix(in oklab, var(--color-base-content) 7%, transparent) 1px, transparent 1px),
                        linear-gradient(to bottom, color-mix(in oklab, var(--color-base-content) 7%, transparent) 1px, transparent 1px);
                    background-size: 52px 52px;
                    mask-image: linear-gradient(to bottom, black, transparent 85%);
                "
                aria-hidden="true"
            />
            <!-- 右上角斜切楔形 -->
            <span
                class="pointer-events-none absolute top-0 right-0 h-12 w-12 bg-primary [clip-path:polygon(100%_0,100%_100%,0_0)]"
                aria-hidden="true"
            />
            <div class="relative mx-auto max-w-6xl px-5 pt-6 pb-5">
                <p class="mb-3 inline-flex items-center gap-2.5 text-[11px] font-semibold tracking-[0.32em] text-primary uppercase">
                    <span class="h-px w-7 bg-primary" aria-hidden="true" />
                    MOD SHARE
                </p>
                <h1 class="font-orbitron text-3xl font-bold leading-none tracking-tight text-base-content sm:text-4xl">
                    {{ $t("mods-list.title") }}
                </h1>
            </div>
        </header>
        <GameModStore route-mode class="flex-1 min-h-0" />
    </div>
</template>
