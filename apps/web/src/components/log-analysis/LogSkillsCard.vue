<script lang="ts" setup>
import { useTranslation } from "i18next-vue"
import { computed } from "vue"
import { fmtInt } from "@/components/log-analysis/format"
import type { AnalysisSession } from "@/utils/log-analysis/types"

const props = defineProps<{ session: AnalysisSession }>()
const { t } = useTranslation()

const total = computed(() =>
    props.session.skills.reduce((sum, group) => sum + group.skills.reduce((inner, skill) => inner + skill.count, 0), 0)
)

const groups = computed(() =>
    props.session.skills.map(group => {
        const max = Math.max(1, ...group.skills.map(skill => skill.count))
        const groupCount = group.skills.reduce((sum, skill) => sum + skill.count, 0)
        return {
            key: `eid-${group.eid}`,
            eid: group.eid,
            name: group.name,
            meta: t("log-analysis.skills_group_meta", { eid: group.eid, count: groupCount }),
            slots: group.slots,
            skills: group.skills.map((skill, index) => ({
                key: `${group.eid}-${skill.skillId}-${index}`,
                name: skill.name ?? `#${skill.skillId}`,
                count: fmtInt(skill.count),
                width: Math.max(3, (skill.count / max) * 100),
            })),
        }
    })
)
</script>

<template>
    <section class="rounded-xs border border-base-content/10 bg-base-100/60 p-3 backdrop-blur-sm">
        <SectionHeader no-animate compact kicker="SKILLS" :title="$t('log-analysis.skills_title')">
            <template #trailing>
                <span class="text-[10px] text-base-content/45">{{ $t("log-analysis.skills_total", { count: fmtInt(total) }) }}</span>
            </template>
        </SectionHeader>

        <div v-if="groups.length" class="space-y-2">
            <div v-for="group in groups" :key="group.key" class="rounded-xs border border-base-content/10 bg-base-content/3 p-2.5">
                <div class="flex flex-wrap items-center justify-between gap-1.5">
                    <div class="flex min-w-0 items-center gap-2">
                        <span class="truncate text-xs font-semibold">{{ group.name }}</span>
                        <span v-if="group.slots.length" class="truncate text-[10px] text-base-content/40">{{ group.slots.join(" / ") }}</span>
                    </div>
                    <span class="shrink-0 text-[10px] text-base-content/45">{{ group.meta }}</span>
                </div>
                <div class="mt-1.5 space-y-1.5">
                    <div v-for="skill in group.skills" :key="skill.key" class="min-w-0">
                        <div class="flex items-center justify-between gap-2 text-[11px]">
                            <span class="min-w-0 truncate">{{ skill.name }}</span>
                            <span class="shrink-0 font-orbitron text-[11px] text-primary">{{ skill.count }}</span>
                        </div>
                        <div class="mt-0.5 h-1 w-full bg-base-content/8">
                            <div class="h-full bg-primary/50" :style="{ width: `${skill.width}%` }" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <div v-else class="flex flex-col items-center justify-center py-10 text-center text-base-content/40">
            <Icon icon="ri:flashlight-line" class="mb-2 size-8 opacity-50" />
            <p class="max-w-md text-xs">{{ $t("log-analysis.skills_empty") }}</p>
        </div>
    </section>
</template>
