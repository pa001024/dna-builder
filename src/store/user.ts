import { useLocalStorage } from "@vueuse/core"
import { jwtDecode } from "jwt-decode"
import { defineStore } from "pinia"
import { meQuery } from "@/api/gen/api-queries"
import type { User } from "@/api/gen/api-types"

function getPayload(token: string) {
    if (!token) return
    return jwtDecode<{
        id: string
        name: string
        email: string
        qq: string
        roles: string
    }>(token)
}

export const useUserStore = defineStore("user", {
    state: () => {
        return {
            // 身份验证
            jwtToken: useLocalStorage("jwt_token", ""),
            roomReadedCount: useLocalStorage("room_readed_count", {} as { [roomId: string]: number }),
            profile: useLocalStorage("user_profile", null as User | null),
        }
    },
    getters: {
        id(state) {
            return state.profile?.id || getPayload(state.jwtToken)?.id
        },
        email(state) {
            return state.profile?.email || getPayload(state.jwtToken)?.email
        },
        name(state) {
            return state.profile?.name || getPayload(state.jwtToken)?.name
        },
        qq(state) {
            return state.profile?.qq || getPayload(state.jwtToken)?.qq
        },
        roles(state) {
            return (state.profile?.roles || getPayload(state.jwtToken)?.roles || "").split(",").filter(Boolean)
        },
        experience(state) {
            return state.profile?.experience ?? 0
        },
        level(state) {
            return state.profile?.level ?? 1
        },
        isAdmin(state) {
            return (state.profile?.roles || getPayload(state.jwtToken)?.roles || "").split(",").includes("admin")
        },
        isGuest(state) {
            return (state.profile?.email || getPayload(state.jwtToken)?.email || "").endsWith("guest")
        },
        userInfo(state) {
            const payload = getPayload(state.jwtToken)
            if (!payload && !state.profile) return null
            return {
                id: state.profile?.id || payload?.id,
                name: state.profile?.name || payload?.name,
                email: state.profile?.email || payload?.email,
                qq: state.profile?.qq || payload?.qq,
                roles: (state.profile?.roles || payload?.roles || "").split(",").filter(Boolean),
                experience: state.profile?.experience ?? 0,
                level: state.profile?.level ?? 1,
            }
        },
    },
    actions: {
        logout() {
            this.jwtToken = ""
            this.profile = null
        },
        /**
         * @description 用服务端最新用户资料覆盖本地缓存。
         * @param profile 服务端返回的用户资料。
         */
        setProfile(profile: User | null) {
            this.profile = profile
        },
        /**
         * @description 主动清空本地用户资料缓存，常用于退出登录或切换账号。
         */
        clearProfile() {
            this.profile = null
        },
        /**
         * @description 从服务端重新拉取当前登录用户资料，并同步经验/等级等动态字段。
         */
        async refreshProfile() {
            if (!this.jwtToken) {
                this.profile = null
                return null
            }

            const profile = await meQuery(undefined, { requestPolicy: "network-only" })
            if (profile) {
                this.profile = profile
            }
            return profile
        },
        setRoomReadedCount(roomId: string, count: number) {
            this.roomReadedCount[roomId] = count
        },
        getRoomReadedCount(roomId: string) {
            return this.roomReadedCount[roomId] || 0
        },
    },
})
