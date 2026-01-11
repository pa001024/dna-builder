<script setup lang="ts">
import { onMounted, ref, computed } from "vue"
import { DNAAPI, DNAWeaponDetailBean } from "dna-api"
import { useSettingStore } from "../store/setting"
import { useRouter, useRoute } from "vue-router"
import { useUIStore } from "../store/ui"
import { LeveledMod } from "../data"

const setting = useSettingStore()
const ui = useUIStore()
let api: DNAAPI
const router = useRouter()
const route = useRoute()

const weaponDetail = ref<DNAWeaponDetailBean | null>(null)
const loading = ref(true)

const weaponId = computed(() => route.params.weaponId as string)
const weaponEid = computed(() => route.params.weaponEid as string)

onMounted(async () => {
    const p = await setting.getDNAAPI()
    if (!p) {
        ui.showErrorMessage("请先登录")
        router.push("/userlogin")
        return
    }
    api = p
    await loadWeaponDetail()
})

async function loadWeaponDetail() {
    try {
        loading.value = true
        const res = await api.getWeaponDetail(weaponId.value, weaponEid.value)
        if (res.is_success && res.data?.weaponDetail?.attribute) {
            weaponDetail.value = res.data.weaponDetail
        } else {
            ui.showErrorMessage(!res.is_success ? res.msg : "获取武器详情失败")
        }
    } catch (e) {
        ui.showErrorMessage("获取武器详情失败", e)
    } finally {
        loading.value = false
    }
}
</script>
<template>
    <div class="w-full h-full flex flex-col">
        <!-- 头部 -->
        <div class="flex-none p-4 bg-base-100 border-b border-base-200 flex items-center justify-between">
            <button class="btn btn-ghost" @click="router.back()">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
                </svg>
            </button>
            <h1 class="text-xl font-bold">
                {{ weaponDetail?.name || "武器详情" }}
            </h1>
            <div class="w-12" />
            <!-- Spacer -->
        </div>

        <!-- 内容区域 -->
        <div class="flex-1 overflow-auto p-4 bg-base-100">
            <div v-if="loading" class="flex justify-center items-center h-full">
                <span class="loading loading-spinner loading-lg" />
            </div>

            <div v-else-if="weaponDetail" class="space-y-6">
                <!-- 武器基本信息 -->
                <div class="card bg-base-100 border border-base-200 rounded-lg shadow-sm">
                    <div class="card-body p-6">
                        <div class="flex items-center gap-6">
                            <!-- 武器图标 -->
                            <div class="shrink-0">
                                <img
                                    v-if="weaponDetail.icon"
                                    :src="weaponDetail.icon"
                                    alt="武器图标"
                                    class="w-24 h-24 object-contain rounded-lg border border-base-200 p-2 bg-base-200"
                                />
                                <div
                                    v-else
                                    class="w-24 h-24 flex items-center justify-center rounded-lg border border-base-200 bg-base-200"
                                >
                                    <span class="text-base-400">无图标</span>
                                </div>
                            </div>

                            <!-- 武器名称与等级 -->
                            <div class="flex-1">
                                <div class="flex items-center gap-3">
                                    <h2 class="text-2xl font-bold">
                                        {{ weaponDetail.name }}
                                    </h2>
                                    <div class="badge badge-secondary">Lv.{{ weaponDetail.level }}</div>
                                </div>

                                <!-- 元素类型 -->
                                <div class="flex items-center gap-2 mt-2">
                                    <img
                                        v-if="weaponDetail.elementIcon"
                                        :src="weaponDetail.elementIcon"
                                        alt="元素图标"
                                        class="w-5 h-5 object-contain"
                                    />
                                    <span class="text-base-content/80">{{ weaponDetail.elementName }}</span>
                                </div>

                                <!-- 精炼等级 -->
                                <div class="mt-2 text-base-content/80">
                                    精炼等级: <span class="font-semibold">{{ weaponDetail.skillLevel }}</span>
                                </div>

                                <!-- 魔之楔 -->
                                <div class="mt-1 text-base-content/80">
                                    魔之楔:
                                    <span class="font-semibold">{{ weaponDetail.currentVolume }}/{{ weaponDetail.sumVolume }}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 武器属性 -->
                <div class="card bg-base-100 border border-base-200 rounded-lg shadow-sm">
                    <div class="card-body p-6">
                        <h3 class="text-lg font-semibold mb-4">武器属性</h3>
                        <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
                            <div class="stat bg-base-200 rounded-lg p-4 text-center">
                                <div class="stat-title text-xs text-base-content/60">攻击力</div>
                                <div class="stat-value text-xl font-bold">
                                    {{ weaponDetail.attribute.atk }}
                                </div>
                            </div>
                            <div class="stat bg-base-200 rounded-lg p-4 text-center">
                                <div class="stat-title text-xs text-base-content/60">暴击率</div>
                                <div class="stat-value text-xl font-bold">{{ +(weaponDetail.attribute.cri * 100).toFixed(2) }}%</div>
                            </div>
                            <div class="stat bg-base-200 rounded-lg p-4 text-center">
                                <div class="stat-title text-xs text-base-content/60">暴击伤害</div>
                                <div class="stat-value text-xl font-bold">{{ +(weaponDetail.attribute.crd * 100).toFixed(2) }}%</div>
                            </div>
                            <div class="stat bg-base-200 rounded-lg p-4 text-center">
                                <div class="stat-title text-xs text-base-content/60">攻速</div>
                                <div class="stat-value text-xl font-bold">
                                    {{ weaponDetail.attribute.speed }}
                                </div>
                            </div>
                            <div class="stat bg-base-200 rounded-lg p-4 text-center">
                                <div class="stat-title text-xs text-base-content/60">触发</div>
                                <div class="stat-value text-xl font-bold">{{ +(weaponDetail.attribute.trigger * 100).toFixed(2) }}%</div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 武器描述 -->
                <div class="card bg-base-100 border border-base-200 rounded-lg shadow-sm">
                    <div class="card-body p-6">
                        <h3 class="text-lg font-semibold mb-4">武器描述</h3>
                        <p class="text-base-content/80 whitespace-pre-line">
                            {{ weaponDetail.description || "暂无描述" }}
                        </p>
                    </div>
                </div>

                <!-- 模式 -->
                <div
                    v-if="weaponDetail.modes && weaponDetail.modes.length > 0"
                    class="card bg-base-100 border border-base-200 rounded-lg shadow-sm"
                >
                    <div class="card-body p-6">
                        <h3 class="text-lg font-semibold mb-4">模式</h3>
                        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <ModItem v-for="(mode, index) in weaponDetail.modes" :key="index" :mod="LeveledMod.fromDNA(mode)" />
                        </div>
                    </div>
                </div>
            </div>

            <!-- 错误状态 -->
            <div v-else class="flex justify-center items-center h-full">
                <div class="text-center">
                    <p class="text-lg mb-4 text-base-content/80">无法获取武器详情</p>
                    <button class="btn btn-secondary" @click="loadWeaponDetail">重试</button>
                </div>
            </div>
        </div>
    </div>
</template>
