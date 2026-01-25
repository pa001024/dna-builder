import { useLocalStorage } from "@vueuse/core"
import { computed, type Ref } from "vue"

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
    /** 血量曲线数据 [时间, 血量值][] */
    hp?: [number, number][]
}
export const useTimeline = (charNameRef: Ref<string>) => {
    const timelineKey = computed(() => `timeline.${charNameRef.value}`)

    const timelineData = useLocalStorage(timelineKey.value, [] as RawTimelineData[])
    return timelineData
}
