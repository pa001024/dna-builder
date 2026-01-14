import { defineStore } from "pinia"
import { IconTypes } from "@/components/Icon.vue"
import { env } from "@/env"
import { until } from "@vueuse/core"

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
                    name: "inventory",
                    path: "/inventory",
                    icon: "ri:box-1-line",
                },
                {
                    name: "timeline",
                    path: "/timeline",
                    icon: "ri:timeline-view",
                },
                {
                    name: "achievement",
                    path: "/achievement",
                    icon: "ri:trophy-line",
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
        showErrorMessage(...messages: any[]) {
            this.errorMessage = messages.join(" ")
            setTimeout(() => {
                this.errorMessage = ""
            }, 3000)
        },
        showSuccessMessage(...messages: any[]) {
            this.successMessage = messages.join(" ")
            setTimeout(() => {
                this.successMessage = ""
            }, 3000)
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
