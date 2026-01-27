import { getCurrentWindow } from "@tauri-apps/api/window"
import { useLocalStorage } from "@vueuse/core"
import { useObservable } from "@vueuse/rxjs"
import { liveQuery } from "dexie"
import { defineStore } from "pinia"
import { enableMod, getGameInstall, importMod, importPic, isGameRunning, launchExe } from "../api/app"
import { env } from "../env"
import { sleep } from "../util"
import { type CustomEntity, db, type Mod, type UCustomEntity, type UMod } from "./db"

if (env.isApp && getCurrentWindow().label === "main") {
    setTimeout(async () => {
        const game = useGameStore()

        if (!game.path) {
            const installPath = await getGameInstall()
            if (installPath) {
                game.path = installPath
            }
        }

        while (true) {
            const path = await isGameRunning(game.running)
            const realPath = path?.replace(/EM\\Binaries\\Win64\\EM-Win64-Shipping.exe$/, "EM.exe")
            const running = !!path
            if (realPath && (!game.path || game.path !== realPath)) {
                game.path = realPath
            }
            if (game.running !== running) {
                game.running = running
                game.liveTime = Date.now()
            }
            const date = new Date().toLocaleDateString("zh")
            // 新的一天重新计时
            if (date !== game.liveDate) {
                game.liveDate = date
                game.liveDiff = 0
            }
            if (running) {
                game.liveTotal += Date.now() - game.liveTime
                game.liveDiff += Date.now() - game.liveTime
                game.liveTime = Date.now()
            }
            await sleep(100)
        }
    }, 1e3)
}

export const useGameStore = defineStore("game", {
    state: () => {
        return {
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
            expend: false,
            lastLaunch: useLocalStorage("game.last_launch", 0),
            likedChars: useLocalStorage("game.liked_chars", [] as string[]),
            customEntitys: useObservable<CustomEntity[]>(liveQuery(() => db.customEntitys.toArray()) as any),
            selectedEntity: "",
        }
    },
    getters: {
        gameDir: state => state.path.replace(/EM\.exe$/, ""),
        modsDir: state => state.path.replace(/EM\.exe$/, "EM\\Content\\Paks\\~mods"),
        modsLib: state => state.path.replace(/EM\.exe$/, "EM\\Content\\Paks\\lib"),
    },
    actions: {
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
                await launchExe(this.path, p)
                console.log("game exited")
            }
            if (this.afterGame && this.afterGameEnable) {
                console.log("afterGame")
                await launchExe(this.afterGame, this.afterGameParams)
            }
        },
        likeChar(charName: string) {
            if (this.likedChars.includes(charName)) {
                this.likedChars = this.likedChars.filter(name => name !== charName)
            } else {
                this.likedChars.push(charName)
            }
        },
        async addMod(mod: UMod) {
            await db.mods.add(mod)
        },
        async removeMod(mod: Mod) {
            const rel = await db.entityMods.get({ entity: mod.entity })
            if (rel && rel.modid === mod.id) {
                await this.disableMod(rel.modid)
                await db.entityMods.delete(rel.id)
            }

            await db.mods.delete(mod.id)
        },
        async addCustomEntity(entity: UCustomEntity) {
            await db.customEntitys.add(entity)
        },
        async removeCustomEntity(entity: CustomEntity) {
            await db.customEntitys.delete(entity.id)
        },
        async getModsCountByEntity(entity: string) {
            const rels = await db.mods.where("entity").equals(entity).count()
            return rels || 0
        },
        async getModsByEntity(entity: string) {
            const mods = db.mods.where("entity").equals(entity).toArray()
            return mods
        },
        async getEntityMod(entity: string) {
            const rel = await db.entityMods.get({ entity })
            const mod = rel && db.mods.get(rel.modid)
            return mod
        },
        async enableMod(modid: number) {
            const mod = await db.mods.get(modid)
            if (!mod) {
                console.error("mod not found")
                return false
            }
            const error = await enableMod(this.modsLib, this.modsDir, mod.files)
            if (error) {
                console.error(error)
                return false
            }
            return true
        },
        async disableMod(modid: number) {
            const mod = await db.mods.get(modid)
            if (!mod) {
                console.error("mod not found")
                return false
            }
            const error = await enableMod(this.modsDir, this.modsLib, mod.files)
            if (error) {
                console.error(error)
                return false
            }
            return true
        },
        async setEntityMod(entity: string, modid: number) {
            const rel = await db.entityMods.get({ entity })
            // 如果当前MODID与新MODID相同，直接返回
            if (rel && rel.modid === modid) {
                return true
            }
            if (rel) {
                // 如果存在记录，先禁用旧的MOD
                const disabled = await this.disableMod(rel.modid)
                if (!disabled) {
                    return false
                }
                if (!modid) {
                    await db.entityMods.delete(rel.id)
                } else {
                    // 启用新MOD
                    const enabled = await this.enableMod(modid)
                    if (!enabled) {
                        return false
                    }
                    await db.entityMods.put({ id: rel.id, entity, modid })
                }
            } else {
                // 如果不存在记录，直接启用新MOD
                const enabled = await this.enableMod(modid)
                if (!enabled) {
                    return false
                }
                await db.entityMods.add({ entity, modid })
            }
            return true
        },
        async importMod(paths: string[]) {
            const entity = this.selectedEntity
            if (!entity) {
                return false
            }
            const results = await importMod(this.modsLib, paths)
            if (!results.length) {
                return false
            }
            let totalSize = 0
            const files = [] as string[]
            results.forEach(([path, size]) => {
                const file = path.split("\\").pop()
                if (file) {
                    files.push(file)
                    totalSize += size
                } else {
                    console.error(`importMods error: ${path}`)
                }
            })
            this.addMod({
                entity,
                name: paths[0].split("\\").pop()?.split(".")[0] || "",
                files,
                addTime: Date.now(),
                size: totalSize,
                pic: "",
            })
            return true
        },
        async importPic(modid: number, path: string) {
            const results = await importPic(path)
            if (!results) {
                return false
            }
            const mod = await db.mods.get(modid)
            if (!mod) {
                console.error("mod not found")
                return false
            }
            mod.pic = results
            await db.mods.put(mod)
            return true
        },
    },
})
