<script lang="ts" setup>
import { useRouter } from "vue-router"

const router = useRouter()

function navigateTo(path: string) {
    router.push(path)
}
</script>

<template>
    <div class="database-home h-full flex flex-col p-4">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div
                class="card bg-base-300 cursor-pointer transition-all hover:scale-[1.02] hover:bg-base-200"
                @click="navigateTo('/db/dungeon')"
            >
                <div class="card-body">
                    <div class="flex items-center gap-3">
                        <div class="w-12 h-12 rounded-lg bg-warning/20 flex items-center justify-center">
                            <svg class="w-8 h-8 text-warning" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M3 3h18v18H3zM12 8v8M8 12h8" />
                            </svg>
                        </div>
                        <div>
                            <h2 class="card-title text-lg">副本列表</h2>
                            <p class="text-sm text-base-content-200">查看副本信息和奖励掉落</p>
                        </div>
                    </div>
                </div>
            </div>
            <div
                class="card bg-base-300 cursor-pointer transition-all hover:scale-[1.02] hover:bg-base-200"
                @click="navigateTo('/db/monster')"
            >
                <div class="card-body">
                    <div class="flex items-center gap-3">
                        <div class="w-12 h-12 rounded-lg bg-error/20 flex items-center justify-center">
                            <svg class="w-8 h-8 text-error" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                            </svg>
                        </div>
                        <div>
                            <h2 class="card-title text-lg">怪物图鉴</h2>
                            <p class="text-sm text-base-content-200">查看所有怪物属性和等级成长</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
