import { computed, onMounted, onUnmounted, type Ref, ref } from "vue"
import { useMihanNotify } from "@/store/mihan"
import { type ResolvedScreenBarItem, resolveScreenBarItem, type ScreenBarConfig } from "@/utils/screen-bar"

/** 时钟与倒计时的刷新节拍(毫秒)。 */
const TICK_MS = 1000

/**
 * 屏幕信息条的内容计算。
 *
 * 浮窗与设置页预览共用:每秒钟推进一次时间,把配置里的条目解析成渲染就绪的文本与分组。
 * 密函数据直接取 `useMihanNotify` 单例,因此浮窗窗口不需要主窗口推送数据;
 * 关注任务由条目自带(`ScreenBarMihanItem.missions`),不读全局通知设置。
 * @param config 信息条配置(响应式)
 * @returns 渲染就绪的条目列表
 */
export function useScreenBarContent(config: Ref<ScreenBarConfig>) {
    const mihanNotify = useMihanNotify()
    const now = ref(new Date())
    let timer: number | null = null

    const items = computed<ResolvedScreenBarItem[]>(() =>
        config.value.items.map(item => resolveScreenBarItem(item, now.value, mihanNotify.mihanData.value))
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
