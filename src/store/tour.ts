import { defineStore } from "pinia"
import { useLocalStorage } from "@vueuse/core"

export const useTourStore = defineStore("tour", () => {
    // 使用 localStorage 持久化已完成的 tour
    const completedTours = useLocalStorage<Record<string, boolean>>("tours-completed", {})

    /**
     * 标记指定 tour 为已完成
     */
    function markTourCompleted(tourKey: string) {
        completedTours.value[tourKey] = true
    }

    /**
     * 检查指定 tour 是否已完成
     */
    function isTourCompleted(tourKey: string): boolean {
        return !!completedTours.value[tourKey]
    }

    /**
     * 重置指定 tour，允许再次显示
     */
    function resetTour(tourKey: string) {
        delete completedTours.value[tourKey]
    }

    /**
     * 重置所有 tours
     */
    function resetAllTours() {
        completedTours.value = {}
    }

    return {
        completedTours,
        markTourCompleted,
        isTourCompleted,
        resetTour,
        resetAllTours,
    }
})
