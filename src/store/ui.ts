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
                    // -- flex-1
                },
                {
                    name: "user",
                    path: "/user",
                    icon: "la:user",
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
