<script setup lang="ts">
import { DNAAPI, DNAWeaponDetailBean } from "dna-api"
import { computed, onMounted, ref } from "vue"
import { useRoute, useRouter } from "vue-router"
import { LeveledModHelper } from "@/data"
import { useSettingStore } from "@/store/setting"
import { useUIStore } from "@/store/ui"

const setting = useSettingStore()
const ui = useUIStore()
let api: DNAAPI
const router = useRouter()
const route = useRoute()

const weaponDetail = ref<DNAWeaponDetailBean | null>(null)
const loading = ref(true)

const weaponId = computed(() => route.params.weaponId as string)
const weaponEid = computed(() => route.params.weaponEid as string)

onMounted(async () => {
    const p = await setting.getDNAAPI()
    if (!p) {
        ui.showErrorMessage("请先登录")
        router.push("/game-accounts")
        return
    }
    api = p
    await loadWeaponDetail()
})

async function loadWeaponDetail() {
    try {
        loading.value = true
        const res = await api.getWeaponDetail(weaponId.value, weaponEid.value)
        if (res.is_success && res.data?.weaponDetail?.attribute) {
            weaponDetail.value = res.data.weaponDetail
        } else {
            ui.showErrorMessage(!res.is_success ? res.msg : "获取武器详情失败")
        }
    } catch (e) {
        ui.showErrorMessage("获取武器详情失败", e)
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
                {{ weaponDetail?.name || "武器详情" }}
            </h1>
        </div>

        <!-- 内容区域 -->
        <div class="flex-1 overflow-auto">
            <div v-if="loading" class="flex h-full items-center justify-center">
                <span class="loading loading-spinner loading-lg" />
            </div>

            <div v-else-if="weaponDetail" class="stagger-rise space-y-3 p-3 sm:p-4">
                <!-- 武器档案头：纸面 + primary 强调线 + 引导网格 + 斜切楔形 -->
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
                    <div class="relative flex items-start gap-3.5">
                        <!-- 武器图标 -->
                        <div
                            class="relative size-20 shrink-0 overflow-hidden rounded-xs border border-base-content/10 bg-base-content/5 sm:size-24"
                        >
                            <img
                                v-if="weaponDetail.icon"
                                :src="weaponDetail.icon"
                                :alt="$t('dna-weapon-detail.weapon_icon')"
                                class="h-full w-full object-contain p-1.5"
                            />
                            <div v-else class="flex h-full w-full items-center justify-center p-1.5 text-center">
                                <span class="text-xs text-base-content/45">{{ $t("dna-weapon-detail.no_icon") }}</span>
                            </div>
                        </div>
                        <!-- 武器名称与等级 -->
                        <div class="relative min-w-0 flex-1">
                            <p
                                class="mb-2 inline-flex items-center gap-2 text-[10px] font-semibold tracking-[0.32em] text-primary uppercase"
                            >
                                <span class="h-px w-6 bg-primary" aria-hidden="true" />
                                Weapon File
                            </p>
                            <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <h2
                                    class="truncate font-orbitron text-xl leading-tight font-bold tracking-tight text-base-content sm:text-2xl"
                                >
                                    {{ weaponDetail.name }}
                                </h2>
                                <CopyID :id="weaponId" />
                            </div>
                            <!-- 元素类型 -->
                            <div class="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-base-content/60">
                                <span v-if="weaponDetail.elementIcon" class="inline-flex items-center gap-1.5">
                                    <img
                                        :src="weaponDetail.elementIcon"
                                        :alt="$t('dna-weapon-detail.element_icon')"
                                        class="h-5 w-5 object-contain"
                                    />
                                    {{ weaponDetail.elementName }}
                                </span>
                                <span v-else>{{ weaponDetail.elementName }}</span>
                                <span class="h-3 w-px bg-base-content/20" aria-hidden="true" />
                                <span
                                    class="shrink-0 rounded-xs border border-secondary/40 bg-secondary/10 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-secondary tabular-nums"
                                    >Lv.{{ weaponDetail.level }}</span
                                >
                            </div>
                            <div class="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-base-content/50">
                                <!-- 精炼等级 -->
                                <span>
                                    {{ $t("dna-weapon-detail.refine_level") }}
                                    <span class="font-mono font-semibold text-base-content/80 tabular-nums">{{
                                        weaponDetail.skillLevel
                                    }}</span>
                                </span>
                                <span class="h-3 w-px bg-base-content/20" aria-hidden="true" />
                                <!-- 魔之楔 -->
                                <span>
                                    {{ $t("dna-weapon-detail.mods") }}
                                    <span class="font-mono font-semibold text-base-content/80 tabular-nums"
                                        >{{ weaponDetail.currentVolume }}/{{ weaponDetail.sumVolume }}</span
                                    >
                                </span>
                            </div>
                        </div>
                    </div>
                </header>

                <!-- 武器属性 -->
                <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                    <SectionHeader no-animate compact kicker="ATTRIBUTES" :title="$t('dna-weapon-detail.weapon_attrs')" />
                    <div class="grid grid-cols-2 gap-1.5 md:grid-cols-5">
                        <div
                            class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                        >
                            <span class="text-xs text-base-content/60">{{ $t("dna-weapon-detail.atk") }}</span>
                            <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary">{{
                                weaponDetail.attribute.atk
                            }}</span>
                        </div>
                        <div
                            class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                        >
                            <span class="text-xs text-base-content/60">{{ $t("dna-weapon-detail.crit_rate") }}</span>
                            <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary tabular-nums"
                                >{{ +(weaponDetail.attribute.cri * 100).toFixed(2) }}%</span
                            >
                        </div>
                        <div
                            class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                        >
                            <span class="text-xs text-base-content/60">{{ $t("暴击伤害") }}</span>
                            <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary tabular-nums"
                                >{{ +(weaponDetail.attribute.crd * 100).toFixed(2) }}%</span
                            >
                        </div>
                        <div
                            class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                        >
                            <span class="text-xs text-base-content/60">{{ $t("攻速") }}</span>
                            <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary tabular-nums">{{
                                weaponDetail.attribute.speed
                            }}</span>
                        </div>
                        <div
                            class="flex items-center justify-between gap-2 rounded-xs border border-base-content/10 bg-base-content/3 px-2.5 py-2"
                        >
                            <span class="text-xs text-base-content/60">{{ $t("触发") }}</span>
                            <span class="shrink-0 font-orbitron text-[13px] font-semibold text-primary tabular-nums"
                                >{{ +(weaponDetail.attribute.trigger * 100).toFixed(2) }}%</span
                            >
                        </div>
                    </div>
                </section>

                <!-- 武器描述 -->
                <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
                    <SectionHeader no-animate compact kicker="DESC" :title="$t('dna-weapon-detail.weapon_desc')" />
                    <p class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5 text-sm leading-relaxed whitespace-pre-line text-base-content/85">
                        {{ weaponDetail.description || "暂无描述" }}
                    </p>
                </section>

                <!-- 模式 -->
                <section
                    v-if="weaponDetail.modes && weaponDetail.modes.length > 0"
                    class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm"
                >
                    <SectionHeader no-animate compact kicker="MODS" :title="$t('dna-weapon-detail.mode')" />
                    <div class="grid grid-cols-2 gap-1.5 md:grid-cols-4">
                        <ModItem v-for="(mode, index) in weaponDetail.modes" :key="index" :mod="LeveledModHelper.fromDNA(mode)" />
                    </div>
                </section>
            </div>

            <!-- 错误状态 -->
            <div v-else class="flex h-full items-center justify-center">
                <div class="text-center">
                    <p class="mb-4 text-sm text-base-content/60">{{ $t("dna-weapon-detail.load_failed") }}</p>
                    <button
                        type="button"
                        class="cursor-pointer rounded-xs border border-primary bg-primary px-3 py-1.5 text-xs font-semibold text-primary-content transition-colors duration-150 active:scale-[0.97]"
                        @click="loadWeaponDetail"
                    >
                        {{ $t("dna-weapon-detail.retry") }}
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>
