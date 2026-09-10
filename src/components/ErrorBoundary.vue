<template>
    <!-- 正常渲染子组件 -->
    <slot v-if="!hasError" />
    <!-- 出错时展示备用 UI：Home 设计语言（直角毛玻璃卡片 + 方章图标 + 方章按钮），居中于当前子页面内容区 -->
    <div v-else class="h-full w-full flex justify-center overflow-y-auto p-6">
        <!-- m-auto 实现垂直+水平居中，内容超出容器时自动退化为顶部对齐并可滚动（避免 align-items:center 裁掉顶部内容） -->
        <div class="m-auto w-full max-w-lg">
            <div
                class="animate-ef-rise motion-reduce:animate-none rounded-xs border border-base-content/10 bg-base-100/60 px-6 py-7 backdrop-blur-sm"
            >
                <!-- 标题区：方章警示图标 + 英文 kicker + 标题 + 说明，居中竖排 -->
                <div class="flex flex-col items-center gap-5 text-center">
                    <span
                        class="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-xs border border-error/40 bg-error/10 text-error"
                    >
                        <Icon icon="ri:error-warning-line" class="h-7 w-7" />
                    </span>
                    <div class="flex flex-col items-center gap-2.5">
                        <span class="text-[11px] font-semibold tracking-[0.3em] text-base-content/45 uppercase">ERROR</span>
                        <h2 class="text-[18px] font-semibold text-base-content">{{ $t("errorBoundary.title") }}</h2>
                        <p class="max-w-sm text-[13px] leading-6 text-base-content/60">
                            {{ $t("errorBoundary.desc") }}
                        </p>
                    </div>
                </div>

                <!-- 错误详情：属性格样式，超长内容可滚动查看 -->
                <div class="mt-8 rounded-xs border border-base-content/10 bg-base-content/3 px-4 py-3.5">
                    <div class="mb-2 text-[10px] tracking-wide text-base-content/40">
                        {{ $t("errorBoundary.messageLabel") }}
                    </div>
                    <p class="max-h-32 overflow-y-auto wrap-break-word text-[12px] leading-6 text-error whitespace-pre-wrap">
                        {{ errorMessage }}
                    </p>
                </div>

                <!-- 修复建议：重置前备份提示（重置可解决绝大多数报错） -->
                <div class="mt-4 flex items-start gap-3 rounded-xs border border-warning/35 bg-warning/10 px-4 py-3.5">
                    <Icon icon="ri:database-2-line" class="mt-1 h-4 w-4 shrink-0 text-warning" />
                    <p class="min-w-0 flex-1 text-[12px] leading-6 text-base-content/65">
                        {{ $t("errorBoundary.backupTip") }}
                    </p>
                </div>

                <!-- 操作区：重试（主操作）+ 前往设置重置（次操作），居中排列 -->
                <div class="mt-8 flex flex-wrap items-center justify-center gap-3">
                    <button
                        type="button"
                        class="inline-flex h-9 cursor-pointer items-center gap-2 rounded-xs border border-primary bg-primary px-4 text-[12px] font-semibold text-primary-content transition-colors duration-150 hover:bg-primary/90 active:scale-[0.97]"
                        @click="resetError"
                    >
                        <Icon icon="ri:refresh-line" class="h-4 w-4" />
                        {{ $t("errorBoundary.retry") }}
                    </button>
                    <button
                        type="button"
                        class="inline-flex h-9 cursor-pointer items-center gap-2 rounded-xs border border-base-content/20 px-4 text-[12px] text-base-content/60 transition-colors duration-150 hover:border-primary/60 hover:text-primary active:scale-[0.97]"
                        @click="gotoSettingReset"
                    >
                        <Icon icon="ri:settings-3-line" class="h-4 w-4" />
                        {{ $t("errorBoundary.gotoSetting") }}
                        <Icon icon="ri:arrow-right-line" class="h-3.5 w-3.5" />
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { onErrorCaptured, ref } from "vue"
import { useRouter } from "vue-router"

const router = useRouter()

const hasError = ref(false)
const errorMessage = ref("")

/**
 * 重置错误状态，让子组件重新挂载渲染（等价于「重试」）。
 */
function resetError() {
    hasError.value = false
    errorMessage.value = ""
}

/**
 * 跳转到设置页并定位「重置所有设置」卡片：带 reset=1 参数，由设置页滚动并高亮该卡片。
 * 若出错时已在设置页，仅改 query 不会重新挂载设置页，因此额外清除错误态让其重新初始化。
 */
async function gotoSettingReset() {
    try {
        await router.push({ name: "setting", query: { reset: "1" } })
    } catch (error) {
        console.error("跳转设置页失败", error)
    }
    if (hasError.value) {
        resetError()
    }
}

// 捕获子孙组件错误
onErrorCaptured((err, vm, info) => {
    console.error("捕获到错误:", err, vm, info)
    hasError.value = true
    errorMessage.value = (err as any).message || "未知错误"
    // 返回 false 阻止错误继续向上传播
    return false
})
</script>
