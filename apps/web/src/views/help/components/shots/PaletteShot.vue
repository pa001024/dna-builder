<script setup lang="ts">
import { useHelpText } from "../../content/locale"
import { L, type PaletteShot } from "../../content/types"
import { clamp01, enterStyle, progressAt } from "./motion"

const props = defineProps<{ shot: PaletteShot; time: number; duration: number }>()
const tr = useHelpText()

function partColor(index: number): string {
    return props.shot.parts[index % Math.max(1, props.shot.parts.length)]?.color ?? "#64748b"
}
</script>

<template>
    <div class="help-center-shot">
        <div class="help-panel flex w-[1000px] gap-6 p-6">
            <div class="flex w-64 flex-none flex-col items-center border border-white/10 bg-white/3 py-5">
                <div class="help-kicker">{{ tr(L("染色预览", "染色預覽", "DYE PREVIEW", "染色プレビュー", "염색 미리보기", "APERÇU")) }}</div>
                <div class="mt-1 text-lg font-semibold">{{ tr(shot.character) }}</div>

                <div class="relative mt-4 h-64 w-40">
                    <div class="absolute left-1/2 top-2 h-20 w-24 -translate-x-1/2 rounded-t-[44px]" :style="{ background: partColor(0) }" />
                    <div class="absolute left-1/2 top-9 h-16 w-14 -translate-x-1/2 rounded-full border border-black/20" :style="{ background: partColor(1) }" />
                    <div class="absolute left-1/2 top-24 h-24 w-24 -translate-x-1/2 rounded-t-[22px]" :style="{ background: partColor(2) }" />
                    <div class="absolute left-[22%] top-28 h-20 w-5 rotate-12 rounded-b-[12px]" :style="{ background: partColor(3) }" />
                    <div class="absolute right-[22%] top-28 h-20 w-5 -rotate-12 rounded-b-[12px]" :style="{ background: partColor(3) }" />
                    <div class="absolute left-1/2 top-44 h-12 w-20 -translate-x-1/2" :style="{ background: partColor(4) }" />
                    <div class="absolute left-[26%] bottom-1 h-9 w-7 rounded-b-[8px]" :style="{ background: partColor(5) }" />
                    <div class="absolute right-[26%] bottom-1 h-9 w-7 rounded-b-[8px]" :style="{ background: partColor(5) }" />
                    <div class="absolute left-1/2 top-20 h-3 w-28 -translate-x-1/2 border border-black/20" :style="{ background: partColor(6) }" />
                </div>

                <div class="mt-3 flex flex-wrap justify-center gap-1.5 px-4">
                    <span v-for="(part, index) in shot.parts.slice(0, 6)" :key="index" class="flex items-center gap-1 border border-white/10 bg-black/20 px-1.5 py-1 text-[8px] text-white/40">
                        <span class="size-2" :style="{ background: part.color }" />
                        {{ tr(part.label) }}
                    </span>
                </div>
            </div>

            <div class="min-w-0 flex-1">
                <div class="flex items-end justify-between">
                    <div>
                        <div class="help-kicker">{{ tr(L("部位染色", "部位染色", "PART DYEING", "部位染色", "부위 염색", "TEINTURE")) }}</div>
                        <div class="mt-1 text-2xl font-bold">{{ tr(L("9 个部位，自由配色", "9 個部位，自由配色", "9 parts, full control", "9 部位を自由に", "9개 부위 자유 배색", "9 zones, contrôle total")) }}</div>
                    </div>
                    <span class="help-chip">{{ tr(L("恢复默认色", "恢復預設色", "Reset colors", "初期色に戻す", "기본색 복원", "Couleurs par défaut")) }}</span>
                </div>

                <div class="mt-4 grid grid-cols-12 gap-1.5">
                    <div
                        v-for="(swatch, index) in shot.swatches"
                        :key="index"
                        class="aspect-square border"
                        :class="swatch.active ? 'border-white scale-105' : 'border-white/15'"
                        :style="{ background: swatch.color, ...enterStyle(time, 0.35 + index * 0.018, 0.35, 5) }"
                        :title="swatch.name ? tr(swatch.name) : ''"
                    />
                </div>

                <div class="mt-5 flex items-center gap-2">
                    <div class="flex-1 border border-white/10 bg-black/25 px-3 py-2.5">
                        <div class="text-[9px] tracking-widest text-white/30">{{ tr(L("染色码", "染色碼", "DYE CODE", "染色コード", "염색 코드", "CODE COULEUR")) }}</div>
                        <div class="mt-1 font-mono text-[12px] help-accent" :style="{ opacity: clamp01(progressAt(time, shot.codeAt ?? 1.2, 0.5)) }">{{ shot.code ?? "C2F8A1K9M4Q7" }}</div>
                    </div>
                    <span class="help-chip help-chip--accent h-10! px-4!">{{ tr(L("复制", "複製", "Copy", "コピー", "복사", "Copier")) }}</span>
                    <span class="help-chip h-10! px-4!">{{ tr(L("从剪贴板导入", "從剪貼簿匯入", "Import", "取込", "가져오기", "Importer")) }}</span>
                </div>

                <div class="mt-4 flex items-center justify-between text-[10px] text-white/35">
                    <span>{{ tr(L("部位 8 仅支持特殊色板 1022–1027", "部位 8 僅支援特殊色板 1022–1027", "Part 8 only accepts swatches 1022–1027", "部位 8 は特殊色 1022–1027 のみ", "부위 8은 특수 색상 1022–1027만", "Zone 8 : nuances 1022–1027 uniquement")) }}</span>
                    <span>{{ tr(L("默认色不消耗资源", "預設色不消耗資源", "Default color costs nothing", "初期色は消費なし", "기본색은 소모 없음", "Couleur par défaut gratuite")) }}</span>
                </div>
            </div>
        </div>
    </div>
</template>
