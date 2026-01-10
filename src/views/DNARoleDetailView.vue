<script setup lang="ts">
import { onMounted, ref, computed } from "vue"
import { DNAAPI, DNACharDetailBean } from "dna-api"
import { useSettingStore } from "../store/setting"
import { useRouter, useRoute } from "vue-router"
import { useUIStore } from "../store/ui"
import { LeveledMod } from "../data"
import { initEmojiDict } from "@/util"

const setting = useSettingStore()
const ui = useUIStore()
let api: DNAAPI
const router = useRouter()
const route = useRoute()

const charDetail = ref<DNACharDetailBean | null>(null)
const loading = ref(true)

const charId = computed(() => route.params.charId as string)
const charEid = computed(() => route.params.charEid as string)

onMounted(async () => {
    const p = await setting.getDNAAPI()
    if (!p) {
        ui.showErrorMessage("请先登录")
        router.push("/login")
        return
    }
    api = p
    await initEmojiDict()
    await loadRoleDetail()
})

async function loadRoleDetail() {
    try {
        loading.value = true
        const res = await api.getRoleDetail(charId.value, charEid.value)
        if (res.is_success && res.data?.charDetail?.attribute) {
            charDetail.value = res.data.charDetail
        } else {
            ui.showErrorMessage(!res.is_success ? res.msg : "获取角色详情失败")
        }
    } catch (e) {
        ui.showErrorMessage("获取角色详情失败", e)
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
                {{ charDetail?.charName || "角色详情" }}
            </h1>
            <div class="w-12" />
            <!-- Spacer -->
        </div>

        <!-- 内容区域 -->
        <div class="flex-1 overflow-auto p-4 bg-base-100">
            <div v-if="loading" class="flex justify-center items-center h-full">
                <span class="loading loading-spinner loading-lg" />
            </div>

            <div v-else-if="charDetail" class="space-y-6">
                <!-- 角色立绘 -->
                <div class="card bg-base-100 border border-base-200 rounded-lg shadow-sm overflow-hidden">
                    <div class="relative h-64 md:h-80">
                        <img v-if="charDetail.paint" :src="charDetail.paint" alt="角色立绘" class="w-full h-full object-cover" />
                        <div v-else class="w-full h-full flex items-center justify-center bg-base-200">
                            <span class="text-base-400">无立绘</span>
                        </div>
                        <!-- 半透明渐变遮罩 -->
                        <div class="absolute bottom-0 left-0 right-0 bg-linear-to-t from-base-100/90 to-transparent p-4">
                            <div class="flex items-center gap-3">
                                <img
                                    v-if="charDetail.icon"
                                    :src="charDetail.icon"
                                    alt="角色头像"
                                    class="w-16 h-16 rounded-full border-2 border-base-100 shadow-md object-cover"
                                />
                                <div
                                    v-else
                                    class="w-16 h-16 rounded-full border-2 border-base-100 shadow-md bg-base-200 flex items-center justify-center"
                                >
                                    <span class="text-base-400">无头像</span>
                                </div>
                                <div>
                                    <h2 class="text-2xl font-bold flex items-center gap-2">
                                        <img
                                            v-if="charDetail.elementIcon"
                                            :src="charDetail.elementIcon"
                                            :alt="charDetail.elementName"
                                            class="size-10 object-contain tooltip"
                                            :data-tip="charDetail.elementName"
                                        />
                                        <span>{{ charDetail.charName }}</span>

                                        <div class="badge badge-neutral badge-lg font-orbitron">
                                            {{ ["0", "I", "II", "III", "IV", "V", "VI"][charDetail.gradeLevel] }}
                                        </div>
                                    </h2>
                                    <div class="flex items-center gap-2 mt-1">
                                        <div class="badge badge-secondary bg-secondary/70">Lv.{{ charDetail.level }}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 角色属性 -->
                <div class="card bg-base-100 border border-base-200 rounded-lg shadow-sm">
                    <div class="card-body p-6">
                        <h3 class="text-lg font-semibold mb-4">角色属性</h3>
                        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div class="stat bg-base-200 rounded-lg p-4 text-center">
                                <div class="stat-title text-xs text-base-content/60">{{ charDetail.elementName }}属性攻击</div>
                                <div class="stat-value text-xl font-bold">
                                    {{ charDetail.attribute.atk }}
                                </div>
                            </div>
                            <div class="stat bg-base-200 rounded-lg p-4 text-center">
                                <div class="stat-title text-xs text-base-content/60">生命值</div>
                                <div class="stat-value text-xl font-bold">
                                    {{ charDetail.attribute.maxHp }}
                                </div>
                            </div>
                            <div class="stat bg-base-200 rounded-lg p-4 text-center">
                                <div class="stat-title text-xs text-base-content/60">防御</div>
                                <div class="stat-value text-xl font-bold">
                                    {{ charDetail.attribute.def }}
                                </div>
                            </div>
                            <div class="stat bg-base-200 rounded-lg p-4 text-center">
                                <div class="stat-title text-xs text-base-content/60">护盾</div>
                                <div class="stat-value text-xl font-bold">
                                    {{ charDetail.attribute.maxES }}
                                </div>
                            </div>
                            <div class="stat bg-base-200 rounded-lg p-4 text-center">
                                <div class="stat-title text-xs text-base-content/60">最大神智</div>
                                <div class="stat-value text-xl font-bold">
                                    {{ charDetail.attribute.maxSp }}
                                </div>
                            </div>
                            <div class="stat bg-base-200 rounded-lg p-4 text-center">
                                <div class="stat-title text-xs text-base-content/60">技能威力</div>
                                <div class="stat-value text-xl font-bold">
                                    {{ charDetail.attribute.skillIntensity }}
                                </div>
                            </div>
                            <div class="stat bg-base-200 rounded-lg p-4 text-center">
                                <div class="stat-title text-xs text-base-content/60">技能耐久</div>
                                <div class="stat-value text-xl font-bold">
                                    {{ charDetail.attribute.skillSustain }}
                                </div>
                            </div>
                            <div class="stat bg-base-200 rounded-lg p-4 text-center">
                                <div class="stat-title text-xs text-base-content/60">技能效益</div>
                                <div class="stat-value text-xl font-bold">
                                    {{ charDetail.attribute.skillEfficiency }}
                                </div>
                            </div>
                            <div class="stat bg-base-200 rounded-lg p-4 text-center">
                                <div class="stat-title text-xs text-base-content/60">技能范围</div>
                                <div class="stat-value text-xl font-bold">
                                    {{ charDetail.attribute.skillRange }}
                                </div>
                            </div>
                            <div class="stat bg-base-200 rounded-lg p-4 text-center">
                                <div class="stat-title text-xs text-base-content/60">武器精通</div>
                                <div class="stat-value text-xl font-bold">
                                    {{ charDetail.attribute.weaponTags.join("/") }}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 角色技能 -->
                <div class="card bg-base-100 border border-base-200 rounded-lg shadow-sm">
                    <div class="card-body p-6">
                        <h3 class="text-lg font-semibold mb-4">技能</h3>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div
                                v-for="skill in charDetail.skills"
                                :key="skill.skillId"
                                class="bg-base-300 rounded-lg p-4 text-center hover:shadow-md transition-shadow"
                            >
                                <div class="flex justify-center items-center gap-2">
                                    <div
                                        alt="技能图标"
                                        class="size-12 rounded-full bg-base-content"
                                        :style="{ mask: `url(${skill.icon}) no-repeat center/contain` }"
                                    />
                                    <div class="text-sm font-medium">
                                        {{ skill.skillName }}
                                    </div>
                                    <div class="ml-auto">Lv. {{ skill.level }}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 溯源 -->
                <div class="card bg-base-100 border border-base-200 rounded-lg shadow-sm">
                    <div class="card-body p-6">
                        <h3 class="text-lg font-semibold mb-4">角色溯源</h3>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div
                                v-for="(trace, index) in charDetail.traces"
                                :key="index"
                                class="bg-base-300 rounded-lg p-4 hover:shadow-md transition-shadow"
                            >
                                <div class="flex items-center gap-2 min-h-15">
                                    <img :src="trace.icon" alt="溯源图标" class="w-10 h-10 object-contain" />

                                    <div class="flex-1 space-y-1">
                                        <div class="flex items-center gap-2">
                                            <span> 第{{ ["一", "二", "三", "四", "五", "六"][index] }}根源 </span>
                                            <span
                                                class="badge badge-sm"
                                                :class="{
                                                    'badge-warning': charDetail.gradeLevel > index,
                                                    'badge-neutral': charDetail.gradeLevel <= index,
                                                }"
                                                >{{ charDetail.gradeLevel > index ? "已解锁" : "未解锁" }}</span
                                            >
                                        </div>
                                        <p class="text-xs opacity-60">
                                            {{ trace.description }}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 魔之楔 -->
                <div class="card bg-base-100 border border-base-200 rounded-lg shadow-sm">
                    <div class="card-body p-6">
                        <div class="flex text-lg font-semibold mb-4">
                            魔之楔
                            <div class="ml-auto">{{ charDetail.currentVolume }}/{{ charDetail.sumVolume }}</div>
                        </div>
                        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <ModItem v-for="(mode, index) in charDetail.modes" :key="index" :mod="LeveledMod.fromDNA(mode)" />
                        </div>
                    </div>
                </div>
            </div>

            <!-- 错误状态 -->
            <div v-else class="flex justify-center items-center h-full">
                <div class="text-center">
                    <p class="text-lg mb-4 text-base-content/80">无法获取角色详情</p>
                    <button class="btn btn-secondary" @click="loadRoleDetail">重试</button>
                </div>
            </div>
        </div>
    </div>
</template>
