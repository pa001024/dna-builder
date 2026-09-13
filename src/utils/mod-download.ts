import type { GameMod } from "@/api/gen/api-types"
import type { InstalledShareMod, Mod } from "@/store/db"

/**
 * 分享 MOD 下载与安装状态的纯逻辑（不依赖网络、数据库与组件，便于单元测试）。
 * 队列本身（串行调度、进度、取消）在 store/modDownload.ts，这里只放可判定的规则。
 */

/** 分享 MOD 相对本地安装记录的状态。 */
export type ModInstallState =
    /** 本地没有安装记录，可直接下载安装。 */
    | "new"
    /** 已安装且与远端最新版本一致。 */
    | "installed"
    /** 已安装但远端有更新版本。 */
    | "outdated"

/** 队列任务 key：最新版任务用发布 id，指定版本任务用 `发布id:版本id`。 */
export function modTaskKey(modId: string, versionId?: string | null) {
    return versionId ? `${modId}:${versionId}` : modId
}

/** 分享 MOD 临时压缩包在系统临时目录下的子目录名。 */
export const MOD_TEMP_DIR_NAME = "dna-builder-mods"

/**
 * @description 构造分享 MOD 临时压缩包的文件名（不含目录）。
 * 文件名带上时间戳，避免「先取消再重下」等场景复用到同一个路径（Rust 侧同一路径不允许并发下载）。
 * @param modId 发布 id。
 * @param stamp 时间戳（毫秒）。
 * @returns 临时文件名。
 */
export function buildModTempFileName(modId: string, stamp: number) {
    // 文件名会直接交给 Rust 写盘，这里只保留安全字符，防止发布 id 里的异常字符影响路径
    const safeId = modId.replace(/[^0-9A-Za-z_-]/g, "_")
    return `${safeId}-${stamp}.zip`
}

/**
 * @description 计算下载百分比（0-100）。
 * @param loaded 已接收字节数。
 * @param total 总字节数，0 或负数表示总量未知。
 * @returns 百分比整数；总量未知时返回 null（界面显示不确定进度）。
 */
export function computeDownloadProgress(loaded: number, total: number): number | null {
    if (!(total > 0)) return null
    const percent = Math.round((loaded / total) * 100)
    return Math.min(100, Math.max(0, percent))
}

/**
 * @description 判定某个分享 MOD 相对本地安装记录的状态。
 * 优先比较版本 id（最准确）；旧记录或列表未带版本信息时，退化为比较发布更新时间的先后。
 * @param record 本地已安装记录，未安装时为 undefined。
 * @param mod 远端发布（列表项即可，需带 updateAt 与可选的 latestVersion）。
 * @returns 安装状态。
 */
export function resolveModInstallState(
    record: InstalledShareMod | undefined,
    mod: Pick<GameMod, "fileSize" | "updateAt"> & { latestVersion?: GameMod["latestVersion"] }
): ModInstallState {
    if (!record) return "new"

    const remoteVersionId = mod.latestVersion?.id
    if (remoteVersionId && record.versionId) {
        return remoteVersionId === record.versionId ? "installed" : "outdated"
    }

    // 缺少版本 id 时用发布时间判断：发布内容更新会刷新 updateAt（下载/浏览不会）
    if (mod.updateAt > record.modUpdateAt) return "outdated"
    return "installed"
}

/**
 * @description 判断某个具体版本是否就是本地已安装的版本（详情页版本列表用）。
 * @param record 本地已安装记录。
 * @param versionId 目标版本 id。
 * @returns 是否为已安装版本。
 */
export function isVersionInstalled(record: InstalledShareMod | undefined, versionId: string) {
    return !!record && record.versionId === versionId
}

/**
 * @description 在本地 MOD 列表中查找安装记录对应的本地 MOD（按安装时写入的名称 + 所属实体匹配）。
 * 用于更新时先移除旧版本，避免每次更新都残留一份旧 MOD。
 * @param mods 目标实体下的本地 MOD 列表。
 * @param record 本地已安装记录。
 * @returns 匹配到的本地 MOD，未找到（已被手动删除）时返回 undefined。
 */
export function findInstalledLocalMod(mods: Mod[], record: InstalledShareMod | undefined) {
    if (!record) return undefined
    return mods.find(mod => mod.name === record.localName && mod.entity === record.entity)
}

/**
 * @description 取远端发布最新版本的展示标签。
 * @param mod 远端发布。
 * @returns 版本号标签，未知时返回 undefined。
 */
export function latestVersionLabel(mod: Pick<GameMod, "latestVersion">) {
    return mod.latestVersion?.version || undefined
}
