<script setup lang="ts">
import { useLocalStorage } from "@vueuse/core"
import { DNAAPI, DNAGameSignInDayAward, DNAGameSignInShowDataBean, DNAUserTaskProcessEntity } from "dna-api"
import { computed, onMounted, ref } from "vue"
import { canSignToday as checkCanSignToday, executeSignFlow, getFirstUnsignedDay } from "@/api/dna-sign"
import { useSettingStore } from "@/store/setting"
import { useUIStore } from "@/store/ui"

defineProps<{
    nobtn?: boolean
}>()
const setting = useSettingStore()
const ui = useUIStore()

let api: DNAAPI

const loading = ref(true)
const signing = ref(false)

const calendarData = useLocalStorage<DNAGameSignInShowDataBean>("dna.sign.calendarData", {} as any)
const taskProcess = useLocalStorage<DNAUserTaskProcessEntity>("dna.sign.taskProcess", {} as any)
const lastUpdateTime = useLocalStorage("dna.sign.lastUpdateTime", 0)

const errorMessage = ref("")

onMounted(async () => {
    const t = await setting.getDNAAPI()
    if (!t) {
        errorMessage.value = "请先登录"
        loading.value = false
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
        errorMessage.value = ""

        await Promise.all([loadCalendarData(), loadTaskProcess()])
        lastUpdateTime.value = ui.timeNow
    } catch (e) {
        errorMessage.value = "加载数据失败"
        ui.showErrorMessage("加载数据失败:", e)
    } finally {
        loading.value = false
    }
}

async function loadCalendarData() {
    try {
        const res = await api.signCalendar()
        if (res.is_success && res.data) {
            calendarData.value = res.data
        } else {
            ui.showErrorMessage(res.msg || "获取签到日历失败")
        }
    } catch (e) {
        ui.showErrorMessage("获取签到日历失败:", e)
    }
}

async function loadTaskProcess() {
    try {
        const res = await api.getTaskProcess()
        if (res.is_success && res.data) {
            taskProcess.value = res.data
        } else {
            ui.showErrorMessage(res.msg || "获取任务进度失败")
        }
    } catch (e) {
        ui.showErrorMessage("获取任务进度失败:", e)
    }
}

async function handleSign() {
    try {
        signing.value = true
        await executeSignFlow(api)
        await loadData(true)
    } finally {
        signing.value = false
    }
}

const canSignToday = computed(() => {
    return checkCanSignToday(calendarData.value || {}) && firstUnsignedDay.value !== null
})

const calendarDays = computed(() => {
    if (!calendarData.value) return []

    const totalDays = calendarData.value.period.overDays
    const today = new Date().getDate()
    const awardMap = new Map<number, DNAGameSignInDayAward>()
    const signedCount = calendarData.value.signinTime || 0
    const todaySignin = calendarData.value.todaySignin || false
    const maybeSignedDays = signedCount + (todaySignin ? 0 : 1)
    const missedCount = today - maybeSignedDays

    calendarData.value.dayAward.forEach(award => {
        awardMap.set(award.dayInPeriod, award)
    })

    return Array.from({ length: totalDays }, (_, index) => {
        const day = index + 1
        const award = awardMap.get(day)
        const isSigned = day <= signedCount
        const isNextToSign = day === maybeSignedDays
        const isMissed = !isSigned && totalDays - day < missedCount

        return {
            day,
            award,
            isSigned,
            isNextToSign,
            isMissed,
            awardNum: award?.awardNum || 0,
            awardName: award?.awardName || "",
            iconUrl: award?.iconUrl || "",
        }
    })
})

const signedDaysCount = computed(() => {
    const signedCount = calendarData.value?.signinTime || 0
    const todaySignin = calendarData.value?.todaySignin || false
    return signedCount + (todaySignin ? 0 : 1)
})

const firstUnsignedDay = computed(() => {
    return getFirstUnsignedDay(calendarData.value || {})
})

defineExpose({
    loadData,
    lastUpdateTime,
})

const isSignFinished = computed(() => {
    if (canSignToday.value) return false
    return !taskProcess.value.dailyTask.some(task => task.completeTimes < task.times)
})
</script>
<template>
    <div class="space-y-3">
        <div v-if="!nobtn" class="flex justify-between items-center">
            <span class="text-xs tracking-wide text-base-content/50">最后更新: {{ ui.timeDistancePassed(lastUpdateTime) }}</span>
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
        <div v-if="loading" class="flex justify-center items-center h-64">
            <span class="loading loading-spinner loading-lg" />
        </div>

        <div v-else-if="errorMessage" class="flex flex-col items-center justify-center h-64">
            <p class="text-sm mb-4 text-error">
                {{ errorMessage }}
            </p>
            <button
                type="button"
                class="cursor-pointer rounded-xs border border-primary bg-primary px-3 py-1.5 text-xs font-semibold text-primary-content transition-colors duration-150 active:scale-[0.97]"
                @click="loadData(true)"
            >
                重试
            </button>
        </div>

        <div v-else class="space-y-3">
            <!-- 签到日历 -->
            <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                <SectionHeader no-animate compact kicker="SIGN-IN" :title="$t('签到日历')" />
                <div v-if="calendarData?.period" class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                    <div class="flex items-center gap-2 text-xs text-base-content/55">
                        <span>周期:</span>
                        <span class="font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{ calendarData.period.name }}</span>
                    </div>
                    <div class="flex items-center gap-2 text-xs text-base-content/55">
                        <span>已签到:</span>
                        <span class="font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{ signedDaysCount }} 天</span>
                    </div>
                    <div class="flex items-center gap-3">
                        <!-- 自动签到开关 -->
                        <div class="flex items-center gap-2">
                            <span class="text-xs text-base-content/60">自动签到</span>
                            <input
                                type="checkbox"
                                class="toggle toggle-primary toggle-sm"
                                :checked="setting.autoSign"
                                @change="setting.setAutoSign(($event.target as HTMLInputElement)!.checked)"
                            />
                        </div>

                        <button
                            v-if="!isSignFinished"
                            type="button"
                            class="inline-flex cursor-pointer items-center gap-1.5 rounded-xs border border-primary bg-primary px-3 py-1.5 text-xs font-semibold text-primary-content transition-colors duration-150 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
                            :disabled="signing"
                            @click="handleSign()"
                        >
                            <Icon v-if="signing" icon="ri:refresh-line" class="size-4 animate-spin" />
                            <Icon v-else icon="ri:checkbox-circle-fill" class="size-4" />
                            签到
                        </button>
                        <span
                            v-else-if="calendarData.todaySignin"
                            class="rounded-xs border border-primary/40 bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary"
                            >今日已签到</span
                        >
                    </div>
                </div>

                <div v-if="calendarData?.period" class="mt-3 space-y-3">
                    <!-- 角色信息行 -->
                    <div class="flex items-center justify-between gap-3 rounded-xs border border-base-content/10 bg-base-content/3 p-2.5">
                        <div class="flex items-center gap-2.5">
                            <img :src="calendarData.roleInfo.headUrl" alt="角色头像" class="h-10 w-10 rounded-full border border-base-content/15 object-cover" />
                            <div>
                                <div class="text-sm font-semibold">
                                    {{ calendarData.roleInfo.roleName }}
                                </div>
                                <div class="text-xs text-base-content/55">Lv. {{ calendarData.roleInfo.level }}</div>
                            </div>
                        </div>
                        <div class="text-right">
                            <div class="text-xs text-base-content/55">金币</div>
                            <div class="font-orbitron text-lg font-semibold tabular-nums text-primary">
                                {{ calendarData.userGoldNum }}
                            </div>
                        </div>
                    </div>

                    <div class="h-px bg-base-content/10" />

                    <!-- 签到日历网格 -->
                    <div class="grid grid-cols-7 gap-1.5">
                        <div
                            v-for="dayInfo in calendarDays"
                            :key="dayInfo.day"
                            class="flex aspect-square flex-col items-center justify-center gap-0.5 rounded-xs border p-1 transition-colors duration-200"
                            :class="{
                                'border-primary/70 bg-primary/10 text-primary': dayInfo.isSigned,
                                'border-base-content/10 bg-base-content/5 text-base-content/35': dayInfo.isMissed,
                                'border-primary/60 ring-1 ring-primary': dayInfo.isNextToSign,
                                'border-base-content/10 bg-base-content/3 text-base-content/75': !dayInfo.isSigned,
                            }"
                        >
                            <div class="font-orbitron text-sm font-semibold tabular-nums">
                                {{ dayInfo.day }}
                            </div>
                            <div class="flex flex-col items-center gap-0.5">
                                <img v-if="dayInfo.iconUrl" :src="dayInfo.iconUrl" :alt="dayInfo.awardName" class="size-8 object-contain" />
                                <div class="text-[10px] tabular-nums">
                                    {{ dayInfo.awardNum }}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <!-- 任务进度 -->
            <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                <SectionHeader no-animate compact kicker="TASKS" :title="$t('任务进度')" />

                <div v-if="taskProcess && taskProcess.dailyTask.length > 0" class="mt-2 space-y-2">
                    <div v-for="(task, index) in taskProcess.dailyTask" :key="index" class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5">
                        <div class="flex items-center justify-between gap-2">
                            <div class="truncate text-sm font-medium">
                                {{ task.remark }}
                            </div>
                            <div class="shrink-0 text-xs text-base-content/55">
                                <span>进度:</span>
                                <span class="font-orbitron text-[13px] font-semibold tabular-nums text-primary">{{ task.completeTimes }}/{{ task.times }}</span>
                            </div>
                        </div>

                        <progress class="progress progress-primary mt-2 h-1.5 w-full" :value="task.completeTimes" :max="task.times" />

                        <div class="mt-2 flex items-center justify-between gap-2 text-xs">
                            <div class="text-base-content/55">
                                <span class="mr-4 tabular-nums">经验: +{{ task.gainExp }}</span>
                                <span class="tabular-nums">金币: +{{ task.gainGold }}</span>
                            </div>
                            <span
                                class="shrink-0 rounded-xs border px-2 py-0.5 text-[11px] font-medium"
                                :class="
                                    task.completeTimes >= task.times
                                        ? 'border-success/40 bg-success/10 text-success'
                                        : 'border-warning/40 bg-warning/10 text-warning'
                                "
                            >
                                {{ task.completeTimes >= task.times ? "已完成" : "进行中" }}
                            </span>
                        </div>
                    </div>
                </div>

                <div v-else class="flex flex-col items-center justify-center py-8">
                    <p class="text-base-content/55">暂无任务数据</p>
                </div>
            </section>
        </div>
    </div>
</template>
