import { StorageSerializers, until, useLocalStorage } from "@vueuse/core"
import { defineStore } from "pinia"
import type { IconTypes } from "@/components/Icon.vue"
import { env } from "@/env"
import { SIDEBAR_DOCKED_PATHS, SIDEBAR_LOCKED_PATHS } from "@/utils/entry-util"

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

/** 侧边栏布局的 localStorage 键 */
const SIDEBAR_LAYOUT_KEY = "setting_sidebar_layout_v1"

/**
 * 默认侧边栏布局：基础 tabs 的路径顺序。
 * @param tabs 基础 tabs
 * @returns 默认布局路径数组
 */
function defaultSidebarLayout(tabs: ITab[]): string[] {
    return tabs.map(tab => tab.path).filter((path): path is string => !!path)
}

export const useUIStore = defineStore("ui", {
    state: () => {
        const tabs = [
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
        ] satisfies ITab[] as ITab[]
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
            // 侧边栏自定义布局：路径数组，顺序即展示顺序；初始即默认布局（非 null，保证推导为 object 序列化器）。
            // writeDefaults 关闭：未改动时不写盘；显式 serializer 双保险，防止默认值类型变化时推导漂移。
            sidebarLayout: useLocalStorage<string[]>(SIDEBAR_LAYOUT_KEY, defaultSidebarLayout(tabs), {
                serializer: StorageSerializers.object,
                writeDefaults: false,
            }),
            // 脚本管理入口解锁态（More 页彩蛋）：侧边栏与设置页共享同一响应式源，解锁后两处同步刷新
            scriptUnlocked: useLocalStorage("script-unlocked", false),
            tabs,
        }
    },
    getters: {
        /**
         * 侧边栏有效布局路径：非数组脏数据回默认，保证渲染层永远拿到可用数组。
         */
        sidebarLayoutPaths(): string[] {
            if (Array.isArray(this.sidebarLayout)) {
                return this.sidebarLayout
            }
            return defaultSidebarLayout(this.tabs)
        },
        /** 是否偏离默认布局：控制设置页「恢复默认」按钮的显隐 */
        isSidebarLayoutCustomized(): boolean {
            const defaults = defaultSidebarLayout(this.tabs)
            const current = this.sidebarLayout
            return !Array.isArray(current) || current.length !== defaults.length || current.some((path, index) => path !== defaults[index])
        },
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
         * 向侧边栏添加一项：插入 More 入口之前，重复/底部常驻/空路径直接忽略。
         * @param path 功能路径
         */
        addSidebarPath(path: string) {
            if (!path || (SIDEBAR_DOCKED_PATHS as readonly string[]).includes(path)) {
                return
            }
            const layout = [...this.sidebarLayout]
            if (layout.includes(path)) {
                return
            }
            const moreIndex = layout.indexOf("/more")
            layout.splice(moreIndex >= 0 ? moreIndex : layout.length, 0, path)
            this.sidebarLayout = layout
        },
        /**
         * 从侧边栏移除一项：主页与 More 锁定不可移除。
         * @param path 功能路径
         */
        removeSidebarPath(path: string) {
            if ((SIDEBAR_LOCKED_PATHS as readonly string[]).includes(path)) {
                return
            }
            const layout = [...this.sidebarLayout]
            const index = layout.indexOf(path)
            if (index < 0) {
                return
            }
            layout.splice(index, 1)
            this.sidebarLayout = layout
        },
        /**
         * 调整侧边栏项目的展示顺序。
         * @param path 功能路径
         * @param direction 移动方向：-1 上移，1 下移
         */
        moveSidebarPath(path: string, direction: -1 | 1) {
            const layout = [...this.sidebarLayout]
            const index = layout.indexOf(path)
            const target = index + direction
            if (index < 0 || target < 0 || target >= layout.length) {
                return
            }
            const [item] = layout.splice(index, 1)
            layout.splice(target, 0, item)
            this.sidebarLayout = layout
        },
        /**
         * 恢复默认布局：侧边栏回到基础 tabs 顺序。
         */
        resetSidebarLayout() {
            this.sidebarLayout = defaultSidebarLayout(this.tabs)
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
