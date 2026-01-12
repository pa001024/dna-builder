import { watchEffect } from "vue"
import { useLocalStorage } from "@vueuse/core"
import { useSound } from "@vueuse/sound"
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification"
import { t } from "i18next"
import { missionsIngameQuery } from "../api/query"
import { useSettingStore } from "../store/setting"
import { env } from "../env"
import { useUIStore } from "./ui"
import { getInstanceInfo } from "@/api/external"

export class MihanNotify {
    mihanData = useLocalStorage<string[][] | undefined>("mihanData", [])
    mihanUpdateTime = useLocalStorage<number>("mihanUpdateTime", 0)
    mihanEnableNotify = useLocalStorage("mihanNotify", false)
    mihanNotifyOnce = useLocalStorage("mihanNotifyOnce", true)
    mihanNotifyTypes = useLocalStorage("mihanNotifyTypes", [] as number[])
    mihanNotifyMissions = useLocalStorage("mihanNotifyMissions", [] as string[])
    sfx = useSound("/sfx/notice.mp3")
    watch = false
    constructor() {
        watchEffect(() => {
            const ui = useUIStore()
            if (ui.mihanVisible) {
                this.updateMihanData()
            }
        })

        watchEffect(() => {
            if (this.mihanEnableNotify.value) {
                this.startWatch()
            }
        })
    }
    async updateMihanData() {
        if (this.mihanData.value && !this.isOutdated()) return true
        const setting = useSettingStore()
        const api = await setting.getDNAAPI()
        if (api) {
            // 用户登录尝试使用DNAAPI获取密函
            const data = await api.defaultRoleForTool()
            if (data?.data?.instanceInfo) {
                const missions = data.data.instanceInfo.map(v => v.instances.map(v => v.name.replace("勘探/无尽", "勘察/无尽")))
                if (!missions) return false
                if (JSON.stringify(missions) === JSON.stringify(this.mihanData.value)) {
                    this.mihanUpdateTime.value = Date.now()
                    return false
                }
                this.mihanData.value = missions
                this.mihanUpdateTime.value = Date.now()
                return true
            }
        }
        try {
            // 自己服务器
            const data = await missionsIngameQuery()
            const missions = data?.missions.map(v => v.map(v => v.replace("勘探/无尽", "勘察/无尽")))
            if (!missions) return false
            if (JSON.stringify(missions) === JSON.stringify(this.mihanData.value)) {
                this.mihanUpdateTime.value = Date.now()
                return false
            }
            this.mihanData.value = missions
            this.mihanUpdateTime.value = new Date(data!.createdAt).getTime()
        } catch {}
        if (this.isOutdated()) {
            // gamekee
            const instanceInfo = await getInstanceInfo()
            if (instanceInfo) {
                this.mihanData.value = instanceInfo.map(v => v.map(v => v.replace("勘探/无尽", "勘察/无尽")))
                this.mihanUpdateTime.value = Date.now()
            }
        }
        return true
    }
    show() {
        const ui = useUIStore()
        ui.mihanVisible = true
    }
    isOutdated() {
        return Date.now() > this.getNextUpdateTime(this.mihanUpdateTime.value)
    }
    async showMihanNotification() {
        if (this.mihanNotifyOnce.value) {
            this.mihanEnableNotify.value = false
        }
        if (env.isApp) {
            const matchedTypes = this.mihanData
                .value!.filter(
                    (list, type) => this.mihanNotifyTypes.value.includes(type) && list.some(v => this.mihanNotifyMissions.value.includes(v))
                )
                .map(
                    (list, type) =>
                        `${t(MihanNotify.TYPES[type])}-${list
                            .filter(v => this.mihanNotifyMissions.value.includes(v))
                            .map(v => t(v))
                            .join("、")}`
                )
            let permissionGranted = await isPermissionGranted()
            if (!permissionGranted) {
                const permission = await requestPermission()
                permissionGranted = permission === "granted"
            }
            if (permissionGranted) {
                sendNotification({
                    title: t("resizeableWindow.mihanNotificationTitle"),
                    body: t("resizeableWindow.mihanNotificationBody", { types: matchedTypes.join(t("resizeableWindow.and")) }),
                })
            }
        }
        this.sfx.play()
        this.show()
    }
    getNextUpdateTime(t?: number) {
        const now = t ?? new Date().getTime()
        const oneHour = 60 * 60 * 1000
        return Math.ceil(now / oneHour) * oneHour
    }
    shouldNotify() {
        if (
            this.mihanData.value?.some(
                (list, type) => this.mihanNotifyTypes.value.includes(type) && list.some(v => this.mihanNotifyMissions.value.includes(v))
            )
        ) {
            return true
        }
        return false
    }
    async checkNotify() {
        if (this.shouldNotify()) {
            await this.showMihanNotification()
        }
    }
    sleep(duration: number) {
        return new Promise(resolve => setTimeout(resolve, duration))
    }
    startWatch() {
        if (this.watch) return
        console.log("start watch")
        this.watch = true
        const next = this.getNextUpdateTime()
        const duration = next - new Date().getTime()
        setTimeout(async () => {
            this.watch = false
            let ok = await this.updateMihanData()
            let c = 0
            while (!ok && c < 3) {
                c++
                console.log("update mihan data failed, retry in 3s")
                ok = await this.updateMihanData()
                await this.sleep(3e3)
            }
            await this.checkNotify()
            if (this.mihanEnableNotify.value) this.startWatch()
        }, duration + 25e3) // 由于服务器往往需要25s左右才能更新数据，所以这里设置25s
    }
    static TYPES = ["角色", "武器", "魔之楔"]
    static MISSIONS = ["探险/无尽", "驱离", "拆解", "驱逐", "避险", "扼守/无尽", "护送", "勘察/无尽", "追缉", "调停", "迁移"]
}
