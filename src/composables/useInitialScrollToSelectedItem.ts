import { nextTick, onBeforeUnmount, onMounted } from "vue"

interface InitialScrollToSelectedItemOptions {
    /**
     * 选中项查询选择器。
     */
    selectedSelector?: string
    /**
     * 最大等待时间（毫秒）。
     */
    maxWaitMs?: number
    /**
     * 滚动行为。
     */
    behavior?: ScrollBehavior
}

/**
 * 在列表首次渲染时滚动到当前选中项。
 * 默认匹配列表项上的选中样式类名（bg-primary/90 + hover:bg-primary）。
 * @param options 选项配置
 */
export function useInitialScrollToSelectedItem(options: InitialScrollToSelectedItemOptions = {}) {
    const selectedSelector = options.selectedSelector ?? ".cursor-pointer.bg-primary\\/90.hover\\:bg-primary"
    const maxWaitMs = options.maxWaitMs ?? 3000
    const behavior = options.behavior ?? "auto"

    let stopped = false
    let observer: MutationObserver | null = null
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    /**
     * 清理观察器与定时器。
     */
    function cleanup() {
        if (observer) {
            observer.disconnect()
            observer = null
        }

        if (timeoutId) {
            clearTimeout(timeoutId)
            timeoutId = null
        }
    }

    /**
     * 尝试定位并滚动到选中项。
     * @returns 是否已滚动成功
     */
    function tryScrollToSelectedItem(): boolean {
        if (stopped) {
            return true
        }

        const selectedElement = document.querySelector<HTMLElement>(selectedSelector)
        if (!selectedElement) {
            return false
        }

        selectedElement.scrollIntoView({
            behavior,
            block: "center",
            inline: "nearest",
        })

        stopped = true
        cleanup()
        return true
    }

    onMounted(() => {
        void nextTick(() => {
            if (tryScrollToSelectedItem()) {
                return
            }

            observer = new MutationObserver(() => {
                void nextTick(() => {
                    tryScrollToSelectedItem()
                })
            })
            observer.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ["class"],
            })

            timeoutId = setTimeout(() => {
                stopped = true
                cleanup()
            }, maxWaitMs)
        })
    })

    onBeforeUnmount(() => {
        stopped = true
        cleanup()
    })
}
