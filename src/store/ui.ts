import { defineStore } from "pinia"
import { type IconTypes } from "../components/Icon.vue"

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
            schatTitle: "",
            tabs: [
                {
                    name: "home",
                    path: "/",
                    icon: "la:bookmark",
                },
                {
                    name: "char-build",
                    path: "/char-build",
                    icon: "la:edit-solid",
                },
                {
                    name: "inventory",
                    path: "/inventory",
                    icon: "ri:box-1-line",
                },
                {
                    name: "game",
                    path: "/game",
                    icon: "la:gamepad-solid",
                },
                {
                    // -- flex-1
                },
                {
                    name: "setting",
                    path: "/setting",
                    icon: "la:cog-solid",
                },
            ] satisfies ITab[] as ITab[],
        }
    },
    actions: {
        toggleSidebar() {
            this.sidebarExpand = !this.sidebarExpand
        },
    },
})
