import { until } from "@vueuse/core"
import { defineStore } from "pinia"
import type { IconTypes } from "@/components/Icon.vue"
import { env } from "@/env"

/** 全局提示自动隐藏延时（毫秒） */
const MESSAGE_HIDE_DELAY = 3000

// 自动隐藏定时器句柄放在模块级：定时器对象不可序列化，进入 Pinia state 会被响应式包装且污染 devtools
let errorMessageHideTimer: ReturnType<typeof setTimeout> | undefined
let successMessageHideTimer: ReturnType<typeof setTimeout> | undefined

export interface ITab {
    name?: string
    path?: string
    icon?: IconTypes

    enable?: boolean
    meta?: any
    show?: boolean
}

export const useUIStore = defineStore("ui", {
    state: () => {
        return {
            sidebarExpand: false,
            loading: false,
            title: "",
            errorMessage: "",
            successMessage: "",
            // 提示条可见性：与文本分离，退场动画期间文本必须保留，否则元素会先塌成只剩图标再播动画
            errorMessageVisible: false,
            successMessageVisible: false,
            dialogVisible: false,
            dialogTitle: "",
            dialogContent: "",
            dialogState: -1,
            loginState: false,
            timeNow: Date.now(),
            // 图片预览相关
            previewVisible: false,
            previewImageUrl: "",
            previewImageElm: null as HTMLElement | null,
            isHoveringPreview: false,
            // 密函
            mihanVisible: false,
            tabs: [
                {
                    name: "home",
                    path: "/",
                    icon: "ri:bookmark-line",
                },
                {
                    name: "game-launcher",
                    path: "/game-launcher",
                    icon: "ri:rocket-2-line",
                    show: env.isApp,
                },
                {
                    name: "char-build",
                    path: "/char",
                    icon: "ri:hammer-line",
                },
                {
                    // 魔灵地图是一级独立路由，不挂在 /db 下（否则 /db 与地图标签会同时高亮）
                    name: "map-local",
                    path: "/map-tool",
                    icon: "ri:map-2-line",
                },
                {
                    name: "database",
                    path: "/db",
                    icon: "ri:book-line",
                },
                {
                    name: "chat",
                    path: "/chat",
                    icon: "ri:chat-3-line",
                },
                {
                    name: "dna-home",
                    path: "/dna",
                    icon: "ri:chat-thread-line",
                },
                // {
                //     name: "flow-editor",
                //     path: "/flow-editor",
                //     icon: "ri:node-tree",
                // },
                {
                    name: "more",
                    path: "/more",
                    icon: "ri:more-line",
                },
            ] satisfies ITab[] as ITab[],
        }
    },
    actions: {
        startTimer() {
            setInterval(() => {
                this.timeNow = Date.now()
            }, 1000)
        },
        setLoginState(state: boolean) {
            this.loginState = state
            const index = this.tabs.findIndex(tab => tab.name === "dna-home")
            if (index === -1) return
            this.tabs[index].show = this.loginState
        },
        toggleSidebar() {
            this.sidebarExpand = !this.sidebarExpand
        },
        /**
         * 收起错误提示：只切可见性，保留文本供退场动画渲染。
         * @param delay 延时毫秒；不传则立即收起
         */
        dismissErrorMessage(delay = 0) {
            clearTimeout(errorMessageHideTimer)
            errorMessageHideTimer = setTimeout(() => {
                this.errorMessageVisible = false
            }, delay)
        },
        /**
         * 收起成功提示：只切可见性，保留文本供退场动画渲染。
         * @param delay 延时毫秒；不传则立即收起
         */
        dismissSuccessMessage(delay = 0) {
            clearTimeout(successMessageHideTimer)
            successMessageHideTimer = setTimeout(() => {
                this.successMessageVisible = false
            }, delay)
        },
        showErrorMessage(...messages: any[]) {
            this.errorMessage = messages.join(" ")
            this.errorMessageVisible = true
            this.dismissErrorMessage(MESSAGE_HIDE_DELAY)
        },
        showSuccessMessage(...messages: any[]) {
            this.successMessage = messages.join(" ")
            this.successMessageVisible = true
            this.dismissSuccessMessage(MESSAGE_HIDE_DELAY)
        },
        timeDistancePassed(time: number) {
            const now = this.timeNow
            const diff = now - time
            const diffDay = Math.floor(diff / (1000 * 60 * 60 * 24))
            if (diffDay > 0) {
                return `${diffDay}天前`
            }
            const diffHour = Math.floor(diff / (1000 * 60 * 60))
            if (diffHour > 0) {
                return `${diffHour}小时前`
            }
            const diffMinute = Math.floor(diff / (1000 * 60))
            if (diffMinute > 0) {
                return `${diffMinute}分钟前`
            }
            const diffSecond = Math.floor(diff / 1000)
            if (diffSecond > 0) {
                return `${diffSecond}秒前`
            }
            return "刚刚"
        },
        timeDistanceFuture(time: number) {
            const now = this.timeNow
            const diff = time - now
            const diffDay = Math.floor(diff / (1000 * 60 * 60 * 24))
            if (diffDay > 0) {
                return `${diffDay}天后`
            }
            const diffHour = Math.floor(diff / (1000 * 60 * 60))
            if (diffHour > 0) {
                return `${diffHour}小时后`
            }
            const diffMinute = Math.floor(diff / (1000 * 60))
            if (diffMinute > 0) {
                return `${diffMinute}分钟后`
            }
            return "已过期"
        },
        timeDistanceFutureFix(time: number) {
            const now = this.timeNow
            const diff = time - now
            const diffDay = Math.floor(diff / (1000 * 60 * 60 * 24))
            const diffHour = Math.floor((diff / (1000 * 60 * 60)) % 24)
            const diffMinute = Math.floor((diff / (1000 * 60)) % 60)
            const diffSecond = Math.floor((diff / 1000) % 60)
            const pad = (num: number) => (num > 9 ? num : `0${num}`)
            if (diffDay > 0) {
                return `${diffDay}天${pad(diffHour)}:${pad(diffMinute)}:${pad(diffSecond)}`
            }
            if (diffHour > 0) {
                return `${pad(diffHour)}:${pad(diffMinute)}:${pad(diffSecond)}`
            }
            if (diffMinute > 0) {
                return `${pad(diffMinute)}:${pad(diffSecond)}`
            }
            if (diffSecond > 0) {
                return `00:${pad(diffSecond)}`
            }
            return "00:00"
        },
        // 显示确认对话框
        async showDialog(title: string, content: string) {
            this.dialogVisible = true
            this.dialogTitle = title
            this.dialogContent = content

            await until(() => this.dialogState !== -1).toBe(true)
            const dialogState = this.dialogState
            this.dialogState = -1
            this.dialogVisible = false
            return !!dialogState
        },
        confirmDialog() {
            this.dialogState = 1
        },
        cancelDialog() {
            this.dialogState = 0
        },
        startImagePreview(url: string, event?: MouseEvent) {
            this.previewImageUrl = url
            this.previewVisible = true
            if (event) {
                this.handlePreviewMouseMove(event)
            }
            document.addEventListener("mousemove", this.handlePreviewMouseMove)
        },
        stopImagePreview() {
            this.previewVisible = false
            document.removeEventListener("mousemove", this.handlePreviewMouseMove)
        },
        handlePreviewMouseMove(event: MouseEvent) {
            const imagePreview = this.previewImageElm
            if (!imagePreview) return
            // 设置初始位置样式，确保元素可见以便获取尺寸
            imagePreview.style.left = `${event.clientX + 10}px`
            imagePreview.style.top = `${event.clientY - 10}px`
            imagePreview.style.position = "fixed"

            // 获取预览元素的实际尺寸
            const rect = imagePreview.getBoundingClientRect()
            const windowWidth = window.innerWidth
            const windowHeight = window.innerHeight
            const padding = 10 // 窗口边缘内边距

            // 计算调整后的位置
            let left = event.clientX + 10
            let top = event.clientY - 10

            // 确保不超出右侧边界
            if (left + rect.width > windowWidth - padding) {
                left = windowWidth - rect.width - padding
            }

            // 确保不超出左侧边界
            if (left < padding) {
                left = padding
            }

            // 确保不超出底部边界
            if (top + rect.height > windowHeight - padding) {
                top = windowHeight - rect.height - padding
            }

            // 确保不超出顶部边界
            if (top < padding) {
                top = padding
            }

            // 更新最终位置
            imagePreview.style.left = `${left}px`
            imagePreview.style.top = `${top}px`
        },
    },
})
