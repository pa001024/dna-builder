<script lang="tsx" setup>
import { env } from "../env"
import pg from "../../package.json"
</script>

<template>
    <div class="h-full flex flex-col">
        <ScrollArea class="h-full overflow-hidden">
            <div class="hero bg-base-200 min-h-72 relative bg-linear-to-br from-purple-500/30 via-gray-500/30 to-blue-500/30">
                <!-- 网格线 -->
                <div class="absolute inset-0 opacity-20">
                    <div
                        class="absolute inset-0"
                        style="
                            background-image:
                                linear-gradient(rgba(6, 182, 212, 0.1) 1px, transparent 1px),
                                linear-gradient(90deg, rgba(6, 182, 212, 0.1) 1px, transparent 1px);
                            background-size: 50px 50px;
                        "
                    ></div>
                </div>
                <!-- 闪烁星星 -->
                <div class="absolute inset-0 overflow-hidden">
                    <div
                        class="absolute aspect-square bg-cyan-400/50 rounded-full animate-ping"
                        v-for="_ in 20"
                        :style="{
                            width: `${0.1 + Math.random() * 0.2}em`,
                            left: `${Math.random() * 100}%`,
                            top: `${Math.random() * 100}%`,
                            animationDelay: `${Math.random() * 3}s`,
                            animationDuration: `${1 + Math.random() * 2}s`,
                        }"
                    ></div>
                </div>
                <div class="hero-content text-center container">
                    <div>
                        <h1 class="text-5xl font-bold">DNA Builder</h1>
                        <div class="py-4">
                            当前版本:
                            <a class="link" :href="`https://github.com/pa001024/dna-builder/releases/tag/v${pg.version}`" target="_blank">
                                {{ pg.version }}
                            </a>
                        </div>

                        <div class="inline-flex gap-4">
                            <a
                                v-if="!env.isApp"
                                href="https://github.com/pa001024/dna-builder/releases/latest"
                                target="_blank"
                                class="btn btn-primary"
                            >
                                <Icon icon="ri:windows-fill" class="w-6 h-6" />
                                {{ $t("home.download") }}
                            </a>
                            <a href="https://github.com/pa001024/dna-builder" target="_blank" class="btn btn-primary">
                                <Icon icon="ri:github-fill" class="w-6 h-6" />
                                {{ $t("home.starme") }}
                            </a>
                        </div>
                    </div>
                </div>
            </div>
            <div class="p-4 grid grid-cols-2 lg:grid-cols-4 w-full justify-items-center gap-4">
                <RouterLink
                    to="/char-build"
                    class="container flex flex-col justify-center items-center p-8 gap-2 bg-base-100/50 hover:bg-base-100 hover:animate-pulse transition-all duration-500 rounded-lg"
                >
                    <div class="text-primary">
                        <Icon icon="la:edit-solid" class="w-12 h-12" />
                    </div>
                    <div class="text-xl font-bold text-primary">
                        {{ $t("char-build.title") }}
                    </div>
                    <div class="text-sm text-gray-500">{{ $t("char-build.desc") }}</div>
                </RouterLink>
                <RouterLink
                    to="/inventory"
                    class="container flex flex-col justify-center items-center p-8 gap-2 bg-base-100/50 hover:bg-base-100 hover:animate-pulse transition-all duration-500 rounded-lg"
                >
                    <div class="text-primary">
                        <Icon icon="ri:box-1-line" class="w-12 h-12" />
                    </div>
                    <div class="text-xl font-bold text-primary">
                        {{ $t("inventory.title") }}
                    </div>
                    <div class="text-sm text-gray-500">{{ $t("inventory.desc") }}</div>
                </RouterLink>
                <RouterLink
                    to="/timeline"
                    class="container flex flex-col justify-center items-center p-8 gap-2 bg-base-100/50 hover:bg-base-100 hover:animate-pulse transition-all duration-500 rounded-lg"
                >
                    <div class="text-primary">
                        <Icon icon="ri:timeline-view" class="w-12 h-12" />
                    </div>
                    <div class="text-xl font-bold text-primary">
                        {{ $t("timeline.title") }}
                    </div>
                    <div class="text-sm text-gray-500">{{ $t("timeline.desc") }}</div>
                </RouterLink>
                <RouterLink
                    to="/more"
                    class="container flex flex-col justify-center items-center p-8 gap-2 bg-base-100/50 hover:bg-base-100 hover:animate-pulse transition-all duration-500 rounded-lg"
                >
                    <div class="text-primary">
                        <Icon icon="ri:more-line" class="w-12 h-12" />
                    </div>
                    <div class="text-xl font-bold text-primary">
                        {{ $t("more.title") }}
                    </div>
                    <div class="text-sm text-gray-500">{{ $t("more.desc") }}</div>
                </RouterLink>
            </div>
        </ScrollArea>
    </div>
</template>
