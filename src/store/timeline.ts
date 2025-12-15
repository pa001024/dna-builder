import { useLocalStorage } from "@vueuse/core"
import { computed, Ref } from "vue"

export interface RawTimelineData {
    name: string
    tracks: string[]
    items: {
        i: number
        n: string
        t: number
        d: number
        l?: number
    }[]
}
export const useTimeline = (charNameRef: Ref<string>) => {
    const timelineKey = computed(() => `timeline.${charNameRef.value}`)

    const timelineData = useLocalStorage(timelineKey.value, [] as RawTimelineData[])
    return timelineData
}
