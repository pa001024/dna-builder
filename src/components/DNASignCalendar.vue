<script setup lang="ts">
import { useLocalStorage } from "@vueuse/core"
import { DNAAPI, DNAGameSignInDayAward, DNAGameSignInShowDataBean, DNAPostListBean, DNAUserTaskProcessEntity } from "dna-api"
import { shuffle } from "lodash-es"
import { computed, onMounted, ref } from "vue"
import { sleep } from "@/util"
import { useSettingStore } from "../store/setting"
import { useUIStore } from "../store/ui"

defineProps<{
    nobtn?: boolean
}>()
const setting = useSettingStore()
const ui = useUIStore()

/**
 * 回复内容库 - 用于自动回复帖子
 * 包含多种类型的积极回复，避免重复使用相同内容
 */
const REPLY_LIBRARY = [
    // 支持/赞同类
    "说得太好了！完全同意",
    "分析得很到位，受教了",
    "有道理，支持一下",
    "确实如此，同感",
    "说得在理",
    "很棒的见解，赞同",
    "分析得很有深度",
    "这个观点很独特",

    // 鼓励/赞赏类
    "楼主用心了，感谢分享",
    "写得真不错，继续加油",
    "很有帮助的内容",
    "感谢楼主的分享",
    "写得非常详细，感谢",
    "内容很有价值",
    "感谢分享，学到了",

    // 交流/互动类
    "哈哈，有趣的观点",
    "原来是这样，了解了",
    "确实有启发",
    "说得对，支持",
    "不错的想法",
    "很有参考价值",

    // 简短回应类
    "_[/皎皎-好耶]",
    "_[/皎皎-冲鸭]",
    "_[/皎皎-得意]",
    "_[/皎皎-开摆]",
    "_[/皎皎-好耶]",
    "_[/皎皎-看书]",
    "_[/皎皎-我的图图呢]",
    "_[/奥特赛德-酷]",
    "_[/菲娜-摸头]",
    "_[/海尔法-得意]",
    "_[/黑龙-佩服]",
    "_[/赛琪-送花]",
    "_[/松露-吐舌]",
    "_[/希尔妲-微笑]",
    "_[/章鱼-兴奋]",
    "_[/松露-榛子开心]",
    "_[/章鱼-兴奋]",
]

/**
 * 从回复库中随机选择一个回复
 */
function getRandomReply(): string {
    const index = Math.floor(Math.random() * REPLY_LIBRARY.length)
    return REPLY_LIBRARY[index]
}

let api: DNAAPI

const loading = ref(true)
const signing = ref(false)
const bbsSigning = ref(false)
const viewingPosts = ref(false)
const likingPosts = ref(false)
const sharingContent = ref(false)
const replyingPosts = ref(false)

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
    if (canSignToday.value && firstUnsignedDay.value) await handleGameSign(firstUnsignedDay.value)

    let posts: DNAPostListBean[] = []
    async function getPosts() {
        if (posts.length > 0) return posts
        const postsRes = await api.getPostList(46)
        if (!postsRes.is_success || !postsRes.data?.postList || postsRes.data.postList.length === 0) {
            ui.showErrorMessage("获取帖子列表失败")
            return []
        }
        return (posts = shuffle(postsRes.data.postList))
    }
    // 顺序执行所有未完成的任务
    for (const t of taskProcess.value.dailyTask) {
        if (t.remark === "签到" && t.completeTimes < t.times) {
            await handleBbsSign()
        } else if (t.remark.startsWith("浏览") && t.completeTimes < t.times) {
            await handlePostView(await getPosts())
        } else if (t.remark.startsWith("完成") && t.completeTimes < t.times) {
            await handleLike(await getPosts())
        } else if (t.remark.startsWith("分享") && t.completeTimes < t.times) {
            await handleShare()
        } else if (t.remark.startsWith("回复") && t.completeTimes < t.times) {
            await handleReply(await getPosts())
        }
    }
    await loadTaskProcess()
}

async function handleGameSign(dayAward: DNAGameSignInDayAward) {
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
        ui.showErrorMessage("游戏签到失败:", e)
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
        } else {
            ui.showErrorMessage(res.msg || "论坛签到失败")
        }
    } catch (e) {
        ui.showErrorMessage("论坛签到失败:", e)
    } finally {
        bbsSigning.value = false
    }
}

/**
 * 浏览3篇帖子完成任务
 */
async function handlePostView(posts: DNAPostListBean[]) {
    try {
        viewingPosts.value = true
        // 浏览3篇帖子
        const viewCount = Math.min(3, posts.length)

        for (let i = 0; i < viewCount; i++) {
            const post = posts[i]
            await api.getPostDetail(post.postId)
        }

        ui.showSuccessMessage(`已浏览${viewCount}篇帖子`)
    } catch (e) {
        ui.showErrorMessage("浏览帖子失败:", e)
    } finally {
        viewingPosts.value = false
    }
}

/**
 * 完成5次点赞任务
 */
async function handleLike(posts: DNAPostListBean[]) {
    try {
        likingPosts.value = true
        // 点赞5篇帖子
        const likeCount = Math.min(5, posts.length)
        let successCount = 0

        for (let i = 0; i < likeCount; i++) {
            const post = posts[i]
            const res = await api.likePost({
                gameForumId: String(post.gameForumId),
                postId: String(post.postId),
                postType: String(post.postType),
                userId: post.userId,
            })
            if (res.is_success) {
                successCount++
            }
        }

        ui.showSuccessMessage(`已点赞${successCount}篇帖子`)
    } catch (e) {
        ui.showErrorMessage("点赞失败:", e)
    } finally {
        likingPosts.value = false
    }
}

/**
 * 分享一篇内容任务
 */
async function handleShare() {
    try {
        sharingContent.value = true
        const res = await api.shareTask()
        if (res.is_success) {
            ui.showSuccessMessage("分享成功")
        } else {
            ui.showErrorMessage(res.msg || "分享失败")
        }
    } catch (e) {
        ui.showErrorMessage("分享失败:", e)
    } finally {
        sharingContent.value = false
    }
}

/**
 * 回复他人帖子5次任务
 */
async function handleReply(posts: DNAPostListBean[]) {
    try {
        replyingPosts.value = true
        let replyCount = 0
        const targetCount = 5

        for (const post of posts) {
            if (replyCount >= targetCount) break

            const res = await api.createComment(
                {
                    userId: post.userId,
                    postId: String(post.postId),
                    gameForumId: post.gameForumId,
                },
                getRandomReply()
            )
            if (res.is_success) {
                replyCount++
                await sleep(3000)
            }
        }

        ui.showSuccessMessage(`已回复${replyCount}次`)
    } catch (e) {
        ui.showErrorMessage("回复失败:", e)
    } finally {
        replyingPosts.value = false
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
    if (!calendarData.value) return null
    const today = new Date().getDate()
    const signedCount = calendarData.value.signinTime || 0

    if (signedCount < today) {
        return calendarData.value.dayAward.find(a => a.dayInPeriod === signedCount + 1) || null
    }
    return null
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
                                        class="w-6 h-6 object-contain"
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
