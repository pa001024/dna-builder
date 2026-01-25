import type { DNAAPI, DNAGameSignInDayAward, DNAGameSignInShowDataBean, DNAPostListBean } from "dna-api"
import { shuffle } from "lodash-es"
import { sleep } from "@/util"
import { useUIStore } from "../store/ui"

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

/**
 * 获取第一个未签到的日期
 */
export function getFirstUnsignedDay(calendarData: DNAGameSignInShowDataBean): DNAGameSignInDayAward | null {
    if (!calendarData) return null
    const today = new Date().getDate()
    const signedCount = calendarData.signinTime || 0

    if (signedCount < today) {
        return calendarData.dayAward.find(a => a.dayInPeriod === signedCount + 1) || null
    }
    return null
}

/**
 * 判断今天是否可以签到
 */
export function canSignToday(calendarData: DNAGameSignInShowDataBean): boolean {
    if (!calendarData) return false
    return !calendarData.todaySignin && getFirstUnsignedDay(calendarData) !== null
}

/**
 * 执行游戏签到
 */
export async function handleGameSign(
    api: DNAAPI,
    dayAward: DNAGameSignInDayAward,
    calendarData: DNAGameSignInShowDataBean
): Promise<boolean> {
    try {
        const res = await api.gameSign(dayAward.id, calendarData.period.id)
        return res.is_success
    } catch (error) {
        console.error("游戏签到失败:", error)
        return false
    }
}

/**
 * 执行论坛签到
 */
export async function handleBbsSign(api: DNAAPI): Promise<boolean> {
    try {
        const res = await api.bbsSign()
        return res.is_success
    } catch (error) {
        console.error("论坛签到失败:", error)
        return false
    }
}

/**
 * 执行帖子浏览任务
 */
export async function handlePostView(api: DNAAPI, posts: DNAPostListBean[]): Promise<boolean> {
    try {
        // 浏览3篇帖子
        const viewCount = Math.min(3, posts.length)
        for (let i = 0; i < viewCount; i++) {
            const post = posts[i]
            await api.getPostDetail(post.postId)
        }
        return true
    } catch (error) {
        console.error("浏览帖子失败:", error)
        return false
    }
}

/**
 * 执行点赞任务
 */
export async function handleLike(api: DNAAPI, posts: DNAPostListBean[]): Promise<boolean> {
    try {
        // 点赞5篇帖子
        const likeCount = Math.min(5, posts.length)
        for (let i = 0; i < likeCount; i++) {
            const post = posts[i]
            await api.likePost({
                gameForumId: String(post.gameForumId),
                postId: String(post.postId),
                postType: String(post.postType),
                userId: post.userId,
            })
        }
        return true
    } catch (error) {
        console.error("点赞失败:", error)
        return false
    }
}

/**
 * 执行分享任务
 */
export async function handleShare(api: DNAAPI): Promise<boolean> {
    try {
        const res = await api.shareTask()
        return res.is_success
    } catch (error) {
        console.error("分享失败:", error)
        return false
    }
}

/**
 * 执行回复任务
 */
export async function handleReply(api: DNAAPI, posts: DNAPostListBean[]): Promise<boolean> {
    try {
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
        return true
    } catch (error) {
        console.error("回复失败:", error)
        return false
    }
}

/**
 * 执行完整的签到流程
 */
export async function executeSignFlow(api: DNAAPI): Promise<boolean> {
    const ui = useUIStore()
    try {
        // 加载日历数据和任务进度
        const [calendarRes, taskRes] = await Promise.all([api.signCalendar(), api.getTaskProcess()])

        if (!calendarRes.is_success || !calendarRes.data) {
            ui.showErrorMessage("获取签到日历失败")
            return false
        }

        if (!taskRes.is_success || !taskRes.data) {
            ui.showErrorMessage("获取任务进度失败")
            return false
        }

        const calendarData = calendarRes.data
        const taskProcess = taskRes.data

        // 执行游戏签到
        if (canSignToday(calendarData)) {
            const firstUnsignedDay = getFirstUnsignedDay(calendarData)
            if (firstUnsignedDay) {
                const signSuccess = await handleGameSign(api, firstUnsignedDay, calendarData)
                if (signSuccess) {
                    ui.showSuccessMessage("游戏签到成功")
                }
            }
        }

        // 获取帖子列表
        let posts: DNAPostListBean[] = []
        async function getPosts() {
            if (posts.length > 0) return posts
            const postsRes = await api.getPostList(46)
            if (!postsRes.is_success || !postsRes.data?.postList || postsRes.data.postList.length === 0) {
                return []
            }
            return (posts = shuffle(postsRes.data.postList))
        }

        // 顺序执行所有未完成的任务
        for (const t of taskProcess.dailyTask) {
            if (t.remark === "签到" && t.completeTimes < t.times) {
                await handleBbsSign(api)
            } else if (t.remark.startsWith("浏览") && t.completeTimes < t.times) {
                await handlePostView(api, await getPosts())
            } else if (t.remark.startsWith("完成") && t.completeTimes < t.times) {
                await handleLike(api, await getPosts())
            } else if (t.remark.startsWith("分享") && t.completeTimes < t.times) {
                await handleShare(api)
            } else if (t.remark.startsWith("回复") && t.completeTimes < t.times) {
                await handleReply(api, await getPosts())
            }
        }

        // 重新获取最新的日历数据和任务进度
        const [newCalendarRes, newTaskRes] = await Promise.all([api.signCalendar(), api.getTaskProcess()])

        if (!newCalendarRes.is_success || !newCalendarRes.data) {
            ui.showErrorMessage("获取最新签到日历失败")
            return false
        }

        if (!newTaskRes.is_success || !newTaskRes.data) {
            ui.showErrorMessage("获取最新任务进度失败")
            return false
        }

        const newCalendarData = newCalendarRes.data
        const newTaskProcess = newTaskRes.data

        // 参考isSignFinished的条件判断是否成功
        // 条件：1. 今天已经签到 2. 所有日常任务都已完成
        const todaySigned = newCalendarData.todaySignin || false
        const allTasksCompleted = !newTaskProcess.dailyTask.some(task => task.completeTimes < task.times)

        return todaySigned && allTasksCompleted
    } catch (error) {
        console.error("签到流程执行失败:", error)
        ui.showErrorMessage("签到流程执行失败")
        return false
    }
}
