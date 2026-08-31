<script setup lang="ts">
import { useLocalStorage } from "@vueuse/core"
import { DNAAPI, DNAItemWeeklyReport, DNARoleEntity, DNAShortNoteEntity, DNAWeaponBean } from "dna-api"
import { toPng } from "html-to-image"
import { t } from "i18next"
import { computed, onMounted, ref } from "vue"
import { useRouter } from "vue-router"
import { submitAbyssUsageMutation } from "@/api/graphql"
import { Draft } from "@/data"
import { modDraftMap, modMap, resourceDraftMap, resourceMap, weaponDraftMap, weaponMap } from "@/data/d"
import { LeveledMod } from "@/data/leveled/LeveledMod"
import { LeveledWeapon } from "@/data/leveled/LeveledWeapon"
import { useInvStore } from "@/store/inv"
import { useSettingStore } from "@/store/setting"
import { useUIStore } from "@/store/ui"
import { useUserStore } from "@/store/user"
import { buildAbyssUploadPayload } from "@/utils/abyss-upload"
import { imgRemoteToLocal } from "@/utils/remoteImg"

defineProps<{
    nobtn?: boolean
}>()
const setting = useSettingStore()
const ui = useUIStore()
const user = useUserStore()
const router = useRouter()
const inv = useInvStore()

let api: DNAAPI

const loading = ref(true)
const roleInfo = useLocalStorage<DNARoleEntity>("dna.roleInfo", {} as any)
const shortNoteInfo = useLocalStorage<DNAShortNoteEntity>("dna.shortNoteInfo", {} as any)

/**
 * 计算铸造的真实结束时间
 * @param startTime 开始时间（秒数时间戳）
 * @param doingNum 进行中数量
 * @param draft 设计稿信息
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
 * @param draft 设计稿信息
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
 * 获取设计稿信息
 * @param productId 产物ID
 * @returns 设计稿信息
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
const abyssUploading = ref(false)
const abyssUploadId = ref<string | null>(null)
const canUploadAbyss = computed(() => !!roleInfo.value?.roleInfo?.abyssInfo?.bestTimeVo1 && !!roleInfo.value?.roleInfo?.roleShow?.roleId)
const weeklyReportType = ref<1 | 2>(1)
const weeklyReport = ref<DNAItemWeeklyReport | null>(null)
const weeklyReportLoading = ref(false)
const weeklyReportError = ref("")

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

        await loadWeeklyReport(weeklyReportType.value)

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
            ui.showErrorMessage(t("dna-game-info.no_inventory"))
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
        ui.showSuccessMessage(t("dna-game-info.sync_inventory_success"))
    } catch (e) {
        ui.showErrorMessage(t("dna-game-info.sync_inventory_failed"), e instanceof Error ? e.message : String(e))
    }
}

defineExpose({
    loadData,
    lastUpdateTime,
})

/**
 * 获取道具获取周报数据。
 * @param weekType 周类型，1=本周，2=上周
 */
async function loadWeeklyReport(weekType: 1 | 2 = weeklyReportType.value) {
    weeklyReportLoading.value = true
    weeklyReportError.value = ""
    try {
        const weeklyReportRes = await api.getItemWeeklyReport(weekType)
        if (weeklyReportRes.is_success && weeklyReportRes.data) {
            weeklyReport.value = weeklyReportRes.data
            weeklyReportType.value = weekType
        } else {
            throw new Error(weeklyReportRes.msg || "获取道具获取周报失败")
        }
    } catch (error) {
        console.error(error)
        weeklyReportError.value = error instanceof Error ? error.message : String(error)
        ui.showErrorMessage(weeklyReportError.value)
    } finally {
        weeklyReportLoading.value = false
    }
}

/**
 * 切换道具获取周报的周类型。
 * @param weekType 周类型，1=本周，2=上周
 */
async function switchWeeklyReport(weekType: 1 | 2) {
    if (weeklyReportType.value === weekType && weeklyReport.value) {
        return
    }

    await loadWeeklyReport(weekType)
}

/**
 * 上传当前深渊数据。
 */
async function uploadAbyssUsage() {
    const role = roleInfo.value
    if (!role?.roleInfo?.abyssInfo?.bestTimeVo1) {
        ui.showErrorMessage("没有可上传的深渊数据")
        return
    }
    const roleId = role.roleInfo?.roleShow?.roleId
    if (!roleId) {
        ui.showErrorMessage("缺少 UID")
        return
    }

    abyssUploading.value = true
    try {
        const payload = await buildAbyssUploadPayload(role)
        if (!payload) {
            throw new Error("无法生成深渊上传数据")
        }
        console.info("深渊数据开始上传:", {
            ...payload,
            uidSha256: "[已隐藏]",
            ownedChars: payload.ownedChars?.length ?? 0,
            ownedWeapons: payload.ownedWeapons?.length ?? 0,
        })
        const result = await submitAbyssUsageMutation({ input: payload }, { requestPolicy: "network-only" })
        if (!result) {
            console.error("深渊数据上传结果为空")
            throw new Error("上传结果为空")
        }
        await user.refreshProfile()
        const awardedExp = result.reward?.awardedExp ?? 0
        const awardedPoints = result.reward?.awardedPoints ?? 0
        ui.showSuccessMessage(awardedExp > 0 ? `深渊数据上传成功，经验+${awardedExp}，积分+${awardedPoints}` : "深渊数据上传成功")
        abyssUploadId.value = result.id
    } catch (error) {
        console.error("深渊数据上传异常:", error)
        ui.showErrorMessage("深渊数据上传失败", error instanceof Error ? error.message : String(error))
    } finally {
        abyssUploading.value = false
    }
}

/**
 * 跳转到深渊统计页。
 */
function openAbyssUsagePage() {
    router.push("/abyss-usage")
}

function getWeaponUnlockProgress(weapons: DNAWeaponBean[]) {
    const my = [...new Set(weapons.filter(v => v.unLocked).map(v => v.weaponId))]
    const all = [...new Set(weapons.map(v => v.weaponId))]
    return `${my.length} / ${all.length}`
}

const isScreenshotLoading = ref(false)
/**
 * 计算锻造进度百分比
 * @param draft 锻造信息
 * @param draftInfo 设计稿信息
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
 * @param draftInfo 设计稿信息
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
    <div class="mx-auto space-y-3 max-w-4xl">
        <div v-if="!nobtn" class="flex justify-between items-center">
            <span class="text-xs tracking-wide text-base-content/50">最后更新: {{ ui.timeDistancePassed(lastUpdateTime) }}</span>
            <div class="flex gap-2">
                <Tooltip tooltip="刷新" side="bottom">
                    <button
                        type="button"
                        class="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-xs border border-base-content/20 text-base-content/60 transition-colors duration-150 hover:border-primary/60 hover:text-primary active:scale-[0.97]"
                        @click="loadData(true)"
                    >
                        <Icon icon="ri:refresh-line" class="size-4" />
                    </button>
                </Tooltip>
            </div>
        </div>
        <div v-if="loading" class="flex justify-center items-center h-full py-8">
            <span class="loading loading-spinner loading-lg" />
        </div>
        <div v-if="roleInfo && roleInfo.roleInfo?.roleShow" class="space-y-3" id="screenshot-container">
            <!-- 角色档案卡 -->
            <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                <div class="flex flex-col items-center gap-4 md:flex-row">
                    <div class="size-20 shrink-0 overflow-hidden rounded-full border border-primary/50 bg-base-content/5 sm:size-24">
                        <img
                            :src="imgRemoteToLocal(roleInfo.roleInfo.roleShow.headUrl)"
                            :alt="roleInfo.roleInfo.roleShow.roleName"
                            class="h-full w-full object-cover object-top"
                        />
                    </div>
                    <div class="min-w-0 flex-1 text-center md:text-left">
                        <h2 class="truncate font-orbitron text-xl font-bold tracking-tight text-base-content">
                            {{ roleInfo.roleInfo.roleShow.roleName }}
                        </h2>
                        <div
                            class="mt-1.5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm text-base-content/60 md:justify-start"
                        >
                            <span
                                >UID: <span class="font-mono tabular-nums">{{ roleInfo.roleInfo.roleShow.roleId }}</span></span
                            >
                            <span class="h-3 w-px bg-base-content/15" aria-hidden="true" />
                            <span
                                >Lv. <span class="font-orbitron tabular-nums">{{ roleInfo.roleInfo.roleShow.level }}</span></span
                            >
                        </div>
                    </div>
                    <div class="flex shrink-0 items-center gap-2 print:hidden">
                        <button
                            type="button"
                            class="inline-flex cursor-pointer items-center gap-1.5 rounded-xs border border-primary bg-primary px-3 py-1.5 text-xs font-semibold text-primary-content transition-colors duration-150 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
                            :disabled="isScreenshotLoading"
                            @click="generateScreenshot"
                        >
                            <Icon v-if="isScreenshotLoading" icon="ri:refresh-line" class="size-3.5 animate-spin" />
                            <Icon v-else icon="ri:screenshot-line" class="size-3.5" />
                            生成截图
                        </button>
                        <button
                            type="button"
                            class="inline-flex cursor-pointer items-center gap-1.5 rounded-xs border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition-colors duration-150 hover:border-primary/60 hover:bg-primary/15 active:scale-[0.97]"
                            @click="syncInventory"
                        >
                            <Icon icon="ri:refresh-line" class="size-3.5" />
                            同步库存
                        </button>
                    </div>
                </div>
            </section>

            <!-- 委托密函 -->
            <section
                v-if="roleInfo.instanceInfo.length > 0"
                class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm print:hidden"
            >
                <SectionHeader no-animate compact kicker="MISSIONS" :title="$t('委托密函')">
                    <template #trailing>
                        <button
                            type="button"
                            class="inline-flex cursor-pointer items-center gap-1 rounded-xs border border-base-content/20 px-2 py-1 text-[11px] text-base-content/60 transition-colors duration-150 hover:border-primary/50 hover:text-primary active:scale-[0.97]"
                            @click="ui.mihanVisible = true"
                        >
                            <Icon icon="ri:settings-3-line" class="size-3.5" />
                            推送设置
                        </button>
                    </template>
                </SectionHeader>
                <div class="flex justify-center">
                    <div class="w-full max-w-4xl space-y-4">
                        <DNAMihanItem :missions="roleInfo.instanceInfo.map(item => item.instances.map(v => v.name)) || []" />
                    </div>
                </div>
            </section>

            <!-- 道具获取周报 -->
            <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                <SectionHeader no-animate compact kicker="WEEKLY REPORT" :title="$t('道具获取周报')">
                    <template #trailing>
                        <div class="flex items-center gap-1.5">
                            <button
                                type="button"
                                class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2.5 py-1 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                                :class="
                                    weeklyReportType === 1
                                        ? 'border-primary bg-primary font-semibold text-primary-content'
                                        : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                                "
                                @click="switchWeeklyReport(1)"
                            >
                                本周
                            </button>
                            <button
                                type="button"
                                class="shrink-0 cursor-pointer whitespace-nowrap rounded-xs border px-2.5 py-1 text-[11px] transition-colors duration-150 active:scale-[0.97]"
                                :class="
                                    weeklyReportType === 2
                                        ? 'border-primary bg-primary font-semibold text-primary-content'
                                        : 'border-base-content/20 text-base-content/60 hover:border-primary/60 hover:text-primary'
                                "
                                @click="switchWeeklyReport(2)"
                            >
                                上周
                            </button>
                        </div>
                    </template>
                </SectionHeader>

                <div v-if="weeklyReportLoading" class="flex justify-center items-center py-8">
                    <span class="loading loading-spinner loading-lg" />
                </div>
                <div v-else-if="weeklyReportError" class="py-8 text-center text-base-content/60">
                    {{ weeklyReportError }}
                </div>
                <div v-else-if="weeklyReport" class="mt-2 space-y-3">
                    <div
                        v-for="category in weeklyReport.categories"
                        :key="`${category.type}-${category.categoryName}`"
                        class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5"
                    >
                        <div class="mb-2 text-[11px] font-semibold tracking-wide text-base-content/60">
                            {{ category.categoryName }}
                        </div>
                        <div class="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-1.5">
                            <ResourceCostItem
                                v-for="item in category.items"
                                :key="item.itemId"
                                class="flex-1 min-w-0"
                                :name="item.itemName"
                                :value="[Number(item.totalNum), item.itemId, 'Resource']"
                            />
                        </div>
                    </div>
                </div>
            </section>

            <!-- 基本信息 -->
            <section v-if="shortNoteInfo" class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                <SectionHeader no-animate compact kicker="BASIC INFO" :title="$t('基本信息')" />
                <div class="mt-2 grid grid-cols-2 gap-1.5 md:grid-cols-4">
                    <div
                        class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                    >
                        <span class="text-xs text-base-content/60">
                            每日任务
                            <span
                                v-if="shortNoteInfo.currentTaskProgress >= shortNoteInfo.maxDailyTaskProgress"
                                class="ml-1 text-[10px] text-base-content/45"
                                >已完成</span
                            >
                        </span>
                        <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">
                            {{ shortNoteInfo.currentTaskProgress }} / {{ shortNoteInfo.maxDailyTaskProgress }}
                        </span>
                    </div>
                    <div
                        class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                    >
                        <span class="text-xs text-base-content/60">
                            迷津奖励
                            <span
                                v-if="shortNoteInfo.rougeLikeRewardCount >= shortNoteInfo.rougeLikeRewardTotal"
                                class="ml-1 text-[10px] text-base-content/45"
                                >已完成</span
                            >
                        </span>
                        <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">
                            {{ shortNoteInfo.rougeLikeRewardCount }} / {{ shortNoteInfo.rougeLikeRewardTotal }}
                        </span>
                    </div>
                    <div
                        class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                    >
                        <span class="text-xs text-base-content/60">
                            竞逐奖励
                            <span v-if="shortNoteInfo.dungeonReward == 0" class="ml-1 text-[10px] text-base-content/45">已完成</span>
                        </span>
                        <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">
                            {{ shortNoteInfo.dungeonRewardTotal - shortNoteInfo.dungeonReward }} /
                            {{ shortNoteInfo.dungeonRewardTotal }}
                        </span>
                    </div>
                    <div
                        class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                    >
                        <span class="text-xs text-base-content/60">
                            周本奖励
                            <span v-if="shortNoteInfo.hardBossRewardCount == 0" class="ml-1 text-[10px] text-base-content/45">已完成</span>
                        </span>
                        <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">
                            {{ shortNoteInfo.hardBossRewardTotal - shortNoteInfo.hardBossRewardCount }} /
                            {{ shortNoteInfo.hardBossRewardTotal }}
                        </span>
                    </div>
                </div>

                <!-- 锻造信息 -->
                <div v-if="shortNoteInfo.draftInfo" class="mt-3 border-t border-base-content/10 pt-3 print:hidden">
                    <div class="space-y-2">
                        <div class="mb-1 text-[11px] font-semibold tracking-wide text-base-content/55">
                            锻造 (<span class="font-orbitron tabular-nums text-primary">{{ shortNoteInfo.draftInfo.draftDoingNum }}</span
                            >)
                        </div>
                        <div
                            v-if="shortNoteInfo.draftInfo.draftDoingInfo && shortNoteInfo.draftInfo.draftDoingInfo.length > 0"
                            class="space-y-2"
                        >
                            <div
                                v-for="(draft, index) in shortNoteInfo.draftInfo.draftDoingInfo"
                                :key="index"
                                class="flex items-start gap-3 rounded-xs border border-base-content/10 bg-base-content/3 p-2.5"
                            >
                                <!-- 产物图片 -->
                                <div class="shrink-0">
                                    <img
                                        :src="getProductImageUrl(getDraftInfo(draft.productId))"
                                        :alt="draft.productName"
                                        class="h-14 w-14 rounded-xs border border-base-content/10 object-cover"
                                    />
                                </div>

                                <!-- 锻造信息 -->
                                <div class="min-w-0 flex-1">
                                    <div class="flex items-start justify-between gap-2">
                                        <h4 class="truncate text-sm font-semibold">{{ draft.productName }}</h4>
                                        <span
                                            class="shrink-0 rounded-xs border border-primary/40 bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-medium tabular-nums text-primary"
                                        >
                                            {{ calculateCompletedNum(draft, getDraftInfo(draft.productId)) }} /
                                            {{ draft.draftCompleteNum + draft.draftDoingNum }}
                                        </span>
                                    </div>

                                    <!-- 进度条 -->
                                    <div class="mt-2">
                                        <div class="h-1.5 w-full overflow-hidden rounded-xs bg-base-content/10">
                                            <div
                                                class="h-full rounded-xs bg-primary transition-all duration-500 ease-out"
                                                :style="{
                                                    width: `${Math.min(100, calculateProgress(draft, getDraftInfo(draft.productId)))}%`,
                                                }"
                                            ></div>
                                        </div>
                                    </div>

                                    <!-- 时间信息 -->
                                    <div class="mt-1.5 flex items-center justify-between gap-2 text-xs">
                                        <span class="text-base-content/55">剩余时间:</span>
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
                        <div
                            v-else
                            class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5 text-center text-sm text-base-content/55"
                        >
                            暂无进行中的锻造
                        </div>
                    </div>
                </div>
            </section>

            <!-- 角色数据 / 成就 -->
            <section
                v-if="roleInfo.roleInfo.roleShow.params.length > 0"
                class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm"
            >
                <SectionHeader no-animate compact kicker="PARAMS" :title="$t('角色数据')" />
                <div class="mt-2 grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-1.5">
                    <div
                        v-for="(p, index) in roleInfo.roleInfo.roleShow.params"
                        :key="index"
                        class="flex flex-col gap-0.5 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                    >
                        <div class="text-xs text-base-content/55">{{ p.paramKey }}</div>
                        <div class="font-orbitron text-[15px] font-semibold tabular-nums text-primary">
                            {{ p.paramValue }}
                        </div>
                    </div>
                </div>
                <div class="mt-1.5 grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-1.5">
                    <div class="flex flex-col gap-0.5 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2">
                        <div class="text-xs text-base-content/55">成就达成</div>
                        <div class="font-orbitron text-[15px] font-semibold tabular-nums text-primary">
                            {{ roleInfo.roleInfo.roleShow.roleAchv?.total }}
                        </div>
                    </div>
                    <div
                        v-if="roleInfo.roleInfo.roleShow.roleAchv"
                        v-for="[k, p] in ['gold', 'silver', 'bronze'].map(v => [
                            v,
                            roleInfo.roleInfo.roleShow.roleAchv[v as keyof typeof roleInfo.roleInfo.roleShow.roleAchv],
                        ])"
                        :key="k"
                        class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                    >
                        <img
                            :src="`/imgs/webp/Icon_Achievement_${{ bronze: 'Copper', silver: 'Silver', gold: 'Gold' }[k]}.webp`"
                            alt="品质"
                            class="size-7"
                        />
                        <span class="font-orbitron text-[15px] font-semibold tabular-nums text-primary">{{ p }}</span>
                    </div>
                </div>
            </section>

            <!-- 角色列表 -->
            <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                <SectionHeader no-animate compact kicker="CHARS" :title="$t('角色')">
                    <template #trailing>
                        <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">
                            {{ roleInfo.roleInfo.roleShow.roleChars.filter(v => v.unLocked).length }}/{{
                                roleInfo.roleInfo.roleShow.roleChars.length
                            }}
                        </span>
                    </template>
                </SectionHeader>
                <div class="mt-2 grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-1.5">
                    <DNACharItem v-for="char in roleInfo.roleInfo.roleShow.roleChars" :key="char.charId" :char="char" />
                </div>
            </section>

            <!-- 远程武器 -->
            <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                <SectionHeader no-animate compact kicker="RANGED" :title="$t('远程武器')">
                    <template #trailing>
                        <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{
                            getWeaponUnlockProgress(roleInfo.roleInfo.roleShow.langRangeWeapons)
                        }}</span>
                    </template>
                </SectionHeader>
                <div class="mt-2 grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-1.5">
                    <DNAWeaponItem
                        v-for="weapon in roleInfo.roleInfo.roleShow.langRangeWeapons"
                        :key="`${weapon.weaponId}-${weapon.weaponEid}`"
                        :weapon="weapon"
                    />
                </div>
            </section>

            <!-- 近战武器 -->
            <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                <SectionHeader no-animate compact kicker="MELEE" :title="$t('近战武器')">
                    <template #trailing>
                        <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{
                            getWeaponUnlockProgress(roleInfo.roleInfo.roleShow.closeWeapons)
                        }}</span>
                    </template>
                </SectionHeader>
                <div class="mt-2 grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-1.5">
                    <DNAWeaponItem
                        v-for="weapon in roleInfo.roleInfo.roleShow.closeWeapons"
                        :key="`${weapon.weaponId}-${weapon.weaponEid}`"
                        :weapon="weapon"
                    />
                </div>
            </section>

            <!-- 迷津 -->
            <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                <SectionHeader no-animate compact kicker="MAZE" :title="$t('迷津')" />
                <div class="mt-2 grid grid-cols-2 gap-1.5 md:grid-cols-4">
                    <div
                        class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                    >
                        <span class="text-xs text-base-content/55">进度</span>
                        <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">
                            {{ ["0", "I", "II", "III", "IV", "V", "VI"][roleInfo.roleInfo.roleShow.rougeLikeInfo.maxPassed >> 4] }}
                        </span>
                    </div>
                    <div
                        class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                    >
                        <span class="text-xs text-base-content/55">本周行迹</span>
                        <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">
                            {{ roleInfo.roleInfo.roleShow.rougeLikeInfo.rewardCount }}
                        </span>
                    </div>
                    <div
                        class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                    >
                        <span class="text-xs text-base-content/55">重置时间</span>
                        <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">
                            {{ ui.timeDistanceFuture(+roleInfo.roleInfo.roleShow.rougeLikeInfo.resetTime * 1000) }}
                        </span>
                    </div>
                </div>

                <div class="mt-1.5 grid grid-cols-2 gap-1.5 md:grid-cols-4">
                    <div
                        v-for="(talent, index) in roleInfo.roleInfo.roleShow.rougeLikeInfo.talentInfo"
                        :key="index"
                        class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                    >
                        <span class="text-xs text-base-content/55">{{ ["技能", "适应", "近战", "远程"][index] }}强化</span>
                        <span class="shrink-0 font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{ talent.cur }}</span>
                    </div>
                </div>
            </section>

            <!-- 深渊 -->
            <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                <SectionHeader no-animate compact kicker="ABYSS" :title="roleInfo.roleInfo.abyssInfo.operaName">
                    <template #trailing>
                        <div class="flex items-center gap-2">
                            <button
                                type="button"
                                class="inline-flex cursor-pointer items-center gap-1.5 rounded-xs border border-primary bg-primary px-2.5 py-1 text-xs font-semibold text-primary-content transition-colors duration-150 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
                                :disabled="!canUploadAbyss || abyssUploading"
                                @click="uploadAbyssUsage"
                            >
                                <Icon v-if="abyssUploading" icon="ri:refresh-line" class="size-3.5 animate-spin" />
                                <Icon v-else icon="ri:upload-2-line" class="size-3.5" />
                                上传
                            </button>
                            <button
                                type="button"
                                class="inline-flex cursor-pointer items-center gap-1.5 rounded-xs border border-base-content/20 px-2.5 py-1 text-xs text-base-content/60 transition-colors duration-150 hover:border-primary/50 hover:text-primary active:scale-[0.97]"
                                @click="openAbyssUsagePage"
                            >
                                <Icon icon="ri:bar-chart-line" class="size-3.5" />
                                统计
                            </button>
                            <span class="hidden text-xs text-base-content/55 tabular-nums sm:inline"
                                >{{ new Date(+roleInfo.roleInfo.abyssInfo.startTime * 1000).toLocaleDateString() }} -
                                {{ new Date(+roleInfo.roleInfo.abyssInfo.endTime * 1000).toLocaleDateString() }}</span
                            >
                        </div>
                    </template>
                </SectionHeader>
                <div class="mt-2 space-y-3">
                    <div class="flex items-center justify-between">
                        <span class="text-xs text-base-content/60">{{
                            roleInfo.roleInfo.abyssInfo.progressName.replace(/null\s+/g, "")
                        }}</span>
                        <span
                            class="inline-flex items-center gap-1 rounded-xs border border-primary/40 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-primary"
                        >
                            <Icon icon="ri:star-line" class="size-3.5" />
                            {{ roleInfo.roleInfo.abyssInfo.stars }}
                        </span>
                    </div>

                    <div class="flex justify-center" style="--spacing: max(0.25rem, calc(1vw / 2))">
                        <div v-if="roleInfo.roleInfo.abyssInfo.bestTimeVo1" class="flex gap-2">
                            <img
                                v-if="roleInfo.roleInfo.abyssInfo.bestTimeVo1.charIcon"
                                :src="imgRemoteToLocal(roleInfo.roleInfo.abyssInfo.bestTimeVo1.charIcon)"
                                alt="角色"
                                class="size-40 object-cover rounded-xs border border-base-content/15 bg-base-content/5"
                            />
                            <div v-else class="size-12 rounded-xs border border-base-content/15 bg-base-content/5" />
                            <div class="flex flex-col items-center gap-2">
                                <img
                                    v-if="roleInfo.roleInfo.abyssInfo.bestTimeVo1.closeWeaponIcon"
                                    :src="imgRemoteToLocal(roleInfo.roleInfo.abyssInfo.bestTimeVo1.closeWeaponIcon)"
                                    alt="近战武器"
                                    class="size-12 object-cover rounded-xs border border-base-content/15 bg-base-content/5"
                                />
                                <div v-else class="size-12 rounded-xs border border-base-content/15 bg-base-content/5" />
                                <img
                                    v-if="roleInfo.roleInfo.abyssInfo.bestTimeVo1.langRangeWeaponIcon"
                                    :src="imgRemoteToLocal(roleInfo.roleInfo.abyssInfo.bestTimeVo1.langRangeWeaponIcon)"
                                    alt="远程武器"
                                    class="size-12 object-cover rounded-xs border border-base-content/15 bg-base-content/5"
                                />
                                <div v-else class="size-12 rounded-xs border border-base-content/15 bg-base-content/5" />
                                <img
                                    v-if="roleInfo.roleInfo.abyssInfo.bestTimeVo1.petIcon"
                                    :src="imgRemoteToLocal(roleInfo.roleInfo.abyssInfo.bestTimeVo1.petIcon)"
                                    alt="魔灵"
                                    class="size-12 object-cover rounded-xs border border-base-content/15 bg-base-content/5"
                                />
                                <div v-else class="size-12 rounded-xs border border-base-content/15 bg-base-content/5" />
                            </div>
                            <div class="flex flex-col gap-2">
                                <img
                                    v-if="roleInfo.roleInfo.abyssInfo.bestTimeVo1.phantomCharIcon1"
                                    :src="imgRemoteToLocal(roleInfo.roleInfo.abyssInfo.bestTimeVo1.phantomCharIcon1)"
                                    alt="协战角色1"
                                    class="size-19 object-cover rounded-xs border border-base-content/15 bg-base-content/5"
                                />
                                <div v-else class="size-12 rounded-xs border border-base-content/15 bg-base-content/5" />
                                <img
                                    v-if="roleInfo.roleInfo.abyssInfo.bestTimeVo1.phantomCharIcon2"
                                    :src="imgRemoteToLocal(roleInfo.roleInfo.abyssInfo.bestTimeVo1.phantomCharIcon2)"
                                    alt="协战角色2"
                                    class="size-19 object-cover rounded-xs border border-base-content/15 bg-base-content/5"
                                />
                                <div v-else class="size-12 rounded-xs border border-base-content/15 bg-base-content/5" />
                            </div>
                            <div class="flex flex-col gap-2">
                                <img
                                    v-if="roleInfo.roleInfo.abyssInfo.bestTimeVo1.phantomWeaponIcon1"
                                    :src="imgRemoteToLocal(roleInfo.roleInfo.abyssInfo.bestTimeVo1.phantomWeaponIcon1)"
                                    alt="协战武器1"
                                    class="size-19 object-cover rounded-xs border border-base-content/15 bg-base-content/5"
                                />
                                <div v-else class="size-12 rounded-xs border border-base-content/15 bg-base-content/5" />
                                <img
                                    v-if="roleInfo.roleInfo.abyssInfo.bestTimeVo1.phantomWeaponIcon2"
                                    :src="imgRemoteToLocal(roleInfo.roleInfo.abyssInfo.bestTimeVo1.phantomWeaponIcon2)"
                                    alt="协战武器2"
                                    class="size-19 object-cover rounded-xs border border-base-content/15 bg-base-content/5"
                                />
                                <div v-else class="size-12 rounded-xs border border-base-content/15 bg-base-content/5" />
                            </div>
                        </div>
                        <span v-else class="text-sm text-base-content/50">暂无数据</span>
                    </div>
                </div>
            </section>
        </div>
        <div v-else-if="!loading" class="flex justify-center items-center h-full">
            <div class="text-center">
                <p class="text-sm text-base-content/60 mb-4">暂无游戏信息数据</p>
            </div>
        </div>
    </div>

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
