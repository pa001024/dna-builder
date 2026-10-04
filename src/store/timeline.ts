import { useLocalStorage } from "@vueuse/core"
import { computed, type Ref } from "vue"
import type { RawTimelineData } from "@/data/timeline-data"

export type { RawTimelineData } from "@/data/timeline-data"

/**
 * 基于角色名读取/写入对应的时间轴本地存储数据。
 * @param charNameRef 角色名称响应式引用。
 * @returns 当前角色绑定的时间轴数据。
 */
export const useTimeline = (charNameRef: Ref<string>) => {
    const timelineKey = computed(() => `timeline.${charNameRef.value}`)
    const timelineData = useLocalStorage<RawTimelineData[]>(timelineKey, [])
    return timelineData
}
