import { computed, onMounted, onUnmounted, type Ref, ref } from "vue"
import { useMihanNotify } from "@/store/mihan"
import type { AfkLedgerSnapshot } from "@/utils/afk-ledger"
import {
    type ResolvedScreenBarItem,
    resolveScreenBarItem,
    type ScreenBarConfig,
    type ScreenBarForgeAlarm,
    type ScreenBarForgeDraft,
} from "@/utils/screen-bar"

/** 时钟、倒计时与铸造提醒的刷新节拍(毫秒)。 */
const TICK_MS = 1000

/** 没有铸造提醒时用的常量引用,避免每次调用都新建一个空 ref。 */
const NO_FORGE_ALARM: Ref<ScreenBarForgeAlarm | null> = ref(null)

/** 没有铸造队列时用的常量引用。 */
const NO_FORGE_DRAFTS: Ref<ScreenBarForgeDraft[]> = ref([])

/** 没有产物图片缓存时用的常量引用。 */
const NO_FORGE_ICONS: Ref<Record<string, string>> = ref({})

/** 没有账本快照时用的常量引用。 */
const NO_AFK_STATS: Ref<AfkLedgerSnapshot | null> = ref(null)

/**
 * 屏幕信息条的内容计算。
 *
 * 浮窗与设置页预览共用:每秒钟推进一次时间,把配置里的条目解析成渲染就绪的文本与分组。
 * 密函数据直接取 `useMihanNotify` 单例,因此浮窗窗口不需要主窗口推送数据;
 * 关注任务由条目自带(`ScreenBarMihanItem.missions`),不读全局通知设置。
 *
 * 铸造完成提醒必须由调用方注入:浮窗窗口若直接用 `useForgeAlarm` 会启动第二个排期定时器,
 * 同一时刻会发两遍系统通知。浮窗页从 localStorage 手动 hydrate,设置页则传单例的 `alarm`。
 * 铸造队列(摘要 / 最近完成模式)与产物图片缓存同理,也由调用方从游戏信息数据里读好归一化结果再传进来。
 * @param config 信息条配置(响应式)
 * @param forgeAlarm 当前铸造完成提醒(响应式);缺省表示没设
 * @param forgeDrafts 游戏信息里的铸造队列(已归一化);缺省表示没有进行中的铸造
 * @param forgeIcons 铸造产物图片缓存(产物 id → 图片路径);缺省表示还没解析过
 * @param afkStats 狩月账本快照(主窗口写入 localStorage);缺省表示还没有统计
 * @returns 渲染就绪的条目列表
 */
export function useScreenBarContent(
    config: Ref<ScreenBarConfig>,
    forgeAlarm: Ref<ScreenBarForgeAlarm | null> = NO_FORGE_ALARM,
    forgeDrafts: Ref<ScreenBarForgeDraft[]> = NO_FORGE_DRAFTS,
    forgeIcons: Ref<Record<string, string>> = NO_FORGE_ICONS,
    afkStats: Ref<AfkLedgerSnapshot | null> = NO_AFK_STATS
) {
    const mihanNotify = useMihanNotify()
    const now = ref(new Date())
    let timer: number | null = null

    const items = computed<ResolvedScreenBarItem[]>(() =>
        config.value.items.map(item =>
            resolveScreenBarItem(
                item,
                now.value,
                mihanNotify.mihanData.value,
                forgeAlarm.value,
                forgeDrafts.value,
                forgeIcons.value,
                afkStats.value
            )
        )
    )

    onMounted(() => {
        timer = window.setInterval(() => {
            now.value = new Date()
        }, TICK_MS)
    })

    onUnmounted(() => {
        if (timer !== null) {
            window.clearInterval(timer)
            timer = null
        }
    })

    return { items }
}
