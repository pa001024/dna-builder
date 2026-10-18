import { defineStore } from "pinia"
import { useUserStore } from "./user"

/** 账号弹窗展示的页签。 */
export type AuthDialogTab = "login" | "register" | "reset"

/**
 * @description 全局账号弹窗状态。
 * 登录/注册/重置密码弹窗由 App.vue 全局挂载一次，任意页面都能通过本 store 拉起；
 * 需要登录的功能用 requireLogin() 作为守卫：未登录时自动弹出登录弹窗并返回 false。
 */
export const useAuthStore = defineStore("auth", {
    state: () => {
        return {
            /** 账号弹窗是否可见。 */
            dialogVisible: false,
            /** 弹窗当前展示的页签。 */
            dialogTab: "login" as AuthDialogTab,
            /** 弹窗顶部的说明文案（由 requireLogin 传入，指明当前操作为何需要登录）。 */
            dialogHint: "",
        }
    },
    actions: {
        /**
         * @description 打开账号弹窗并切换到指定页签。
         * @param tab 目标页签，默认登录页。
         */
        openDialog(tab: AuthDialogTab = "login") {
            this.dialogTab = tab
            this.dialogHint = ""
            this.dialogVisible = true
        },
        /**
         * @description 打开登录弹窗。
         */
        openLogin() {
            this.openDialog("login")
        },
        /**
         * @description 打开注册弹窗。
         */
        openRegister() {
            this.openDialog("register")
        },
        /**
         * @description 打开重置密码弹窗。
         */
        openReset() {
            this.openDialog("reset")
        },
        /**
         * @description 关闭账号弹窗并清空说明文案。
         */
        closeDialog() {
            this.dialogVisible = false
            this.dialogHint = ""
        },
        /**
         * @description 需要登录的功能守卫：已登录返回 true；未登录时弹出登录弹窗并返回 false。
         * @param hint 弹窗内展示的说明文案，用于说明当前操作需要登录。
         * @returns 当前是否已登录。
         */
        requireLogin(hint = ""): boolean {
            if (useUserStore().jwtToken) {
                return true
            }
            this.dialogTab = "login"
            this.dialogHint = hint
            this.dialogVisible = true
            return false
        },
    },
})
