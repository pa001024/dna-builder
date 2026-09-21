/**
 * 密函(委托密函)的类型元数据与委托任务清单。
 *
 * 下标与 `store/mihan` 的 `mihanData` 分组一一对应;主题色按角色金 / 武器蓝 / 魔之楔红。
 * 首页密函卡片与屏幕信息条的委托条目共用,保证同一类型在两处配色一致;类型名走 i18n,不在这里存文案。
 * 任务名既是筛选用的稳定标识也是 i18n 键,因此放在这个无依赖模块里,供纯逻辑模块直接引用。
 */
export const MIHAN_TYPE_META = [
    { icon: "/imgs/webp/T_Walnut_Avatar.webp", color: "#ba9011" },
    { icon: "/imgs/webp/T_Walnut_Weapon.webp", color: "#1171ba" },
    { icon: "/imgs/webp/T_Walnut_Mod.webp", color: "#ba1111" },
] as const

/**
 * 全部委托密函任务名(与密函数据里的任务名一致)。
 *
 * 只收「委托密函」副本实际覆盖的任务 —— 口径来自 `dungeon-utils.ts` 的 `mhList`(三类型各 8 个副本)。
 * 游戏里没有委托密函副本的任务不能列进来:选了它永远等不到,关注过滤会变成死选项。
 */
export const MIHAN_MISSIONS: readonly string[] = ["探险/无尽", "驱离", "拆解", "驱逐", "避险", "扼守/无尽", "追缉", "调停"]
