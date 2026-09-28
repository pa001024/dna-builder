<script lang="ts" setup>
import { computed } from "vue"
import DBLatestItemCard from "@/components/DBLatestItemCard.vue"
import { resolveDBCardEntry } from "@/utils/db-card-utils"

/**
 * AI 卡片：资料库条目卡片的中间层。
 *
 * 资料检索 Agent 在回复里写 `<DBAICard kind="char" name="煜明" />` 这类标签时，
 * 渲染层会把参数原样交给本组件：这里负责把「类型 + id / 名称」补齐成完整条目数据
 * （见 `resolveDBCardEntry`），再交给 `DBLatestItemCard` 渲染——卡片本体只管展示，
 * 不做数据查找，模型也不必（更不可能）拼出完整的 Char / Weapon / Mod 结构。
 *
 * 参数在 `src/utils/rich-component.ts` 的白名单里限定为 kind / id / name 三个。
 * 查不到条目时渲染一条可读的降级提示而不是空白：模型写错名称时，用户能看出哪个名字没对上，
 * 页面上也不会留下一串没人认识的标签文本。
 */
const props = defineProps<{
    /** 条目类型：char / weapon / mod（也接受「角色 / 武器 / 魔之楔」这类写法） */
    kind?: string
    /** 条目 id（优先用它定位，取自工具返回结果） */
    id?: number | string
    /** 条目名称：id 缺失或查不到时用它定位（支持别名与拼音） */
    name?: string
}>()

/** 补齐后的条目数据 */
const entry = computed(() => resolveDBCardEntry({ kind: props.kind, id: props.id, name: props.name }))

/** 降级提示里回显的原始参数，便于对照模型写了什么 */
const requested = computed(() => {
    const name = `${props.name ?? ""}`.trim()

    if (name) {
        return name
    }

    const id = `${props.id ?? ""}`.trim()

    return id ? `${props.kind ?? ""} #${id}`.trim() : ""
})
</script>

<template>
    <span v-if="entry" class="mr-2 mb-2 inline-block w-40 align-top">
        <DBLatestItemCard :entry="entry" />
    </span>
    <span
        v-else-if="requested"
        class="mr-2 mb-2 inline-flex w-40 flex-col gap-1 rounded-xs border border-dashed border-base-content/20 p-2.5 align-top text-[11px] leading-5 text-base-content/45"
    >
        <span>{{ $t("dbAgent.card.notFound") }}</span>
        <span class="truncate text-[10px] text-base-content/35">{{ requested }}</span>
    </span>
</template>
