import { useLocalStorage } from "@vueuse/core"
import { defineStore } from "pinia"
import { jwtDecode } from "jwt-decode"

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
        }
    },
    getters: {
        id(state) {
            return getPayload(state.jwtToken)?.id
        },
        email(state) {
            return getPayload(state.jwtToken)?.email
        },
        name(state) {
            return getPayload(state.jwtToken)?.name
        },
        qq(state) {
            return getPayload(state.jwtToken)?.qq
        },
        roles(state) {
            return getPayload(state.jwtToken)?.roles?.split(",") || []
        },
        isAdmin(state) {
            return (getPayload(state.jwtToken)?.roles?.split(",") || []).includes("admin")
        },
        isGuest(state) {
            return getPayload(state.jwtToken)?.email?.endsWith("guest") || false
        },
        today() {
            return new Date(Date.now() - 4 * 36e5).toLocaleDateString("zh-CN")
        },
        userInfo(state) {
            const payload = getPayload(state.jwtToken)
            if (!payload) return null
            return {
                id: payload.id,
                name: payload.name,
                email: payload.email,
                qq: payload.qq,
                roles: payload.roles.split(","),
            }
        },
    },
    actions: {
        logout() {
            this.jwtToken = ""
        },
        setRoomReadedCount(roomId: string, count: number) {
            this.roomReadedCount[roomId] = count
        },
        getRoomReadedCount(roomId: string) {
            return this.roomReadedCount[roomId] || 0
        },
    },
})
