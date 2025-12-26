<script setup lang="ts">
import { onMounted, ref } from "vue"
import { DNAAPI, DNAGameConfigRes, DNAMineRes, DNARoleForToolRes, DNAPost } from "dna-api"
import { useSettingStore } from "../store/setting"
import { useRouter } from "vue-router"
import { useUIStore } from "../store/ui"
import { useLocalStorage } from "@vueuse/core"
import { useInvStore } from "../store/inv"

const setting = useSettingStore()
const ui = useUIStore()
let api: DNAAPI
const router = useRouter()

// network first cache
const mine = useLocalStorage<DNAMineRes["mine"]>("dna.mine", {} as any)
const gameConfig = useLocalStorage<DNAGameConfigRes>("dna.gameConfig", {} as any)
const roleInfo = useLocalStorage<DNARoleForToolRes>("dna.roleInfo", {} as any)
const annPosts = useLocalStorage<DNAPost[]>("dna.annPosts", [])
const loading = ref(true)
const lastUpdateTime = useLocalStorage("dna.lastUpdateTime", 0)
const activeTab = useLocalStorage("dna.activeTab", "公告")

onMounted(async () => {
    const t = await setting.getDNAAPI()
    if (!t) {
        ui.showErrorMessage("请先登录")
        router.push("/login")
        return
    }
    api = t
    await loadGameConfig()
})

async function loadGameConfig(force = false) {
    try {
        // cache 5 minutes
        if (lastUpdateTime.value > 0 && ui.timeNow - lastUpdateTime.value < 1000 * 60 * 5 && !force) {
            loading.value = false
            return
        }
        loading.value = true
        const rm = await api.getMine()
        if (rm.is_success && rm.data) {
            mine.value = rm.data.mine
        } else {
            ui.showErrorMessage(rm.msg || "获取用户信息失败")
        }

        const res = await api.getGameConfig()
        if (res.is_success && res.data) {
            gameConfig.value = res.data[0]
        } else {
            ui.showErrorMessage(res.msg || "获取游戏配置失败")
        }

        const roleRes = await api.getDefaultRoleForTool()
        if (roleRes.is_success && roleRes.data) {
            roleInfo.value = roleRes.data
        } else {
            ui.showErrorMessage(roleRes.msg || "获取默认角色信息失败")
        }
        lastUpdateTime.value = ui.timeNow

        const annRes = await api.getOtherMine()
        if (annRes.is_success && annRes.data) {
            annPosts.value = annRes.data.postList
        } else {
            ui.showErrorMessage(annRes.msg || "获取公告失败")
        }
    } catch (e) {
        ui.showErrorMessage("获取游戏配置失败")
    } finally {
        loading.value = false
    }
}

function timeDistancePassed(time: number) {
    const now = ui.timeNow
    const diff = now - time
    const diffDay = Math.floor(diff / (1000 * 60 * 60 * 24))
    if (diffDay > 0) {
        return `${diffDay}天前`
    }
    const diffHour = Math.floor(diff / (1000 * 60 * 60))
    if (diffHour > 0) {
        return `${diffHour}小时前`
    }
    const diffMinute = Math.floor(diff / (1000 * 60))
    if (diffMinute > 0) {
        return `${diffMinute}分钟前`
    }
    const diffSecond = Math.floor(diff / 1000)
    if (diffSecond > 0) {
        return `${diffSecond}秒前`
    }
    return "刚刚"
}

function timeDistanceFuture(time: number) {
    const now = ui.timeNow
    const diff = time - now
    const diffDay = Math.floor(diff / (1000 * 60 * 60 * 24))
    if (diffDay > 0) {
        return `${diffDay}天后`
    }
    const diffHour = Math.floor(diff / (1000 * 60 * 60))
    if (diffHour > 0) {
        return `${diffHour}小时后`
    }
    const diffMinute = Math.floor(diff / (1000 * 60))
    if (diffMinute > 0) {
        return `${diffMinute}分钟后`
    }
    return "已过期"
}

const inv = useInvStore()
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
</script>
<template>
    <div class="w-full h-full flex flex-col">
        <!-- 头部 -->
        <div class="flex-none flex justify-between items-center p-4 bg-base-100 border-b border-base-200">
            <div class="tabs tabs-border gap-2">
                <div @click="activeTab = '公告'" class="tab" :class="{ 'tab-active': activeTab === '公告' }">公告</div>
                <div @click="activeTab = '游戏信息'" class="tab" :class="{ 'tab-active': activeTab === '游戏信息' }">游戏信息</div>
                <div @click="activeTab = '论坛'" class="tab" :class="{ 'tab-active': activeTab === '论坛' }">论坛</div>
            </div>
            <RouterLink to="/dna/mine" class="flex items-center">
                <img :src="mine?.headUrl" alt="User Head" class="w-8 h-8 rounded-full mr-2" />
                <span>
                    {{ mine?.userName || "?" }}
                </span>
            </RouterLink>
            <div class="flex items-center gap-4">
                <span class="text-xs text-gray-500"> 最后更新: {{ timeDistancePassed(lastUpdateTime) }} </span>
                <Tooltip tooltip="刷新" side="bottom">
                    <button class="btn btn-primary btn-square btn-sm ml-2" @click="loadGameConfig(true)">
                        <Icon icon="ri:refresh-line" />
                    </button>
                </Tooltip>
            </div>
        </div>
        <!-- 内容区域 -->
        <ScrollArea v-if="activeTab === '公告'" class="flex-1 p-4">
            <div v-if="loading" class="flex justify-center items-center h-full py-8">
                <span class="loading loading-spinner loading-lg"></span>
            </div>
            <div v-if="annPosts.length > 0" class="space-y-4">
                <DNAPostListItem v-for="post in annPosts" :post="post" :key="post.postId" />
            </div>
            <div v-else-if="!loading" class="flex justify-center items-center h-full">
                <div class="text-center">
                    <p class="text-lg mb-4">暂无公告数据</p>
                </div>
            </div>
        </ScrollArea>
        <ScrollArea v-if="activeTab === '游戏信息'" class="flex-1 p-4">
            <div v-if="loading" class="flex justify-center items-center h-full py-8">
                <span class="loading loading-spinner loading-lg"></span>
            </div>
            <div v-if="roleInfo" class="space-y-6">
                <!-- 角色基本信息 -->
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

                <!-- 委托密函 -->
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

                <!-- 角色列表 -->
                <div class="card bg-base-100 shadow-xl">
                    <div class="card-body">
                        <h3 class="card-title mb-4">角色</h3>
                        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <DNACharItem :char="char" v-for="char in roleInfo.roleInfo.roleShow.roleChars" :key="char.charId" />
                        </div>
                    </div>
                </div>

                <!-- 远程武器 -->
                <div class="card bg-base-100 shadow-xl">
                    <div class="card-body">
                        <h3 class="card-title mb-4">远程武器</h3>
                        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <DNAWeaponItem
                                :weapon="weapon"
                                v-for="weapon in roleInfo.roleInfo.roleShow.langRangeWeapons"
                                :key="weapon.weaponId"
                            />
                        </div>
                    </div>
                </div>

                <!-- 近战武器 -->
                <div class="card bg-base-100 shadow-xl">
                    <div class="card-body">
                        <h3 class="card-title mb-4">近战武器</h3>
                        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <DNAWeaponItem
                                :weapon="weapon"
                                v-for="weapon in roleInfo.roleInfo.roleShow.closeWeapons"
                                :key="weapon.weaponId"
                            />
                        </div>
                    </div>
                </div>

                <!-- 迷津信息 -->
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
                                    {{ timeDistanceFuture(+roleInfo.roleInfo.roleShow.rougeLikeInfo.resetTime * 1000) }}
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

                <!-- 深渊信息 -->
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
                                    <div v-else class="size-12 rounded-xl bg-base-300 shadow-md border border-gray-300/50">
                                        <!-- 占位符 -->
                                    </div>
                                    <div class="flex flex-col items-center gap-2">
                                        <img
                                            v-if="roleInfo.roleInfo.abyssInfo.bestTimeVo1.closeWeaponIcon"
                                            :src="roleInfo.roleInfo.abyssInfo.bestTimeVo1.closeWeaponIcon"
                                            alt="近战武器"
                                            class="size-12 object-cover rounded-xl bg-base-300 shadow-md border border-gray-300/50"
                                        />
                                        <div v-else class="size-12 rounded-xl bg-base-300 shadow-md border border-gray-300/50">
                                            <!-- 占位符 -->
                                        </div>
                                        <img
                                            v-if="roleInfo.roleInfo.abyssInfo.bestTimeVo1.langRangeWeaponIcon"
                                            :src="roleInfo.roleInfo.abyssInfo.bestTimeVo1.langRangeWeaponIcon"
                                            alt="远程武器"
                                            class="size-12 object-cover rounded-xl bg-base-300 shadow-md border border-gray-300/50"
                                        />
                                        <div v-else class="size-12 rounded-xl bg-base-300 shadow-md border border-gray-300/50">
                                            <!-- 占位符 -->
                                        </div>
                                        <img
                                            v-if="roleInfo.roleInfo.abyssInfo.bestTimeVo1.petIcon"
                                            :src="roleInfo.roleInfo.abyssInfo.bestTimeVo1.petIcon"
                                            alt="魔灵"
                                            class="size-12 object-cover rounded-xl bg-base-300 shadow-md border border-gray-300/50"
                                        />
                                        <div v-else class="size-12 rounded-xl bg-base-300 shadow-md border border-gray-300/50">
                                            <!-- 占位符 -->
                                        </div>
                                    </div>
                                    <div class="flex flex-col gap-2">
                                        <img
                                            v-if="roleInfo.roleInfo.abyssInfo.bestTimeVo1.phantomCharIcon1"
                                            :src="roleInfo.roleInfo.abyssInfo.bestTimeVo1.phantomCharIcon1"
                                            alt="协战角色1"
                                            class="size-19 object-cover rounded-xl bg-base-300 shadow-md border border-gray-300/50"
                                        />
                                        <div v-else class="size-12 rounded-xl bg-base-300 shadow-md border border-gray-300/50">
                                            <!-- 占位符 -->
                                        </div>
                                        <img
                                            v-if="roleInfo.roleInfo.abyssInfo.bestTimeVo1.phantomCharIcon2"
                                            :src="roleInfo.roleInfo.abyssInfo.bestTimeVo1.phantomCharIcon2"
                                            alt="协战角色2"
                                            class="size-19 object-cover rounded-xl bg-base-300 shadow-md border border-gray-300/50"
                                        />
                                        <div v-else class="size-12 rounded-xl bg-base-300 shadow-md border border-gray-300/50">
                                            <!-- 占位符 -->
                                        </div>
                                    </div>
                                    <div class="flex flex-col gap-2">
                                        <img
                                            v-if="roleInfo.roleInfo.abyssInfo.bestTimeVo1.phantomWeaponIcon1"
                                            :src="roleInfo.roleInfo.abyssInfo.bestTimeVo1.phantomWeaponIcon1"
                                            alt="协战武器1"
                                            class="size-19 object-cover rounded-xl bg-base-300 shadow-md border border-gray-300/50"
                                        />
                                        <div v-else class="size-12 rounded-xl bg-base-300 shadow-md border border-gray-300/50">
                                            <!-- 占位符 -->
                                        </div>
                                        <img
                                            v-if="roleInfo.roleInfo.abyssInfo.bestTimeVo1.phantomWeaponIcon2"
                                            :src="roleInfo.roleInfo.abyssInfo.bestTimeVo1.phantomWeaponIcon2"
                                            alt="协战武器2"
                                            class="size-19 object-cover rounded-xl bg-base-300 shadow-md border border-gray-300/50"
                                        />
                                        <div v-else class="size-12 rounded-xl bg-base-300 shadow-md border border-gray-300/50">
                                            <!-- 占位符 -->
                                        </div>
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
        </ScrollArea>
        <ScrollArea v-if="activeTab === '论坛'" class="flex-1 p-4">
            <div v-if="loading" class="flex justify-center items-center h-full">
                <span class="loading loading-spinner loading-lg"></span>
            </div>

            <div v-if="gameConfig" class="space-y-6">
                <!-- 游戏板块 -->
                <div class="card bg-base-100 shadow-xl">
                    <div class="card-body">
                        <h3 class="card-title">游戏板块</h3>
                        <div class="grid grid-cols-2 md:grid-cols-3 gap-2 mt-4">
                            <RouterLink
                                v-for="forum in gameConfig.gameAllForumList"
                                :key="forum.id"
                                :to="`/dna/posts/${forum.id}`"
                                class="bg-base-200 p-3 rounded-lg cursor-pointer hover:bg-base-300 transition-colors flex items-center"
                            >
                                <img :src="forum.iconUrl" alt="Forum Icon" class="w-6 h-6 mr-2" />
                                <span>{{ forum.name }}</span>
                            </RouterLink>
                        </div>
                    </div>
                </div>

                <!-- 话题列表 -->
                <div class="card bg-base-100 shadow-xl">
                    <div class="card-body">
                        <h3 class="card-title">话题列表</h3>
                        <div class="grid grid-cols-2 md:grid-cols-3 gap-2 mt-4">
                            <RouterLink
                                v-for="topic in gameConfig.topicList"
                                :key="topic.topicId"
                                :to="`/dna/topic/${topic.topicId}`"
                                class="bg-base-200 p-3 rounded-lg cursor-pointer hover:bg-base-300 transition-colors flex items-center"
                            >
                                <img :src="topic.topicIconUrl" alt="Wiki Icon" class="w-6 h-6 mr-2" />
                                <span>{{ topic.topicName }}</span>
                            </RouterLink>
                        </div>
                    </div>
                </div>
            </div>

            <div v-else class="flex justify-center items-center h-full">
                <div class="text-center">
                    <p class="text-lg mb-4">无法获取游戏配置</p>
                    <button class="btn btn-secondary" @click="loadGameConfig(true)">重试</button>
                </div>
            </div>
        </ScrollArea>
    </div>
</template>
