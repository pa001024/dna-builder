<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from "vue"
import { meQuery, myShopSummaryQuery, type UserShopSummary, updateUserMetaMutation } from "@/api/graphql"
import { useAuthStore } from "@/store/auth"
import { useUIStore } from "@/store/ui"
import { useUserStore } from "@/store/user"
import { getUserLevelProgress } from "@/utils/user-level"

const user = useUserStore()
const ui = useUIStore()
const auth = useAuthStore()

// 登录/注册/重置密码弹窗由全局的 LoginDialog 承载（见 store/auth.ts），这里只负责拉起

const nameEdit = reactive({
    active: false,
    name: "",
})

const levelProgress = computed(() => getUserLevelProgress(user.experience, user.level))

type MeQueryResult = NonNullable<Awaited<ReturnType<typeof meQuery>>>

const dailyExperienceStatus = ref<MeQueryResult["dailyExperienceStatus"] | null>(null)
const abyssUsageUploadStatus = ref<MeQueryResult["abyssUsageUploadStatus"] | null>(null)

/**
 * @description 将进度数值裁剪到安全范围，供 tooltip 进度条使用。
 * @param current 当前进度。
 * @param total 总量。
 * @returns 归一化后的进度值。
 */
function clampProgress(current: number | null | undefined, total: number | null | undefined): number {
    const safeTotal = Math.max(1, total ?? 0)
    const safeCurrent = Math.max(0, current ?? 0)
    return Math.min(safeCurrent, safeTotal)
}

/**
 * @description 拉取当前用户每日经验状态，用于等级提示 tooltip。
 */
async function refreshDailyExperienceStatus(): Promise<void> {
    if (!user.jwtToken) {
        dailyExperienceStatus.value = null
        return
    }

    try {
        dailyExperienceStatus.value = (await refreshMeStatus())?.dailyExperienceStatus ?? null
    } catch (error) {
        console.error("拉取每日经验状态失败:", error)
        dailyExperienceStatus.value = null
    }
}

/**
 * @description 拉取当前用户本赛季深渊上传状态，用于设置页 tooltip 展示。
 */
async function refreshAbyssUsageUploadStatus(): Promise<void> {
    if (!user.jwtToken) {
        abyssUsageUploadStatus.value = null
        return
    }

    try {
        abyssUsageUploadStatus.value = (await refreshMeStatus())?.abyssUsageUploadStatus ?? null
    } catch (error) {
        console.error("拉取深渊上传状态失败:", error)
        abyssUsageUploadStatus.value = null
    }
}

/**
 * @description 拉取一次当前用户资料，供多个设置项复用。
 * @returns 当前用户资料；失败时抛出错误。
 */
async function refreshMeStatus(): Promise<MeQueryResult | null> {
    if (!user.jwtToken) {
        return null
    }

    return (await meQuery(undefined, { requestPolicy: "network-only" })) ?? null
}

/**
 * @description 将毫秒格式化为便于展示的剩余时间文本。
 * @param ms 剩余等待毫秒数。
 * @returns 格式化后的中文文本。
 */
function formatRemainingDuration(ms: number | null | undefined): string {
    if (!ms || ms <= 0) {
        return ""
    }

    const totalSeconds = Math.ceil(ms / 1000)
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60
    const parts: string[] = []

    if (hours > 0) parts.push(`${hours}小时`)
    if (minutes > 0) parts.push(`${minutes}分钟`)
    if (seconds > 0 && hours === 0) parts.push(`${seconds}秒`)

    return parts.join("") || "1分钟内"
}

const shopSummary = ref<UserShopSummary | null>(null)
const loadingShopSummary = ref(false)

/**
 * 拉取当前用户的积分与装扮摘要，用于在账号设置区做轻量信息展示与入口引导。
 */
async function refreshShopSummary(): Promise<void> {
    if (!user.jwtToken) {
        shopSummary.value = null
        return
    }

    loadingShopSummary.value = true
    try {
        const result = await myShopSummaryQuery(undefined, { requestPolicy: "network-only" })
        shopSummary.value = result ?? null
    } catch (error) {
        console.error("拉取积分/装扮摘要失败:", error)
        ui.showErrorMessage("积分信息暂不可用，请稍后重试")
        shopSummary.value = null
    } finally {
        loadingShopSummary.value = false
    }
}

watch(
    () => user.jwtToken,
    () => {
        refreshShopSummary()
        refreshDailyExperienceStatus()
        refreshAbyssUsageUploadStatus()
    },
    { immediate: true }
)

// 退出登录
const handleLogout = async () => {
    if (await ui.showDialog("确认退出", "确定要退出当前账号吗？")) {
        user.clearProfile()
        user.jwtToken = ""
        ui.showSuccessMessage("已退出登录")
    }
}

const nameInput = ref<HTMLInputElement>()

/**
 * @description 切换昵称编辑状态；编辑态使用普通输入框，避免 contenteditable 逐字回写导致反向输入。
 */
async function startNameEdit() {
    if (nameEdit.active) {
        nameEdit.active = false
        const result = await updateUserMetaMutation({ data: { name: nameEdit.name } })
        if (result?.success && result.token) {
            user.jwtToken = result.token
        } else {
            nameEdit.name = user.name || "用户"
        }
    } else {
        nameEdit.active = true
        nameEdit.name = user.name || "用户"
        await nextTick()
        const input = nameInput.value!
        input.focus()
        input.select()
    }
}
</script>

<template>
    <div class="flex flex-col gap-3">
        <!-- 账号信息 -->
        <div>
            <div v-if="user.jwtToken" class="flex flex-col gap-3">
                <!-- 已登录状态 -->
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-3">
                        <div class="flex-none">
                            <QQAvatar v-if="user.qq" :qq="user.qq" :name="user.name!" class="size-12 rounded-xs" />
                        </div>
                        <h1 class="text-lg font-semibold flex gap-2 items-center">
                            <div>
                                <div class="font-semibold text-base-content">
                                    <input
                                        v-if="nameEdit.active"
                                        ref="nameInput"
                                        v-model="nameEdit.name"
                                        type="text"
                                        class="h-auto min-h-0 w-auto max-w-64 font-semibold rounded-none border-b border-base-content/20 bg-transparent px-0.5 pb-1 text-[13px] text-base-content outline-none transition-colors duration-150 placeholder:text-base-content/30 focus:border-primary"
                                    />
                                    <span v-else>
                                        {{ user.name || "用户" }}
                                    </span>
                                    <button class="btn btn-ghost btn-square btn-sm" @click="startNameEdit">
                                        <Icon v-if="nameEdit.active" icon="radix-icons:check" class="size-4" />
                                        <Icon v-else icon="ri:edit-line" class="size-4" />
                                    </button>
                                </div>
                                <div class="text-sm text-base-content/60">{{ user.email || "" }}</div>
                            </div>
                        </h1>
                    </div>
                    <div class="ml-auto flex items-center gap-2">
                        <button v-if="user.roles.includes('admin')" class="btn btn-sm btn-outline" @click="$router.push('/admin')">
                            {{ $t('dob-account.manage') }}
                        </button>
                        <button class="btn btn-sm btn-outline btn-error" @click="handleLogout">{{ $t('dob-account.logout') }}</button>
                    </div>
                </div>
                <!-- 用户详细信息 -->
                <div class="text-sm space-y-1 pt-2 border-t border-base-content/10">
                    <div class="mb-2">
                        <div class="flex items-center justify-between text-sm">
                            <span class="font-medium inline-flex items-center gap-1.5">
                                <span
                                    >{{ $t('common.level') }}
                                    <b class="font-orbitron text-[13px] font-semibold text-primary">Lv.{{ user.level }}</b></span
                                >
                                <FullTooltip side="bottom">
                                    <button type="button" class="inline-flex text-base-content/50 hover:text-base-content/80">
                                        <Icon icon="ri:question-line" class="size-4" />
                                    </button>
                                    <template #tooltip>
                                        <div class="w-72 space-y-2 text-xs leading-5 text-base-content">
                                            <div class="font-semibold">{{ $t('dob-account.daily_exp_progress') }}</div>
                                            <div v-if="dailyExperienceStatus" class="space-y-2">
                                                <div class="flex items-center justify-between gap-3">
                                                    <span>{{ $t('dob-account.earned_today') }}</span>
                                                    <span class="tabular-nums">
                                                        {{ dailyExperienceStatus.todayAwardedExp }}/{{
                                                            dailyExperienceStatus.totalAvailableExp
                                                        }}
                                                    </span>
                                                </div>
                                                <progress
                                                    class="progress progress-primary w-full h-2"
                                                    :value="dailyExperienceStatus.todayAwardedExp"
                                                    :max="dailyExperienceStatus.totalAvailableExp"
                                                />
                                                <div class="border-t border-base-content/10 pt-2 space-y-2">
                                                    <div class="space-y-1">
                                                        <div class="flex items-center justify-between gap-3">
                                                            <span>{{ $t('dob-account.task_open_app') }}</span>
                                                            <span class="tabular-nums">
                                                                {{
                                                                    clampProgress(
                                                                        dailyExperienceStatus.dailyLaunchProgress,
                                                                        dailyExperienceStatus.dailyLaunchLimit
                                                                    )
                                                                }}/{{ dailyExperienceStatus.dailyLaunchLimit }}
                                                            </span>
                                                        </div>
                                                        <progress
                                                            class="progress progress-secondary w-full h-2"
                                                            :value="
                                                                clampProgress(
                                                                    dailyExperienceStatus.dailyLaunchProgress,
                                                                    dailyExperienceStatus.dailyLaunchLimit
                                                                )
                                                            "
                                                            :max="dailyExperienceStatus.dailyLaunchLimit"
                                                        />
                                                    </div>
                                                    <div class="space-y-1">
                                                        <div class="flex items-center justify-between gap-3">
                                                            <span>{{ $t('dob-account.task_online_1h') }}</span>
                                                            <span class="tabular-nums">
                                                                {{
                                                                    clampProgress(
                                                                        dailyExperienceStatus.dailyOnlineHourProgress,
                                                                        dailyExperienceStatus.dailyOnlineHourLimit
                                                                    )
                                                                }}/{{ dailyExperienceStatus.dailyOnlineHourLimit }}
                                                            </span>
                                                        </div>
                                                        <progress
                                                            class="progress progress-secondary w-full h-2"
                                                            :value="
                                                                clampProgress(
                                                                    dailyExperienceStatus.dailyOnlineHourProgress,
                                                                    dailyExperienceStatus.dailyOnlineHourLimit
                                                                )
                                                            "
                                                            :max="dailyExperienceStatus.dailyOnlineHourLimit"
                                                        />
                                                        <div
                                                            v-if="
                                                                (dailyExperienceStatus.dailyOnlineHourProgress ?? 0) <
                                                                (dailyExperienceStatus.dailyOnlineHourLimit ?? 1)
                                                            "
                                                            class="text-[11px] text-base-content/50"
                                                        >
                                                            <span
                                                                v-if="
                                                                    formatRemainingDuration(
                                                                        dailyExperienceStatus.dailyOnlineHourRetryAfterMs
                                                                    )
                                                                "
                                                            >
                                                                还需
                                                                {{
                                                                    formatRemainingDuration(
                                                                        dailyExperienceStatus.dailyOnlineHourRetryAfterMs
                                                                    )
                                                                }}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div class="space-y-1">
                                                        <div class="flex items-center justify-between gap-3">
                                                            <span>{{ $t('dob-account.task_first_chat') }}</span>
                                                            <span class="tabular-nums">
                                                                {{
                                                                    clampProgress(
                                                                        dailyExperienceStatus.dailyMessageProgress,
                                                                        dailyExperienceStatus.dailyMessageLimit
                                                                    )
                                                                }}/{{ dailyExperienceStatus.dailyMessageLimit }}
                                                            </span>
                                                        </div>
                                                        <progress
                                                            class="progress progress-secondary w-full h-2"
                                                            :value="
                                                                clampProgress(
                                                                    dailyExperienceStatus.dailyMessageProgress,
                                                                    dailyExperienceStatus.dailyMessageLimit
                                                                )
                                                            "
                                                            :max="dailyExperienceStatus.dailyMessageLimit"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                            <div v-else class="text-base-content/60">{{ $t('dob-account.progress_unavailable') }}</div>
                                            <div class="border-t border-base-content/10 pt-2 space-y-2">
                                                <div class="flex items-center justify-between gap-3">
                                                    <span>{{ $t('dob-account.task_abyss_upload') }}</span>
                                                    <span class="tabular-nums">
                                                        {{ abyssUsageUploadStatus?.uploadedThisSeason ? "1/1" : "0/1" }}
                                                    </span>
                                                </div>
                                                <progress
                                                    class="progress progress-primary w-full h-2"
                                                    :value="abyssUsageUploadStatus?.uploadedThisSeason ? 1 : 0"
                                                    :max="1"
                                                />
                                            </div>
                                        </div>
                                    </template>
                                </FullTooltip>
                            </span>
                            <span class="text-base-content/60"
                                ><b class="font-orbitron text-[13px] font-semibold text-primary">{{ user.experience }}</b> {{ $t('dob-account.total_exp') }}</span
                            >
                        </div>
                        <progress
                            class="progress progress-primary w-full mt-2"
                            :value="levelProgress.currentLevelExp"
                            :max="levelProgress.requiredExp"
                        />
                        <div class="text-xs text-base-content/60 mt-1 flex justify-between">
                            <span>{{ $t('dob-account.level_exp', { current: levelProgress.currentLevelExp, required: levelProgress.requiredExp }) }}</span>
                            <span>{{ $t('dob-account.exp_to_level_up', { value: levelProgress.requiredExp - levelProgress.currentLevelExp }) }}</span>
                        </div>
                    </div>
                    <div v-if="user.qq" class="flex justify-between">
                        <span class="text-base-content/60">{{ $t('dob-account.qq') }}</span>
                        <span>{{ user.qq }}</span>
                    </div>
                    <div v-if="user.roles && user.roles.length" class="flex justify-between items-center">
                        <span class="text-base-content/60">{{ $t('dob-account.roles') }}</span>
                        <span class="flex flex-wrap justify-end gap-1">
                            <span
                                v-for="role in user.roles"
                                :key="role"
                                class="rounded-xs border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
                                >{{ role }}</span
                            >
                        </span>
                    </div>
                </div>

                <!-- 积分/装扮摘要 -->
                <div class="pt-3 border-t border-base-content/10">
                    <div class="flex items-center justify-between">
                        <div class="text-sm font-medium">积分与装扮</div>
                        <span v-if="loadingShopSummary" class="loading loading-spinner loading-xs" />
                    </div>
                    <div class="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div class="rounded-xs border border-base-content/10 bg-base-content/3 p-3">
                            <div class="text-xs text-base-content/60">积分余额</div>
                            <div class="font-orbitron text-2xl font-semibold leading-tight tabular-nums text-primary">
                                {{ shopSummary?.points ?? "--" }}
                            </div>
                            <div class="text-xs text-base-content/50 mt-1">用于兑换称号、名字特效等装扮</div>
                        </div>
                        <div class="rounded-xs border border-base-content/10 bg-base-content/3 p-3">
                            <div class="text-xs text-base-content/60">{{ $t('dob-account.current_appearance') }}</div>
                            <div class="mt-1 text-sm space-y-1">
                                <div class="flex justify-between gap-2">
                                    <span class="text-base-content/60">{{ $t('title-frame-label.title') }}</span>
                                    <span class="truncate">
                                        {{ shopSummary?.selectedTitleAsset?.rewardName || $t('common.default') }}
                                    </span>
                                </div>
                                <div class="flex justify-between gap-2">
                                    <span class="text-base-content/60">{{ $t('points-mall.rewardType.nameCard') }}</span>
                                    <span class="truncate">
                                        {{ shopSummary?.selectedNameCardAsset?.rewardName || $t('common.default') }}
                                    </span>
                                </div>
                            </div>
                            <button class="btn btn-sm btn-primary w-full mt-2" @click="$router.push('/points-mall')">{{ $t('dob-account.go_points_mall') }}</button>
                        </div>
                    </div>
                </div>
            </div>
            <!-- 未登录状态 -->
            <div v-else class="rounded-xs border border-base-content/10 bg-base-content/3 px-3 py-5 text-center">
                <div class="text-base-content/60 mb-3">{{ $t('dob-account.not_logged_in') }}</div>
                <button class="btn btn-primary px-12 mx-2" @click="auth.openLogin()">{{ $t('dob-account.login') }}</button>
                <button class="btn btn-primary px-12 mx-2" @click="auth.openRegister()">{{ $t('dob-account.register') }}</button>
            </div>
        </div>

        <!-- 功能说明 -->
        <div class="border-t border-base-content/10 pt-2.5 text-xs text-base-content/45">
            <p>{{ $t('dob-account.account_desc') }}</p>
        </div>

    </div>
</template>
