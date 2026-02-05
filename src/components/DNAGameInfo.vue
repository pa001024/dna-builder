<script setup lang="ts">
import { useLocalStorage } from "@vueuse/core"
import { DNAAPI, DNARoleEntity, DNAShortNoteEntity, DNAWeaponBean } from "dna-api"
import { toPng } from "html-to-image"
import { onMounted, ref } from "vue"
import { Draft } from "@/data"
import { imgRemoteToLocal } from "@/utils/remoteImg"
import { modDraftMap, modMap, resourceDraftMap, resourceMap, weaponDraftMap, weaponMap } from "../data/d"
import { LeveledMod } from "../data/leveled/LeveledMod"
import { LeveledWeapon } from "../data/leveled/LeveledWeapon"
import { useInvStore } from "../store/inv"
import { useSettingStore } from "../store/setting"
import { useUIStore } from "../store/ui"

defineProps<{
    nobtn?: boolean
}>()
const setting = useSettingStore()
const ui = useUIStore()
const inv = useInvStore()

let api: DNAAPI

const loading = ref(true)
const roleInfo = useLocalStorage<DNARoleEntity>("dna.roleInfo", {} as any)
const shortNoteInfo = useLocalStorage<DNAShortNoteEntity>("dna.shortNoteInfo", {} as any)

/**
 * 计算铸造的真实结束时间
 * @param startTime 开始时间（秒数时间戳）
 * @param doingNum 进行中数量
 * @param draft 图纸信息
 * @returns 结束时间字符串
 */
function calculateRealEndTime(startTime: string | number, doingNum: number, draft?: Draft): string {
    if (!draft) return ""

    try {
        // 转换startTime为秒数
        const startSeconds = typeof startTime === "string" ? parseInt(startTime) : startTime
        if (isNaN(startSeconds)) return ""

        // 计算单个产物的制造时间（秒）
        const secs = (draft.d || 0) * 60 * doingNum
        if (secs <= 0) return ""

        // 计算真实结束时间（毫秒）
        const endTimeMs = (startSeconds + secs) * 1000

        return ui.timeDistanceFutureFix(endTimeMs)
    } catch (error) {
        console.error("计算结束时间失败:", error)
        return ""
    }
}

/**
 * 获取产物图片URL
 * @param draft 图纸信息
 * @returns 图片URL
 */
function getProductImageUrl(draft?: Draft): string {
    if (!draft) return "/imgs/webp/T_Head_Empty.webp"

    try {
        if (draft.t === "Mod") {
            const mod = modMap.get(draft.p)
            return LeveledMod.url(mod?.icon)
        } else if (draft.t === "Weapon") {
            const weapon = weaponMap.get(draft.p)
            return LeveledWeapon.url(weapon?.icon)
        } else if (draft.t === "Resource") {
            // 参考ResourceCostItem.vue的资源图片处理方式
            const res = resourceMap.get(draft.n || draft.p)
            return res?.icon ? `/imgs/res/${res?.icon}.webp` : `/imgs/webp/T_Head_Empty.webp`
        }
        return "/imgs/webp/T_Head_Empty.webp"
    } catch (error) {
        console.error("获取产物图片失败:", error)
        return "/imgs/webp/T_Head_Empty.webp"
    }
}

/**
 * 获取图纸信息
 * @param productId 产物ID
 * @returns 图纸信息
 */
function getDraftInfo(productId: number) {
    if (modDraftMap.has(productId)) {
        return modDraftMap.get(productId)
    } else if (weaponDraftMap.has(productId)) {
        return weaponDraftMap.get(productId)
    } else if (resourceDraftMap.has(productId)) {
        return resourceDraftMap.get(productId)
    }
}

const lastUpdateTime = useLocalStorage("dna.gameInfo.lastUpdateTime", 0)

// 截图相关状态
const screenshotResult = ref<string | null>(null)
const showScreenshotModal = ref(false)
const screenshotError = ref<string | null>(null)

onMounted(async () => {
    const t = await setting.getDNAAPI()
    if (!t) {
        ui.showErrorMessage("请先登录")
        return
    }
    api = t
    await loadData()
})

async function loadData(force = false) {
    try {
        if (lastUpdateTime.value > 0 && ui.timeNow - lastUpdateTime.value < 1000 * 60 * 5 && !force) {
            loading.value = false
            return
        }
        loading.value = true
        await setting.startHeartbeat()

        const roleRes = await api.defaultRoleForTool()
        if (roleRes.is_success && roleRes.data) {
            roleInfo.value = roleRes.data
        } else {
            throw new Error(roleRes.msg || "获取默认角色信息失败")
        }

        // 获取铸造信息
        const shortNoteRes = await api.getShortNoteInfo()
        if (shortNoteRes.is_success && shortNoteRes.data) {
            shortNoteInfo.value = shortNoteRes.data
        } else {
            throw new Error(shortNoteRes.msg || "获取额外信息失败")
        }

        lastUpdateTime.value = ui.timeNow
    } catch (e) {
        console.error(e)
        ui.showErrorMessage(e instanceof Error ? e.message : String(e))
    } finally {
        await setting.stopHeartbeat()
        loading.value = false
    }
}

async function syncInventory() {
    try {
        if (!roleInfo.value.roleInfo.roleShow.closeWeapons || !roleInfo.value.roleInfo.roleShow.langRangeWeapons) {
            ui.showErrorMessage("无库存, 请先到官方APP绑定角色")
            return
        }
        inv.meleeWeapons = roleInfo.value.roleInfo.roleShow.closeWeapons.reduce(
            (acc, cur) => {
                if (cur.unLocked) acc[cur.weaponId] = cur.skillLevel
                return acc
            },
            {} as Record<string, number>
        )
        inv.rangedWeapons = roleInfo.value.roleInfo.roleShow.langRangeWeapons.reduce(
            (acc, cur) => {
                if (cur.unLocked) acc[cur.weaponId] = cur.skillLevel
                return acc
            },
            {} as Record<string, number>
        )
        ui.showSuccessMessage("库存同步成功")
    } catch (e) {
        ui.showErrorMessage("库存同步失败:", e instanceof Error ? e.message : String(e))
    }
}

defineExpose({
    loadData,
    lastUpdateTime,
})

function getWeaponUnlockProgress(weapons: DNAWeaponBean[]) {
    const my = [...new Set(weapons.filter(v => v.unLocked).map(v => v.weaponId))]
    const all = [...new Set(weapons.map(v => v.weaponId))]
    return `${my.length} / ${all.length}`
}

const isScreenshotLoading = ref(false)
/**
 * 计算锻造进度百分比
 * @param draft 锻造信息
 * @param draftInfo 图纸信息
 * @returns 进度百分比（0-100）
 */
function calculateProgress(draft: any, draftInfo?: Draft): number {
    if (!draftInfo) return 0

    try {
        // 转换startTime为秒数
        const startSeconds = typeof draft.startTime === "string" ? parseInt(draft.startTime) : draft.startTime
        if (isNaN(startSeconds)) return 0

        // 计算总数量
        const totalNum = draft.draftCompleteNum + draft.draftDoingNum
        if (totalNum <= 0) return 0

        // 计算单个产物的制造时间（秒）
        const singleTimeSecs = (draftInfo.d || 0) * 60
        if (singleTimeSecs <= 0) return 0

        // 计算总制造时间（秒）
        const totalTimeSecs = singleTimeSecs * totalNum

        // 计算已经过去的时间（秒）
        const elapsedSecs = Math.max(0, Math.floor(ui.timeNow / 1000) - startSeconds)

        // 计算进度百分比
        const progress = (elapsedSecs / totalTimeSecs) * 100

        // 确保进度在0-100之间
        return Math.min(100, Math.max(0, progress))
    } catch (error) {
        console.error("计算进度失败:", error)
        return 0
    }
}

/**
 * 计算已完成的锻造数量
 * @param draft 锻造信息
 * @param draftInfo 图纸信息
 * @returns 已完成的数量
 */
function calculateCompletedNum(draft: any, draftInfo?: Draft): number {
    if (!draftInfo) return draft.draftCompleteNum || 0

    try {
        // 转换startTime为秒数
        const startSeconds = typeof draft.startTime === "string" ? parseInt(draft.startTime) : draft.startTime
        if (isNaN(startSeconds)) return draft.draftCompleteNum || 0

        // 计算总数量
        const totalNum = draft.draftCompleteNum + draft.draftDoingNum
        if (totalNum <= 0) return draft.draftCompleteNum || 0

        // 计算单个产物的制造时间（秒）
        const singleTimeSecs = (draftInfo.d || 0) * 60
        if (singleTimeSecs <= 0) return draft.draftCompleteNum || 0

        // 计算已经过去的时间（秒）
        const elapsedSecs = Math.max(0, Math.floor(ui.timeNow / 1000) - startSeconds)

        // 计算已完成的数量
        const completedNum = Math.floor(elapsedSecs / singleTimeSecs)

        // 确保已完成的数量不超过总数量，且不小于原始的已完成数量
        return Math.min(totalNum, Math.max(draft.draftCompleteNum || 0, completedNum))
    } catch (error) {
        console.error("计算已完成数量失败:", error)
        return draft.draftCompleteNum || 0
    }
}

/**
 * 生成完整页面截图
 */
async function generateScreenshot() {
    try {
        screenshotError.value = null

        // 获取要截图的根元素
        const targetElement = document.querySelector("#screenshot-container") as HTMLElement
        if (!targetElement) {
            throw new Error("找不到截图目标元素")
        }

        showScreenshotModal.value = true
        isScreenshotLoading.value = true
        targetElement.classList.add("screenshot")

        // 使用 html-to-image 生成截图
        const dataUrl = await toPng(targetElement, {
            // pixelRatio: 2,
            backgroundColor: "var(--color-base-100)",
        })
        targetElement.classList.remove("screenshot")

        screenshotResult.value = dataUrl
    } catch (error) {
        console.error("截图生成失败:", error)
        screenshotError.value = error instanceof Error ? error.message : "截图生成失败"
        ui.showErrorMessage("截图生成失败: " + screenshotError.value)
    } finally {
        isScreenshotLoading.value = false
    }
}
</script>
<template>
    <div class="space-y-6">
        <div v-if="!nobtn" class="flex justify-between items-center">
            <span class="text-xs text-gray-500">最后更新: {{ ui.timeDistancePassed(lastUpdateTime) }}</span>
            <div class="flex gap-2">
                <Tooltip tooltip="刷新" side="bottom">
                    <button class="btn btn-primary btn-square btn-sm" @click="loadData(true)">
                        <Icon icon="ri:refresh-line" />
                    </button>
                </Tooltip>
            </div>
        </div>
        <div v-if="loading" class="flex justify-center items-center h-full py-8">
            <span class="loading loading-spinner loading-lg" />
        </div>
        <div v-if="roleInfo && roleInfo.roleInfo?.roleShow" class="space-y-6" id="screenshot-container">
            <div class="card bg-base-100 shadow-xl">
                <div class="card-body">
                    <div class="flex flex-col md:flex-row items-center gap-4">
                        <div class="avatar">
                            <div class="w-24 h-24 rounded-full ring ring-primary ring-offset-base-100 ring-offset-2">
                                <img
                                    :src="imgRemoteToLocal(roleInfo.roleInfo.roleShow.headUrl)"
                                    :alt="roleInfo.roleInfo.roleShow.roleName"
                                />
                            </div>
                        </div>
                        <div class="flex-1">
                            <h2 class="text-2xl font-bold">
                                {{ roleInfo.roleInfo.roleShow.roleName }}
                            </h2>
                            <div class="text-sm text-base-content/70 mt-1">UID: {{ roleInfo.roleInfo.roleShow.roleId }}</div>
                            <div class="text-sm text-base-content/70 mt-1">Lv. {{ roleInfo.roleInfo.roleShow.level }}</div>
                        </div>
                        <div class="ml-auto space-x-2 print:hidden">
                            <button class="btn btn-primary" @click="generateScreenshot" :class="{ 'btn-disabled': isScreenshotLoading }">
                                <span v-if="isScreenshotLoading" class="loading loading-spinner loading-sm"></span>
                                <Icon v-else icon="ri:screenshot-line" />
                                生成截图
                            </button>
                            <button class="btn btn-primary" @click="syncInventory">
                                <Icon icon="ri:refresh-line" />
                                同步库存
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div v-if="roleInfo.instanceInfo.length > 0" class="card bg-base-100 shadow-xl print:hidden">
                <div class="card-body">
                    <h3 class="card-title mb-4">
                        <span>委托密函</span>
                        <div class="ml-auto btn btn-ghost" @click="ui.mihanVisible = true">
                            <Icon icon="ri:settings-3-line" />
                            推送设置
                        </div>
                    </h3>
                    <div class="flex justify-center">
                        <div class="space-y-4 max-w-4xl grow">
                            <DNAMihanItem :missions="roleInfo.instanceInfo.map(item => item.instances.map(v => v.name)) || []" />
                        </div>
                    </div>
                </div>
            </div>

            <!-- 铸造信息 -->
            <div v-if="shortNoteInfo" class="card bg-base-100 shadow-xl">
                <div class="card-body">
                    <h3 class="card-title mb-4">基本信息</h3>
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div class="bg-base-200 p-3 rounded-lg">
                            <div class="text-sm font-medium">每日任务</div>
                            <div class="text-xl font-bold">
                                {{ shortNoteInfo.currentTaskProgress }} / {{ shortNoteInfo.maxDailyTaskProgress }}
                            </div>
                        </div>
                        <div class="bg-base-200 p-3 rounded-lg">
                            <div class="text-sm font-medium">迷津奖励</div>
                            <div class="text-xl font-bold">
                                {{ shortNoteInfo.rougeLikeRewardCount }} / {{ shortNoteInfo.rougeLikeRewardTotal }}
                            </div>
                        </div>
                        <div class="bg-base-200 p-3 rounded-lg">
                            <div class="text-sm font-medium">竞逐次数</div>
                            <div class="text-xl font-bold">{{ shortNoteInfo.dungeonReward }} / {{ shortNoteInfo.dungeonRewardTotal }}</div>
                        </div>
                        <div class="bg-base-200 p-3 rounded-lg">
                            <div class="text-sm font-medium">周本次数</div>
                            <div class="text-xl font-bold">
                                {{ shortNoteInfo.hardBossRewardCount }} / {{ shortNoteInfo.hardBossRewardTotal }}
                            </div>
                        </div>
                    </div>

                    <!-- 锻造信息 -->
                    <div v-if="shortNoteInfo.draftInfo" class="mt-6 print:hidden">
                        <!-- 锻造列表 -->
                        <div class="space-y-3">
                            <div class="text-lg font-semibold mb-3">锻造 ({{ shortNoteInfo.draftInfo.draftDoingNum }})</div>
                            <div
                                v-if="shortNoteInfo.draftInfo.draftDoingInfo && shortNoteInfo.draftInfo.draftDoingInfo.length > 0"
                                class="space-y-4"
                            >
                                <div
                                    v-for="(draft, index) in shortNoteInfo.draftInfo.draftDoingInfo"
                                    :key="index"
                                    class="bg-base-200 p-4 rounded-lg flex gap-4 items-start shadow-sm"
                                >
                                    <!-- 产物图片 -->
                                    <div class="shrink-0">
                                        <img
                                            :src="getProductImageUrl(getDraftInfo(draft.productId))"
                                            :alt="draft.productName"
                                            class="w-16 h-16 object-cover rounded-lg border border-base-300 shadow-md"
                                        />
                                    </div>

                                    <!-- 锻造信息 -->
                                    <div class="flex-1">
                                        <div class="flex justify-between items-start mb-2">
                                            <h4 class="text-lg font-bold">{{ draft.productName }}</h4>
                                            <span class="text-sm bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                                                {{ calculateCompletedNum(draft, getDraftInfo(draft.productId)) }} /
                                                {{ draft.draftCompleteNum + draft.draftDoingNum }}
                                            </span>
                                        </div>

                                        <!-- 进度条 -->
                                        <div class="mb-2">
                                            <div class="w-full bg-base-300 rounded-full h-3 overflow-hidden">
                                                <div
                                                    class="bg-primary h-full rounded-full transition-all duration-500 ease-out"
                                                    :style="{
                                                        width: `${Math.min(100, calculateProgress(draft, getDraftInfo(draft.productId)))}%`,
                                                    }"
                                                ></div>
                                            </div>
                                        </div>

                                        <!-- 时间信息 -->
                                        <div class="flex justify-between items-center text-sm">
                                            <span class="text-base-content/70">剩余时间:</span>
                                            <span class="font-medium text-primary">
                                                {{
                                                    calculateRealEndTime(
                                                        draft.startTime,
                                                        draft.draftDoingNum + draft.draftCompleteNum,
                                                        getDraftInfo(draft.productId)
                                                    )
                                                }}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div v-else class="bg-base-200 p-4 rounded-lg text-center text-base-content/70">暂无进行中的锻造</div>
                        </div>
                    </div>
                </div>
            </div>

            <div v-if="roleInfo.roleInfo.roleShow.params.length > 0" class="card bg-base-100 shadow-xl">
                <div class="card-body">
                    <div class="grid grid-cols-[repeat(auto-fill,160px)] gap-4 justify-center">
                        <div v-for="(p, index) in roleInfo.roleInfo.roleShow.params" :key="index" class="card hover-3d">
                            <div class="card-body bg-linear-0 from-base-300 to-base-200 rounded-2xl relative p-4">
                                <div class="text-sm font-medium">{{ p.paramKey }}</div>
                                <div class="text-xl font-bold">
                                    {{ p.paramValue }}
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="grid grid-cols-[repeat(auto-fill,160px)] gap-4 justify-center mt-2">
                        <div class="card hover-3d">
                            <div class="card-body bg-linear-0 from-base-300 to-base-200 rounded-2xl relative p-4">
                                <div class="text-sm font-medium">成就达成</div>
                                <div class="text-xl font-bold">
                                    {{ roleInfo.roleInfo.roleShow.roleAchv.total }}
                                </div>
                            </div>
                        </div>
                        <div
                            v-for="[k, p] in ['gold', 'silver', 'bronze'].map(v => [
                                v,
                                roleInfo.roleInfo.roleShow.roleAchv[v as keyof typeof roleInfo.roleInfo.roleShow.roleAchv],
                            ])"
                            :key="k"
                            class="card hover-3d"
                        >
                            <div class="card-body bg-linear-0 from-base-300 to-base-200 rounded-2xl relative p-4">
                                <div class="text-xl font-bold flex flex-col justify-center h-full">
                                    <div class="flex items-end gap-4">
                                        <img
                                            :src="`/imgs/webp/Icon_Achievement_${{ bronze: 'Copper', silver: 'Silver', gold: 'Gold' }[k]}.webp`"
                                            alt="品质"
                                            class="size-10"
                                        />
                                        {{ p }}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="card bg-base-100 shadow-xl">
                <div class="card-body">
                    <h3 class="card-title mb-4">
                        角色 ({{ roleInfo.roleInfo.roleShow.roleChars.filter(v => v.unLocked).length }}/{{
                            roleInfo.roleInfo.roleShow.roleChars.length
                        }})
                    </h3>
                    <div class="grid grid-cols-[repeat(auto-fill,160px)] gap-4 justify-center">
                        <DNACharItem v-for="char in roleInfo.roleInfo.roleShow.roleChars" :key="char.charId" :char="char" />
                    </div>
                </div>
            </div>

            <div class="card bg-base-100 shadow-xl">
                <div class="card-body">
                    <h3 class="card-title mb-4">远程武器 ({{ getWeaponUnlockProgress(roleInfo.roleInfo.roleShow.langRangeWeapons) }})</h3>
                    <div class="grid grid-cols-[repeat(auto-fill,160px)] gap-4 justify-center">
                        <DNAWeaponItem
                            v-for="weapon in roleInfo.roleInfo.roleShow.langRangeWeapons"
                            :key="weapon.weaponId"
                            :weapon="weapon"
                        />
                    </div>
                </div>
            </div>

            <div class="card bg-base-100 shadow-xl">
                <div class="card-body">
                    <h3 class="card-title mb-4">近战武器 ({{ getWeaponUnlockProgress(roleInfo.roleInfo.roleShow.closeWeapons) }})</h3>
                    <div class="grid grid-cols-[repeat(auto-fill,160px)] gap-4 justify-center">
                        <DNAWeaponItem v-for="weapon in roleInfo.roleInfo.roleShow.closeWeapons" :key="weapon.weaponId" :weapon="weapon" />
                    </div>
                </div>
            </div>

            <div class="card bg-base-100 shadow-xl">
                <div class="card-body">
                    <h3 class="card-title mb-4">迷津</h3>
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div class="bg-base-200 p-3 rounded-lg">
                            <div class="text-sm font-medium">进度</div>
                            <div class="text-xl font-bold">
                                {{ ["0", "I", "II", "III", "IV", "V", "VI"][roleInfo.roleInfo.roleShow.rougeLikeInfo.maxPassed >> 4] }}
                            </div>
                            <div class="text-sm text-base-content/70">
                                Lv.{{ (roleInfo.roleInfo.roleShow.rougeLikeInfo.maxPassed & 8) * 10 }}
                            </div>
                        </div>
                        <div class="bg-base-200 p-3 rounded-lg">
                            <div class="text-sm font-medium">本周行迹</div>
                            <div class="text-xl font-bold">
                                {{ roleInfo.roleInfo.roleShow.rougeLikeInfo.rewardCount }}
                            </div>
                            <div class="text-sm text-base-content/70">/ {{ roleInfo.roleInfo.roleShow.rougeLikeInfo.rewardTotal }}</div>
                        </div>
                        <div class="bg-base-200 p-3 rounded-lg">
                            <div class="text-sm font-medium">重置时间</div>
                            <div class="text-xl font-bold">
                                {{ ui.timeDistanceFuture(+roleInfo.roleInfo.roleShow.rougeLikeInfo.resetTime * 1000) }}
                            </div>
                            <div class="text-sm text-base-content/70">
                                {{ new Date(+roleInfo.roleInfo.roleShow.rougeLikeInfo.resetTime * 1000).toLocaleDateString() }}
                            </div>
                        </div>
                    </div>

                    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div
                            v-for="(talent, index) in roleInfo.roleInfo.roleShow.rougeLikeInfo.talentInfo"
                            :key="index"
                            class="bg-base-200 p-3 rounded-lg"
                        >
                            <div class="text-sm font-medium">{{ ["技能", "适应", "近战", "远程"][index] }}强化</div>
                            <div class="text-xl font-bold">
                                {{ talent.cur }}
                            </div>
                            <div class="text-sm text-base-content/70">/ {{ talent.max }}</div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="card bg-base-100 shadow-xl">
                <div class="card-body">
                    <h3 class="card-title mb-4">
                        {{ roleInfo.roleInfo.abyssInfo.operaName }}
                        <span class="ml-auto text-base-content/70 text-sm"
                            >{{ new Date(+roleInfo.roleInfo.abyssInfo.startTime * 1000).toLocaleDateString() }} -
                            {{ new Date(+roleInfo.roleInfo.abyssInfo.endTime * 1000).toLocaleDateString() }}</span
                        >
                    </h3>
                    <div class="space-y-3">
                        <div class="flex justify-between">
                            <span class="text-base-content/70">{{ roleInfo.roleInfo.abyssInfo.progressName }}</span>
                            <span class="font-semibold badge badge-primary">
                                <Icon icon="ri:star-line" class="size-4 inline-block" />
                                {{ roleInfo.roleInfo.abyssInfo.stars }}</span
                            >
                        </div>

                        <div class="flex justify-center" style="--spacing: max(0.25rem, calc(1vw / 2))">
                            <div v-if="roleInfo.roleInfo.abyssInfo.bestTimeVo1" class="flex gap-2">
                                <img
                                    v-if="roleInfo.roleInfo.abyssInfo.bestTimeVo1.charIcon"
                                    :src="imgRemoteToLocal(roleInfo.roleInfo.abyssInfo.bestTimeVo1.charIcon)"
                                    alt="角色"
                                    class="size-40 object-cover rounded-xl bg-base-300 shadow-md border border-gray-300/50"
                                />
                                <div v-else class="size-12 rounded-xl bg-base-300 shadow-md border border-gray-300/50" />
                                <div class="flex flex-col items-center gap-2">
                                    <img
                                        v-if="roleInfo.roleInfo.abyssInfo.bestTimeVo1.closeWeaponIcon"
                                        :src="imgRemoteToLocal(roleInfo.roleInfo.abyssInfo.bestTimeVo1.closeWeaponIcon)"
                                        alt="近战武器"
                                        class="size-12 object-cover rounded-xl bg-base-300 shadow-md border border-gray-300/50"
                                    />
                                    <div v-else class="size-12 rounded-xl bg-base-300 shadow-md border border-gray-300/50" />
                                    <img
                                        v-if="roleInfo.roleInfo.abyssInfo.bestTimeVo1.langRangeWeaponIcon"
                                        :src="imgRemoteToLocal(roleInfo.roleInfo.abyssInfo.bestTimeVo1.langRangeWeaponIcon)"
                                        alt="远程武器"
                                        class="size-12 object-cover rounded-xl bg-base-300 shadow-md border border-gray-300/50"
                                    />
                                    <div v-else class="size-12 rounded-xl bg-base-300 shadow-md border border-gray-300/50" />
                                    <img
                                        v-if="roleInfo.roleInfo.abyssInfo.bestTimeVo1.petIcon"
                                        :src="imgRemoteToLocal(roleInfo.roleInfo.abyssInfo.bestTimeVo1.petIcon)"
                                        alt="魔灵"
                                        class="size-12 object-cover rounded-xl bg-base-300 shadow-md border border-gray-300/50"
                                    />
                                    <div v-else class="size-12 rounded-xl bg-base-300 shadow-md border border-gray-300/50" />
                                </div>
                                <div class="flex flex-col gap-2">
                                    <img
                                        v-if="roleInfo.roleInfo.abyssInfo.bestTimeVo1.phantomCharIcon1"
                                        :src="imgRemoteToLocal(roleInfo.roleInfo.abyssInfo.bestTimeVo1.phantomCharIcon1)"
                                        alt="协战角色1"
                                        class="size-19 object-cover rounded-xl bg-base-300 shadow-md border border-gray-300/50"
                                    />
                                    <div v-else class="size-12 rounded-xl bg-base-300 shadow-md border border-gray-300/50" />
                                    <img
                                        v-if="roleInfo.roleInfo.abyssInfo.bestTimeVo1.phantomCharIcon2"
                                        :src="imgRemoteToLocal(roleInfo.roleInfo.abyssInfo.bestTimeVo1.phantomCharIcon2)"
                                        alt="协战角色2"
                                        class="size-19 object-cover rounded-xl bg-base-300 shadow-md border border-gray-300/50"
                                    />
                                    <div v-else class="size-12 rounded-xl bg-base-300 shadow-md border border-gray-300/50" />
                                </div>
                                <div class="flex flex-col gap-2">
                                    <img
                                        v-if="roleInfo.roleInfo.abyssInfo.bestTimeVo1.phantomWeaponIcon1"
                                        :src="imgRemoteToLocal(roleInfo.roleInfo.abyssInfo.bestTimeVo1.phantomWeaponIcon1)"
                                        alt="协战武器1"
                                        class="size-19 object-cover rounded-xl bg-base-300 shadow-md border border-gray-300/50"
                                    />
                                    <div v-else class="size-12 rounded-xl bg-base-300 shadow-md border border-gray-300/50" />
                                    <img
                                        v-if="roleInfo.roleInfo.abyssInfo.bestTimeVo1.phantomWeaponIcon2"
                                        :src="imgRemoteToLocal(roleInfo.roleInfo.abyssInfo.bestTimeVo1.phantomWeaponIcon2)"
                                        alt="协战武器2"
                                        class="size-19 object-cover rounded-xl bg-base-300 shadow-md border border-gray-300/50"
                                    />
                                    <div v-else class="size-12 rounded-xl bg-base-300 shadow-md border border-gray-300/50" />
                                </div>
                            </div>
                            <span v-else>暂无数据</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <div v-else-if="!loading" class="flex justify-center items-center h-full">
            <div class="text-center">
                <p class="text-lg mb-4">暂无游戏信息数据</p>
            </div>
        </div>
    </div>

    {{ showScreenshotModal }}
    <!-- 截图弹窗 -->
    <DialogModel v-model="showScreenshotModal">
        <div class="flex-1 overflow-auto p-6">
            <div v-if="isScreenshotLoading" class="flex justify-center items-center">
                <span class="loading loading-spinner loading-sm"></span>
                <span class="ml-2">正在生成截图，请稍后...</span>
            </div>
            <div v-else-if="screenshotError" class="flex justify-center items-center py-12 text-red-500">
                {{ screenshotError }}
            </div>
            <div v-else-if="screenshotResult" class="relative overflow-auto max-h-[60vh]">
                <img :src="screenshotResult" alt="游戏信息截图" class="mx-auto max-w-full" />
            </div>
        </div>
    </DialogModel>
</template>

<style lang="less">
#screenshot-container.screenshot {
    width: 922px;
    .print\:hidden {
        display: none;
    }
}
</style>
