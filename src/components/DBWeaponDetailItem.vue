<script lang="ts" setup>
import { computed, ref, watch } from "vue"
import type { Weapon } from "../data/data-types"
import { LeveledWeapon } from "../data/leveled/LeveledWeapon"
import { formatProp, formatSkillProp } from "../util"

const props = defineProps<{
    weapon: Weapon
}>()

const currentLevel = ref(80)
const currentRefine = ref(5)

const leveledWeapon = computed(() => {
    return new LeveledWeapon(props.weapon, currentRefine.value, currentLevel.value)
})

watch(
    () => props.weapon,
    () => {
        currentLevel.value = 80
        currentRefine.value = 5
    }
)
</script>

<template>
    <ScrollArea class="h-full">
        <div class="p-3 space-y-4">
            <div class="p-3">
                <div class="flex items-center gap-3 mb-3">
                    <SRouterLink :to="`/db/weapon/${weapon.id}`" class="text-lg font-bold link link-primary">
                        {{ $t(weapon.名称) }}
                    </SRouterLink>
                    <span class="text-xs text-base-content/70">ID: {{ weapon.id }}</span>
                </div>

                <div class="flex justify-center items-center mb-3">
                    <img :src="leveledWeapon.url" class="w-24 object-cover rounded" />
                </div>

                <div class="flex flex-wrap gap-2 text-sm opacity-70 mb-3">
                    <span>{{ weapon.类型.map(t => $t(t)).join(", ") }}</span>
                    <span>
                        {{ $t(weapon.伤害类型) }}
                    </span>
                    <span v-if="weapon.版本">{{ weapon.版本 }}版本</span>
                </div>

                <div v-if="weapon.描述" class="text-sm text-base-content/70 mb-3">
                    {{ weapon.描述 }}
                </div>
            </div>

            <div class="mb-3">
                <div class="flex items-center gap-4 mb-3">
                    <span class="text-sm min-w-20 flex-none grid grid-cols-2">
                        <span> Lv. </span>
                        <span> {{ currentLevel }} </span>
                    </span>
                    <input
                        :key="leveledWeapon.id"
                        v-model.number="currentLevel"
                        type="range"
                        class="range range-primary range-xs grow"
                        :min="1"
                        :max="80"
                        step="1"
                    />
                </div>
                <div class="flex items-center gap-4">
                    <span class="text-sm min-w-20 flex-none grid grid-cols-2">
                        <span> 熔炼: </span>
                        <span> {{ ["0", "I", "II", "III", "IV", "V"][currentRefine] }} </span>
                    </span>
                    <input
                        :key="leveledWeapon.id"
                        v-model.number="currentRefine"
                        type="range"
                        class="range range-primary range-xs grow"
                        :min="0"
                        :max="5"
                        step="1"
                    />
                </div>
            </div>

            <div class="p-3 bg-base-200 rounded mb-3">
                <div class="text-xs text-base-content/70 mb-2">基础属性</div>
                <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
                    <div class="flex justify-between items-center p-2 bg-base-300 rounded text-sm">
                        <span class="text-base-content/70">{{ $t("攻击") }}</span>
                        <span class="font-medium text-primary">{{ leveledWeapon.基础攻击 }}</span>
                    </div>
                    <div class="flex justify-between items-center p-2 bg-base-300 rounded text-sm">
                        <span class="text-base-content/70">{{ $t("暴击") }}</span>
                        <span class="font-medium text-primary">{{ formatProp("基础暴击", weapon.暴击) }}</span>
                    </div>
                    <div class="flex justify-between items-center p-2 bg-base-300 rounded text-sm">
                        <span class="text-base-content/70">{{ $t("暴伤") }}</span>
                        <span class="font-medium text-primary">{{ formatProp("基础暴伤", weapon.暴伤) }}</span>
                    </div>
                    <div class="flex justify-between items-center p-2 bg-base-300 rounded text-sm">
                        <span class="text-base-content/70">{{ $t("触发") }}</span>
                        <span class="font-medium text-primary">{{ formatProp("基础触发", weapon.触发) }}</span>
                    </div>
                    <div v-if="weapon.弹匣" class="flex justify-between items-center p-2 bg-base-300 rounded text-sm">
                        <span class="text-base-content/70">{{ $t("弹匣") }}</span>
                        <span class="font-medium text-primary">{{ weapon.弹匣 }}</span>
                    </div>
                    <div v-if="weapon.最大弹药" class="flex justify-between items-center p-2 bg-base-300 rounded text-sm">
                        <span class="text-base-content/70">{{ $t("最大弹药") }}</span>
                        <span class="font-medium text-primary">{{ weapon.最大弹药 }}</span>
                    </div>
                    <div v-if="weapon.最大射程" class="flex justify-between items-center p-2 bg-base-300 rounded text-sm">
                        <span class="text-base-content/70">{{ $t("最大射程") }}</span>
                        <span class="font-medium text-primary">{{ weapon.最大射程 }}</span>
                    </div>
                </div>
            </div>

            <div v-if="weapon.突破 && weapon.突破.length > 0" class="p-3 bg-base-200 rounded mb-3">
                <div class="text-xs text-base-content/70 mb-2">突破消耗</div>
                <div class="space-y-3">
                    <div v-for="(cost, index) in weapon.突破" :key="index" class="p-2 bg-base-300 rounded">
                        <div class="text-sm font-medium mb-2 text-primary">突破 {{ ["I", "II", "III", "IV", "V", "VI"][index] }}</div>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
                            <ResourceCostItem v-for="(value, key) in cost" :key="key" :name="key" :value="value" />
                        </div>
                    </div>
                </div>
            </div>

            <div v-if="weapon.熔炼 && weapon.熔炼.length > 0" class="p-3 bg-base-200 rounded mb-3">
                <div class="text-xs text-base-content/70 mb-2">
                    {{ $t("属性") }}
                </div>
                <div class="space-y-1">
                    {{ weapon.熔炼[currentRefine] }}
                </div>
            </div>

            <div v-if="leveledWeapon.技能 && leveledWeapon.技能.length > 0" class="p-3 bg-base-200 rounded">
                <div class="text-xs text-base-content/70 mb-2">
                    {{ $t("技能") }}
                </div>
                <div class="space-y-3">
                    <div v-for="skill in leveledWeapon.技能" :key="skill.名称">
                        <div
                            v-for="(val, index) in skill!.getFieldsWithAttr()"
                            :key="index"
                            class="flex flex-col group hover:bg-base-300/50 rounded-md p-2"
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
                                            .map(item => $t(item))
                                            .join(",")
                                    }}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </ScrollArea>
</template>
