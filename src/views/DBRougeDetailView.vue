<script lang="ts" setup>
import { computed } from "vue"
import { useRoute } from "vue-router"
import {
    type RougeLikeBlessing,
    type RougeLikeContract,
    type RougeLikeRoom,
    type RougeLikeStoryEvent,
    type RougeLikeTalent,
    type RougeLikeTreasure,
    type RougeLikeTreasureGroup,
    type RougeProClass,
    type RougeProContract,
    type RougeProDifficulty,
    type RougeProEvent,
    type RougeProRoom,
    type RougeProSeason,
    type RougeProTalent,
    type RougeProTreasure,
    type RougeProTreasureGroup,
    rougeLikeBlessings,
    rougeLikeContracts,
    rougeLikeRooms,
    rougeLikeStoryEvents,
    rougeLikeTalents,
    rougeLikeTreasureGroups,
    rougeLikeTreasures,
    rougeProClasses,
    rougeProContracts,
    rougeProDifficulties,
    rougeProEvents,
    rougeProRooms,
    rougeProSeasons,
    rougeProTalents,
    rougeProTreasureGroups,
    rougeProTreasures,
} from "@/data/d/rouge.data"

const route = useRoute()

const mode = computed(() => (route.params.mode === "pro" ? "pro" : "like"))
const kind = computed(() => String(route.params.kind || ""))
const id = computed(() => Number(route.params.id))

type LikeItem =
    | RougeLikeBlessing
    | RougeLikeTalent
    | RougeLikeTreasure
    | RougeLikeTreasureGroup
    | RougeLikeContract
    | RougeLikeRoom
    | RougeLikeStoryEvent

type ProItem =
    | RougeProTreasure
    | RougeProTalent
    | RougeProContract
    | RougeProClass
    | RougeProTreasureGroup
    | RougeProRoom
    | RougeProEvent
    | RougeProSeason
    | RougeProDifficulty

/**
 * 根据路由参数查找匹配的迷津条目。
 * @returns 找到的条目（含 kind）
 */
function findItem(): (LikeItem & { kind: string }) | (ProItem & { kind: string }) | null {
    if (mode.value === "like") {
        switch (kind.value) {
            case "blessing":
                return (
                    rougeLikeBlessings.map(item => ({ kind: "blessing", ...item })).find(item => item.id === id.value) || null
                )
            case "talent":
                return rougeLikeTalents.map(item => ({ kind: "talent", ...item })).find(item => item.id === id.value) || null
            case "treasure":
                return (
                    rougeLikeTreasures.map(item => ({ kind: "treasure", ...item })).find(item => item.id === id.value) || null
                )
            case "treasureGroup":
                return (
                    rougeLikeTreasureGroups.map(item => ({ kind: "treasureGroup", ...item })).find(item => item.id === id.value) ||
                    null
                )
            case "contract":
                return (
                    rougeLikeContracts.map(item => ({ kind: "contract", ...item })).find(item => item.id === id.value) || null
                )
            case "room":
                return rougeLikeRooms.map(item => ({ kind: "room", ...item })).find(item => item.id === id.value) || null
            case "story":
                return (
                    rougeLikeStoryEvents.map(item => ({ kind: "story", ...item })).find(item => item.id === id.value) || null
                )
        }
    }

    switch (kind.value) {
        case "treasure":
            return rougeProTreasures.map(item => ({ kind: "treasure", ...item })).find(item => item.id === id.value) || null
        case "talent":
            return rougeProTalents.map(item => ({ kind: "talent", ...item })).find(item => item.id === id.value) || null
        case "contract":
            return rougeProContracts.map(item => ({ kind: "contract", ...item })).find(item => item.id === id.value) || null
        case "class":
            return rougeProClasses.map(item => ({ kind: "class", ...item })).find(item => item.id === id.value) || null
        case "treasureGroup":
            return (
                rougeProTreasureGroups.map(item => ({ kind: "treasureGroup", ...item })).find(item => item.id === id.value) ||
                null
            )
        case "room":
            return rougeProRooms.map(item => ({ kind: "room", ...item })).find(item => item.id === id.value) || null
        case "event":
            return rougeProEvents.map(item => ({ kind: "event", ...item })).find(item => item.id === id.value) || null
        case "season":
            return rougeProSeasons.map(item => ({ kind: "season", ...item })).find(item => item.id === id.value) || null
        case "difficulty":
            return (
                rougeProDifficulties.map(item => ({ kind: "difficulty", ...item })).find(item => item.id === id.value) || null
            )
    }

    return null
}

const item = computed(() => findItem())

const likeItem = computed(() => (item.value && mode.value === "like" ? (item.value as LikeItem & { kind: string }) : null))
const proItem = computed(() => (item.value && mode.value === "pro" ? (item.value as ProItem & { kind: string }) : null))
</script>

<template>
    <ScrollArea class="h-full">
        <div v-if="item" class="flex-1">
            <DBRougeLikeDetailItem v-if="likeItem" :item="likeItem" :kind="kind" />
            <DBRougeProDetailItem v-else-if="proItem" :item="proItem" :kind="kind" />
        </div>
        <div v-else class="p-4">
            <div class="text-base-content/70">未找到迷津条目</div>
        </div>
    </ScrollArea>
</template>
