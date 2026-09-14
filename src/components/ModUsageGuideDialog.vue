<script setup lang="ts">
import { onMounted, ref } from "vue"
import { useTourStore } from "@/store/tour"

/**
 * MOD 使用教程弹窗：MOD 分享页首次进入时自动展示。
 * 说明两步：先在「MOD 管理」对应页签启用已下载的 MOD，再到「游戏启动器 - 游戏设置」勾选「启用MOD」；
 * 第二步附带启动器截图（点击可放大）。关闭时写入 tour 完成标记，之后不再自动弹出，
 * 工具栏的帮助入口仍可随时重新打开。
 */

/** 教程完成标记 key：写入 localStorage，决定首次进入时是否还需要自动弹出 */
const GUIDE_TOUR_KEY = "mod-share-guide"

/** 教程配图（游戏启动器 - 游戏设置中勾选「启用MOD」的截图），加载失败时展示兜底占位 */
const GUIDE_IMAGE_URL = "https://cdn.dna-builder.cn/img/help/mod.webp"

/** 弹窗开关：由父组件 v-model 控制；首次进入未读时也会自动置为 true */
const open = defineModel<boolean>({ default: false })

const tourStore = useTourStore()

/** 大图预览实例（manual 模式，仅由配图点击调用 openFromUrls，截图文字较小需放大查看） */
const previewRef = ref<InstanceType<typeof ImagePreview> | null>(null)

/** 「不再自动弹出」勾选状态：默认勾选，关闭时按勾选与否写入完成标记 */
const dontShowAgain = ref(true)

/**
 * @description 首次进入 MOD 分享页时自动展示教程，已读过的用户不再弹出。
 */
onMounted(() => {
    if (!tourStore.isTourCompleted(GUIDE_TOUR_KEY)) {
        open.value = true
    }
})

/**
 * @description 关闭教程弹窗：勾选「不再自动弹出」时写入完成标记，后续进入分享页不再自动展示。
 */
function closeGuide() {
    if (dontShowAgain.value) {
        tourStore.markTourCompleted(GUIDE_TOUR_KEY)
    }
    open.value = false
}

/**
 * @description 点击配图打开可缩放大图预览，方便看清启动器设置项。
 */
function openImagePreview() {
    previewRef.value?.openFromUrls(GUIDE_IMAGE_URL, GUIDE_IMAGE_URL)
}
</script>

<template>
    <dialog class="modal" :class="{ 'modal-open': open }">
        <div
            class="row-start-1 col-start-1 flex max-h-[88vh] w-full max-w-xl flex-col overflow-hidden rounded-lg border border-base-300 bg-base-100 shadow-xl"
        >
            <!-- 标题栏 -->
            <header class="flex flex-none items-center gap-2 border-b border-base-300 px-4 py-3">
                <Icon icon="ri:book-open-line" class="size-5 text-primary" />
                <h3 class="text-base font-bold text-base-content">{{ $t("mods-guide.title") }}</h3>
                <button
                    type="button"
                    class="btn btn-square btn-ghost btn-sm ml-auto tooltip tooltip-bottom"
                    :data-tip="$t('mods-guide.close')"
                    @click="closeGuide()"
                >
                    <Icon icon="ri:close-line" class="size-4" />
                </button>
            </header>

            <!-- 教程步骤 -->
            <div class="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                <!-- 步骤一：在 MOD 管理的对应页签启用 -->
                <section class="flex gap-3 rounded-xs border border-base-content/10 bg-base-content/5 p-3">
                    <span
                        class="flex size-5 flex-none items-center justify-center rounded-xs bg-primary font-orbitron text-[11px] font-bold text-primary-content"
                        >1</span
                    >
                    <div class="min-w-0 flex-1 space-y-1">
                        <p class="text-sm font-semibold text-base-content">{{ $t("mods-guide.step1Title") }}</p>
                        <p class="text-xs leading-relaxed text-base-content/70">{{ $t("mods-guide.step1Desc") }}</p>
                    </div>
                </section>

                <!-- 步骤二：启动器勾选「启用MOD」（附截图，点击放大） -->
                <section class="flex gap-3 rounded-xs border border-base-content/10 bg-base-content/5 p-3">
                    <span
                        class="flex size-5 flex-none items-center justify-center rounded-xs bg-primary font-orbitron text-[11px] font-bold text-primary-content"
                        >2</span
                    >
                    <div class="min-w-0 flex-1 space-y-2">
                        <p class="text-sm font-semibold text-base-content">{{ $t("mods-guide.step2Title") }}</p>
                        <p class="text-xs leading-relaxed text-base-content/70">{{ $t("mods-guide.step2Desc") }}</p>
                        <button
                            type="button"
                            class="group relative block cursor-zoom-in overflow-hidden rounded-xs border border-base-content/10"
                            @click="openImagePreview()"
                        >
                            <ImageFallback :src="GUIDE_IMAGE_URL" :alt="$t('mods-guide.imageAlt')" class="block max-h-[40vh] w-auto">
                                <span class="flex h-32 w-48 items-center justify-center text-xs opacity-60">
                                    {{ $t("mods-guide.imageFailed") }}
                                </span>
                            </ImageFallback>
                            <span
                                class="pointer-events-none absolute right-2 bottom-2 flex items-center gap-1 rounded-full bg-base-100/85 px-2 py-0.5 text-[11px] text-base-content/70 opacity-0 backdrop-blur-sm transition-opacity duration-200 group-hover:opacity-100"
                            >
                                <Icon icon="ri:zoom-in-line" class="size-3.5" />
                                {{ $t("mods-guide.imageHint") }}
                            </span>
                        </button>
                    </div>
                </section>
            </div>

            <!-- 底部操作 -->
            <footer class="flex flex-none flex-wrap items-center justify-between gap-2 border-t border-base-300 px-4 py-3">
                <label class="flex cursor-pointer items-center gap-2 text-xs text-base-content/70 select-none">
                    <input v-model="dontShowAgain" type="checkbox" class="checkbox checkbox-primary checkbox-xs" />
                    {{ $t("mods-guide.dontShowAgain") }}
                </label>
                <button type="button" class="btn btn-primary btn-sm" @click="closeGuide()">{{ $t("mods-guide.confirm") }}</button>
            </footer>
        </div>
        <div class="modal-backdrop" @click="closeGuide()" />
        <!-- 大图预览（manual 模式仅提供 openFromUrls） -->
        <ImagePreview ref="previewRef" manual thumb-url="" full-url="" />
    </dialog>
</template>
