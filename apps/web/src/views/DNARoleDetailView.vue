<script setup lang="ts">
import { DNAAPI, DNACharDetailBean } from "dna-api"
import { computed, onMounted, ref } from "vue"
import { useRoute, useRouter } from "vue-router"
import { CharBuild, LeveledCharHelper, LeveledModHelper, LeveledWeapon } from "@/data"
import { useSettingStore } from "@/store/setting"
import { useUIStore } from "@/store/ui"

const setting = useSettingStore()
const ui = useUIStore()
let api: DNAAPI
const router = useRouter()
const route = useRoute()

const charDetail = ref<DNACharDetailBean | null>(null)
const loading = ref(true)

const charId = computed(() => route.params.charId as string)
const charEid = computed(() => route.params.charEid as string)

/**
 * 获取角色溯源的序号文本。
 * @param index 溯源索引
 * @returns 适合展示的序号文本
 */
function getTraceOrdinal(index: number): string {
    const ordinals = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"]
    return ordinals[index] || String(index + 1)
}

/**
 * 角色详情魔之楔列表（统一转换后复用到展示和生效计算）
 */
const roleMods = computed(() => {
    return charDetail.value?.modes.map(mode => LeveledModHelper.fromDNA(mode)) || []
})

/**
 * 构建角色详情页专用 CharBuild，用于 tooltip 中的生效条件判断
 */
const roleCharBuild = computed(() => {
    if (!charDetail.value) return null
    try {
        const leveledChar = LeveledCharHelper.fromId(charDetail.value.charId, Number(charDetail.value.level))
        return new CharBuild({
            char: leveledChar,
            hpPercent: 1,
            resonanceGain: 3,
            charMods: roleMods.value,
            melee: LeveledWeapon.emptyWeapon,
            ranged: LeveledWeapon.emptyWeapon,
            baseName: leveledChar.技能[0]?.名称 || "",
        })
    } catch (error) {
        console.error("角色详情 CharBuild 构建失败", error)
        return null
    }
})

onMounted(async () => {
    const p = await setting.getDNAAPI()
    if (!p) {
        ui.showErrorMessage("请先登录")
        router.push("/game-accounts")
        return
    }
    api = p
    await loadRoleDetail()
})

async function loadRoleDetail() {
    try {
        loading.value = true
        const res = await api.getRoleDetail(charId.value, charEid.value)
        if (res.is_success && res.data?.charDetail?.attribute) {
            charDetail.value = res.data.charDetail
        } else {
            ui.showErrorMessage(!res.is_success ? res.msg : "获取角色详情失败")
        }
    } catch (e) {
        ui.showErrorMessage("获取角色详情失败", e)
    } finally {
        loading.value = false
    }
}
</script>
<template>
    <div class="w-full h-full flex flex-col">
        <!-- 顶栏：返回 + 标题（hairline 分隔，无实底页头） -->
        <div class="flex flex-none items-center gap-2.5 border-b border-base-content/15 px-4 py-2.5">
            <button
                type="button"
                class="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-xs border border-base-content/20 text-base-content/60 transition-colors duration-150 hover:border-primary/60 hover:text-primary active:scale-[0.97]"
                @click="router.back()"
            >
                <Icon icon="ri:arrow-left-line" class="size-4" />
            </button>
            <h1 class="min-w-0 flex-1 truncate text-sm font-semibold text-base-content">
                {{ charDetail?.charName || "角色详情" }}
            </h1>
        </div>

        <!-- 内容区域 -->
        <div class="flex-1 overflow-auto">
            <div v-if="loading" class="flex h-full items-center justify-center">
                <span class="loading loading-spinner loading-lg" />
            </div>

            <div v-else-if="charDetail" class="stagger-rise space-y-3 p-3 sm:p-4">
                <!-- 角色档案头：立绘横幅 + 纸面 + primary 强调线 + 引导网格 + 斜切楔形 -->
                <header class="relative overflow-hidden border-b-2 border-primary pb-4">
                    <!-- 引导线网格（装饰性，随主题明暗） -->
                    <div
                        class="pointer-events-none absolute inset-0"
                        style="
                            background-image:
                                linear-gradient(to right, color-mix(in oklab, var(--color-base-content) 7%, transparent) 1px, transparent 1px),
                                linear-gradient(to bottom, color-mix(in oklab, var(--color-base-content) 7%, transparent) 1px, transparent 1px);
                            background-size: 26px 26px;
                            mask-image: linear-gradient(to bottom, black, transparent 85%);
                        "
                        aria-hidden="true"
                    />
                    <!-- 右上角斜切楔形 -->
                    <span
                        class="pointer-events-none absolute top-0 right-0 h-8 w-8 bg-primary [clip-path:polygon(100%_0,100%_100%,0_0)]"
                        aria-hidden="true"
                    />
                    <!-- 角色立绘横幅 -->
                    <div v-if="charDetail.paint" class="relative mb-4">
                        <img
                            :src="charDetail.paint"
                            :alt="$t('dna-role-detail.char_splash')"
                            class="h-48 w-full rounded-xs border border-base-content/10 object-cover object-top md:h-64"
                        />
                    </div>
                    <div class="relative flex items-start gap-3.5">
                        <div
                            class="relative size-20 shrink-0 overflow-hidden rounded-xs border border-base-content/10 bg-base-content/5 sm:size-24"
                        >
                            <img
                                v-if="charDetail.icon"
                                :src="charDetail.icon"
                                :alt="$t('dna-role-detail.char_avatar')"
                                class="h-full w-full object-cover object-top"
                            />
                            <div v-else class="flex h-full w-full items-center justify-center p-1 text-center">
                                <span class="text-xs text-base-content/45">{{ $t("dna-role-detail.no_avatar") }}</span>
                            </div>
                        </div>
                        <div class="relative min-w-0 flex-1">
                            <p
                                class="mb-2 inline-flex items-center gap-2 text-[10px] font-semibold tracking-[0.32em] text-primary uppercase"
                            >
                                <span class="h-px w-6 bg-primary" aria-hidden="true" />
                                Character File
                            </p>
                            <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <h2
                                    class="truncate font-orbitron text-xl leading-tight font-bold tracking-tight text-base-content sm:text-2xl"
                                >
                                    {{ charDetail.charName }}
                                </h2>
                                <CopyID :id="charDetail.charId" />
                            </div>
                            <div class="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-base-content/60">
                                <span v-if="charDetail.elementIcon" class="inline-flex items-center gap-1.5">
                                    <img
                                        :src="charDetail.elementIcon"
                                        :alt="charDetail.elementName"
                                        class="h-5 w-2.5 object-cover"
                                    />
                                    {{ charDetail.elementName }}
                                </span>
                                <span v-else>{{ charDetail.elementName }}</span>
                                <span class="h-3 w-px bg-base-content/20" aria-hidden="true" />
                                <span
                                    class="shrink-0 rounded-xs border border-primary/40 bg-primary/10 px-1.5 py-0.5 font-orbitron text-[11px] font-semibold text-primary tabular-nums"
                                    >{{ ["0", "I", "II", "III", "IV", "V", "VI"][charDetail.gradeLevel] }}</span
                                >
                                <span
                                    class="shrink-0 rounded-xs border border-secondary/40 bg-secondary/10 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-secondary tabular-nums"
                                    >Lv.{{ charDetail.level }}</span
                                >
                            </div>
                        </div>
                    </div>
                </header>

                <!-- 角色属性 -->
                <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                    <SectionHeader no-animate compact kicker="ATTRIBUTES" :title="$t('dna-role-detail.char_attributes')" />
                    <div class="grid grid-cols-2 gap-1.5 md:grid-cols-4">
                        <div
                            class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                        >
                            <span class="text-xs text-base-content/60">{{ $t(`${charDetail.elementName}属性攻击`) }}</span>
                            <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary tabular-nums">{{
                                charDetail.attribute.atk
                            }}</span>
                        </div>
                        <div
                            class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                        >
                            <span class="text-xs text-base-content/60">{{ $t("dna-role-detail.hp") }}</span>
                            <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary tabular-nums">{{
                                charDetail.attribute.maxHp
                            }}</span>
                        </div>
                        <div
                            class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                        >
                            <span class="text-xs text-base-content/60">{{ $t("防御") }}</span>
                            <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary tabular-nums">{{
                                charDetail.attribute.def
                            }}</span>
                        </div>
                        <div
                            class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                        >
                            <span class="text-xs text-base-content/60">{{ $t("护盾") }}</span>
                            <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary tabular-nums">{{
                                charDetail.attribute.maxES
                            }}</span>
                        </div>
                        <div
                            class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                        >
                            <span class="text-xs text-base-content/60">{{ $t("dna-role-detail.max_sanity") }}</span>
                            <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary tabular-nums">{{
                                charDetail.attribute.maxSp
                            }}</span>
                        </div>
                        <div
                            class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                        >
                            <span class="text-xs text-base-content/60">{{ $t("技能威力") }}</span>
                            <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary tabular-nums">{{
                                charDetail.attribute.skillIntensity
                            }}</span>
                        </div>
                        <div
                            class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                        >
                            <span class="text-xs text-base-content/60">{{ $t("技能耐久") }}</span>
                            <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary tabular-nums">{{
                                charDetail.attribute.skillSustain
                            }}</span>
                        </div>
                        <div
                            class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                        >
                            <span class="text-xs text-base-content/60">{{ $t("技能效益") }}</span>
                            <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary tabular-nums">{{
                                charDetail.attribute.skillEfficiency
                            }}</span>
                        </div>
                        <div
                            class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                        >
                            <span class="text-xs text-base-content/60">{{ $t("技能范围") }}</span>
                            <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary tabular-nums">{{
                                charDetail.attribute.skillRange
                            }}</span>
                        </div>
                        <div
                            class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                        >
                            <span class="text-xs text-base-content/60">{{ $t("武器精通") }}</span>
                            <span class="shrink-0 text-[13px] font-semibold text-base-content/85">
                                {{ charDetail.attribute.weaponTags.join("/") }}
                            </span>
                        </div>
                    </div>
                </section>

                <!-- 角色技能 -->
                <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                    <SectionHeader no-animate compact kicker="SKILLS" :title="$t('技能')" />
                    <div class="grid grid-cols-1 gap-1.5 md:grid-cols-3">
                        <div
                            v-for="skill in charDetail.skills"
                            :key="skill.skillId"
                            class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5 transition-colors duration-150 hover:border-primary/40"
                        >
                            <div class="flex items-center gap-2">
                                <div
                                    class="size-10 shrink-0 rounded-xs bg-base-content"
                                    :style="{ mask: `url(${skill.icon}) no-repeat center/contain` }"
                                    role="img"
                                    :aria-label="$t('dna-role-detail.skill_icons')"
                                />
                                <div class="min-w-0 flex-1 truncate text-sm font-medium">
                                    {{ skill.skillName }}
                                </div>
                                <div class="shrink-0 font-mono text-xs text-base-content/55 tabular-nums">Lv. {{ skill.level }}</div>
                            </div>
                        </div>
                    </div>
                </section>

                <!-- 溯源 -->
                <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                    <SectionHeader no-animate compact kicker="TRACE" :title="$t('dna-role-detail.char_trace')" />
                    <div class="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                        <div
                            v-for="(trace, index) in charDetail.traces"
                            :key="index"
                            class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5"
                        >
                            <div class="flex items-center gap-2.5">
                                <img
                                    :src="trace.icon"
                                    :alt="$t('dna-role-detail.trace_icons')"
                                    class="size-10 shrink-0 rounded-xs object-contain"
                                />
                                <div class="min-w-0 flex-1 space-y-1">
                                    <div class="flex flex-wrap items-center gap-1.5">
                                        <span class="text-sm font-medium"> 第{{ getTraceOrdinal(index) }}根源 </span>
                                        <span
                                            class="shrink-0 rounded-xs border px-1.5 py-0.5 text-[10px] font-medium tabular-nums"
                                            :class="
                                                charDetail.gradeLevel > index
                                                    ? 'border-primary/40 bg-primary/10 text-primary'
                                                    : 'border-base-content/15 text-base-content/40'
                                            "
                                            >{{
                                                charDetail.gradeLevel > index ? "已解锁" : "未解锁"
                                            }}</span
                                        >
                                    </div>
                                    <p class="text-xs leading-relaxed text-base-content/55">
                                        {{ trace.description }}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <!-- 魔之楔 -->
                <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                    <SectionHeader no-animate compact kicker="MODS" :title="$t('魔之楔')" />
                    <div class="flex items-center justify-center gap-2">
                        <GameStyleModView
                            :mods="roleMods"
                            :char-build="roleCharBuild || undefined"
                            :current-volume="Number(charDetail.currentVolume)"
                            :sum-volume="Number(charDetail.sumVolume)"
                        />
                    </div>
                </section>
            </div>

            <!-- 错误状态 -->
            <div v-else class="flex h-full items-center justify-center">
                <div class="text-center">
                    <p class="mb-4 text-sm text-base-content/60">{{ $t("dna-role-detail.load_failed") }}</p>
                    <button
                        type="button"
                        class="cursor-pointer rounded-xs border border-primary bg-primary px-3 py-1.5 text-xs font-semibold text-primary-content transition-colors duration-150 active:scale-[0.97]"
                        @click="loadRoleDetail"
                    >
                        {{ $t("dna-role-detail.retry") }}
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>
