import { getCurrentWindow } from "@tauri-apps/api/window"
import { useLocalStorage } from "@vueuse/core"
import { useObservable } from "@vueuse/rxjs"
import { liveQuery } from "dexie"
import { defineStore } from "pinia"
import {
    getGameInstall,
    importModFiles as importModData,
    importPicData,
    isGameRunning,
    launchExe,
    enableMod as moveModFiles,
    pathExists,
    readTextFile,
} from "../api/app"
import { env } from "../env"
import { sleep } from "../util"
import { resolveGameVersion } from "../utils/game-download"
import { type CustomEntity, db, type Mod, type UCustomEntity, type UMod } from "./db"

const GAME_RUNNING_POLL_MS = 1000
const GAME_LIVE_PERSIST_MS = 1000

if (env.isApp && getCurrentWindow().label === "main") {
    setTimeout(async () => {
        const game = useGameStore()
        let stopped = false
        let pendingLiveTotal = 0
        let pendingLiveDiff = 0
        let runtimeLiveTime = game.liveTime || Date.now()
        let lastPersistAt = Date.now()
        let lastObservedPath = game.path

        /**
         * 将累计的在线时长写回持久化状态，降低 localStorage 高频写入压力。
         */
        function flushLiveDuration() {
            if (pendingLiveTotal === 0 && pendingLiveDiff === 0) return
            game.liveTotal += pendingLiveTotal
            game.liveDiff += pendingLiveDiff
            game.liveTime = runtimeLiveTime
            pendingLiveTotal = 0
            pendingLiveDiff = 0
        }

        /**
         * 在窗口关闭时停止轮询，避免后台无意义循环。
         */
        function stopPolling() {
            stopped = true
        }
        window.addEventListener("beforeunload", stopPolling, { once: true })

        if (!game.path) {
            const installPath = await getGameInstall()
            if (installPath) {
                game.path = installPath
            }
        }

        await game.refreshGameInstalled()
        lastObservedPath = game.path

        try {
            while (!stopped) {
                const now = Date.now()

                // 先累计上一个周期的在线时长，确保运行状态切换时不丢时长
                if (game.running) {
                    const delta = now - runtimeLiveTime
                    if (delta > 0) {
                        pendingLiveTotal += delta
                        pendingLiveDiff += delta
                    }
                    runtimeLiveTime = now
                }

                const path = await isGameRunning(game.running)
                const realPath = path?.replace(/EM\\Binaries\\Win64\\EM-Win64-Shipping.exe$/, "EM.exe")
                const running = !!path

                // 只在未配置路径时自动补全，避免把别的服务器路径写回当前配置。
                if (!game.path && realPath) {
                    game.path = realPath
                }
                if (game.path !== lastObservedPath) {
                    await game.refreshGameInstalled()
                    lastObservedPath = game.path
                }
                if (game.running !== running) {
                    game.running = running
                    runtimeLiveTime = now
                    game.liveTime = runtimeLiveTime
                }

                const date = new Date().toLocaleDateString("zh")
                // 新的一天重新计时
                if (date !== game.liveDate) {
                    flushLiveDuration()
                    game.liveDate = date
                    game.liveDiff = 0
                }

                if (!running || now - lastPersistAt >= GAME_LIVE_PERSIST_MS) {
                    flushLiveDuration()
                    lastPersistAt = now
                }
                await sleep(GAME_RUNNING_POLL_MS)
            }
        } finally {
            flushLiveDuration()
            window.removeEventListener("beforeunload", stopPolling)
        }
    }, 1e3)
}

export const useGameStore = defineStore("game", {
    state: () => {
        return {
            dx11Enable: useLocalStorage("game.dx11_enable", false),
            modEnable: useLocalStorage("game.mod_enable", false),
            modLoader: useLocalStorage("game.mod_loader", "legacy"),
            pathEnable: useLocalStorage("game.path_enable", true),
            beforeGameEnable: useLocalStorage("game.before_enable", false),
            afterGameEnable: useLocalStorage("game.after_enable", false),
            path: useLocalStorage("game.path", ""),
            beforeGame: useLocalStorage("game.before", ""),
            afterGame: useLocalStorage("game.after", ""),
            pathParams: useLocalStorage("game.path_params", ""),
            beforeGameParams: useLocalStorage("game.before_params", ""),
            afterGameParams: useLocalStorage("game.after_params", ""),
            liveDate: useLocalStorage("game.live_date", "1999/1/1"),
            liveTime: useLocalStorage("game.live_time", 0),
            liveDiff: useLocalStorage("game.live_diff", 0),
            liveTotal: useLocalStorage("game.live_total", 0),
            running: false,
            installed: false,
            expend: false,
            lastLaunch: useLocalStorage("game.last_launch", 0),
            likedChars: useLocalStorage("game.liked_chars", [] as string[]),
            customEntitys: useObservable<CustomEntity[]>(liveQuery(() => db.customEntitys.toArray()) as any),
            selectedEntity: "",
        }
    },
    getters: {
        gameDir: state => state.path.replace(/EM\.exe$/, ""),
        gameExeExists: state => state.installed,
        modsDir: state => state.path.replace(/EM\.exe$/, "EM\\Content\\Paks\\~mods"),
        modsLib: state => state.path.replace(/EM\.exe$/, "EM\\Content\\Paks\\lib"),
    },
    actions: {
        /**
         * 校验游戏文件与本地版本是否匹配 CDN 期望版本。
         * @param expectedVersion CDN 正式版本号
         */
        async refreshGameInstalled(expectedVersion?: string | number) {
            if (!this.path || expectedVersion === undefined) {
                this.installed = false
                return
            }
            const gameDir = this.path.replace(/EM\.exe$/, "")
            const gameVersion = await readTextFile(`${gameDir}GameVersion.json`)
                .then(resolveGameVersion)
                .catch(() => null)
            this.installed =
                (await pathExists(this.path)) &&
                gameVersion !== null &&
                String(gameVersion) === String(expectedVersion) &&
                !(await pathExists(`${gameDir}.extracting`))
        },
        async launchGame() {
            if (Date.now() > this.lastLaunch && Date.now() - this.lastLaunch < 1000) {
                return
            }
            this.lastLaunch = Date.now()

            if (this.beforeGame && this.beforeGameEnable) {
                console.log("beforeGame")
                await launchExe(this.beforeGame, this.beforeGameParams)
            }
            if (this.path && this.pathEnable) {
                console.log("game start")
                let p = this.pathParams
                if (this.modEnable && this.modLoader === "legacy") {
                    p += ` -fileopenlog`
                }
                if (this.dx11Enable) {
                    p += ` -dx11`
                }
                await launchExe(this.path, p)
                console.log("game exited")
            }
            if (this.afterGame && this.afterGameEnable) {
                console.log("afterGame")
                await launchExe(this.afterGame, this.afterGameParams)
            }
        },
        /**
         * 切换实体的收藏状态。
         * @param charName 实体名称
         */
        likeChar(charName: string) {
            if (this.likedChars.includes(charName)) {
                this.likedChars = this.likedChars.filter(name => name !== charName)
            } else {
                this.likedChars.push(charName)
            }
        },
        /**
         * 保存一个 MOD 的元数据。
         * @param mod MOD 元数据
         */
        async addMod(mod: UMod) {
            await db.mods.add(mod)
        },
        /**
         * 删除 MOD，并在删除前撤销其启用状态。
         * @param mod 待删除的 MOD
         */
        async removeMod(mod: Mod) {
            const rel = await db.entityMods.get({ entity: mod.entity })
            if (rel && rel.modid === mod.id) {
                await this.disableMod(rel.modid)
                await db.entityMods.delete(rel.id)
            }

            await db.mods.delete(mod.id)
        },
        /**
         * 添加自定义实体类型。
         * @param entity 自定义实体
         */
        async addCustomEntity(entity: UCustomEntity) {
            await db.customEntitys.add(entity)
        },
        /**
         * 删除自定义实体类型。
         * @param entity 自定义实体
         */
        async removeCustomEntity(entity: CustomEntity) {
            await db.customEntitys.delete(entity.id)
        },
        /**
         * 获取实体下的 MOD 数量。
         * @param entity 实体名称
         * @returns MOD 数量
         */
        async getModsCountByEntity(entity: string) {
            return await db.mods.where("entity").equals(entity).count()
        },
        /**
         * 获取实体下的全部 MOD。
         * @param entity 实体名称
         * @returns MOD 列表
         */
        async getModsByEntity(entity: string) {
            return await db.mods.where("entity").equals(entity).toArray()
        },
        /**
         * 获取实体当前启用的 MOD。
         * @param entity 实体名称
         * @returns 当前启用的 MOD
         */
        async getEntityMod(entity: string) {
            const rel = await db.entityMods.get({ entity })
            return rel ? await db.mods.get(rel.modid) : undefined
        },
        /**
         * 将 MOD 文件从资源库移动到游戏 MOD 目录。
         * @param modid MOD ID
         * @returns 是否成功
         */
        async enableMod(modid: number) {
            const mod = await db.mods.get(modid)
            if (!mod) {
                console.error("mod not found")
                return false
            }
            const error = await moveModFiles(this.modsLib, this.modsDir, mod.files)
            if (error) {
                console.error(error)
                return false
            }
            return true
        },
        /**
         * 将 MOD 文件从游戏 MOD 目录移回资源库。
         * @param modid MOD ID
         * @returns 是否成功
         */
        async disableMod(modid: number) {
            const mod = await db.mods.get(modid)
            if (!mod) {
                console.error("mod not found")
                return false
            }
            const error = await moveModFiles(this.modsDir, this.modsLib, mod.files)
            if (error) {
                console.error(error)
                return false
            }
            return true
        },
        /**
         * 为实体设置或取消当前启用的 MOD。
         * @param entity 实体名称
         * @param modid MOD ID，0 表示取消
         * @returns 是否成功
         */
        async setEntityMod(entity: string, modid: number) {
            const rel = await db.entityMods.get({ entity })
            if (rel && rel.modid === modid) {
                return true
            }

            if (!modid) {
                if (!rel) return true
                if (!(await this.disableMod(rel.modid))) return false
                await db.entityMods.delete(rel.id)
                return true
            }

            if (rel) {
                if (!(await this.disableMod(rel.modid))) return false
                if (!(await this.enableMod(modid))) return false
                await db.entityMods.put({ id: rel.id, entity, modid })
                return true
            }

            if (!(await this.enableMod(modid))) return false
            await db.entityMods.add({ entity, modid })
            return true
        },
        /**
         * 导入 MOD 文件并保存其元数据。
         * @param files 待导入的文件
         * @returns 是否成功
         */
        async importMod(files: File[]) {
            const entity = this.selectedEntity
            if (!entity || !files.length) return false

            const importedFiles = await Promise.all(
                files.map(async file => ({
                    name: file.name,
                    data: new Uint8Array(await file.arrayBuffer()),
                }))
            )
            const results = await importModData(this.modsLib, importedFiles)
            if (!results.length) return false

            let totalSize = 0
            const importedNames: string[] = []
            results.forEach(([path, size]) => {
                const file = path.split(/[\\/]/).pop()
                if (file) {
                    importedNames.push(file)
                    totalSize += size
                } else {
                    console.error(`importMods error: ${path}`)
                }
            })

            await this.addMod({
                entity,
                name: files[0].name.split(/[\\/]/).pop()?.split(".")[0] || "",
                files: importedNames,
                addTime: Date.now(),
                size: totalSize,
                pic: "",
            })
            return true
        },
        /**
         * 将本地图片保存为 MOD 预览图。
         * @param modid MOD ID
         * @param file 图片文件
         * @returns 是否成功
         */
        async importPic(modid: number, file: File) {
            const extension = file.name.split(".").pop()?.toLowerCase() || ""
            const mime =
                file.type ||
                ({
                    bmp: "image/bmp",
                    gif: "image/gif",
                    ico: "image/x-icon",
                    jpeg: "image/jpeg",
                    jpg: "image/jpeg",
                    png: "image/png",
                    tif: "image/tiff",
                    tiff: "image/tiff",
                    webp: "image/webp",
                }[extension] ??
                    "")
            const result = await importPicData(new Uint8Array(await file.arrayBuffer()), mime)
            if (!result) return false

            const mod = await db.mods.get(modid)
            if (!mod) {
                console.error("mod not found")
                return false
            }
            mod.pic = result
            await db.mods.put(mod)
            return true
        },
    },
})
