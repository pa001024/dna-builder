<script setup lang="ts">
import { useLocalStorage } from "@vueuse/core"
import { DNAAPI, DNAGameSignInDayAward, DNAGameSignInShowDataBean, DNAUserTaskProcessEntity } from "dna-api"
import { computed, onMounted, ref } from "vue"
import { canSignToday as checkCanSignToday, executeSignFlow, getFirstUnsignedDay } from "../api/dna-sign"
import { useSettingStore } from "../store/setting"
import { useUIStore } from "../store/ui"

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
    <div class="space-y-6">
        <div v-if="!nobtn" class="flex justify-between items-center">
            <span class="text-xs text-gray-500">最后更新: {{ ui.timeDistancePassed(lastUpdateTime) }}</span>
            <Tooltip tooltip="刷新" side="bottom">
                <button class="btn btn-primary btn-square btn-sm" @click="loadData(true)">
                    <Icon icon="ri:refresh-line" />
                </button>
            </Tooltip>
        </div>
        <div v-if="loading" class="flex justify-center items-center h-64">
            <span class="loading loading-spinner loading-lg" />
        </div>

        <div v-else-if="errorMessage" class="flex flex-col items-center justify-center h-64">
            <p class="text-lg mb-4 text-error">
                {{ errorMessage }}
            </p>
            <button class="btn btn-primary" @click="loadData(true)">重试</button>
        </div>

        <div v-else class="space-y-6">
            <div class="card bg-base-100 shadow-xl">
                <div class="card-body">
                    <h3 class="card-title mb-4">签到日历</h3>
                    <div v-if="calendarData?.period" class="flex items-center justify-between">
                        <div class="text-sm">
                            <span class="text-base-content/70">周期:</span>
                            <span class="font-bold ml-2">{{ calendarData.period.name }}</span>
                        </div>
                        <div class="text-sm">
                            <span class="text-base-content/70">已签到:</span>
                            <span class="font-bold ml-2">{{ signedDaysCount }} 天</span>
                        </div>
                        <div class="flex items-center gap-3">
                            <!-- 自动签到开关 -->
                            <div class="flex items-center gap-2">
                                <span class="text-sm">自动签到</span>
                                <input
                                    type="checkbox"
                                    class="toggle toggle-primary"
                                    :model-value="setting.autoSign"
                                    @update:model-value="setting.setAutoSign($event)"
                                />
                            </div>

                            <button
                                v-if="!isSignFinished"
                                class="btn btn-primary"
                                :class="{ loading: signing }"
                                :disabled="signing"
                                @click="handleSign()"
                            >
                                <Icon icon="ri:checkbox-circle-fill" />
                                签到
                            </button>
                            <div v-else-if="calendarData.todaySignin" class="badge badge-success">今日已签到</div>
                        </div>
                    </div>

                    <div v-if="calendarData?.period" class="space-y-4">
                        <div class="flex items-center justify-between p-4 bg-base-200 rounded-lg">
                            <div class="flex items-center gap-4">
                                <img :src="calendarData.roleInfo.headUrl" alt="角色头像" class="w-12 h-12 rounded-full" />
                                <div>
                                    <div class="font-bold">
                                        {{ calendarData.roleInfo.roleName }}
                                    </div>
                                    <div class="text-sm text-base-content/70">Lv. {{ calendarData.roleInfo.level }}</div>
                                </div>
                            </div>
                            <div class="text-right">
                                <div class="text-sm text-base-content/70">金币</div>
                                <div class="font-bold text-xl">
                                    {{ calendarData.userGoldNum }}
                                </div>
                            </div>
                        </div>

                        <div class="divider mx-2" />

                        <div class="grid grid-cols-7 gap-2">
                            <div
                                v-for="dayInfo in calendarDays"
                                :key="dayInfo.day"
                                class="aspect-square flex flex-col items-center justify-center rounded-lg p-2 transition-colors"
                                :class="{
                                    'bg-primary/50 text-primary-content': dayInfo.isSigned,
                                    'bg-base-300 opacity-70': dayInfo.isMissed,
                                    'ring-2 ring-primary': dayInfo.isNextToSign,
                                    'bg-base-200': !dayInfo.isSigned,
                                }"
                            >
                                <div class="text-sm font-bold">
                                    {{ dayInfo.day }}
                                </div>
                                <div class="flex flex-col items-center gap-1">
                                    <img
                                        v-if="dayInfo.iconUrl"
                                        :src="dayInfo.iconUrl"
                                        :alt="dayInfo.awardName"
                                        class="size-12 object-contain"
                                    />
                                    <div class="text-xs">
                                        {{ dayInfo.awardNum }}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="card bg-base-100 shadow-xl">
                <div class="card-body">
                    <h3 class="card-title mb-4">任务进度</h3>

                    <div v-if="taskProcess && taskProcess.dailyTask.length > 0" class="space-y-4">
                        <div v-for="(task, index) in taskProcess.dailyTask" :key="index" class="bg-base-200 p-4 rounded-lg">
                            <div class="flex items-center justify-between mb-2">
                                <div class="font-medium">
                                    {{ task.remark }}
                                </div>
                                <div class="text-sm">
                                    <span class="text-base-content/70">进度:</span>
                                    <span class="font-bold ml-1">{{ task.completeTimes }}/{{ task.times }}</span>
                                </div>
                            </div>

                            <progress class="progress progress-primary w-full" :value="task.completeTimes" :max="task.times" />

                            <div class="flex items-center justify-between mt-2 text-sm">
                                <div class="text-base-content/70">
                                    <span class="mr-4">经验: +{{ task.gainExp }}</span>
                                    <span>金币: +{{ task.gainGold }}</span>
                                </div>
                                <div
                                    class="badge"
                                    :class="{
                                        'badge-success': task.completeTimes >= task.times,
                                        'badge-warning': task.completeTimes < task.times,
                                    }"
                                >
                                    {{ task.completeTimes >= task.times ? "已完成" : "进行中" }}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div v-else class="flex flex-col items-center justify-center py-8">
                        <p class="text-base-content/70">暂无任务数据</p>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
