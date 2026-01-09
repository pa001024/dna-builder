<script setup lang="ts">
import { onMounted, ref } from "vue"
import { DNAAPI, DNAGameConfigResponse, DNARoleEntity } from "dna-api"
import { useSettingStore } from "../store/setting"
import { useUIStore } from "../store/ui"
import { useLocalStorage } from "@vueuse/core"
import { useInvStore } from "../store/inv"
defineProps<{
    nobtn?: boolean
}>()
const setting = useSettingStore()
const ui = useUIStore()
const inv = useInvStore()

let api: DNAAPI

const loading = ref(true)
const gameConfig = useLocalStorage<DNAGameConfigResponse>("dna.gameConfig", {} as any)
const roleInfo = useLocalStorage<DNARoleEntity>("dna.roleInfo", {} as any)
const lastUpdateTime = useLocalStorage("dna.gameInfo.lastUpdateTime", 0)

onMounted(async () => {
    const t = await setting.getDNAAPI()
    if (!t) {
        ui.showErrorMessage("请先登录")
        return
    }
    api = t
    await loadData()
})

async function loadData(force = false) {
    try {
        if (lastUpdateTime.value > 0 && ui.timeNow - lastUpdateTime.value < 1000 * 60 * 5 && !force) {
            loading.value = false
            return
        }
        loading.value = true

        const res = await api.getGameConfig()
        if (res.is_success && res.data) {
            gameConfig.value = res.data[0]
        } else {
            ui.showErrorMessage(res.msg || "获取游戏配置失败")
        }

        const roleRes = await api.defaultRoleForTool()
        if (roleRes.is_success && roleRes.data) {
            roleInfo.value = roleRes.data
        } else {
            ui.showErrorMessage(roleRes.msg || "获取默认角色信息失败")
        }

        lastUpdateTime.value = ui.timeNow
    } catch (e) {
        console.error(e)
        ui.showErrorMessage("获取游戏配置失败")
    } finally {
        loading.value = false
    }
}

async function syncInventory() {
    try {
        if (!roleInfo.value.roleInfo.roleShow.closeWeapons || !roleInfo.value.roleInfo.roleShow.langRangeWeapons) {
            ui.showErrorMessage("无库存, 请先到官方APP绑定角色")
            return
        }
        inv.meleeWeapons = roleInfo.value.roleInfo.roleShow.closeWeapons.reduce(
            (acc, cur) => {
                if (cur.unLocked) acc[cur.name] = cur.skillLevel
                return acc
            },
            {} as Record<string, number>,
        )
        inv.rangedWeapons = roleInfo.value.roleInfo.roleShow.langRangeWeapons.reduce(
            (acc, cur) => {
                if (cur.unLocked) acc[cur.name] = cur.skillLevel
                return acc
            },
            {} as Record<string, number>,
        )
        ui.showSuccessMessage("库存同步成功")
    } catch (e) {
        ui.showErrorMessage("库存同步失败")
    }
}

defineExpose({
    loadData,
    lastUpdateTime,
})
</script>
<template>
    <div class="space-y-6">
        <div class="flex justify-between items-center" v-if="!nobtn">
            <span class="text-xs text-gray-500">最后更新: {{ ui.timeDistancePassed(lastUpdateTime) }}</span>
            <Tooltip tooltip="刷新" side="bottom">
                <button class="btn btn-primary btn-square btn-sm" @click="loadData(true)">
                    <Icon icon="ri:refresh-line" />
                </button>
            </Tooltip>
        </div>
        <div v-if="loading" class="flex justify-center items-center h-full py-8">
            <span class="loading loading-spinner loading-lg"></span>
        </div>
        <div v-if="roleInfo" class="space-y-6">
            <div class="card bg-base-100 shadow-xl">
                <div class="card-body">
                    <div class="flex flex-col md:flex-row items-center gap-4">
                        <div class="avatar">
                            <div class="w-24 h-24 rounded-full ring ring-primary ring-offset-base-100 ring-offset-2">
                                <img :src="roleInfo.roleInfo.roleShow.headUrl" :alt="roleInfo.roleInfo.roleShow.roleName" />
                            </div>
                        </div>
                        <div class="flex-1">
                            <h2 class="text-2xl font-bold">{{ roleInfo.roleInfo.roleShow.roleName }}</h2>
                            <div class="text-sm text-base-content/70 mt-1">UID: {{ roleInfo.roleInfo.roleShow.roleId }}</div>
                            <div class="text-sm text-base-content/70 mt-1">Lv. {{ roleInfo.roleInfo.roleShow.level }}</div>
                        </div>
                        <div class="ml-auto">
                            <button class="btn btn-primary" @click="syncInventory">
                                <Icon icon="ri:refresh-line" />
                                同步库存
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div v-if="roleInfo.instanceInfo.length > 0" class="card bg-base-100 shadow-xl">
                <div class="card-body">
                    <h3 class="card-title mb-4">
                        <span>委托密函</span>
                        <div class="ml-auto btn btn-ghost" @click="ui.mihanVisible = true">
                            <Icon icon="ri:settings-3-line" />
                            推送设置
                        </div>
                    </h3>
                    <div class="space-y-4">
                        <DNAMihanItem :missions="roleInfo.instanceInfo.map((item) => item.instances.map((v) => v.name)) || []" />
                    </div>
                </div>
            </div>

            <div class="card bg-base-100 shadow-xl">
                <div class="card-body">
                    <h3 class="card-title mb-4">角色</h3>
                    <div
                        class="grid grid-cols-[repeat(auto-fill,minmax(min(100%,160px),1fr))] sm:grid-cols-[repeat(auto-fill,minmax(min(100%,180px),1fr))] md:grid-cols-[repeat(auto-fill,minmax(min(100%,200px),1fr))] gap-4"
                    >
                        <DNACharItem :char="char" v-for="char in roleInfo.roleInfo.roleShow.roleChars" :key="char.charId" />
                    </div>
                </div>
            </div>

            <div class="card bg-base-100 shadow-xl">
                <div class="card-body">
                    <h3 class="card-title mb-4">远程武器</h3>
                    <div
                        class="grid grid-cols-[repeat(auto-fill,minmax(min(100%,160px),1fr))] sm:grid-cols-[repeat(auto-fill,minmax(min(100%,180px),1fr))] md:grid-cols-[repeat(auto-fill,minmax(min(100%,200px),1fr))] gap-4"
                    >
                        <DNAWeaponItem
                            :weapon="weapon"
                            v-for="weapon in roleInfo.roleInfo.roleShow.langRangeWeapons"
                            :key="weapon.weaponId"
                        />
                    </div>
                </div>
            </div>

            <div class="card bg-base-100 shadow-xl">
                <div class="card-body">
                    <h3 class="card-title mb-4">近战武器</h3>
                    <div
                        class="grid grid-cols-[repeat(auto-fill,minmax(min(100%,160px),1fr))] sm:grid-cols-[repeat(auto-fill,minmax(min(100%,180px),1fr))] md:grid-cols-[repeat(auto-fill,minmax(min(100%,200px),1fr))] gap-4"
                    >
                        <DNAWeaponItem :weapon="weapon" v-for="weapon in roleInfo.roleInfo.roleShow.closeWeapons" :key="weapon.weaponId" />
                    </div>
                </div>
            </div>

            <div class="card bg-base-100 shadow-xl">
                <div class="card-body">
                    <h3 class="card-title mb-4">迷津</h3>
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div class="bg-base-200 p-3 rounded-lg">
                            <div class="text-sm font-medium">进度</div>
                            <div class="text-xl font-bold">
                                {{ ["0", "I", "II", "III", "IV", "V", "VI"][roleInfo.roleInfo.roleShow.rougeLikeInfo.maxPassed >> 4] }}
                            </div>
                            <div class="text-sm text-base-content/70">
                                Lv.{{ (roleInfo.roleInfo.roleShow.rougeLikeInfo.maxPassed & 8) * 10 }}
                            </div>
                        </div>
                        <div class="bg-base-200 p-3 rounded-lg">
                            <div class="text-sm font-medium">本周行迹</div>
                            <div class="text-xl font-bold">{{ roleInfo.roleInfo.roleShow.rougeLikeInfo.rewardCount }}</div>
                            <div class="text-sm text-base-content/70">/ {{ roleInfo.roleInfo.roleShow.rougeLikeInfo.rewardTotal }}</div>
                        </div>
                        <div class="bg-base-200 p-3 rounded-lg">
                            <div class="text-sm font-medium">重置时间</div>
                            <div class="text-xl font-bold">
                                {{ ui.timeDistanceFuture(+roleInfo.roleInfo.roleShow.rougeLikeInfo.resetTime * 1000) }}
                            </div>
                            <div class="text-sm text-base-content/70">
                                {{ new Date(+roleInfo.roleInfo.roleShow.rougeLikeInfo.resetTime * 1000).toLocaleDateString() }}
                            </div>
                        </div>
                    </div>

                    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div
                            v-for="(talent, index) in roleInfo.roleInfo.roleShow.rougeLikeInfo.talentInfo"
                            :key="index"
                            class="bg-base-200 p-3 rounded-lg"
                        >
                            <div class="text-sm font-medium">{{ ["技能", "适应", "近战", "远程"][index] }}强化</div>
                            <div class="text-xl font-bold">
                                {{ talent.cur }}
                            </div>
                            <div class="text-sm text-base-content/70">/ {{ talent.max }}</div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="card bg-base-100 shadow-xl">
                <div class="card-body">
                    <h3 class="card-title mb-4">
                        {{ roleInfo.roleInfo.abyssInfo.operaName }}
                        <span class="ml-auto text-base-content/70 text-sm"
                            >{{ new Date(+roleInfo.roleInfo.abyssInfo.startTime * 1000).toLocaleDateString() }} -
                            {{ new Date(+roleInfo.roleInfo.abyssInfo.endTime * 1000).toLocaleDateString() }}</span
                        >
                    </h3>
                    <div class="space-y-3">
                        <div class="flex justify-between">
                            <span class="text-base-content/70">{{ roleInfo.roleInfo.abyssInfo.progressName }}</span>
                            <span class="font-semibold badge badge-primary">
                                <Icon icon="ri:star-line" class="size-4 inline-block" />
                                {{ roleInfo.roleInfo.abyssInfo.stars }}</span
                            >
                        </div>

                        <div class="flex justify-center">
                            <div v-if="roleInfo.roleInfo.abyssInfo.bestTimeVo1" class="flex gap-2">
                                <img
                                    v-if="roleInfo.roleInfo.abyssInfo.bestTimeVo1.charIcon"
                                    :src="roleInfo.roleInfo.abyssInfo.bestTimeVo1.charIcon"
                                    alt="角色"
                                    class="size-40 object-cover rounded-xl bg-base-300 shadow-md border border-gray-300/50"
                                />
                                <div v-else class="size-12 rounded-xl bg-base-300 shadow-md border border-gray-300/50"></div>
                                <div class="flex flex-col items-center gap-2">
                                    <img
                                        v-if="roleInfo.roleInfo.abyssInfo.bestTimeVo1.closeWeaponIcon"
                                        :src="roleInfo.roleInfo.abyssInfo.bestTimeVo1.closeWeaponIcon"
                                        alt="近战武器"
                                        class="size-12 object-cover rounded-xl bg-base-300 shadow-md border border-gray-300/50"
                                    />
                                    <div v-else class="size-12 rounded-xl bg-base-300 shadow-md border border-gray-300/50"></div>
                                    <img
                                        v-if="roleInfo.roleInfo.abyssInfo.bestTimeVo1.langRangeWeaponIcon"
                                        :src="roleInfo.roleInfo.abyssInfo.bestTimeVo1.langRangeWeaponIcon"
                                        alt="远程武器"
                                        class="size-12 object-cover rounded-xl bg-base-300 shadow-md border border-gray-300/50"
                                    />
                                    <div v-else class="size-12 rounded-xl bg-base-300 shadow-md border border-gray-300/50"></div>
                                    <img
                                        v-if="roleInfo.roleInfo.abyssInfo.bestTimeVo1.petIcon"
                                        :src="roleInfo.roleInfo.abyssInfo.bestTimeVo1.petIcon"
                                        alt="魔灵"
                                        class="size-12 object-cover rounded-xl bg-base-300 shadow-md border border-gray-300/50"
                                    />
                                    <div v-else class="size-12 rounded-xl bg-base-300 shadow-md border border-gray-300/50"></div>
                                </div>
                                <div class="flex flex-col gap-2">
                                    <img
                                        v-if="roleInfo.roleInfo.abyssInfo.bestTimeVo1.phantomCharIcon1"
                                        :src="roleInfo.roleInfo.abyssInfo.bestTimeVo1.phantomCharIcon1"
                                        alt="协战角色1"
                                        class="size-19 object-cover rounded-xl bg-base-300 shadow-md border border-gray-300/50"
                                    />
                                    <div v-else class="size-12 rounded-xl bg-base-300 shadow-md border border-gray-300/50"></div>
                                    <img
                                        v-if="roleInfo.roleInfo.abyssInfo.bestTimeVo1.phantomCharIcon2"
                                        :src="roleInfo.roleInfo.abyssInfo.bestTimeVo1.phantomCharIcon2"
                                        alt="协战角色2"
                                        class="size-19 object-cover rounded-xl bg-base-300 shadow-md border border-gray-300/50"
                                    />
                                    <div v-else class="size-12 rounded-xl bg-base-300 shadow-md border border-gray-300/50"></div>
                                </div>
                                <div class="flex flex-col gap-2">
                                    <img
                                        v-if="roleInfo.roleInfo.abyssInfo.bestTimeVo1.phantomWeaponIcon1"
                                        :src="roleInfo.roleInfo.abyssInfo.bestTimeVo1.phantomWeaponIcon1"
                                        alt="协战武器1"
                                        class="size-19 object-cover rounded-xl bg-base-300 shadow-md border border-gray-300/50"
                                    />
                                    <div v-else class="size-12 rounded-xl bg-base-300 shadow-md border border-gray-300/50"></div>
                                    <img
                                        v-if="roleInfo.roleInfo.abyssInfo.bestTimeVo1.phantomWeaponIcon2"
                                        :src="roleInfo.roleInfo.abyssInfo.bestTimeVo1.phantomWeaponIcon2"
                                        alt="协战武器2"
                                        class="size-19 object-cover rounded-xl bg-base-300 shadow-md border border-gray-300/50"
                                    />
                                    <div v-else class="size-12 rounded-xl bg-base-300 shadow-md border border-gray-300/50"></div>
                                </div>
                            </div>
                            <span v-else>暂无数据</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <div v-else-if="!loading" class="flex justify-center items-center h-full">
            <div class="text-center">
                <p class="text-lg mb-4">暂无游戏信息数据</p>
            </div>
        </div>
    </div>
</template>
