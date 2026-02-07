<script setup lang="ts">
import { computed, ref } from "vue"
import { LeveledChar, LeveledSkill, LeveledSkillWeapon } from "../data"
import type { Char } from "../data/data-types"
import { formatProp, formatSkillProp } from "../util"

const props = defineProps<{
    char: Char
}>()

// 当前角色等级
const currentLevel = ref(80) // 默认80级
// 当前技能等级
const currentSkillLevel = ref(12)

// 当前选中的技能标签
const selectedSkillTab = ref<string>("")

// 展开的技能详情
const selectedSkill = ref<LeveledSkill | null>(null)

// 创建LeveledChar实例
const leveledChar = computed(() => {
    return new LeveledChar(props.char.名称, currentLevel.value)
})

// 监听技能等级变化，更新选中的技能
function updateSelectedSkill() {
    if (!selectedSkillTab.value) {
        selectedSkillTab.value = leveledChar.value.技能[0].名称
    }
    const skill = leveledChar.value.技能.find(s => s.名称 === selectedSkillTab.value)
    if (skill) {
        selectedSkill.value = skill.clone(currentSkillLevel.value)
    }
}

// 切换技能标签
function switchSkillTab(skillName: string) {
    selectedSkillTab.value = skillName
    updateSelectedSkill()
}

// 初始化选中的技能
updateSelectedSkill()

// 计算基础属性
const baseAttributes = computed(() => {
    return [
        { name: "攻击", value: leveledChar.value.基础攻击 },
        { name: "生命", value: leveledChar.value.基础生命 },
        { name: "防御", value: leveledChar.value.基础防御 },
        { name: "护盾", value: leveledChar.value.基础护盾 },
        { name: "最大神智", value: leveledChar.value.基础神智 },
    ]
})

// 计算加成属性
const bonusAttributes = computed(() => {
    if (!props.char.加成) return []
    return Object.entries(props.char.加成).map(([key, value]) => {
        return { name: key, value: value }
    })
})

const leveledWeapons = computed(() => {
    return props.char.同律武器
        ? props.char.同律武器.map(weapon => new LeveledSkillWeapon(weapon, currentSkillLevel.value, currentLevel.value))
        : null
})
</script>

<template>
    <div class="p-3 space-y-4">
        <div class="flex items-center gap-3 p-3">
            <SRouterLink :to="`/db/char/${char.id}`" class="text-lg font-bold link link-primary">
                {{ $t(char.名称) }}
            </SRouterLink>
            <span class="text-xs text-base-content/70">ID: {{ char.id }}</span>
            <div class="text-sm text-base-content/70 flex items-center gap-2">
                <div class="px-1.5 py-0.5 rounded bg-base-200 text-base-content">
                    {{ $t(`${char.属性}属性`) }}
                </div>
                <div v-if="char.阵营" class="ml-auto text-xs text-base-content/70">
                    {{ char.阵营 }}
                </div>
            </div>
        </div>

        <div class="flex justify-center items-center">
            <img :src="leveledChar.url" class="w-28 object-cover rounded" />
        </div>

        <div class="flex flex-wrap gap-2 text-sm opacity-70 p-3">
            <span>{{ char.精通.map(m => $t(m)).join("、") }}</span>
            <span v-if="char.别名">{{ $t(char.别名) }}</span>
            <span v-if="char.版本">v{{ char.版本 }}</span>
        </div>

        <!-- 等级调整 -->
        <div class="mb-3 p-3">
            <div class="flex items-center gap-4">
                <span class="text-sm min-w-12">Lv. <input v-model.number="currentLevel" type="text" class="w-12 text-center" /> </span>
                <input v-model.number="currentLevel" type="range" class="range range-primary range-xs grow" :min="1" :max="80" step="1" />
            </div>
        </div>

        <!-- 基础属性 -->
        <div class="p-3 bg-base-200 rounded">
            <div class="text-xs text-base-content/70 mb-2">{{ $t("char-build.base_attr") }}</div>
            <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
                <div
                    v-for="attr in baseAttributes"
                    :key="attr.name"
                    class="flex justify-between items-center p-2 bg-base-300 rounded text-sm"
                >
                    <span class="text-base-content/70">{{ $t(attr.name) }}</span>
                    <span class="font-medium text-primary">{{ attr.value }}</span>
                </div>
            </div>
        </div>

        <!-- 加成属性 -->
        <div v-if="bonusAttributes.length > 0" class="p-3 bg-base-200 rounded">
            <div class="text-xs text-base-content/70 mb-2">{{ $t("char-build.bonus_attr") }}</div>
            <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
                <div
                    v-for="attr in bonusAttributes"
                    :key="attr.name"
                    class="flex justify-between items-center p-2 bg-base-300 rounded text-sm"
                >
                    <span class="text-base-content/70">{{ $t(attr.name) }}</span>
                    <span class="font-medium text-primary">{{ formatProp(attr.name, attr.value) }}</span>
                </div>
            </div>
        </div>

        <!-- 技能等级调整 -->
        <div class="p-3 bg-base-200 rounded">
            <div class="text-xs text-base-content/70 mb-2">{{ $t("char-build.skill_level") }}</div>
            <div class="flex items-center gap-4">
                <span class="text-sm min-w-12">Lv. {{ currentSkillLevel }}</span>
                <input
                    v-model.number="currentSkillLevel"
                    type="range"
                    class="range range-primary range-xs grow"
                    :min="1"
                    :max="12"
                    step="1"
                    @change="updateSelectedSkill"
                />
            </div>
        </div>

        <!-- 技能标签页 -->
        <div class="flex gap-2 p-2 overflow-x-auto">
            <button
                v-for="skill in leveledChar.技能"
                :key="skill.名称"
                class="btn btn-sm rounded-full whitespace-nowrap transition-all duration-200"
                :class="selectedSkillTab === skill.名称 ? 'btn-primary shadow-lg scale-105' : 'btn-ghost hover:bg-base-200'"
                @click="switchSkillTab(skill.名称)"
            >
                {{ $t(skill.名称) }}
            </button>
        </div>

        <!-- 技能详情 -->
        <div v-if="selectedSkill" class="text-sm space-y-4">
            <div class="p-2 text-sm font-medium flex items-center gap-2">
                <div
                    alt="技能图标"
                    class="size-8 rounded-full bg-base-content"
                    :style="{ mask: `url(${selectedSkill.url}) no-repeat center/contain` }"
                />
                <div class="flex items-center gap-2">
                    {{ $t(selectedSkill.类型) }}
                    <span v-if="selectedSkill.skillData.cd" class="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full">
                        CD: {{ selectedSkill.skillData.cd }}s
                    </span>
                </div>
            </div>
            <div class="p-2 text-sm">
                {{ $t(selectedSkill.描述 || "") }}
            </div>
            <div v-for="(value, key) in selectedSkill.术语解释" :key="key" class="p-2">
                <div class="text-xs font-medium underline">
                    {{ $t(key.toString()) }}
                </div>
                <div class="text-xs">
                    {{ $t(value) }}
                </div>
            </div>
            <div
                v-for="(val, index) in selectedSkill.getFieldsWithAttr()"
                :key="index"
                class="flex flex-col group hover:bg-base-200/50 rounded-md p-2"
            >
                <div class="flex justify-between items-center gap-4">
                    <div>{{ $t(val.名称) }}</div>
                    <div class="font-medium text-primary">
                        {{ formatSkillProp(val.名称, val) }}
                    </div>
                </div>
                <div
                    v-if="val.影响"
                    class="opacity-0 group-hover:opacity-80 justify-between items-center gap-4 flex max-h-0 overflow-hidden group-hover:max-h-32 transition-all duration-300"
                >
                    <div>{{ $t("属性影响") }}</div>
                    <div class="ml-auto font-medium">
                        {{
                            val.影响
                                .split(",")
                                .map((item: string) => $t(item))
                                .join(",")
                        }}
                    </div>
                </div>
            </div>

            <!-- 子技能区域 -->
            <div v-if="selectedSkill.skillData.子技能 && selectedSkill.skillData.子技能.length > 0" class="mt-4 p-2">
                <h3 class="text-base font-semibold mb-2">{{ $t("子技能") }}</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div v-for="(subSkill, subIndex) in selectedSkill.skillData.子技能" :key="subIndex" class="p-3">
                        <div class="flex items-center gap-2">
                            <div
                                alt="子技能图标"
                                class="size-6 rounded-full bg-base-content"
                                :style="{ mask: `url(/imgs/webp/T_Skill_${subSkill.icon}.webp) no-repeat center/contain` }"
                            />
                            <div class="font-medium text-sm">{{ $t(subSkill.类型) }}</div>
                            <span v-if="subSkill.cd" class="text-xs bg-primary/30 text-primary px-2 py-0.5 rounded-full">
                                CD: {{ subSkill.cd }}s
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 底层数据 -->
            <div class="collapse p-2">
                <input type="checkbox" />
                <div class="collapse-title font-semibold p-0">{{ $t("底层数据") }}({{ $t("点击展开") }})</div>
                <div class="collapse-content p-0">
                    <SkillDetails :skill="selectedSkill.skillData" :lv="currentSkillLevel" />
                </div>
            </div>
        </div>

        <!-- 溯源信息 -->
        <div v-if="char.溯源 && char.溯源.length > 0" class="p-3 bg-base-200 rounded">
            <div class="text-xs text-base-content/70 mb-2">{{ $t("溯源") }}</div>
            <div class="space-y-2">
                <div v-for="(trace, index) in char.溯源" :key="index" class="p-2 bg-base-300 rounded text-sm">
                    <div class="font-medium mb-1">{{ $t("第" + ["一", "二", "三", "四", "五", "六"][index] + "根源") }}</div>
                    <div class="text-base-content/90">{{ $t(trace) }}</div>
                </div>
            </div>
        </div>

        <!-- 同律武器 -->
        <div v-if="char.同律武器 && char.同律武器.length > 0" class="p-3 bg-base-200 rounded">
            <div class="text-xs text-base-content/70 mb-2">{{ $t("同律武器") }}</div>
            <div class="space-y-3">
                <div v-for="leveledWeapon in leveledWeapons" :key="leveledWeapon.id" class="p-2 bg-base-300 rounded">
                    <div class="font-medium mb-1">{{ $t(leveledWeapon.名称) }}</div>
                    <div class="text-xs text-base-content/70 mb-2">
                        {{ leveledWeapon._originalWeaponData.类型.map(type => $t(type === "同律" ? "同律武器" : type)).join("、") }}
                    </div>

                    <div class="text-xs text-base-content/70 mb-2">{{ $t("char-build.base_attr") }}</div>
                    <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
                        <div class="flex justify-between items-center p-2 bg-base-300 rounded text-sm">
                            <span class="text-base-content/70">{{ $t("攻击") }}</span>
                            <span class="font-medium text-primary">{{ leveledWeapon.基础攻击 }}</span>
                        </div>
                        <div class="flex justify-between items-center p-2 bg-base-300 rounded text-sm">
                            <span class="text-base-content/70">{{ $t("暴击") }}</span>
                            <span class="font-medium text-primary">{{
                                formatProp("基础暴击", leveledWeapon._originalWeaponData.暴击)
                            }}</span>
                        </div>
                        <div class="flex justify-between items-center p-2 bg-base-300 rounded text-sm">
                            <span class="text-base-content/70">{{ $t("暴伤") }}</span>
                            <span class="font-medium text-primary">{{
                                formatProp("基础暴伤", leveledWeapon._originalWeaponData.暴伤)
                            }}</span>
                        </div>
                        <div class="flex justify-between items-center p-2 bg-base-300 rounded text-sm">
                            <span class="text-base-content/70">{{ $t("触发") }}</span>
                            <span class="font-medium text-primary">{{
                                formatProp("基础触发", leveledWeapon._originalWeaponData.触发)
                            }}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
