import { onBeforeUnmount, onMounted, type Ref, ref } from "vue"

/** 参与观测的区块属性名：滚动容器内带该属性的元素按文档顺序参与判定，属性值即区块键名 */
const SECTION_ATTR = "data-scroll-section"
/** 判定线距容器顶部的下限（px）：容器很矮时也要留出可辨识的锚点带 */
const MIN_ANCHOR_BAND = 48
/** 判定线占容器高度的比例 */
const ANCHOR_BAND_RATIO = 0.25
/** 用户接管滚动的信号：出现任一即解除跳转高亮锁 */
const USER_SCROLL_EVENTS = ["wheel", "touchstart", "keydown"] as const
/** 程序滚动结束的兜底时长（ms）：scrollend 不可用时靠它标记滚动已结束 */
const SETTLE_FALLBACK_MS = 1200

/**
 * 滚动定位（scroll-spy）结果。
 */
export interface UseScrollSpyResult {
    /** 当前区块的键名：判定线以上最靠下的那个区块；容器内无区块时为空串 */
    activeKey: Ref<string>
    /** 平滑滚动到指定区块，并把高亮锁定在该区块，直到用户自行滚动 */
    scrollToKey: (key: string) => void
}

/**
 * 在指定滚动容器内维护「当前区块」，供目录导航同步高亮。
 *
 * 区块通过 `data-scroll-section="<key>"` 在模板上声明，不依赖调用方传入引用；
 * 点击目录跳转会锁定高亮，避免平滑滚动途经的中间区块抢占选中态。
 * @param container 滚动容器的模板引用
 * @returns 当前区块键名与跳转方法
 */
export function useScrollSpy(container: Ref<HTMLElement | null>): UseScrollSpyResult {
    const activeKey = ref("")
    /**
     * 跳转锁：点击目录后高亮的归属区块；为 null 表示高亮完全由实际滚动位置决定。
     *
     * 该锁只由用户自身的滚动行为解除，不会随程序滚动结束而失效 —— 目标区块因内容不足
     * 无法顶到容器顶部时（例如点倒数第二项，容器已经触底），按位置判定会把高亮判给别的
     * 区块，与用户的点击意图不符。
     */
    let lockedKey: string | null = null
    /** 程序发起的滚动是否已结束；结束后再收到 scroll 事件即判定为用户接管（如拖滚动条） */
    let scrollSettled = false
    /** 标记滚动结束的兜底定时器句柄 */
    let settleTimer: number | null = null
    /** 合帧用的 rAF 句柄 */
    let frame: number | null = null
    /** 事件绑定的元素快照：卸载阶段模板引用已被置空，必须用快照解绑 */
    let boundEl: HTMLElement | null = null

    /**
     * 读取区块键名。
     * @param el 带 data-scroll-section 的元素
     * @returns 区块键名
     */
    function keyOf(el: HTMLElement) {
        return el.dataset.scrollSection || ""
    }

    /**
     * 采集容器内的所有区块，文档顺序即视觉顺序。
     * @returns 区块元素列表
     */
    function collectSections() {
        return Array.from(container.value?.querySelectorAll<HTMLElement>(`[${SECTION_ATTR}]`) ?? [])
    }

    /**
     * 依据容器的滚动位置重算当前区块。
     */
    function update() {
        const el = container.value
        if (!el) {
            return
        }

        const sections = collectSections()
        if (!sections.length) {
            activeKey.value = ""
            return
        }

        // 锁定的区块已不存在（如环境切换导致区块消失）时不再拦截，交回实际位置判定
        if (lockedKey !== null && sections.some(section => keyOf(section) === lockedKey)) {
            activeKey.value = lockedKey
            return
        }

        let next: string
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) {
            // 触底时末尾区块未必能顶到判定线，单独归给末项，否则最后一项目录永远点不亮
            next = keyOf(sections[sections.length - 1])
        } else {
            const line = el.getBoundingClientRect().top + Math.max(MIN_ANCHOR_BAND, el.clientHeight * ANCHOR_BAND_RATIO)
            next = keyOf(sections[0])
            for (const section of sections) {
                if (section.getBoundingClientRect().top > line) {
                    break
                }
                next = keyOf(section)
            }
        }

        if (next !== activeKey.value) {
            activeKey.value = next
        }
    }

    /**
     * 设置跳转锁。
     * @param key 锁定的区块键名
     */
    function holdLock(key: string) {
        lockedKey = key
    }

    /**
     * 解除跳转锁并按实际滚动位置重算；作为用户滚动信号的监听器使用，无参调用。
     */
    function releaseLock() {
        if (lockedKey === null) {
            return
        }
        lockedKey = null
        update()
    }

    /**
     * 标记程序滚动已结束：此后出现的 scroll 事件一律来自用户。
     */
    function settleScroll() {
        if (settleTimer !== null) {
            window.clearTimeout(settleTimer)
            settleTimer = null
        }
        scrollSettled = true
    }

    /**
     * 合并同一帧内的多次滚动回调。
     */
    function scheduleUpdate() {
        // 滚动已结束还继续收到 scroll，说明是拖滚动条这类不带 wheel/touch 的滚动方式
        if (lockedKey !== null && scrollSettled) {
            releaseLock()
        }

        if (frame !== null) {
            return
        }
        frame = window.requestAnimationFrame(() => {
            frame = null
            update()
        })
    }

    /**
     * 平滑滚动到指定区块并锁定高亮。
     * @param key 区块键名
     */
    function scrollToKey(key: string) {
        const el = container.value
        if (!el) {
            return
        }

        const target = collectSections().find(section => keyOf(section) === key)
        if (!target) {
            return
        }

        holdLock(key)
        scrollSettled = false
        if (settleTimer !== null) {
            window.clearTimeout(settleTimer)
        }
        settleTimer = window.setTimeout(settleScroll, SETTLE_FALLBACK_MS)
        activeKey.value = key
        // 让区块顶部与容器顶部对齐；首段之前的区块会被浏览器钳到 0
        const delta = target.getBoundingClientRect().top - el.getBoundingClientRect().top
        el.scrollTo({ top: el.scrollTop + delta, behavior: "smooth" })
    }

    onMounted(() => {
        boundEl = container.value
        if (!boundEl) {
            return
        }
        boundEl.addEventListener("scroll", scheduleUpdate, { passive: true })
        // scrollend 只用来标记程序滚动结束，不在此时解锁：目标区块因内容不足滚不到顶部时，
        // 解锁会让位置判定立刻抢走高亮，与用户点击意图不符。
        boundEl.addEventListener("scrollend", settleScroll)
        // 用户发起滚动的显式信号，命中即接管；拖滚动条没有这些事件，由 scrollend 后的 scroll 兜住
        for (const eventName of USER_SCROLL_EVENTS) {
            window.addEventListener(eventName, releaseLock, { passive: true, capture: true })
        }
        update()
    })

    onBeforeUnmount(() => {
        boundEl?.removeEventListener("scroll", scheduleUpdate)
        boundEl?.removeEventListener("scrollend", settleScroll)
        boundEl = null
        for (const eventName of USER_SCROLL_EVENTS) {
            window.removeEventListener(eventName, releaseLock, { capture: true })
        }
        if (settleTimer !== null) {
            window.clearTimeout(settleTimer)
            settleTimer = null
        }
        if (frame !== null) {
            window.cancelAnimationFrame(frame)
            frame = null
        }
    })

    return { activeKey, scrollToKey }
}
