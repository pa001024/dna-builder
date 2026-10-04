/**
 * 时间线存档的数据形状。
 *
 * 归属说明：`CharBuildTimeline.fromRaw` 以它为输入契约（数据层计算内核），故定义放在数据层；
 * `store/timeline.ts` 只负责按角色名读写 localStorage，引用此处定义以保证两端形状一致。
 */
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
