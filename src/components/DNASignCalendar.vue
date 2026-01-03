<script setup lang="ts">
import { ref, onMounted, computed } from "vue"
import { DNAAPI, DNACalendarSignRes, DNATaskProcessRes, DNADayAward } from "dna-api"
import { useSettingStore } from "../store/setting"
import { useUIStore } from "../store/ui"

const setting = useSettingStore()
const ui = useUIStore()

let api: DNAAPI

const loading = ref(true)
const signing = ref(false)
const bbsSigning = ref(false)

const calendarData = ref<DNACalendarSignRes | null>(null)
const taskProcess = ref<DNATaskProcessRes | null>(null)

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

async function loadData() {
    try {
        loading.value = true
        errorMessage.value = ""

        await Promise.all([loadCalendarData(), loadTaskProcess()])
    } catch (e) {
        errorMessage.value = "加载数据失败"
        ui.showErrorMessage("加载数据失败")
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
        ui.showErrorMessage("获取签到日历失败")
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
        ui.showErrorMessage("获取任务进度失败")
    }
}

async function handleGameSign(dayAward: DNADayAward) {
    if (!calendarData.value) return

    try {
        signing.value = true
        const res = await api.gameSign(dayAward.id, calendarData.value.period.id)
        if (res.is_success) {
            ui.showSuccessMessage("游戏签到成功")
            await loadCalendarData()
        } else {
            ui.showErrorMessage(res.msg || "游戏签到失败")
        }
    } catch (e) {
        ui.showErrorMessage("游戏签到失败")
    } finally {
        signing.value = false
    }
}

async function handleBbsSign() {
    try {
        bbsSigning.value = true
        const res = await api.bbsSign()
        if (res.is_success) {
            ui.showSuccessMessage("论坛签到成功")
            await loadTaskProcess()
        } else {
            ui.showErrorMessage(res.msg || "论坛签到失败")
        }
    } catch (e) {
        ui.showErrorMessage("论坛签到失败")
    } finally {
        bbsSigning.value = false
    }
}

const canSignToday = computed(() => {
    if (!calendarData.value) return false
    return !calendarData.value.todaySignin && firstUnsignedDay.value !== null
})

const calendarDays = computed(() => {
    if (!calendarData.value) return []

    const totalDays = calendarData.value.period.overDays
    const today = new Date().getDate()
    const awardMap = new Map<number, DNADayAward>()
    const signedCount = calendarData.value.signinTime || 0
    const todaySignin = calendarData.value.todaySignin || false
    const maybeSignedDays = signedCount + (todaySignin ? 0 : 1)
    const missedCount = today - maybeSignedDays

    calendarData.value.dayAward.forEach((award) => {
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
    if (!calendarData.value) return null
    const today = new Date().getDate()
    const signedCount = calendarData.value.signinTime || 0

    if (signedCount < today) {
        return calendarData.value.dayAward.find((a) => a.dayInPeriod === signedCount + 1) || null
    }
    return null
})
</script>
<template>
    <div class="space-y-6">
        <div v-if="loading" class="flex justify-center items-center h-64">
            <span class="loading loading-spinner loading-lg"></span>
        </div>

        <div v-else-if="errorMessage" class="flex flex-col items-center justify-center h-64">
            <p class="text-lg mb-4 text-error">{{ errorMessage }}</p>
            <button class="btn btn-primary" @click="loadData">重试</button>
        </div>

        <div v-else class="space-y-6">
            <div class="card bg-base-100 shadow-xl">
                <div class="card-body">
                    <h3 class="card-title mb-4">
                        签到日历

                        <Tooltip tooltip="刷新" side="bottom">
                            <button class="ml-auto btn btn-primary btn-square btn-sm" @click="loadData">
                                <Icon icon="ri:refresh-line" />
                            </button>
                        </Tooltip>
                    </h3>
                    <div v-if="calendarData" class="flex items-center justify-between">
                        <div class="text-sm">
                            <span class="text-base-content/70">周期:</span>
                            <span class="font-bold ml-2">{{ calendarData.period.name }}</span>
                        </div>
                        <div class="text-sm">
                            <span class="text-base-content/70">已签到:</span>
                            <span class="font-bold ml-2">{{ signedDaysCount }} 天</span>
                        </div>
                        <button
                            v-if="canSignToday && firstUnsignedDay"
                            class="btn btn-primary"
                            :class="{ loading: signing }"
                            :disabled="signing"
                            @click="handleGameSign(firstUnsignedDay)"
                        >
                            <Icon icon="ri:checkbox-circle-fill" />
                            签到
                        </button>
                        <div v-else-if="calendarData.todaySignin" class="badge badge-success">今日已签到</div>
                    </div>

                    <div v-if="calendarData" class="space-y-4">
                        <div class="flex items-center justify-between p-4 bg-base-200 rounded-lg">
                            <div class="flex items-center gap-4">
                                <img :src="calendarData.roleInfo.headUrl" alt="角色头像" class="w-12 h-12 rounded-full" />
                                <div>
                                    <div class="font-bold">{{ calendarData.roleInfo.roleName }}</div>
                                    <div class="text-sm text-base-content/70">Lv. {{ calendarData.roleInfo.level }}</div>
                                </div>
                            </div>
                            <div class="text-right">
                                <div class="text-sm text-base-content/70">金币</div>
                                <div class="font-bold text-xl">{{ calendarData.userGoldNum }}</div>
                            </div>
                        </div>

                        <div class="divider mx-2"></div>

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
                                <div class="text-sm font-bold">{{ dayInfo.day }}</div>
                                <div class="flex flex-col items-center gap-1">
                                    <img
                                        v-if="dayInfo.iconUrl"
                                        :src="dayInfo.iconUrl"
                                        :alt="dayInfo.awardName"
                                        class="w-6 h-6 object-contain"
                                    />
                                    <div class="text-xs">{{ dayInfo.awardNum }}</div>
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
                                <div class="font-medium">{{ task.remark }}</div>
                                <div class="text-sm">
                                    <span class="text-base-content/70">进度:</span>
                                    <span class="font-bold ml-1">{{ task.completeTimes }}/{{ task.times }}</span>
                                </div>
                            </div>

                            <progress class="progress progress-primary w-full" :value="task.completeTimes" :max="task.times"></progress>

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

            <div class="card bg-base-100 shadow-xl">
                <div class="card-body">
                    <h3 class="card-title mb-4">论坛签到</h3>

                    <div class="flex items-center justify-between">
                        <div class="text-sm text-base-content/70">完成论坛签到可获得额外奖励</div>
                        <button class="btn btn-secondary" :class="{ loading: bbsSigning }" :disabled="bbsSigning" @click="handleBbsSign">
                            <Icon icon="ri:chat-thread-line" />
                            论坛签到
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
