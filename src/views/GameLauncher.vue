<script setup lang="ts">
import { onUnmounted, ref, watchEffect } from "vue"
import * as dialog from "@tauri-apps/plugin-dialog"
import { useGameStore } from "../store/game"
import { t } from "i18next"
import { openExplorer } from "../api/app"
import { gameData } from "../data"
import { onMounted } from "vue"
import { env } from "../env"
import { Mod } from "../store/db"
import { watch } from "vue"
import { computed } from "vue"
// 状态管理
const keys = ["path", "beforeGame", "afterGame"] as const
const tab = ref("mod")
const errorMessage = ref("")
const successMessage = ref("")
const game = useGameStore()
watch(errorMessage, (newValue) => {
    if (newValue) {
        setTimeout(() => {
            errorMessage.value = ""
        }, 3000)
    }
})
watch(successMessage, (newValue) => {
    if (newValue) {
        setTimeout(() => {
            successMessage.value = ""
        }, 3000)
    }
})

//#region 启动
async function selectPath(key: (typeof keys)[number]) {
    const result = await dialog.open({
        defaultPath: game[key],
        filters:
            key === "path"
                ? [{ name: "EM.exe", extensions: ["exe"] }]
                : [
                      { name: t("misc.exec_files"), extensions: ["exe", "bat", "cmd", "ahk", "ps1"] },
                      { name: t("misc.all_files"), extensions: ["*"] },
                  ],
    })
    if (result) {
        game[key] = result
    }
}

// 打开游戏所在目录
const openGameDirectory = async () => {
    if (!game.path) {
        errorMessage.value = "请先选择游戏路径或启动一次游戏"
        return
    }

    try {
        await openExplorer(game.modsDir)
    } catch (error) {
        console.error("打开目录失败:", error)
        errorMessage.value = `打开目录失败: ${error instanceof Error ? error.message : String(error)}`
    }
}

const launchGame = async () => {
    if (!game.path) {
        errorMessage.value = "请先选择游戏文件或启动一次游戏"
        return
    }
    try {
        await game.launchGame()
    } catch (error) {
        console.error("启动游戏失败:", error)
        errorMessage.value = `启动游戏失败: ${error instanceof Error ? error.message : String(error)}`
    }
}
//#endregion
//#region entity
const entityType = ref<(typeof entityTypes)[number]>("char")
const entityTypes = ["char", "weapon", "custom"] as const
const customEntityName = ref("")
const customEntityIcon = ref("la:gamepad-solid")
const customEntityIconsOptions = [
    "la:gamepad-solid",
    "ri:rocket-2-line",
    "ri:heart-line",
    "ri:sword-line",
    "ri:settings-3-line",
    "ri:trophy-line",
    "ri:pencil-fill",
    "ri:edit-line",
    "ri:more-line",
    "ri:crosshair-line",
    "ri:flashlight-line",
] as const
const entitys = ref<{ name: string; icon: string; count: number }[]>([])
watchEffect(async () => {
    if (entityType.value === "custom") {
        entitys.value = await Promise.all(
            game.customEntitys?.map(async (v) => ({ name: v.name, icon: v.icon, count: await game.getModsCountByEntity(v.name) })) || [],
        )
    } else {
        const data = await Promise.all(
            gameData[entityType.value].map(async (v) => ({
                name: v.名称,
                icon: `/public/imgs/${v.名称}.png`,
                count: await game.getModsCountByEntity(v.名称),
            })),
        )
        entitys.value = data
    }
})

const sortedEntitys = computed(() =>
    [...entitys.value].sort((a, b) => (game.likedChars.includes(a.name) ? -1 : game.likedChars.includes(b.name) ? 1 : b.count - a.count)),
)

async function addCustomEntity() {
    if (!customEntityName.value) {
        errorMessage.value = "请输入自定义类型名称"
        return
    }
    try {
        await game.addCustomEntity({ name: customEntityName.value, icon: customEntityIcon.value })
        customEntityName.value = ""
    } catch (error: any) {
        if (error.name === "ConstraintError") {
            errorMessage.value = "自定义类型名称已存在"
            return
        }
        console.error("添加自定义类型失败:", error)
        errorMessage.value = `添加自定义类型失败: ${error instanceof Error ? error.message : String(error)}`
    }
}
//#endregion
//#region mod
const entityMod = ref<Mod | undefined>(undefined)
const modsInEntity = ref<Mod[]>([])
async function updateEntityMod() {
    entityMod.value = await game.getEntityMod(game.selectedEntity)
    modsInEntity.value = await game.getModsByEntity(game.selectedEntity)
    if (game.selectedEntity) {
        const e = entitys.value.find((v) => v.name === game.selectedEntity)
        if (e) e.count = modsInEntity.value.length
    }
}
watchEffect(updateEntityMod)
const setEntityMod = async (entity: string, modid: number) => {
    try {
        await game.setEntityMod(entity, modid)
        await updateEntityMod()
        successMessage.value = modid ? "MOD已启用" : "MOD已禁用"
    } catch (error: any) {
        console.error("设置MOD失败:", error)
        errorMessage.value = `设置MOD失败: ${error instanceof Error ? error.message : String(error)}`
    }
}

const removeMod = async (mod: Mod) => {
    try {
        await game.removeMod(mod)
        await updateEntityMod()
        successMessage.value = "MOD已删除"
    } catch (error: any) {
        console.error("删除MOD失败:", error)
        errorMessage.value = `删除MOD失败: ${error instanceof Error ? error.message : String(error)}`
    }
}

// 拖拽相关状态
const isDragging = ref(false)

let unlistenDragEnter = () => {}
let unlistenDragLeave = () => {}
let unlistenDragDrop = () => {}
onMounted(async () => {
    // Tauri专用拖放逻辑
    if (env.isApp) {
        // 监听全局拖放事件以处理桌面应用中的文件拖放
        const { listen, TauriEvent } = await import("@tauri-apps/api/event")

        interface TauriDragEvent {
            paths: string[]
            position: {
                x: number
                y: number
            }
        }
        // 监听文件拖入窗口事件
        unlistenDragEnter = await listen<TauriDragEvent>(TauriEvent.DRAG_ENTER, () => {
            if (!game.selectedEntity) return
            isDragging.value = true
        })

        // 监听文件拖离窗口事件
        unlistenDragLeave = await listen<TauriDragEvent>(TauriEvent.DRAG_LEAVE, () => {
            isDragging.value = false
        })

        // 监听文件放置事件
        unlistenDragDrop = await listen<TauriDragEvent>(TauriEvent.DRAG_DROP, async (event) => {
            if (!isDragging.value) return
            isDragging.value = false
            if (!game.selectedEntity) return
            if (!game.path) {
                errorMessage.value = "请先选择游戏文件或启动一次游戏"
                return
            }

            const paths = event.payload.paths
            if (paths.some((v) => v.endsWith(".zip") || v.endsWith(".pak"))) {
                try {
                    const results = await game.importMod(paths)
                    if (!results) {
                        errorMessage.value = "导入MOD失败"
                        return
                    }
                    successMessage.value = `成功导入 1 个MOD`
                    await updateEntityMod()
                } catch (error: any) {
                    console.error("导入MOD失败:", error)
                    errorMessage.value = `导入MOD失败: ${error instanceof Error ? error.message : String(error)}`
                }
            } else if (paths.some((v) => /\.(?:png|jpg|jpeg|gif|webp)$/.test(v))) {
                if (!entityMod.value) {
                    errorMessage.value = "请先选择一个MOD"
                    return
                }
                try {
                    const results = await game.importPic(entityMod.value.id, paths[0])
                    if (!results) {
                        errorMessage.value = "导入MOD图片失败"
                        return
                    }
                    successMessage.value = `成功导入MOD图片`
                } catch (error: any) {
                    console.error("导入MOD图片失败:", error)
                    errorMessage.value = `导入MOD图片失败: ${error instanceof Error ? error.message : String(error)}`
                }
            }
        })
    }
})

onUnmounted(() => {
    unlistenDragEnter()
    unlistenDragDrop()
    unlistenDragLeave()
})
//#endregion
</script>

<template>
    <div class="flex flex-col h-full overflow-hidden relative">
        <div class="flex-none tabs tabs-lift tabs-lg items-center">
            <input type="radio" name="game_mod" class="tab" value="mod" aria-label="MOD管理" v-model="tab" />
            <input type="radio" name="game_mod" class="tab" value="setting" aria-label="游戏设置" v-model="tab" />
            <div @click="openGameDirectory()" class="ml-auto btn btn-square tooltip tooltip-bottom" data-tip="打开游戏目录">
                <Icon icon="ri:folder-line" class="w-6 h-6" />
            </div>
            <div @click="launchGame()" class="w-40 btn btn-primary mx-2" :class="{ 'btn-disabled': game.running }">
                <Icon icon="ri:rocket-2-line" class="w-6 h-6" />
                启动游戏
            </div>
        </div>
        <div v-if="tab === 'mod'" class="flex-1 bg-base-100 border-base-300 flex relative h-full overflow-hidden">
            <!-- 角色列表 -->
            <div class="flex-none overflow-hidden flex flex-col">
                <div class="flex-none p-1">
                    <Select class="w-full inline-flex items-center justify-between input input-sm whitespace-nowrap" v-model="entityType">
                        <SelectItem v-for="type in entityTypes" :key="type" :value="type">
                            {{ $t(`game-launcher.${type}`) }}
                        </SelectItem>
                    </Select>
                </div>
                <ScrollArea class="overflow-x-hidden overflow-y-auto">
                    <transition-group name="list" tag="ul" class="list">
                        <template v-if="entityType === 'custom'">
                            <ContextMenu v-for="item in sortedEntitys" :key="item.name">
                                <template #menu>
                                    <ContextMenuItem
                                        class="group text-sm p-2 leading-none text-base-content rounded flex items-center relative select-none outline-none data-disabled:text-base-content/60 data-disabled:pointer-events-none data-highlighted:bg-primary data-highlighted:text-base-100"
                                        @click="game.removeCustomEntity(item as any)"
                                    >
                                        删除
                                    </ContextMenuItem>
                                </template>
                                <li
                                    class="list-row cursor-pointer min-w-60 justify-between rounded-none"
                                    @click="game.selectedEntity = item.name"
                                    :class="{ 'bg-base-300': item.name === game.selectedEntity }"
                                >
                                    <div>
                                        <Icon :icon="item.icon as any" class="size-10 rounded-box" />
                                    </div>
                                    <div>
                                        <div>{{ item.name }}</div>
                                        <div class="text-xs font-semibold opacity-60">{{ item.count }}</div>
                                    </div>
                                    <button
                                        class="btn btn-square btn-ghost"
                                        @click="game.likeChar(item.name)"
                                        :class="{ 'text-primary': game.likedChars.includes(item.name) }"
                                    >
                                        <Icon
                                            :icon="game.likedChars.includes(item.name) ? 'ri:heart-fill' : 'ri:heart-line'"
                                            class="size-[1.2em]"
                                        />
                                    </button>
                                </li>
                            </ContextMenu>
                            <li key="--none" class="list-row cursor-pointer min-w-60 justify-between rounded-none flex">
                                <div class="btn w-full" onclick="add_custom_entity_modal.show()">添加自定义类型</div>
                                <dialog id="add_custom_entity_modal" class="modal z-10">
                                    <div class="modal-box">
                                        <h3 class="text-lg font-bold">添加自定义类型</h3>
                                        <p class="py-4">
                                            <input
                                                v-model="customEntityName"
                                                type="text"
                                                placeholder="请输入自定义类型名称"
                                                class="input input-bordered input-md w-full"
                                            />
                                        </p>
                                        <p class="py-4">
                                            <Select
                                                class="w-full inline-flex items-center justify-between input input-md whitespace-nowrap"
                                                v-model="customEntityIcon"
                                            >
                                                <SelectItem v-for="icon in customEntityIconsOptions" :key="icon" :value="icon">
                                                    <Icon :icon="icon" class="size-8 rounded-box" />
                                                </SelectItem>
                                            </Select>
                                        </p>
                                        <div class="modal-action">
                                            <form method="dialog" class="space-x-2">
                                                <!-- if there is a button in form, it will close the modal -->
                                                <button class="min-w-20 btn btn-primary" @click="addCustomEntity()">确定</button>
                                                <button class="min-w-20 btn">取消</button>
                                            </form>
                                        </div>
                                    </div>
                                </dialog>
                            </li>
                        </template>
                        <template v-else>
                            <li
                                v-for="item in sortedEntitys"
                                :key="item.name"
                                class="list-row cursor-pointer min-w-60 justify-between rounded-none"
                                @click="game.selectedEntity = item.name"
                                :class="{ 'bg-base-300': item.name === game.selectedEntity }"
                            >
                                <div>
                                    <img class="size-10 rounded-box" :src="item.icon" />
                                </div>
                                <div>
                                    <div>{{ item.name }}</div>
                                    <div class="text-xs font-semibold opacity-60">{{ item.count }}</div>
                                </div>
                                <button
                                    class="btn btn-square btn-ghost"
                                    @click="game.likeChar(item.name)"
                                    :class="{ 'text-primary': game.likedChars.includes(item.name) }"
                                >
                                    <Icon
                                        :icon="game.likedChars.includes(item.name) ? 'ri:heart-fill' : 'ri:heart-line'"
                                        class="size-[1.2em]"
                                    />
                                </button>
                            </li>
                        </template>
                    </transition-group>
                </ScrollArea>
            </div>
            <!-- MOD列表 -->
            <div class="flex-1 p-2 overflow-hidden flex flex-col border-l border-r border-base-300 gap-2">
                <div class="flex-none font-bold text-primary">MOD列表</div>
                <ScrollArea class="flex-2 overflow-x-hidden overflow-y-auto">
                    <div v-if="!game.selectedEntity" class="h-40 flex justify-center items-center opacity-60">请先选择一个实体</div>
                    <transition-group name="list" tag="ul" class="list">
                        <li
                            v-if="game.selectedEntity"
                            :key="0"
                            class="list-row cursor-pointer min-w-60 justify-between rounded-none"
                            :class="{ 'bg-base-300': !entityMod }"
                            @click="setEntityMod(game.selectedEntity, 0)"
                        >
                            <div>
                                <Icon icon="ri:puzzle-line" class="size-10 rounded-box opacity-60" />
                            </div>
                            <div class="flex-1">
                                <div>不使用MOD</div>
                                <div class="text-xs font-semibold opacity-60"></div>
                            </div>
                        </li>
                        <li
                            v-for="mod in modsInEntity"
                            :key="mod.id"
                            class="list-row cursor-pointer min-w-60 justify-between rounded-none"
                            :class="{ 'bg-base-300': mod.id === entityMod?.id }"
                            @click="setEntityMod(game.selectedEntity, mod.id)"
                        >
                            <div>
                                <Icon icon="ri:puzzle-line" class="size-10 rounded-box opacity-60" />
                            </div>
                            <div class="flex-1">
                                <div>{{ mod.name }}</div>
                                <div class="text-xs font-semibold opacity-60">
                                    {{ new Date(mod.addTime).toLocaleString() }} | {{ (mod.size / 1024 / 1024).toFixed(2) }} MB
                                </div>
                            </div>
                            <button class="btn btn-square btn-ghost" @click.stop="removeMod(mod)">
                                <Icon icon="ri:delete-bin-line" class="size-[1.2em]" />
                            </button>
                        </li>
                    </transition-group>
                </ScrollArea>
            </div>
            <!-- 预览 -->
            <div class="flex-1 p-2 overflow-hidden flex flex-col">
                <div class="flex-none font-bold text-primary">预览</div>
                <div class="flex-1 overflow-hidden flex justify-center items-center">
                    <!-- 图片预览 -->
                    <img v-if="entityMod?.pic" :src="entityMod.pic" alt="MOD预览" class="max-w-full max-h-full mx-auto my-auto" />
                    <div v-else class="h-40 flex justify-center items-center opacity-60">暂无预览图片</div>
                </div>
            </div>
        </div>
        <div v-if="tab === 'setting'" class="flex-1 bg-base-100 border-base-300 p-6">
            <div v-for="key in keys" :key="key">
                <div class="p-2 flex flex-row justify-between items-center flex-wrap">
                    <label class="label cursor-pointer space-x-2 min-w-32 justify-start">
                        <input type="checkbox" v-model="game[`${key}Enable`]" class="checkbox checkbox-primary" />
                        <span class="label-text">{{ $t("game-launcher." + key) }}</span>
                    </label>
                    <div class="flex flex-1 space-x-2" v-show="game[`${key}Enable`]">
                        <input
                            type="text"
                            disabled
                            :value="game[key]"
                            :placeholder="$t('game-launcher.selectPath')"
                            class="input input-bordered input-sm w-full min-w-32"
                        />
                        <div class="btn btn-primary btn-sm" @click="selectPath(key)">{{ $t("game-launcher.select") }}</div>
                    </div>
                </div>
                <div class="p-2 flex flex-row justify-between items-center flex-wrap" v-if="key === 'path' && game[`${key}Enable`]">
                    <label class="label cursor-pointer min-w-32 justify-start">
                        <span class="label-text ml-12">{{ $t("game-launcher.params") }}</span>
                    </label>
                    <div class="flex flex-1 space-x-2" v-show="game.pathEnable">
                        <input type="text" v-model="game.pathParams" class="input input-bordered input-sm w-full min-w-32" />
                    </div>
                </div>
            </div>
            <div>
                <div class="p-2 flex flex-row justify-between items-center flex-wrap">
                    <label class="label cursor-pointer space-x-2 min-w-32 justify-start">
                        <input type="checkbox" v-model="game.modEnable" class="checkbox checkbox-primary" />
                        <span class="label-text">{{ $t("game-launcher.modEnable") }}</span>
                    </label>
                </div>
                <div class="p-2 flex flex-row justify-between items-center flex-wrap" v-if="game.modEnable">
                    <label class="label cursor-pointer min-w-32 justify-start">
                        <span class="label-text ml-12">{{ $t("game-launcher.modLoader") }}</span>
                    </label>
                    <div class="flex flex-1 space-x-2" v-show="game.pathEnable">
                        <label class="label tooltip" data-tip="启动命令行添加-fileopenlog, 可能导致游戏卡顿">
                            <input type="radio" v-model="game.modLoader" value="legacy" class="radio radio-primary" />
                            <span class="label-text">{{ $t("game-launcher.legacy") }}</span>
                        </label>
                    </div>
                </div>
            </div>
        </div>
        <transition name="slide-right">
            <div
                v-if="errorMessage"
                @click="errorMessage = ''"
                role="alert"
                class="alert alert-error absolute bottom-8 right-8 cursor-pointer"
            >
                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 shrink-0 stroke-current" fill="none" viewBox="0 0 24 24">
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                </svg>
                <span>{{ errorMessage }}</span>
            </div>
        </transition>
        <transition name="slide-right">
            <div
                v-if="successMessage"
                @click="successMessage = ''"
                role="alert"
                class="alert alert-success absolute bottom-8 right-8 cursor-pointer"
            >
                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 shrink-0 stroke-current" fill="none" viewBox="0 0 24 24">
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                </svg>
                <span>{{ successMessage }}</span>
            </div>
        </transition>

        <!-- 拖拽提示 -->
        <div v-if="isDragging" class="fixed inset-0 flex items-center justify-center bg-black/50 z-50" @click="isDragging = false">
            <div class="bg-base-200 p-8 rounded-lg text-2xl font-bold text-primary shadow-xl">松开鼠标导入MOD或图片</div>
        </div>
    </div>
</template>
