<script setup lang="ts">
import { useTranslation } from "i18next-vue"
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue"
import { buildQuery } from "@/api/graphql"
import { type CharSettings, normalizeCharSettings } from "@/composables/useCharSettings"
import { charMap, LeveledChar, LeveledMod, LeveledModHelper, LeveledWeapon, weaponMap } from "@/data"

/**
 * 协战构筑弹窗——简洁模式下点击协战角色/协战武器时打开。
 *
 * 数据来源是专业模式里为该协战角色关联的服务器分享构筑 id（charSettings.teamNBuild）：
 * 打开时按 id 拉取构筑快照，再按「角色魔之楔 + 各武器槽位魔之楔」分组展示。
 * 本组件只读，不修改任何构筑数据。
 *
 * 弹窗以 Teleport 挂到 body 上：简洁模式根节点是 overflow:hidden 的定高容器，
 * 且内部大量视差图层带 transform，就地渲染会被裁剪/定位错乱；teleport 后自带的暗色主题也不受父级 CSS 变量影响。
 */

/** 弹窗内的魔之楔分组（角色 / 各武器槽位） */
interface ModGroup {
    /** 分组键（char / melee / ranged / skill），用于打开时定位 */
    key: string
    /** 分组标题（已翻译） */
    label: string
    /** 关联武器名（角色组为空串） */
    weaponName: string
    /** 关联武器图标（角色组为空串） */
    weaponIcon: string
    /** 武器等级/精炼等元信息（角色组为空串） */
    weaponMeta: string
    /** 普通槽位（空槽位保留为 null，用于体现装配数量） */
    mods: (LeveledMod | null)[]
    /** 中枢魔之楔（仅角色组有值） */
    aura: LeveledMod | null
}

/** 弹窗展示数据 */
interface DialogView {
    /** 服务器上的构筑标题 */
    title: string
    /** 队友名 */
    charName: string
    /** 队友头像 */
    charIcon: string
    /** 队友等级 */
    charLevel: number
    /** 队友元素（已翻译，如「火属性」） */
    element: string
    /** 构筑使用的技能名 */
    skillName: string
    /** 技能等级 */
    skillLevel: number
    /** 魔之楔分组 */
    groups: ModGroup[]
}

const props = withDefaults(
    defineProps<{
        /** 关联的服务器构筑 id（空串表示未关联，弹窗展示空态） */
        buildId: string
        /** 当前构筑中的协战角色名（拉取成功前用于标题占位） */
        charName: string
        /** 点击来源：角色 / 武器，打开后自动定位到对应区块 */
        focus?: "char" | "weapon"
    }>(),
    { focus: "char" }
)

/** 弹窗开关（父级 v-model） */
const open = defineModel<boolean>({ default: false })

const { t } = useTranslation()

const loading = ref(false)
const error = ref("")
const view = ref<DialogView | null>(null)
const bodyEl = ref<HTMLElement | null>(null)

/** 标题：优先用拉取到的构筑标题，未拉到时退回队友名 */
const heading = computed(() => view.value?.title || `${props.charName || ""}`)

/**
 * 实际要拉取的构筑 id。
 * 构筑关联在配置里用 "-" 占位表示未关联（与 teamN 一致），这里统一归一化为空串。
 */
const resolvedBuildId = computed(() => {
    const buildId = (props.buildId ?? "").trim()
    return buildId === "-" ? "" : buildId
})

/** 需要高亮的区块键：点击武器进入时定位到第一个武器区块，否则定位角色区块 */
const focusKey = computed(() => {
    if (!view.value) return "char"
    if (props.focus !== "weapon") return "char"
    return view.value.groups.find(group => group.key !== "char")?.key ?? "char"
})

/**
 * 读取普通槽位的魔之楔实例。
 * 静态表查不到（数据包未更新）的槽位退化为空槽，避免整块弹窗失败。
 * @param slots 配置中的槽位数组（[id, 等级] 或 null）
 * @returns 与配置等长的魔之楔数组
 */
function readMods(slots: ([number, number] | null)[] | undefined): (LeveledMod | null)[] {
    return (slots ?? []).map(slot => (slot ? LeveledModHelper.optionalFromId(slot[0], slot[1]) : null))
}

/**
 * 读取武器展示信息（图标 / 名称 / 等级与精炼元信息）。
 * @param weaponId 武器 id（0 表示未装备）
 * @param level 武器等级
 * @param refine 武器精炼等级
 * @returns 展示信息
 */
function readWeapon(weaponId: number, level: number, refine: number) {
    const weapon = weaponMap.get(weaponId)
    return {
        name: weapon?.名称 ?? "",
        icon: weapon ? LeveledWeapon.url(weapon.icon) : "",
        meta: `Lv.${level} · ${t("char-build.refine")} ${refine}`,
    }
}

/**
 * 把一份角色配置转换为弹窗展示数据。
 * 同律武器按继承规则归位：继承近战/远程时其魔之楔就是被继承槽位的槽位，
 * 因此不再单独成组（避免同一批魔之楔出现两次），仅独立同律武器才展示「同律」组。
 * @param charId 构筑所属角色 id
 * @param settings 已标准化的角色配置
 * @param title 服务器上的构筑标题
 * @returns 弹窗展示数据
 */
function createView(charId: number, settings: CharSettings, title: string): DialogView {
    const char = charMap.get(charId)
    // 中枢魔之楔在配置里只存 id（无等级字段），与构筑页一致按品质满级展示
    const auraQuality = LeveledModHelper.getQuality(settings.auraMod)
    const groups: ModGroup[] = [
        {
            key: "char",
            label: t("char-build.team_char_mods"),
            weaponName: "",
            weaponIcon: "",
            weaponMeta: "",
            mods: readMods(settings.charMods),
            aura: LeveledModHelper.optionalFromId(settings.auraMod, LeveledMod.getMaxLevel(auraQuality)),
        },
    ]

    const melee = readWeapon(settings.meleeWeapon, settings.meleeWeaponLevel, settings.meleeWeaponRefine)
    if (melee.name) {
        groups.push({
            key: "melee",
            label: t("char-build.team_weapon_mods", { slot: t("char-build.melee") }),
            weaponName: melee.name,
            weaponIcon: melee.icon,
            weaponMeta: melee.meta,
            mods: readMods(settings.meleeMods),
            aura: null,
        })
    }

    const ranged = readWeapon(settings.rangedWeapon, settings.rangedWeaponLevel, settings.rangedWeaponRefine)
    if (ranged.name) {
        groups.push({
            key: "ranged",
            label: t("char-build.team_weapon_mods", { slot: t("char-build.ranged") }),
            weaponName: ranged.name,
            weaponIcon: ranged.icon,
            weaponMeta: ranged.meta,
            mods: readMods(settings.rangedMods),
            aura: null,
        })
    }

    const skillWeapon = char?.同律武器?.[0]
    if (skillWeapon && !skillWeapon.inherit) {
        groups.push({
            key: "skill",
            label: t("char-build.team_weapon_mods", { slot: t("char-build.skill") }),
            weaponName: skillWeapon.名称,
            weaponIcon: skillWeapon.icon ? LeveledWeapon.url(skillWeapon.icon) : "",
            weaponMeta: "",
            mods: readMods(settings.skillWeaponMods),
            aura: null,
        })
    }

    return {
        title,
        charName: char?.名称 ?? "",
        charIcon: char ? LeveledChar.url(char.icon) : "",
        charLevel: settings.charLevel,
        element: char?.属性 ? t(`${char.属性}属性`) : "",
        skillName: settings.baseName,
        skillLevel: settings.charSkillLevel,
        groups,
    }
}

/**
 * 拉取并解析关联的协战构筑。
 * 未关联构筑时不发请求，直接清空展示数据。
 */
async function load() {
    const buildId = resolvedBuildId.value
    view.value = null
    error.value = ""
    if (!buildId) return

    loading.value = true
    try {
        const build = await buildQuery({ id: buildId }, { requestPolicy: "network-only" })
        if (!build?.charSettings) {
            throw new Error(t("char-build.team_build_empty"))
        }
        const settings = normalizeCharSettings(JSON.parse(build.charSettings) as Partial<CharSettings>)
        view.value = createView(build.charId, settings, build.title)
    } catch (err) {
        error.value = err instanceof Error ? err.message : String(err)
        console.error("加载协战构筑失败", err)
    } finally {
        loading.value = false
    }
}

/**
 * 打开后把弹窗内容滚动到本次点击对应的区块，让「点武器看武器魔之楔」直达目标。
 */
async function scrollToFocus() {
    await nextTick()
    const target = bodyEl.value?.querySelector<HTMLElement>(`[data-group="${focusKey.value}"]`)
    target?.scrollIntoView({ block: "nearest" })
}

/** 关闭弹窗 */
function close() {
    open.value = false
}

/**
 * 全局 Esc 关闭：弹窗挂在 body 上，不依赖父级的键盘事件。
 * @param event 键盘事件
 */
function onKeydown(event: KeyboardEvent) {
    if (event.key === "Escape" && open.value) {
        event.stopPropagation()
        close()
    }
}

watch(
    () => [open.value, resolvedBuildId.value] as const,
    ([isOpen]) => {
        if (isOpen) {
            void load().then(scrollToFocus)
        } else {
            view.value = null
            error.value = ""
        }
    },
    { immediate: true }
)

onMounted(() => window.addEventListener("keydown", onKeydown))
onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown))
</script>

<template>
    <Teleport to="body">
        <div v-if="open" class="tb-root" role="dialog" aria-modal="true" @click.self="close">
            <div class="tb-panel">
                <header class="tb-head">
                    <span class="tb-head-icon">
                        <img v-if="view?.charIcon" :src="view.charIcon" :alt="view.charName" />
                        <Icon v-else icon="ri:user-line" class="tb-placeholder-icon" />
                    </span>
                    <div class="tb-head-text">
                        <div class="tb-kicker">{{ $t("char-build.team_build_title") }}</div>
                        <h3 class="tb-title">{{ heading || $t("char-build.team_build_empty") }}</h3>
                        <div class="tb-head-meta">
                            <span v-if="view?.charName">{{ $t(view.charName) }}</span>
                            <span v-if="view?.charLevel">Lv.{{ view.charLevel }}</span>
                            <span v-if="view?.element">{{ view.element }}</span>
                            <span v-if="view?.skillName">{{ $t(view.skillName) }} Lv.{{ view.skillLevel }}</span>
                        </div>
                    </div>
                    <button type="button" class="tb-close" :title="$t('char-build.simple_close')" @click="close">
                        <Icon icon="ri:close-line" class="tb-close-icon" />
                    </button>
                </header>

                <div ref="bodyEl" class="tb-body">
                    <p v-if="loading" class="tb-note">{{ $t("char-build.team_build_loading") }}</p>
                    <p v-else-if="error" class="tb-note is-error">{{ $t("char-build.team_build_failed") }}：{{ error }}</p>
                    <p v-else-if="!resolvedBuildId" class="tb-note">{{ $t("char-build.team_build_unlinked") }}</p>

                    <template v-else-if="view">
                        <section
                            v-for="group in view.groups"
                            :key="group.key"
                            class="tb-group"
                            :data-group="group.key"
                            :class="{ 'is-focus': group.key === focusKey }"
                        >
                            <div class="tb-group-head">
                                <span class="tb-group-title">{{ group.label }}</span>
                                <span v-if="group.weaponName" class="tb-group-weapon">
                                    <span class="tb-group-weapon-icon">
                                        <img v-if="group.weaponIcon" :src="group.weaponIcon" :alt="$t(group.weaponName)" />
                                    </span>
                                    <span class="tb-group-weapon-name">{{ $t(group.weaponName) }}</span>
                                    <span v-if="group.weaponMeta" class="tb-group-weapon-meta">{{ group.weaponMeta }}</span>
                                </span>
                                <span class="tb-group-line" />
                            </div>

                            <div class="tb-modgrid">
                                <!-- 普通槽位：空槽保留占位，体现装配数量 -->
                                <template v-for="(mod, index) in group.mods" :key="index">
                                    <ShowProps
                                        v-if="mod"
                                        :link="`/db/mod/${mod.id}`"
                                        :props="mod.getProperties()"
                                        :title="`${$t(mod.系列)}${$t(mod.名称)}`"
                                        :rarity="mod.品质"
                                        :polarity="mod.极性"
                                        :cost="mod.耐受"
                                        :type="`${$t(mod.类型)}${mod.属性 ? `,${$t(mod.属性 + '属性')}` : ''}${mod.限定 ? `,${$t(mod.限定)}` : ''}`"
                                        :effdesc="mod.效果"
                                        :eff="mod.getCondition()"
                                    >
                                        <div class="tb-mod" :data-quality="mod.品质">
                                            <span class="tb-mod-icon">
                                                <img :src="mod.url" :alt="$t(mod.名称)" />
                                            </span>
                                            <span class="tb-mod-text">
                                                <span class="tb-mod-name">{{ $t(mod.名称) }}</span>
                                                <span class="tb-mod-sub">{{ $t(mod.系列) }}</span>
                                            </span>
                                            <span class="tb-mod-lv">+{{ mod.等级 }}</span>
                                        </div>
                                    </ShowProps>
                                    <div v-else class="tb-mod is-empty">
                                        <span class="tb-mod-icon">
                                            <span class="tb-mod-index">{{ index + 1 }}</span>
                                        </span>
                                        <span class="tb-mod-text">
                                            <span class="tb-mod-sub">{{ $t("char-build.simple_empty_slot") }}</span>
                                        </span>
                                    </div>
                                </template>

                                <!-- 中枢魔之楔：角色组的独立槽位 -->
                                <ShowProps
                                    v-if="group.key === 'char' && group.aura"
                                    :link="`/db/mod/${group.aura.id}`"
                                    :props="group.aura.getProperties()"
                                    :title="`${$t(group.aura.系列)}${$t(group.aura.名称)}`"
                                    :rarity="group.aura.品质"
                                    :polarity="group.aura.极性"
                                    :cost="group.aura.耐受"
                                    :effdesc="group.aura.效果"
                                    :eff="group.aura.getCondition()"
                                >
                                    <div class="tb-mod" :data-quality="group.aura.品质">
                                        <span class="tb-mod-icon">
                                            <img :src="group.aura.url" :alt="$t(group.aura.名称)" />
                                        </span>
                                        <span class="tb-mod-text">
                                            <span class="tb-mod-name">{{ $t(group.aura.名称) }}</span>
                                            <span class="tb-mod-sub">{{ $t(group.aura.系列) }}</span>
                                        </span>
                                        <span class="tb-mod-tag">{{ $t("char-build.simple_aura") }}</span>
                                    </div>
                                </ShowProps>
                            </div>
                        </section>
                    </template>
                </div>
            </div>
        </div>
    </Teleport>
</template>

<style scoped>
/* 弹窗整体走简洁模式的暗色 HUD 语言：不依赖 daisyUI 主题，避免亮色主题下与 HUD 撞色 */
.tb-root {
    --tb-accent: #68b6ff;
    --tb-line: rgba(255, 255, 255, 0.12);
    --tb-line-strong: rgba(255, 255, 255, 0.24);
    --tb-text: rgba(236, 243, 255, 0.94);
    --tb-text-dim: rgba(190, 206, 232, 0.62);

    position: fixed;
    inset: 0;
    z-index: 120;
    display: grid;
    place-items: center;
    padding: 16px;
    background: rgba(3, 6, 12, 0.72);
    color: var(--tb-text);
    backdrop-filter: blur(3px);
}

.tb-panel {
    display: flex;
    width: min(760px, 100%);
    max-height: min(84vh, 720px);
    flex-direction: column;
    overflow: hidden;
    border: 1px solid var(--tb-line-strong);
    background:
        radial-gradient(120% 90% at 12% 0%, color-mix(in srgb, var(--tb-accent) 14%, transparent), transparent 58%),
        linear-gradient(180deg, #0b1322, #05080f 72%);
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.62);
}

.tb-head {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: none;
    padding: 12px 14px;
    border-bottom: 1px solid var(--tb-line);
}

.tb-head-icon {
    display: grid;
    place-items: center;
    width: 42px;
    height: 42px;
    flex: none;
    overflow: hidden;
    border: 1px solid var(--tb-line-strong);
    background: rgba(0, 0, 0, 0.4);
}

.tb-head-icon img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: top;
}

.tb-placeholder-icon {
    width: 18px;
    height: 18px;
    color: var(--tb-text-dim);
}

.tb-head-text {
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
    gap: 2px;
}

.tb-kicker {
    font-size: 9px;
    letter-spacing: 0.24em;
    text-transform: uppercase;
    color: color-mix(in srgb, var(--tb-accent) 70%, white);
}

.tb-title {
    overflow: hidden;
    font-size: 15px;
    font-weight: 700;
    white-space: nowrap;
    text-overflow: ellipsis;
}

.tb-head-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    font-size: 11px;
    color: var(--tb-text-dim);
}

.tb-close {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    flex: none;
    border: 1px solid var(--tb-line);
    color: var(--tb-text-dim);
    cursor: pointer;
    transition:
        color 0.15s ease,
        border-color 0.15s ease;
}

.tb-close:hover {
    border-color: var(--tb-line-strong);
    color: var(--tb-text);
}

.tb-close-icon {
    width: 15px;
    height: 15px;
}

.tb-body {
    display: flex;
    min-height: 0;
    flex: 1;
    flex-direction: column;
    gap: 14px;
    overflow-y: auto;
    padding: 14px;
}

.tb-note {
    padding: 18px 4px;
    font-size: 12px;
    color: var(--tb-text-dim);
}

.tb-note.is-error {
    color: #ff8f8f;
}

.tb-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.tb-group-head {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 10px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: color-mix(in srgb, var(--tb-accent) 72%, white);
}

.tb-group.is-focus .tb-group-title {
    color: #fff;
}

.tb-group-weapon {
    display: flex;
    align-items: center;
    gap: 5px;
    letter-spacing: 0;
    text-transform: none;
    color: var(--tb-text-dim);
}

.tb-group-weapon-icon {
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    overflow: hidden;
    border: 1px solid var(--tb-line);
    background: rgba(0, 0, 0, 0.4);
}

.tb-group-weapon-icon img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.tb-group-weapon-name {
    font-size: 11px;
    font-weight: 600;
    color: var(--tb-text);
}

.tb-group-weapon-meta {
    font-size: 10px;
}

.tb-group-line {
    height: 1px;
    flex: 1;
    background: linear-gradient(90deg, color-mix(in srgb, var(--tb-accent) 45%, transparent), transparent);
}

.tb-modgrid {
    display: grid;
    gap: 6px;
    grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
}

/* 魔之楔卡片：与简洁模式魔之楔面板同一套视觉（品质色 + 切角） */
.tb-mod {
    --tb-quality: rgba(255, 255, 255, 0.18);

    display: flex;
    align-items: center;
    gap: 7px;
    padding: 5px 7px;
    border: 1px solid var(--tb-line);
    border-left: 2px solid var(--tb-quality);
    background: linear-gradient(120deg, color-mix(in srgb, var(--tb-quality) 16%, transparent), rgba(0, 0, 0, 0.34));
    clip-path: polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px);
}

.tb-mod.is-empty {
    border-left-color: var(--tb-line);
    background: rgba(255, 255, 255, 0.02);
    opacity: 0.55;
}

.tb-mod[data-quality="金"] {
    --tb-quality: #f2c14e;
}

.tb-mod[data-quality="紫"] {
    --tb-quality: #b06bff;
}

.tb-mod[data-quality="蓝"] {
    --tb-quality: #4a9bff;
}

.tb-mod[data-quality="绿"] {
    --tb-quality: #4bd07a;
}

.tb-mod[data-quality="白"] {
    --tb-quality: #c3ccd9;
}

.tb-mod-icon {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    flex: none;
    overflow: hidden;
    border: 1px solid var(--tb-line);
    background: rgba(0, 0, 0, 0.42);
}

.tb-mod-icon img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.tb-mod-index {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.24);
}

.tb-mod-text {
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
}

.tb-mod-name {
    overflow: hidden;
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
    text-overflow: ellipsis;
}

.tb-mod-sub {
    overflow: hidden;
    font-size: 9px;
    color: var(--tb-text-dim);
    white-space: nowrap;
    text-overflow: ellipsis;
}

.tb-mod-lv {
    flex: none;
    font-size: 11px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--tb-text-dim);
}

.tb-mod-tag {
    flex: none;
    margin-left: auto;
    padding: 2px 6px;
    border: 1px solid color-mix(in srgb, var(--tb-accent) 45%, transparent);
    font-size: 9px;
    letter-spacing: 0.2em;
    color: color-mix(in srgb, var(--tb-accent) 72%, white);
}
</style>
