<script setup lang="ts">
import { computed } from "vue"
import { useHelpText } from "../../content/locale"
import { type BuildShot, L } from "../../content/types"
import { clamp01, easeInOutCubic, easeOutCubic, easeOutExpo, enterStyle, progressAt, samplePath } from "./motion"

const props = defineProps<{ shot: BuildShot; time: number; duration: number }>()
const tr = useHelpText()

const modeLabel = computed(() => {
    const labels = {
        simple: L("简洁模式", "簡潔模式", "SIMPLE", "シンプル", "간단 모드", "SIMPLE"),
        pro: L("专业模式", "專業模式", "PRO EDITOR", "プロ編集", "전문 편집", "ÉDITEUR PRO"),
        mods: L("魔之楔", "魔之楔", "MODS", "魔之楔", "모드", "MODS"),
        target: L("目标函数", "目標函數", "TARGET FUNCTION", "目標関数", "목표 함수", "FONCTION CIBLE"),
        drag: L("字段拖拽", "欄位拖曳", "FIELD DRAG", "項目ドラッグ", "필드 드래그", "GLISSER UN CHAMP"),
        auto: L("自动构筑", "自動構築", "AUTO BUILD", "自動構築", "자동 빌드", "BUILD AUTO"),
    }
    return labels[props.shot.mode]
})

const levelLabel = computed(() => props.shot.level ?? "Lv.80")

const displayedMods = computed(() => Array.from({ length: 8 }, (_, index) => props.shot.mods?.[index] ?? null))

const tolerancePercent = computed(() => {
    const value = props.shot.tolerance ?? [38, 60]
    return clamp01(value[0] / Math.max(1, value[1])) * 100
})

const damageText = computed(() => countText(props.shot.damage, easeOutExpo(progressAt(props.time, 0.75, 1.2))))

const defaultStats = computed(() => [
    { label: L("攻击", "攻擊", "ATK", "攻撃", "공격", "ATQ"), value: "1,286" },
    { label: L("暴击率", "暴擊率", "CRIT RATE", "会心率", "치명타율", "TAUX CRIT"), value: "62.4%" },
    { label: L("暴击伤害", "暴擊傷害", "CRIT DMG", "会心ダメージ", "치명타 피해", "DÉGÂTS CRIT"), value: "218%" },
    { label: L("增伤", "增傷", "DMG BONUS", "ダメ増加", "피해 증가", "BONUS DGT"), value: "+86.2%" },
])

function countText(raw: string | undefined, progress: number): string {
    if (!raw) return "—"
    const digits = raw.replace(/[^\d]/g, "")
    if (!digits) return raw
    return Math.round(Number(digits) * clamp01(progress)).toLocaleString("en-US")
}

function logVisible(at: number): boolean {
    return props.time >= at
}

/** 字段拖拽演示：指针从技能字段行移动到目标函数里的自定义变量表达式框 */
const DRAG_PATH: [number, number][] = [
    [22, 26],
    [36, 19],
    [55, 20],
    [67, 21],
]

const dragFields = computed(() => props.shot.stats ?? defaultStats.value)
const dragExpr = computed(() => props.shot.dragExpr ?? "")
const dragSkill = computed(() => props.shot.skill ?? props.shot.character)
const targetRest = computed(() => (props.shot.expression ?? "x * 攻速").replace(/^x/, ""))

const dragPoint = computed(() => samplePath(DRAG_PATH, easeInOutCubic(progressAt(props.time, 1.2, 1.9))))

const dragPointerStyle = computed(() => ({
    left: `${dragPoint.value[0]}%`,
    top: `${dragPoint.value[1]}%`,
    opacity: easeOutCubic(progressAt(props.time, 1.0, 0.25)) * (1 - easeOutCubic(progressAt(props.time, 3.3, 0.2))),
}))

const dragGhostVisible = computed(() => props.time >= 1.28 && props.time < 3.45)
const dragGhostStyle = computed(() => {
    const enter = easeOutExpo(progressAt(props.time, 1.28, 0.3))
    const exit = easeOutCubic(progressAt(props.time, 3.28, 0.12))
    return {
        left: `${dragPoint.value[0]}%`,
        top: `${dragPoint.value[1]}%`,
        opacity: clamp01(enter * (1 - exit)),
        transform: `translate(14px, 16px) scale(${0.9 + enter * 0.1})`,
    }
})

const dragPicked = computed(() => props.time >= 0.85 && props.time < 3.4)
const dropHot = computed(() => props.time >= 2.1 && props.time < 3.4)
const dragLanded = computed(() => props.time >= 3.3)
const freshInsert = computed(() => props.time >= 3.3 && props.time < 5.8)

const typedDragExpr = computed(() => {
    const progress = easeOutCubic(progressAt(props.time, 3.3, 0.55))
    return dragExpr.value.slice(0, Math.ceil(dragExpr.value.length * progress))
})

const dropRippleVisible = computed(() => props.time >= 3.3 && props.time < 3.95)
const dropRippleStyle = computed(() => {
    const progress = easeOutCubic(progressAt(props.time, 3.3, 0.6))
    return { opacity: 1 - progress, transform: `scale(${0.7 + progress * 1.6})` }
})

const dragDamage = computed(() => {
    const intro = easeOutExpo(progressAt(props.time, 0.9, 1.1))
    const update = easeOutExpo(progressAt(props.time, 3.95, 1.0))
    const initial = 1_284_900
    const final = Number(props.shot.damage?.replace(/[^\d]/g, "") ?? "") || initial
    const value = update > 0 ? initial + (final - initial) * update : initial * intro
    return Math.round(value).toLocaleString("en-US")
})

const reuseHintOpacity = computed(
    () => easeOutCubic(progressAt(props.time, 5.1, 0.3)) * (1 - easeOutCubic(progressAt(props.time, 7.0, 0.3)))
)

const copyRippleVisible = computed(() => props.time >= 7.35 && props.time < 8.05)
const copyRippleStyle = computed(() => {
    const progress = easeOutCubic(progressAt(props.time, 7.35, 0.7))
    return { opacity: 1 - progress, transform: `scale(${1 + progress * 0.06})` }
})

const copyPointerStyle = computed(() => ({
    left: "40%",
    top: "38%",
    opacity: easeOutCubic(progressAt(props.time, 7.25, 0.2)) * (1 - easeOutCubic(progressAt(props.time, 7.95, 0.2))),
}))

const copyClickRippleStyle = computed(() => {
    const progress = easeOutCubic(progressAt(props.time, 7.35, 0.6))
    return { opacity: 1 - progress, transform: `scale(${0.7 + progress * 1.8})` }
})

const copyToastOpacity = computed(
    () => easeOutCubic(progressAt(props.time, 7.7, 0.25)) * (1 - easeOutCubic(progressAt(props.time, 9.8, 0.3)))
)
</script>

<template>
    <div class="help-build-shot">
        <div class="help-window help-window--static" style="height: 100%; display: flex; flex-direction: column">
            <div class="help-window__bar">
                <div class="help-window__dots"><i class="help-window__dot" /><i class="help-window__dot" /><i class="help-window__dot" /></div>
                <span class="help-window__title">{{ tr(shot.character) }}</span>
                <span v-if="shot.element" class="help-chip help-chip--accent h-5! px-2! text-[9px]!">{{ tr(shot.element) }}</span>
                <span class="help-muted text-[10px]">{{ levelLabel }}</span>
                <span class="help-window__tag">{{ tr(modeLabel) }}</span>
            </div>

            <div class="help-window__body" style="flex: 1; min-height: 0">
                <!-- 简洁模式 HUD -->
                <div v-if="shot.mode === 'simple'" class="help-build-shot__hud w-full p-4">
                    <div class="help-build-panel flex flex-col">
                        <div class="help-build-panel__title">CHARACTER / TEAM</div>
                        <div class="mt-4 flex items-center gap-3">
                            <span class="help-avatar size-12!"><Icon icon="ri:user-line" class="size-6" /></span>
                            <div>
                                <div class="text-sm font-semibold">{{ tr(shot.character) }}</div>
                                <div class="help-muted text-[10px]">{{ tr(shot.element ?? L("", "", "", "", "", "")) }}</div>
                            </div>
                        </div>
                        <div class="mt-5 space-y-2">
                            <div v-for="(stat, index) in shot.stats ?? defaultStats" :key="index" class="help-stat-row">
                                <span class="help-stat-row__label">{{ tr(stat.label) }}</span>
                                <span class="help-stat-row__value">{{ tr(stat.value) }}</span>
                            </div>
                        </div>
                    </div>

                    <div class="help-build-panel relative flex items-center justify-center">
                        <div class="absolute inset-8 rounded-full border border-white/5" />
                        <div class="absolute inset-16 rounded-full border border-dashed border-white/8" />
                        <div class="help-build-hero">
                            <div class="help-build-hero__portrait">
                                <Icon icon="ri:user-line" class="size-20" />
                            </div>
                            <div class="help-chip help-chip--accent">{{ tr(shot.weapon ?? L("近战武器", "近戰武器", "MELEE", "近接武器", "근접 무기", "MÊLÉE")) }}</div>
                            <div class="help-build-damage" :style="{ opacity: progressAt(time, 0.8, 0.5) }">
                                {{ damageText }}<small>DMG</small>
                            </div>
                        </div>
                    </div>

                    <div class="help-build-panel flex flex-col">
                        <div class="flex items-center justify-between">
                            <div class="help-build-panel__title">MODS</div>
                            <span class="help-chip help-chip--accent h-5! px-2! text-[9px]!">{{ shot.tolerance?.[0] ?? 38 }}/{{ shot.tolerance?.[1] ?? 60 }}</span>
                        </div>
                        <div class="mt-4 help-slot-grid" style="grid-template-columns: repeat(2, minmax(0, 1fr))">
                            <div v-for="(mod, index) in displayedMods.slice(0, 4)" :key="index" class="help-mod-slot" :class="mod ? 'help-mod-slot--filled' : 'help-mod-slot--empty'">
                                <span class="help-mod-slot__name">{{ mod ? tr(mod.name) : "+" }}</span>
                                <span v-if="mod" class="help-mod-slot__lv">Lv.{{ mod.level ?? 10 }}</span>
                            </div>
                        </div>
                        <div class="help-tolerance">
                            <span class="help-muted text-[10px]">TOL</span>
                            <div class="help-tolerance__bar"><div class="help-tolerance__fill" :style="{ width: `${tolerancePercent}%` }" /></div>
                        </div>
                        <div class="mt-auto pt-4">
                            <div class="help-build-panel__title">OUTPUT</div>
                            <div class="mt-2 text-[11px] leading-relaxed text-white/55">
                                {{ tr(L("目标函数：伤害", "目標函數：傷害", "Target: Damage", "目標関数：ダメージ", "목표 함수: 피해", "Cible : dégâts")) }}
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 专业模式：顶栏 + 左侧角色/武器与目标函数 + 右侧编号正文 -->
                <div v-else-if="shot.mode === 'pro'" class="help-build-pro">
                    <div class="help-pro-topbar">
                        <div class="flex min-w-0 items-center gap-2.5">
                            <span class="help-pro-topbar__title">{{ tr(shot.character) }} <b>Build</b></span>
                            <span class="help-pro-topbar__divider" />
                            <span class="help-pro-topbar__meta">{{ tr(shot.element ?? L("", "", "", "", "", "")) }}</span>
                            <span class="help-pro-topbar__meta">{{ levelLabel }}</span>
                        </div>
                        <div class="help-pro-actions">
                            <span
                                v-for="icon in ['ri:focus-3-line', 'ri:question-line', 'ri:share-line', 'ri:download-2-line', 'ri:game-line', 'ri:robot-2-line', 'ri:bar-chart-line']"
                                :key="icon"
                                class="help-pro-icon"
                            >
                                <Icon :icon="icon" class="size-3.5" />
                            </span>
                            <span class="help-pro-icon help-pro-icon--primary"><Icon icon="ri:save-fill" class="size-3.5" /></span>
                            <span class="help-pro-icon"><Icon icon="ri:refresh-line" class="size-3.5" /></span>
                        </div>
                    </div>

                    <div class="help-pro-body">
                        <aside class="help-pro-sidebar">
                            <div class="help-pro-tabs">
                                <span
                                    v-for="tab in [
                                        { icon: 'ri:user-line', active: true },
                                        { icon: 'ri:sword-line', active: false },
                                        { icon: 'ri:crosshair-line', active: false },
                                        { icon: 'ri:sparkling-line', active: false },
                                    ]"
                                    :key="tab.icon"
                                    class="help-pro-tab"
                                    :class="{ 'is-active': tab.active }"
                                >
                                    <Icon :icon="tab.icon" class="size-4" />
                                </span>
                            </div>

                            <div class="help-pro-card">
                                <div class="help-pro-card__head">
                                    <span>{{ tr(shot.character) }}</span>
                                    <span class="help-pro-card__lv">{{ levelLabel }}</span>
                                </div>
                                <div class="help-pro-slider"><i style="width: 100%" /></div>
                                <div class="help-pro-stats">
                                    <div v-for="(stat, index) in (shot.stats ?? defaultStats).slice(0, 4)" :key="index" class="help-pro-stat">
                                        <span>{{ tr(stat.label) }}</span>
                                        <b>{{ tr(stat.value) }}</b>
                                    </div>
                                </div>
                                <div class="help-pro-chevron"><Icon icon="ri:arrow-down-s-line" class="size-3.5" /></div>
                                <div class="help-pro-skilltabs">
                                    <span class="help-pro-skilltab is-active">E</span>
                                    <span class="help-pro-skilltab">Q</span>
                                    <span class="help-pro-skilltab">{{ tr(L("被动", "被動", "Passive", "パッシブ", "패시브", "Passif")) }}</span>
                                </div>
                                <div class="help-pro-skillrow">
                                    <span>{{ tr(L("技能等级", "技能等級", "Skill Lv.", "スキルLv", "스킬 레벨", "Niv. compétence")) }}</span>
                                    <span>12</span>
                                </div>
                                <div class="help-pro-slider"><i style="width: 100%" /></div>
                            </div>

                            <div class="help-pro-card help-pro-target">
                                <div class="help-pro-card__head">
                                    <span>{{ tr(L("目标函数", "目標函數", "Target function", "目標関数", "목표 함수", "Fonction cible")) }}</span>
                                    <span class="flex items-center gap-1.5">
                                        <Icon icon="ri:question-line" class="size-3 text-white/35" />
                                        <span class="help-pro-toggle" />
                                    </span>
                                </div>
                                <div class="help-pro-dot">
                                    <span>{{ tr(L("每秒DOT伤害", "每秒DOT傷害", "DOT damage / s", "毎秒DOTダメージ", "초당 DOT 피해", "Dégâts DOT/s")) }}</span>
                                    <span>0</span>
                                </div>
                                <div class="help-pro-expression">{{ shot.expression ?? "伤害" }}</div>
                                <div class="help-pro-result">
                                    <span class="help-pro-result__label">{{ tr(L("普攻 · 一段", "普攻 · 一段", "Basic · 1st", "通常攻撃・1段", "평타 · 1단", "Attaque · 1er")) }}</span>
                                    <span class="help-pro-damage">{{ damageText }}</span>
                                </div>
                            </div>
                        </aside>

                        <main class="help-pro-main">
                            <div
                                v-for="section in [
                                    { number: '01', kicker: 'SHARE', title: L('配装分享', '配裝分享', 'Build share', '構築共有', '빌드 공유', 'Partage') },
                                    { number: '02', kicker: 'PROFILE', title: L('角色详情', '角色詳情', 'Character detail', 'キャラ詳細', '캐릭터 상세', 'Détail') },
                                    { number: '03', kicker: 'SETTINGS', title: L('基本设置', '基本設定', 'Basic settings', '基本設定', '기본 설정', 'Réglages') },
                                ]"
                                :key="section.number"
                                class="help-pro-section"
                            >
                                <div class="help-pro-section__head">
                                    <span class="help-pro-num">{{ section.number }}</span>
                                    <span class="help-pro-kicker">{{ section.kicker }}</span>
                                    <span class="help-pro-title">{{ tr(section.title) }}</span>
                                    <span class="help-pro-line" />
                                    <Icon icon="ri:arrow-down-s-line" class="size-4 text-white/35" />
                                </div>
                            </div>

                            <div class="help-pro-section help-pro-section--open">
                                <div class="help-pro-section__head">
                                    <span class="help-pro-num">04</span>
                                    <span class="help-pro-kicker">MODS</span>
                                    <span class="help-pro-title">{{ tr(L("魔之楔", "魔之楔", "MODs", "魔之楔", "모드", "MODs")) }} ({{ shot.tolerance?.[0] ?? 42 }}/{{ shot.tolerance?.[1] ?? 60 }})</span>
                                    <span class="help-pro-badge">{{ tr(L("8 装配", "8 裝配", "8 slotted", "8 装着", "8 장착", "8 équipés")) }}</span>
                                    <span class="help-pro-line" />
                                    <Icon icon="ri:arrow-down-s-line" class="size-4 rotate-180 text-white/55" />
                                </div>
                                <div class="help-pro-section__body">
                                    <div class="help-pro-modbar">
                                        <span class="help-pro-variant is-active">A</span>
                                        <span class="help-pro-variant">B</span>
                                        <span class="help-pro-variant">+</span>
                                        <span class="help-pro-tool"><Icon icon="ri:calculator-line" class="size-3" /></span>
                                        <span class="help-pro-aura">
                                            <Icon icon="ri:copper-coin-line" class="size-3.5 text-amber-300" />
                                            <span>{{ tr(L("金 - 决断", "金 - 決斷", "Gold - Resolve", "金 - 決断", "금 - 결단", "Or - Décision")) }}</span>
                                        </span>
                                        <span class="help-pro-badge">D 22</span>
                                        <span class="help-pro-line" />
                                        <span class="help-pro-tool"><Icon icon="ri:download-cloud-2-line" class="size-3" /></span>
                                        <span class="help-pro-tool"><Icon icon="ri:import-line" class="size-3" /></span>
                                        <span class="help-pro-tool"><Icon icon="ri:file-copy-line" class="size-3" /></span>
                                    </div>
                                    <div class="help-pro-mods">
                                        <div
                                            v-for="(mod, index) in displayedMods"
                                            :key="index"
                                            class="help-mod-slot"
                                            :class="[mod ? 'help-mod-slot--filled' : 'help-mod-slot--empty', { 'opacity-60': !mod }]"
                                            :style="{ ...enterStyle(time, 0.35 + index * 0.06, 0.4, 8), borderColor: mod?.accent ? 'color-mix(in oklch, var(--accent) 55%, transparent)' : undefined }"
                                        >
                                            <span class="help-mod-slot__name">{{ mod ? tr(mod.name) : "+" }}</span>
                                            <span class="help-mod-slot__lv">{{ mod ? `Lv.${mod.level ?? 10}` : "EMPTY" }}</span>
                                        </div>
                                    </div>
                                    <div class="help-tolerance">
                                        <span class="help-muted text-[9px]">TOLERANCE</span>
                                        <div class="help-tolerance__bar"><div class="help-tolerance__fill" :style="{ width: `${tolerancePercent}%` }" /></div>
                                        <span class="font-orbitron text-[9px] text-white/70">{{ shot.tolerance?.[0] ?? 42 }}</span>
                                    </div>
                                </div>
                            </div>

                            <div
                                v-for="section in [
                                    { number: '05', kicker: 'EFFECTS', title: L('特效配置', '特效設定', 'Effects', 'エフェクト', '이펙트', 'Effets') },
                                    { number: '06', kicker: 'BUFFS', title: L('BUFF 列表', 'BUFF 列表', 'BUFF list', 'BUFF 一覧', 'BUFF 목록', 'Liste BUFF') },
                                    { number: '07', kicker: 'ACTIONS', title: L('动作序列', '動作序列', 'Actions', 'アクション', '동작', 'Actions') },
                                    { number: '08', kicker: 'LOADOUT', title: L('装配预览', '裝配預覽', 'Loadout preview', '装備プレビュー', '장비 미리보기', 'Aperçu') },
                                ]"
                                :key="section.number"
                                class="help-pro-section help-pro-section--faded"
                            >
                                <div class="help-pro-section__head">
                                    <span class="help-pro-num">{{ section.number }}</span>
                                    <span class="help-pro-kicker">{{ section.kicker }}</span>
                                    <span class="help-pro-title">{{ tr(section.title) }}</span>
                                    <span class="help-pro-line" />
                                    <Icon icon="ri:arrow-down-s-line" class="size-4 text-white/25" />
                                </div>
                            </div>
                        </main>
                    </div>
                </div>

                <!-- 魔之楔 -->
                <div v-else-if="shot.mode === 'mods'" class="w-full p-5">
                    <div class="flex items-end justify-between">
                        <div>
                            <div class="help-kicker">MOD LOADOUT</div>
                            <div class="mt-1 text-xl font-bold">
                                {{ tr(L("魔之楔", "魔之楔", "Mods", "魔之楔", "모드", "Mods")) }}
                                <span class="help-accent">({{ shot.tolerance?.[0] ?? 38 }}/{{ shot.tolerance?.[1] ?? 60 }})</span>
                            </div>
                        </div>
                        <div class="flex items-center gap-1.5">
                            <span v-for="variant in ['A', 'B', 'C']" :key="variant" class="help-chip h-7! w-8! justify-center px-0! text-[11px]!" :class="{ 'help-chip--accent': variant === (shot.activeVariant ?? 'A') }">
                                {{ variant }}
                            </span>
                            <span class="help-chip">+</span>
                            <span class="help-chip">{{ tr(L("导入游戏", "匯入遊戲", "Import", "ゲーム取込", "게임 가져오기", "Importer")) }}</span>
                            <span class="help-chip">{{ tr(L("复制代码", "複製代碼", "Copy code", "コードをコピー", "코드 복사", "Copier le code")) }}</span>
                        </div>
                    </div>
                    <div class="mt-4 help-slot-grid" style="grid-template-columns: repeat(8, minmax(0, 1fr))">
                        <div
                            v-for="(mod, index) in displayedMods"
                            :key="index"
                            class="help-mod-slot"
                            :class="mod ? 'help-mod-slot--filled' : 'help-mod-slot--empty'"
                            :style="enterStyle(time, 0.4 + index * 0.07, 0.45, 14)"
                        >
                            <span class="help-mod-slot__name">{{ mod ? tr(mod.name) : "+" }}</span>
                            <span v-if="mod" class="help-mod-slot__lv">Lv.{{ mod.level ?? 10 }}</span>
                            <span v-else class="help-mod-slot__lv">EMPTY</span>
                            <span v-if="mod?.accent" class="absolute right-1 top-1 size-1.5 bg-(--accent)" />
                        </div>
                    </div>
                    <div class="help-tolerance mt-5">
                        <span class="help-muted text-[11px]">{{ tr(L("当前有效负荷 / 耐受上限", "目前有效負荷 / 耐受上限", "Current load / tolerance", "現在の負荷 / 耐性上限", "현재 부하 / 내성 상한", "Charge / tolérance")) }}</span>
                        <div class="help-tolerance__bar"><div class="help-tolerance__fill" :style="{ width: `${tolerancePercent}%` }" /></div>
                        <span class="font-orbitron text-[12px] text-white/80">{{ Math.round(tolerancePercent) }}%</span>
                    </div>
                    <div class="mt-4 flex items-center gap-2">
                        <span class="help-chip help-chip--accent">{{ tr(L("2 个移转模块", "2 個移轉模組", "2 transfer modules", "転送モジュール 2", "이전 모듈 2", "2 modules de transfert")) }}</span>
                        <span class="help-muted text-[11px]">{{ tr(L("自动计算需要用的移转模块数量", "自動計算需要用的移轉模組數量", "Automatically calculates the transfer modules needed", "必要な転送モジュール数を自動計算", "필요한 전이 모듈 수를 자동 계산", "Calcule automatiquement les modules de transfert nécessaires")) }}</span>
                    </div>
                </div>

                <!-- 目标函数 -->
                <div v-else-if="shot.mode === 'target'" class="grid w-full grid-cols-[1.25fr_1fr] gap-4 p-5">
                    <div class="help-build-panel flex flex-col">
                        <div class="help-build-panel__title">EXPRESSION</div>
                        <div class="mt-3 help-expression text-[20px]!">{{ shot.expression ?? "DPS" }}</div>
                        <div class="mt-4 help-build-panel__title">AST</div>
                        <div class="help-ast">
                            <div v-for="(line, index) in shot.ast ?? []" :key="index" class="help-ast__row" :style="enterStyle(time, 0.5 + index * 0.22, 0.45, 8)">
                                <span class="help-dim">{{ String(index + 1).padStart(2, "0") }}</span>
                                <span>{{ line }}</span>
                            </div>
                        </div>
                        <div class="mt-auto flex items-center gap-2 pt-4">
                            <span class="help-chip help-chip--accent">{{ tr(L("表达式合法", "表達式合法", "Expression valid", "式は有効", "표현식 유효", "Expression valide")) }}</span>
                            <span class="help-muted text-[11px]">{{ tr(L("拖拽属性行可直接插入字段", "拖曳屬性列可直接插入欄位", "Drag an attribute row to insert a field", "属性行をドラッグして挿入", "속성 행을 드래그해 삽입", "Glissez une ligne d'attribut")) }}</span>
                        </div>
                    </div>
                    <div class="help-build-panel flex flex-col">
                        <div class="help-build-panel__title">RESULT</div>
                        <div class="help-build-damage mt-4 text-[48px]!">{{ damageText }}</div>
                        <div class="mt-2 text-[12px] text-white/55">{{ tr(L("每秒伤害", "每秒傷害", "Damage per second", "秒間ダメージ", "초당 피해", "Dégâts par seconde")) }}</div>
                        <div class="mt-6 space-y-1">
                            <div v-for="(stat, index) in shot.stats ?? defaultStats" :key="index" class="help-stat-row">
                                <span class="help-stat-row__label">{{ tr(stat.label) }}</span>
                                <span class="help-stat-row__value">{{ tr(stat.value) }}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 字段拖拽：技能字段 → 自定义变量 -->
                <div v-else-if="shot.mode === 'drag'" class="help-drag-stage">
                    <div class="help-drag-card">
                        <div class="help-drag-card__head">
                            <div class="help-drag-card__title">
                                <span class="help-drag-skillicon"><Icon icon="ri:flashlight-line" class="size-3.5" /></span>
                                <span>{{ tr(dragSkill) }}</span>
                            </div>
                            <span class="help-chip help-chip--accent h-5! px-2! text-[9px]!">E</span>
                        </div>

                        <div class="help-drag-skillmeta">
                            <span>{{ tr(L("技能等级", "技能等級", "Skill Lv.", "スキルLv", "스킬 레벨", "Niv. compétence")) }}</span>
                            <div class="help-drag-slider"><i /></div>
                            <b>12</b>
                        </div>

                        <div class="help-drag-fields">
                            <div class="help-drag-fields__head">
                                <span>{{ tr(L("技能字段", "技能欄位", "Skill fields", "スキル項目", "스킬 필드", "Champs de compétence")) }}</span>
                                <span class="help-drag-fields__hint">
                                    <Icon icon="ri:information-line" class="size-3" />
                                    {{ tr(L("可拖动", "可拖曳", "Draggable", "ドラッグ可", "드래그 가능", "Déplaçable")) }}
                                </span>
                            </div>
                            <div
                                v-for="(field, index) in dragFields.slice(0, 6)"
                                :key="index"
                                class="help-drag-field"
                                :class="{ 'is-picked': index === 0 && dragPicked, 'is-copying': index === 1 && copyRippleVisible }"
                            >
                                <div class="help-drag-field__name">
                                    <span class="help-drag-grip"><i /><i /><i /><i /><i /><i /></span>
                                    <span>{{ tr(field.label) }}</span>
                                </div>
                                <span class="help-drag-field__value">{{ tr(field.value) }}</span>
                                <span
                                    v-if="index === 1 && copyRippleVisible"
                                    class="help-drag-copy-ripple"
                                    :style="copyRippleStyle"
                                />
                            </div>
                        </div>

                        <div class="help-drag-tip">
                            <Icon icon="ri:drag-move-line" class="size-3.5" />
                            <span>{{ tr(L("按住字段拖到右侧表达式，双击复制", "按住欄位拖到右側表達式，雙擊複製", "Press and drag a field into the expression; double-click to copy", "項目を押したまま式へドラッグ、ダブルクリックでコピー", "필드를 눌러 식으로 드래그, 더블클릭으로 복사", "Glissez un champ dans l'expression ; double-clic pour copier")) }}</span>
                        </div>
                    </div>

                    <div class="help-drag-card">
                        <div class="help-drag-card__head">
                            <span>{{ tr(L("目标函数", "目標函數", "Target function", "目標関数", "목표 함수", "Fonction cible")) }}</span>
                            <span class="flex items-center gap-1.5">
                                <Icon icon="ri:question-line" class="size-3 text-white/35" />
                                <span class="help-pro-toggle" />
                            </span>
                        </div>

                        <div class="help-drag-vars">
                            <div class="help-drag-vars__head">
                                <span>{{ tr(L("自定义变量", "自訂變數", "Custom variables", "カスタム変数", "사용자 변수", "Variables personnalisées")) }}</span>
                                <span class="help-drag-vars__count">{{ tr(L("1 个", "1 個", "1 var", "1 件", "1 개", "1 var")) }}</span>
                                <Icon icon="ri:arrow-down-s-line" class="ml-auto size-3.5 text-white/35" />
                            </div>

                            <div class="help-drag-var" :class="{ 'is-hot': dropHot, 'is-landed': dragLanded }">
                                <span class="help-drag-var__name">x</span>
                                <span class="help-drag-var__eq">=</span>
                                <span class="help-drag-var__expr">
                                    攻击
                                    <span v-if="typedDragExpr" class="help-drag-var__insert" :class="{ 'is-fresh': freshInsert }"> + {{ typedDragExpr }}</span>
                                </span>
                                <Icon icon="codicon:chrome-close" class="help-drag-var__close" />
                            </div>

                            <div class="help-drag-var__tools">
                                <span class="help-drag-addvar">
                                    <Icon icon="ri:add-line" class="size-3.5" />
                                    {{ tr(L("变量", "變數", "Variable", "変数", "변수", "Variable")) }}
                                </span>
                                <span class="help-drag-var__tool"><Icon icon="ri:file-copy-line" class="size-3.5" /></span>
                                <span class="help-drag-var__tool"><Icon icon="ri:clipboard-line" class="size-3.5" /></span>
                            </div>
                        </div>

                        <div class="help-drag-dot">
                            <span>{{ tr(L("每秒DOT伤害", "每秒DOT傷害", "DOT damage / s", "毎秒DOTダメージ", "초당 DOT 피해", "Dégâts DOT/s")) }}</span>
                            <span>0</span>
                        </div>

                        <div class="help-drag-targetline">
                            <span class="help-drag-targetline__expr">
                                <b :class="{ 'is-reused': reuseHintOpacity > 0.4 }">x</b>{{ targetRest }}
                            </span>
                            <Icon icon="codicon:chrome-close" class="help-drag-var__close" />
                        </div>

                        <div class="help-drag-result">
                            <span class="help-drag-result__label">{{ tr(dragSkill) }}</span>
                            <span class="help-pro-damage">{{ dragDamage }}</span>
                        </div>

                        <div class="help-drag-feedback">
                            <div class="help-drag-reuse" :style="{ opacity: reuseHintOpacity }">
                                <Icon icon="ri:arrow-right-up-line" class="size-3.5" />
                                <span>{{ tr(L("目标函数复用了变量 x", "目標函數複用了變數 x", "The target function reuses x", "目標関数が x を再利用", "목표 함수가 x를 재사용", "La fonction cible réutilise x")) }}</span>
                            </div>

                            <div class="help-drag-toast" :style="{ opacity: copyToastOpacity }">
                                <Icon icon="ri:check-line" class="size-3.5" />
                                <span>{{ tr(L("已复制到剪贴板", "已複製到剪貼簿", "Copied to clipboard", "クリップボードにコピーしました", "클립보드에 복사되었습니다", "Copié dans le presse-papiers")) }}</span>
                            </div>
                        </div>

                        <div class="help-drag-legend">
                            <span><Icon icon="ri:drag-move-line" class="size-3" />{{ tr(L("拖动字段", "拖曳欄位", "Drag", "ドラッグ", "드래그", "Glisser")) }}</span>
                            <span><Icon icon="ri:cursor-line" class="size-3" />{{ tr(L("触屏点选", "觸屏點選", "Tap to pick", "タップで選択", "탭으로 선택", "Toucher")) }}</span>
                            <span><Icon icon="ri:file-copy-line" class="size-3" />{{ tr(L("双击复制", "雙擊複製", "Double-click", "ダブルクリック", "더블클릭", "Double-clic")) }}</span>
                        </div>
                    </div>

                    <div v-if="dragGhostVisible" class="help-drag-ghost" :style="dragGhostStyle">
                        {{ dragExpr }}
                    </div>

                    <div v-if="time >= 1.0 && time < 3.55" class="help-drag-pointer" :style="dragPointerStyle">
                        <span class="help-drag-pointer__ring" />
                        <span class="help-drag-pointer__dot" />
                        <span v-if="dropRippleVisible" class="help-drag-pointer__ripple" :style="dropRippleStyle" />
                    </div>

                    <div v-if="time >= 7.25 && time < 8.1" class="help-drag-pointer" :style="copyPointerStyle">
                        <span class="help-drag-pointer__ring" />
                        <span class="help-drag-pointer__dot" />
                        <span v-if="copyRippleVisible" class="help-drag-pointer__ripple" :style="copyClickRippleStyle" />
                    </div>
                </div>

                <!-- 自动构筑 -->
                <div v-else class="w-full p-5">
                    <div class="flex items-end justify-between">
                        <div>
                            <div class="help-kicker">OPTIMIZER</div>
                            <div class="mt-1 text-2xl font-bold">{{ tr(L("自动构筑", "自動構築", "Auto Build", "自動構築", "자동 빌드", "Build automatique")) }}</div>
                        </div>
                        <span class="help-chip help-chip--accent">{{ tr(L("使用库存", "使用庫存", "Use inventory", "在庫を使用", "인벤토리 사용", "Utiliser l'inventaire")) }}</span>
                    </div>

                    <div class="mt-6 flex items-center gap-6">
                        <div class="text-center">
                            <div class="help-muted text-[11px]">BEFORE</div>
                            <div class="mt-1 font-orbitron text-2xl text-white/55">{{ shot.before ?? "0" }}</div>
                        </div>
                        <Icon icon="ri:arrow-right-line" class="help-accent size-7" />
                        <div class="text-center">
                            <div class="help-muted text-[11px]">AFTER</div>
                            <div class="mt-1 font-orbitron text-3xl help-accent">{{ countText(shot.after, easeOutExpo(progressAt(time, 0.9, 1.4))) }}</div>
                        </div>
                        <span class="help-chip help-chip--accent h-8! text-sm!">{{ shot.percent ?? "+0%" }}</span>
                        <div class="flex-1">
                            <div class="help-muted mb-2 text-[10px]">{{ tr(L("优化进度", "最佳化進度", "OPTIMIZING", "最適化中", "최적화 중", "OPTIMISATION")) }}</div>
                            <div class="help-progress"><div class="help-progress__fill" :style="{ width: `${clamp01(progressAt(time, 0.5, 3.2)) * 100}%` }" /></div>
                        </div>
                    </div>

                    <div class="mt-6 grid grid-cols-[1fr_1.2fr] gap-4">
                        <div class="help-build-panel">
                            <div class="help-build-panel__title">CANDIDATES</div>
                            <div class="mt-3 grid grid-cols-2 gap-2">
                                <div v-for="(mod, index) in displayedMods.slice(0, 6)" :key="index" class="help-mod-slot" :class="mod ? 'help-mod-slot--filled' : 'help-mod-slot--empty'">
                                    <span class="help-mod-slot__name">{{ mod ? tr(mod.name) : "+" }}</span>
                                    <span v-if="mod" class="help-mod-slot__lv">Lv.{{ mod.level ?? 10 }}</span>
                                </div>
                            </div>
                        </div>
                        <div class="help-build-panel overflow-hidden">
                            <div class="help-build-panel__title">LOG</div>
                            <div class="mt-2 space-y-1.5 font-mono text-[10px] leading-relaxed">
                                <div v-for="(log, index) in shot.logs ?? []" :key="index" class="flex gap-2 text-white/55" :style="{ opacity: logVisible(log.at) ? 1 : 0 }">
                                    <span class="help-accent">›</span>
                                    <span>{{ tr(log.text) }}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
