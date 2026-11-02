<script setup lang="ts">
import { useHelpText } from "../../content/locale"
import { type CommunityShot, L } from "../../content/types"
import { enterStyle } from "./motion"

defineProps<{ shot: CommunityShot; time: number; duration: number }>()
const tr = useHelpText()

const calendar = Array.from({ length: 28 }, (_, index) => index < 18 || [20, 21, 24, 26].includes(index))
</script>

<template>
    <div class="help-center-shot">
        <div class="help-panel w-[900px] overflow-hidden">
            <div class="flex items-center justify-between border-b border-white/10 px-5 py-3">
                <div class="flex items-center gap-3">
                    <span class="flex size-8 items-center justify-center border border-(--accent)/40 bg-(--accent)/10">
                        <Icon :icon="shot.mode === 'chat' ? 'ri:chat-3-line' : 'ri:chat-thread-line'" class="size-4 help-accent" />
                    </span>
                    <div class="text-sm font-semibold">{{ tr(shot.title) }}</div>
                </div>
                <div class="flex items-center gap-1.5">
                    <span
                        v-for="(item, index) in shot.nav ?? []"
                        :key="index"
                        class="help-chip h-6! px-2! text-[10px]!"
                        :class="{ 'help-chip--accent': item.active }"
                    >
                        <Icon v-if="item.icon" :icon="item.icon" class="size-3" />
                        {{ tr(item.label) }}
                    </span>
                </div>
            </div>

            <div class="p-5">
                <template v-if="shot.mode === 'dna'">
                    <div class="grid grid-cols-[1.15fr_1fr] gap-4">
                        <div class="border border-white/10 bg-white/3 p-4">
                            <div class="flex items-center justify-between">
                                <div class="help-build-panel__title">{{ tr(L("每日签到", "每日簽到", "DAILY CHECK-IN", "デイリー签到", "일일 출석", "CHECK-IN QUOTIDIEN")) }}</div>
                                <span class="help-chip help-chip--accent">{{ tr(L("已签 18 天", "已簽 18 天", "18 days", "18 日", "18일", "18 jours")) }}</span>
                            </div>
                            <div class="mt-4 grid grid-cols-7 gap-1.5">
                                <div v-for="(checked, index) in calendar" :key="index" class="flex aspect-square items-center justify-center border text-[9px]" :class="checked ? 'border-(--accent)/45 bg-(--accent)/14 help-accent' : 'border-white/8 bg-white/3 text-white/25'">
                                    <Icon v-if="checked" icon="ri:check-line" class="size-3" />
                                    <span v-else>{{ index + 1 }}</span>
                                </div>
                            </div>
                            <div class="mt-4 flex items-center justify-between">
                                <span class="help-chip">{{ tr(L("自动签到", "自動簽到", "Auto check-in", "自動签到", "자동 출석", "Check-in auto")) }}</span>
                                <span class="help-chip help-chip--accent">{{ tr(L("签到", "簽到", "Check in", "签到", "출석", "Signer")) }}</span>
                            </div>
                        </div>
                        <div class="space-y-2">
                            <div v-for="(stat, index) in shot.stats ?? []" :key="index" class="help-kpi" :style="enterStyle(time, 0.35 + index * 0.1, 0.45, 10)">
                                <div class="help-kpi__value" :class="{ 'help-kpi__value--accent': index === 0 }">{{ stat.value }}</div>
                                <div class="help-kpi__label">{{ tr(stat.label) }}</div>
                            </div>
                        </div>
                    </div>
                </template>

                <template v-else-if="shot.mode === 'chat'">
                    <div class="grid grid-cols-[1fr_190px] gap-4">
                        <div class="flex h-[360px] flex-col border border-white/10 bg-white/3">
                            <div class="flex-1 space-y-3 overflow-hidden p-4">
                                <div v-for="(message, index) in shot.messages ?? []" :key="index" class="flex gap-2.5" :class="{ 'flex-row-reverse': message.from === 'me' }" :style="enterStyle(time, 0.3 + index * 0.18, 0.45, 10)">
                                    <span class="help-avatar size-8! text-[10px]">{{ (tr(message.author ?? L("我", "我", "ME", "自分", "나", "MOI"))).slice(0, 1) }}</span>
                                    <div class="min-w-0">
                                        <div class="mb-1 flex items-center gap-1.5 text-[9px] text-white/35" :class="{ 'justify-end': message.from === 'me' }">
                                            <span>{{ tr(message.author ?? L("我", "我", "Me", "自分", "나", "Moi")) }}</span>
                                            <span v-if="message.tag" class="help-chip h-4! px-1! text-[8px]!">{{ tr(message.tag) }}</span>
                                        </div>
                                        <div class="help-bubble" :class="{ 'help-bubble--me': message.from === 'me' }">{{ tr(message.text) }}</div>
                                    </div>
                                </div>
                            </div>
                            <div class="border-t border-white/10 p-3">
                                <div class="flex items-center gap-2 border border-white/10 bg-black/20 px-3 py-2 text-[11px] text-white/35">
                                    <Icon icon="ri:chat-3-line" class="size-3.5" />
                                    <span>{{ tr(L("说点什么…", "說點什麼…", "Say something…", "何か入力…", "무언가 입력…", "Dites quelque chose…")) }}</span>
                                    <span class="ml-auto help-chip help-chip--accent h-5! px-2! text-[9px]!">{{ tr(L("发送", "傳送", "Send", "送信", "보내기", "Envoyer")) }}</span>
                                </div>
                            </div>
                        </div>
                        <div class="space-y-2">
                            <div class="help-build-panel__title">{{ tr(L("在线", "線上", "ONLINE", "オンライン", "온라인", "EN LIGNE")) }}</div>
                            <div v-for="index in 5" :key="index" class="flex items-center gap-2 border border-white/8 bg-white/3 px-2.5 py-2">
                                <span class="help-avatar size-6! text-[9px]">{{ String.fromCharCode(64 + index) }}</span>
                                <span class="text-[10px] text-white/55">{{ tr(L("旅人", "旅人", "Traveler", "旅人", "여행자", "Voyageur")) }} {{ index }}</span>
                                <span class="ml-auto size-1.5 rounded-full bg-emerald-400" />
                            </div>
                        </div>
                    </div>
                </template>

                <template v-else>
                    <div class="space-y-2">
                        <div
                            v-for="(post, index) in shot.posts ?? []"
                            :key="index"
                            class="flex items-center gap-3 border border-white/10 bg-white/3 px-4 py-3"
                            :style="enterStyle(time, 0.3 + index * 0.12, 0.45, 10)"
                        >
                            <span class="flex size-8 items-center justify-center border border-white/10 bg-white/4 font-orbitron text-[10px] text-white/50">
                                {{ String(index + 1).padStart(2, "0") }}
                            </span>
                            <div class="min-w-0 flex-1">
                                <div class="truncate text-[12px] font-medium text-white/80">{{ tr(post.title) }}</div>
                                <div class="mt-0.5 flex items-center gap-2 text-[9px] text-white/35">
                                    <span>{{ tr(post.author ?? "") }}</span>
                                    <span>·</span>
                                    <span>{{ tr(post.meta ?? "") }}</span>
                                </div>
                            </div>
                            <span v-if="post.tag" class="help-chip h-5! px-2! text-[9px]!" :class="{ 'help-chip--accent': index === 0 }">{{ tr(post.tag) }}</span>
                        </div>
                    </div>
                </template>
            </div>
        </div>
    </div>
</template>
