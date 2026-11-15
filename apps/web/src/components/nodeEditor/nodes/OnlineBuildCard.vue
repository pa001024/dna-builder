<script setup lang="ts">
import { useTranslation } from "i18next-vue"
import { computed, ref, watch } from "vue"
import {
    type CharSettings,
    normalizeCharSettings,
    normalizeCharSkillLevels,
} from "@/composables/useCharSettings"
import { charMap, LeveledChar, LeveledPet, LeveledSkill, LeveledWeapon, petMap, weaponMap } from "@/data"
import { getElementAccentColor } from "@/utils/element-utils"
import { formatDateTime } from "@/utils/time"

/**
 * 在线构筑的「沉浸模式」配装卡。
 *
 * 版面参考游戏内的配装分享卡：左栏为主角色立绘与技能，右栏为近战 / 远程武器与
 * 两名协战同伴的角色、武器，底行是魔灵与构筑信息。全部内容只读取节点里缓存的
 * 在线构筑 JSON（charSettings）与列表字段，不修改任何构筑数据。
 */
const props = defineProps<{
    /** 在线构筑节点数据（buildId / title / desc / author / charSettings 等） */
    data: any
}>()

const { t } = useTranslation()

/** 解析构建在线构筑的 charSettings：优先节点缓存的原始 JSON，回退已计算的构筑上下文 */
const settings = computed<CharSettings | null>(() => {
    const raw = props.data.charSettings
    if (typeof raw === "string" && raw.trim()) {
        try {
            return normalizeCharSettings(JSON.parse(raw))
        } catch {
            // JSON 损坏时继续尝试已计算的构筑上下文
        }
    }
    const buildSettings = props.data.build?.settings
    return buildSettings ? (buildSettings as CharSettings) : null
})

/** 构筑的角色 id */
const charId = computed(() => {
    const id = Number(props.data.charId)
    if (Number.isFinite(id) && id > 0) return id
    const buildId = Number(props.data.build?.charId)
    return Number.isFinite(buildId) && buildId > 0 ? buildId : 0
})

/** 主角色静态数据 */
const charInfo = computed(() => charMap.get(charId.value) ?? null)

/** 主角色半身立绘；加载失败时退回头像 */
const bustFailed = ref(false)
const charBust = computed(() => (charInfo.value ? LeveledChar.bustUrl(charInfo.value.icon) : ""))
const charAvatar = computed(() => (charInfo.value ? LeveledChar.url(charInfo.value.icon) : ""))
watch(charBust, () => {
    bustFailed.value = false
})

/** 主角色元素强调色 */
const elementAccent = computed(() => (charInfo.value ? getElementAccentColor(charInfo.value.属性) : undefined))

/** 角色三个技能（E / Q / 被动）：各带名称、图标与等级 */
const charSkills = computed(() => {
    const char = charInfo.value
    if (!char?.技能?.length) return []
    const levels = normalizeCharSkillLevels(settings.value?.charSkillLevel)
    const labels = ["E", "Q", "被动"]
    return char.技能.slice(0, 3).map((skill, index) => ({
        key: `${index}-${skill.名称 ?? ""}`,
        name: skill.名称 ?? "",
        icon: skill.icon ? LeveledSkill.url(skill.icon) : "",
        label: labels[index] ?? "被动",
        level: levels[index] ?? levels[2],
    }))
})

/** 卡片槽位展示数据 */
interface CardItem {
    /** 槽位标识（模板 v-for key） */
    key: string
    /** 条目类型（决定图片裁切方式与图标兜底） */
    kind: "char" | "weapon" | "pet"
    /** 主标题（角色 / 武器 / 魔灵名） */
    label: string
    /** 副标题（类别、元素、定位等） */
    meta: string
    /** 图片地址 */
    image: string
    /** 元素色点（仅角色卡） */
    accent?: string
    /** 元素名（色点紧贴属性文本，与主角色卡片的属性行位置一致） */
    element?: string
    /** 右上角等级徽记 */
    badge?: string
}

/**
 * 读取一把武器的展示数据。
 * @param key 槽位标识
 * @param id 武器 id（"-" 或非法值视为未装备）
 * @param role 槽位名（近战 / 远程 / 同伴武器）
 * @param level 武器等级
 * @returns 展示数据；未装备时返回 null
 */
function readWeapon(key: string, id: unknown, role: string, level: unknown): CardItem | null {
    if (typeof id !== "number" || id <= 0) return null
    const weapon = weaponMap.get(id)
    if (!weapon) return null
    return {
        key,
        kind: "weapon",
        label: weapon.名称,
        meta: [role, t(weapon.类型?.[1] ?? weapon.类型?.[0] ?? "")].filter(Boolean).join(" · "),
        image: LeveledWeapon.url(weapon.icon),
        badge: typeof level === "number" && level > 0 ? `Lv.${level}` : undefined,
    }
}

/**
 * 读取一名协战同伴的展示数据。
 * @param slot 槽位序号（1/2）
 * @returns 展示数据；未配置时返回 null
 */
function readTeammate(slot: 1 | 2): CardItem | null {
    const config = settings.value
    if (!config) return null
    const id = slot === 1 ? config.team1 : config.team2
    const char = typeof id === "number" ? charMap.get(id) : undefined
    if (!char) return null
    return {
        key: `team${slot}`,
        kind: "char",
        label: char.名称,
        meta: "协战同伴",
        image: LeveledChar.url(char.icon),
        accent: getElementAccentColor(char.属性),
        element: t(`${char.属性}属性`),
        badge: `Lv.${config.charLevel}`,
    }
}

/** 魔灵展示数据 */
const petItem = computed<CardItem | null>(() => {
    const config = settings.value
    if (!config?.petId) return null
    const pet = petMap.get(config.petId)
    if (!pet) return null
    return {
        key: "pet",
        kind: "pet",
        label: pet.名称,
        meta: ["魔灵", `突破 ${config.petLevel}`].join(" · "),
        image: LeveledPet.url(pet.icon),
    }
})

/** 右栏六个固定槽位：主角色近战 / 协战 1 / 同伴武器 1，主角色远程 / 协战 2 / 同伴武器 2 */
const gridSlots = computed<(CardItem | null)[]>(() => {
    const config = settings.value
    if (!config) return []
    return [
        readWeapon("melee", config.meleeWeapon, t("char-build.melee"), config.meleeWeaponLevel),
        readTeammate(1),
        readWeapon("team1Weapon", config.team1Weapon, "同伴武器", config.charLevel),
        readWeapon("ranged", config.rangedWeapon, t("char-build.ranged"), config.rangedWeaponLevel),
        readTeammate(2),
        readWeapon("team2Weapon", config.team2Weapon, "同伴武器", config.charLevel),
    ]
})

/** 构筑标题 */
const buildTitle = computed(() => {
    const title = props.data.title
    if (typeof title === "string" && title.trim()) return title
    return typeof props.data.buildId === "string" && props.data.buildId ? props.data.buildId : "未命名构筑"
})

/** 构筑作者 */
const buildAuthor = computed(() => (typeof props.data.author === "string" ? props.data.author : ""))

/** 构筑描述 */
const buildDesc = computed(() => (typeof props.data.desc === "string" ? props.data.desc.trim() : ""))

/** 构筑最后更新时间 */
const updatedAtText = computed(() => {
    const updateAt = Number(props.data.updateAt)
    return Number.isFinite(updateAt) && updateAt > 0 ? formatDateTime(updateAt) : ""
})
</script>

<template>
    <div class="w-170 max-w-full select-none">
        <!-- 构筑数据解析失败 / 未选择构筑：保持与卡片一致的外框，给出可读的空态 -->
        <div
            v-if="!settings || !charInfo"
            class="flex min-h-72 flex-col items-center justify-center gap-2 rounded-xs border border-dashed border-base-content/20 bg-base-100/50 px-6 py-10 text-center backdrop-blur-sm"
        >
            <Icon icon="ri:cloud-line" class="size-8 text-base-content/25" />
            <div class="text-[13px] font-semibold text-base-content/60">
                {{ settings ? "构筑角色数据缺失" : "尚未选择在线构筑" }}
            </div>
            <div class="text-[11px] text-base-content/40">退出沉浸模式后选择一份在线构筑</div>
        </div>

        <div v-else class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 shadow-lg backdrop-blur-sm">
            <div class="grid grid-cols-[150px_repeat(3,minmax(0,1fr))] gap-2.5">
                <!-- 栏目标题：角色 / 协战同伴 -->
                <div class="flex items-baseline gap-2 border-b border-base-content/10 pb-1.5">
                    <span class="font-orbitron text-[10px] font-bold text-primary">01</span>
                    <span class="text-[12px] font-semibold tracking-[0.18em] text-base-content">角色</span>
                    <span class="h-px flex-1 bg-base-content/10" aria-hidden="true" />
                </div>
                <div class="col-span-3 flex items-baseline gap-2 border-b border-base-content/10 pb-1.5">
                    <span class="font-orbitron text-[10px] font-bold text-primary">02</span>
                    <span class="text-[12px] font-semibold tracking-[0.18em] text-base-content">协战同伴</span>
                    <span class="h-px flex-1 bg-base-content/10" aria-hidden="true" />
                </div>

                <!-- 主角色立绘：跨两行，与右侧 1:1 卡片对齐 -->
                <div class="relative row-span-2 min-h-0 overflow-hidden rounded-xs border border-base-content/10 bg-base-content/3">
                        <img
                            v-if="charBust && !bustFailed"
                            :src="charBust"
                            :alt="t(charInfo.名称)"
                            class="absolute inset-0 size-full object-cover object-top"
                            @error="bustFailed = true"
                        />
                        <img
                            v-else-if="charAvatar"
                            :src="charAvatar"
                            :alt="t(charInfo.名称)"
                            class="absolute inset-0 size-full object-cover object-top"
                        />
                        <div
                            class="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-linear-to-t from-base-100/95 via-base-100/45 to-transparent"
                        />
                        <div class="absolute inset-x-0 bottom-0 p-2.5">
                            <div class="text-[9px] tracking-[0.28em] text-base-content/50 uppercase">Character</div>
                            <div class="truncate text-[18px] leading-tight font-bold text-base-content">
                                {{ t(charInfo.名称) }}
                            </div>
                            <div class="mt-1 flex items-center gap-2 text-[10px] text-base-content/65">
                                <span
                                    v-if="elementAccent"
                                    class="size-1.5 shrink-0"
                                    :style="{ backgroundColor: elementAccent }"
                                />
                                <span class="truncate">{{ t(`${charInfo.属性}属性`) }}</span>
                                <span class="ml-auto shrink-0 font-orbitron tracking-wide">LV.{{ settings.charLevel }}</span>
                            </div>
                        </div>
                </div>

                <!-- 卡片区：六张 1:1 卡片，与立绘跨行、构筑信息跨列共用同一网格 -->
                    <template v-for="(item, index) in gridSlots" :key="item?.key ?? `empty-${index}`">
                        <div
                            v-if="item"
                            class="relative aspect-square self-start overflow-hidden rounded-xs border border-base-content/10 bg-base-content/3"
                        >
                            <img
                                :src="item.image"
                                :alt="t(item.label)"
                                class="size-full"
                                :class="item.kind === 'weapon' ? 'object-contain p-2.5' : 'object-cover object-top'"
                            />
                            <div
                                class="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-linear-to-t from-base-100/95 via-base-100/45 to-transparent"
                            />
                            <span
                                v-if="item.badge"
                                class="absolute top-1 right-1 border border-base-content/15 bg-base-100/80 px-1 py-0.5 font-orbitron text-[9px] text-base-content/70 backdrop-blur-sm"
                            >
                                {{ item.badge }}
                            </span>
                            <div class="absolute inset-x-0 bottom-0 px-2 pb-1.5">
                                <div class="truncate text-[13px] leading-tight font-semibold text-base-content">
                                    {{ t(item.label) }}
                                </div>
                                <div class="flex items-center gap-1 text-[9px] text-base-content/55">
                                    <span class="truncate">{{ item.meta }}</span>
                                    <template v-if="item.element">
                                        <span class="shrink-0 text-base-content/30">·</span>
                                        <span
                                            v-if="item.accent"
                                            class="size-1.5 shrink-0"
                                            :style="{ backgroundColor: item.accent }"
                                        />
                                        <span class="truncate">{{ item.element }}</span>
                                    </template>
                                </div>
                            </div>
                        </div>
                        <div
                            v-else
                            class="grid aspect-square self-start place-items-center rounded-xs border border-dashed border-base-content/15 bg-base-content/2 text-center"
                        >
                            <div>
                                <Icon icon="ri:add-line" class="mx-auto size-4 text-base-content/25" />
                                <div class="mt-1 text-[10px] text-base-content/35">{{ index === 2 || index === 5 ? "未配置同伴武器" : "未配置" }}</div>
                            </div>
                        </div>
                    </template>

                    <!-- 技能卡：角色三个技能（E / Q / 被动），各自展示图标、名称与等级 -->
                    <div class="flex min-h-0 flex-col rounded-xs border border-base-content/10 bg-base-content/3 p-2.5">
                        <div class="text-[9px] tracking-[0.2em] text-base-content/45">技能</div>
                        <div class="mt-1.5 flex flex-col gap-1">
                            <div v-for="skill in charSkills" :key="skill.key" class="flex items-center gap-1.5">
                                <span
                                    class="grid size-6 shrink-0 place-items-center overflow-hidden rounded-xs border border-base-content/10 bg-base-content/5"
                                >
                                    <img v-if="skill.icon" :src="skill.icon" :alt="t(skill.name)" class="size-full object-cover" />
                                    <Icon v-else icon="ri:magic-line" class="size-3 text-base-content/30" />
                                </span>
                                <span class="min-w-0 flex-1">
                                    <span class="block truncate text-[11px] leading-tight font-semibold text-base-content">
                                        {{ t(skill.name) }}
                                    </span>
                                    <span class="block text-[9px] text-base-content/45">
                                        {{ skill.label }} ·
                                        <b class="font-orbitron text-[10px] font-semibold text-base-content/70">Lv.{{ skill.level }}</b>
                                    </span>
                                </span>
                            </div>
                            <div v-if="charSkills.length === 0" class="text-[10px] text-base-content/40">暂无技能数据</div>
                        </div>
                    </div>

                    <!-- 魔灵 -->
                    <div v-if="petItem" class="relative aspect-square self-start overflow-hidden rounded-xs border border-base-content/10 bg-base-content/3">
                        <img
                            :src="petItem.image"
                            :alt="t(petItem.label)"
                            class="size-full object-cover object-top"
                        />
                        <div
                            class="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-linear-to-t from-base-100/95 via-base-100/45 to-transparent"
                        />
                        <div class="absolute inset-x-0 bottom-0 px-2 pb-1.5">
                            <div class="truncate text-[13px] leading-tight font-semibold text-base-content">
                                {{ t(petItem.label) }}
                            </div>
                            <div class="truncate text-[9px] text-base-content/55">{{ petItem.meta }}</div>
                        </div>
                    </div>
                    <div
                        v-else
                        class="grid aspect-square self-start place-items-center rounded-xs border border-dashed border-base-content/15 bg-base-content/2 text-center"
                    >
                        <div>
                            <Icon icon="ri:ghost-2-line" class="mx-auto size-4 text-base-content/25" />
                            <div class="mt-1 text-[10px] text-base-content/35">未配置魔灵</div>
                        </div>
                    </div>

                    <!-- 右下角：构筑信息（占据两列，对应游戏卡里的背包方案位） -->
                    <div
                        class="col-span-2 flex min-h-0 flex-col gap-1.5 rounded-xs border border-base-content/10 bg-base-content/3 p-2.5"
                    >
                        <div class="flex items-center gap-1.5 border-b border-base-content/10 pb-1.5">
                            <Icon icon="ri:cloud-line" class="size-3.5 shrink-0 text-primary" />
                            <span class="truncate text-[12px] font-semibold tracking-[0.14em] text-base-content">构筑信息</span>
                        </div>
                        <div class="min-h-0 flex-1">
                            <div class="truncate text-[14px] leading-tight font-semibold text-base-content" :title="buildTitle">
                                {{ buildTitle }}
                            </div>
                            <div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-base-content/50">
                                <span v-if="buildAuthor" class="truncate">{{ buildAuthor }}</span>
                                <span v-if="updatedAtText" class="shrink-0">更新于 {{ updatedAtText }}</span>
                            </div>
                            <div
                                v-if="buildDesc"
                                class="mt-1 line-clamp-3 text-[11px] leading-4 whitespace-pre-wrap text-base-content/60"
                            >
                                {{ buildDesc }}
                            </div>
                        </div>
                    </div>
            </div>
        </div>
    </div>
</template>
