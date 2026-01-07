<script setup lang="ts">
import { ref } from "vue"
import type { IconTypes } from "../components/Icon.vue"

const activeTab = ref("char-build")

const tabs = [
    { id: "char-build", label: "char-build.title", icon: "ri:hammer-line" },
    { id: "inventory", label: "inventory.title", icon: "ri:box-1-line" },
    { id: "timeline", label: "timeline.title", icon: "ri:timeline-view" },
    { id: "game-launcher", label: "game-launcher.title", icon: "ri:rocket-2-line" },
    { id: "achievement", label: "achievement.title", icon: "ri:trophy-line" },
    { id: "game", label: "game.title", icon: "ri:gamepad-line" },
    { id: "setting", label: "setting.title", icon: "ri:settings-3-line" },
] satisfies { id: string; label: string; icon: IconTypes }[]
</script>

<template>
    <div class="h-full flex flex-col bg-base-100 overflow-auto">
        <!-- 标题区域 -->
        <div class="hero bg-base-200 min-h-40 relative bg-linear-to-br from-primary/20 via-base-200 to-secondary/20">
            <div class="hero-content text-center">
                <div>
                    <h1 class="text-4xl font-bold mb-4">{{ $t("help.title") }}</h1>
                    <p class="text-lg opacity-80">{{ $t("help.desc") }}</p>
                </div>
            </div>
        </div>

        <div class="flex-1 flex flex-col lg:flex-row p-4 gap-4 max-w-7xl mx-auto w-full">
            <!-- 左侧导航 -->
            <div class="lg:w-64 w-full">
                <div class="bg-base-200 rounded-lg p-4 shadow-lg">
                    <h2 class="text-xl font-bold mb-4">{{ $t("help.navigation") }}</h2>
                    <div class="space-y-2">
                        <button
                            v-for="tab in tabs"
                            :key="tab.id"
                            @click="activeTab = tab.id"
                            class="w-full btn btn-ghost justify-start"
                            :class="{ 'btn-active': activeTab === tab.id }"
                        >
                            <Icon :icon="tab.icon" class="w-5 h-5 mr-2" />
                            {{ $t(tab.label) }}
                        </button>
                    </div>
                </div>
            </div>

            <!-- 右侧内容区域 -->
            <div class="flex-1">
                <div class="bg-base-100 rounded-lg shadow-lg p-6">
                    <!-- 角色构建说明 -->
                    <div v-if="activeTab === 'char-build'" class="space-y-6">
                        <h2 class="text-2xl font-bold">{{ $t("char-build.title") }}</h2>
                        <p class="text-lg">{{ $t("char-build.desc") }}</p>

                        <div class="bg-base-200 p-4 rounded-lg">
                            <h3 class="text-xl font-bold mb-3">{{ $t("help.workflow") }}</h3>

                            <!-- 流程图 -->
                            <div class="mb-6 p-4 bg-base-100 rounded-lg">
                                <div class="text-center font-bold mb-2">{{ $t("help.charBuildFlow") }}</div>
                                <div class="flex flex-col md:flex-row items-center justify-center gap-4">
                                    <!-- 步骤1 -->
                                    <div class="flex flex-col items-center">
                                        <div
                                            class="w-16 h-16 rounded-full bg-primary text-primary-content flex items-center justify-center text-xl font-bold"
                                        >
                                            1
                                        </div>
                                        <div class="mt-2 text-center text-sm font-medium">{{ $t("help.charBuildStep1") }}</div>
                                        <div class="text-xs opacity-70 mt-1">{{ $t("help.select") }}</div>
                                    </div>
                                    <div class="hidden md:block">
                                        <Icon icon="ri:arrow-right-line" class="w-8 h-8 text-primary" />
                                    </div>
                                    <div class="md:hidden">
                                        <Icon icon="ri:arrow-down-line" class="w-8 h-8 text-primary" />
                                    </div>
                                    <!-- 步骤2 -->
                                    <div class="flex flex-col items-center">
                                        <div
                                            class="w-16 h-16 rounded-full bg-secondary text-secondary-content flex items-center justify-center text-xl font-bold"
                                        >
                                            2
                                        </div>
                                        <div class="mt-2 text-center text-sm font-medium">{{ $t("help.charBuildStep2") }}</div>
                                        <div class="text-xs opacity-70 mt-1">{{ $t("help.configure") }}</div>
                                    </div>
                                    <div class="hidden md:block">
                                        <Icon icon="ri:arrow-right-line" class="w-8 h-8 text-primary" />
                                    </div>
                                    <div class="md:hidden">
                                        <Icon icon="ri:arrow-down-line" class="w-8 h-8 text-primary" />
                                    </div>
                                    <!-- 步骤3 -->
                                    <div class="flex flex-col items-center">
                                        <div
                                            class="w-16 h-16 rounded-full bg-accent text-accent-content flex items-center justify-center text-xl font-bold"
                                        >
                                            3
                                        </div>
                                        <div class="mt-2 text-center text-sm font-medium">{{ $t("help.charBuildStep3") }}</div>
                                        <div class="text-xs opacity-70 mt-1">{{ $t("help.setEnemy") }}</div>
                                    </div>
                                    <div class="hidden md:block">
                                        <Icon icon="ri:arrow-right-line" class="w-8 h-8 text-primary" />
                                    </div>
                                    <div class="md:hidden">
                                        <Icon icon="ri:arrow-down-line" class="w-8 h-8 text-primary" />
                                    </div>
                                    <!-- 步骤4 -->
                                    <div class="flex flex-col items-center">
                                        <div
                                            class="w-16 h-16 rounded-full bg-success text-success-content flex items-center justify-center text-xl font-bold"
                                        >
                                            4
                                        </div>
                                        <div class="mt-2 text-center text-sm font-medium">{{ $t("help.charBuildStep4") }}</div>
                                        <div class="text-xs opacity-70 mt-1">{{ $t("help.analyze") }}</div>
                                    </div>
                                </div>
                            </div>

                            <!-- 详细步骤说明 -->
                            <div class="space-y-4">
                                <div class="flex items-start gap-3">
                                    <div class="badge badge-primary badge-lg">1</div>
                                    <div>
                                        <h4 class="font-bold">{{ $t("help.step1") }}</h4>
                                        <p>{{ $t("help.charBuildStep1") }}</p>
                                    </div>
                                </div>
                                <div class="flex items-start gap-3">
                                    <div class="badge badge-secondary badge-lg">2</div>
                                    <div>
                                        <h4 class="font-bold">{{ $t("help.step2") }}</h4>
                                        <p>{{ $t("help.charBuildStep2") }}</p>
                                    </div>
                                </div>
                                <div class="flex items-start gap-3">
                                    <div class="badge badge-accent badge-lg">3</div>
                                    <div>
                                        <h4 class="font-bold">{{ $t("help.step3") }}</h4>
                                        <p>{{ $t("help.charBuildStep3") }}</p>
                                    </div>
                                </div>
                                <div class="flex items-start gap-3">
                                    <div class="badge badge-success badge-lg">4</div>
                                    <div>
                                        <h4 class="font-bold">{{ $t("help.step4") }}</h4>
                                        <p>{{ $t("help.charBuildStep4") }}</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="bg-base-200 p-4 rounded-lg">
                            <h3 class="text-xl font-bold mb-3">{{ $t("help.features") }}</h3>
                            <ul class="list-disc pl-5 space-y-2">
                                <li>{{ $t("help.charBuildFeature1") }}</li>
                                <li>{{ $t("help.charBuildFeature2") }}</li>
                                <li>{{ $t("help.charBuildFeature3") }}</li>
                                <li>{{ $t("help.charBuildFeature4") }}</li>
                                <li>{{ $t("help.charBuildFeature5") }}</li>
                            </ul>
                        </div>
                    </div>

                    <!-- 库存管理说明 -->
                    <div v-else-if="activeTab === 'inventory'" class="space-y-6">
                        <h2 class="text-2xl font-bold">{{ $t("inventory.title") }}</h2>
                        <p class="text-lg">{{ $t("inventory.desc") }}</p>

                        <div class="bg-base-200 p-4 rounded-lg">
                            <h3 class="text-xl font-bold mb-3">{{ $t("help.workflow") }}</h3>
                            <div class="space-y-4">
                                <div class="flex items-start gap-3">
                                    <div class="badge badge-primary badge-lg">1</div>
                                    <div>
                                        <h4 class="font-bold">{{ $t("help.step1") }}</h4>
                                        <p>{{ $t("help.inventoryStep1") }}</p>
                                    </div>
                                </div>
                                <div class="flex items-start gap-3">
                                    <div class="badge badge-primary badge-lg">2</div>
                                    <div>
                                        <h4 class="font-bold">{{ $t("help.step2") }}</h4>
                                        <p>{{ $t("help.inventoryStep2") }}</p>
                                    </div>
                                </div>
                                <div class="flex items-start gap-3">
                                    <div class="badge badge-primary badge-lg">3</div>
                                    <div>
                                        <h4 class="font-bold">{{ $t("help.step3") }}</h4>
                                        <p>{{ $t("help.inventoryStep3") }}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 时间线编辑器说明 -->
                    <div v-else-if="activeTab === 'timeline'" class="space-y-6">
                        <h2 class="text-2xl font-bold">{{ $t("timeline.title") }}</h2>
                        <p class="text-lg">{{ $t("timeline.desc") }}</p>

                        <div class="bg-base-200 p-4 rounded-lg">
                            <h3 class="text-xl font-bold mb-3">{{ $t("help.workflow") }}</h3>
                            <div class="space-y-4">
                                <div class="flex items-start gap-3">
                                    <div class="badge badge-primary badge-lg">1</div>
                                    <div>
                                        <h4 class="font-bold">{{ $t("help.step1") }}</h4>
                                        <p>{{ $t("help.timelineStep1") }}</p>
                                    </div>
                                </div>
                                <div class="flex items-start gap-3">
                                    <div class="badge badge-primary badge-lg">2</div>
                                    <div>
                                        <h4 class="font-bold">{{ $t("help.step2") }}</h4>
                                        <p>{{ $t("help.timelineStep2") }}</p>
                                    </div>
                                </div>
                                <div class="flex items-start gap-3">
                                    <div class="badge badge-primary badge-lg">3</div>
                                    <div>
                                        <h4 class="font-bold">{{ $t("help.step3") }}</h4>
                                        <p>{{ $t("help.timelineStep3") }}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 游戏启动器说明 -->
                    <div v-else-if="activeTab === 'game-launcher'" class="space-y-6">
                        <h2 class="text-2xl font-bold">{{ $t("game-launcher.title") }}</h2>
                        <p class="text-lg">{{ $t("game-launcher.desc") }}</p>

                        <div class="bg-base-200 p-4 rounded-lg">
                            <h3 class="text-xl font-bold mb-3">{{ $t("help.workflow") }}</h3>
                            <div class="space-y-4">
                                <div class="flex items-start gap-3">
                                    <div class="badge badge-primary badge-lg">1</div>
                                    <div>
                                        <h4 class="font-bold">{{ $t("help.step1") }}</h4>
                                        <p>{{ $t("help.gameLauncherStep1") }}</p>
                                    </div>
                                </div>
                                <div class="flex items-start gap-3">
                                    <div class="badge badge-primary badge-lg">2</div>
                                    <div>
                                        <h4 class="font-bold">{{ $t("help.step2") }}</h4>
                                        <p>{{ $t("help.gameLauncherStep2") }}</p>
                                    </div>
                                </div>
                                <div class="flex items-start gap-3">
                                    <div class="badge badge-primary badge-lg">3</div>
                                    <div>
                                        <h4 class="font-bold">{{ $t("help.step3") }}</h4>
                                        <p>{{ $t("help.gameLauncherStep3") }}</p>
                                    </div>
                                </div>
                                <div class="flex items-start gap-3">
                                    <div class="badge badge-primary badge-lg">4</div>
                                    <div>
                                        <h4 class="font-bold">{{ $t("help.step4") }}</h4>
                                        <p>{{ $t("help.gameLauncherStep4") }}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 成就系统说明 -->
                    <div v-else-if="activeTab === 'achievement'" class="space-y-6">
                        <h2 class="text-2xl font-bold">{{ $t("achievement.title") }}</h2>
                        <p class="text-lg">{{ $t("achievement.desc") }}</p>

                        <div class="bg-base-200 p-4 rounded-lg">
                            <h3 class="text-xl font-bold mb-3">{{ $t("help.features") }}</h3>
                            <ul class="list-disc pl-5 space-y-2">
                                <li>{{ $t("help.achievementFeature1") }}</li>
                                <li>{{ $t("help.achievementFeature2") }}</li>
                                <li>{{ $t("help.achievementFeature3") }}</li>
                                <li>{{ $t("help.achievementFeature4") }}</li>
                            </ul>
                        </div>
                    </div>

                    <!-- 小游戏说明 -->
                    <div v-else-if="activeTab === 'game'" class="space-y-6">
                        <h2 class="text-2xl font-bold">{{ $t("game.title") }}</h2>
                        <p class="text-lg">{{ $t("game.desc") }}</p>

                        <div class="bg-base-200 p-4 rounded-lg">
                            <h3 class="text-xl font-bold mb-3">{{ $t("help.controls") }}</h3>
                            <ul class="list-disc pl-5 space-y-2">
                                <li>{{ $t("help.gameControl1") }}</li>
                                <li>{{ $t("help.gameControl2") }}</li>
                                <li>{{ $t("help.gameControl3") }}</li>
                                <li>{{ $t("help.gameControl4") }}</li>
                                <li>{{ $t("help.gameControl5") }}</li>
                            </ul>
                        </div>
                    </div>

                    <!-- 设置说明 -->
                    <div v-else-if="activeTab === 'setting'" class="space-y-6">
                        <h2 class="text-2xl font-bold">{{ $t("setting.title") }}</h2>

                        <div class="bg-base-200 p-4 rounded-lg">
                            <h3 class="text-xl font-bold mb-3">{{ $t("setting.appearance") }}</h3>
                            <ul class="list-disc pl-5 space-y-2">
                                <li>{{ $t("help.settingFeature1") }}</li>
                                <li>{{ $t("help.settingFeature2") }}</li>
                                <li>{{ $t("help.settingFeature3") }}</li>
                                <li>{{ $t("help.settingFeature4") }}</li>
                                <li>{{ $t("help.settingFeature5") }}</li>
                            </ul>
                        </div>

                        <div class="bg-base-200 p-4 rounded-lg">
                            <h3 class="text-xl font-bold mb-3">{{ $t("setting.other") }}</h3>
                            <ul class="list-disc pl-5 space-y-2">
                                <li>{{ $t("help.settingFeature6") }}</li>
                                <li>{{ $t("help.settingFeature7") }}</li>
                                <li>{{ $t("help.settingFeature8") }}</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
