<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue"
import { useRoute, useRouter } from "vue-router"
import { gqClient } from "../api/graphql"
import { charData } from "../data"
import { useCharSettings } from "../composables/useCharSettings"
import { useUIStore } from "../store/ui"
import { env } from "../env"
import { importPic } from "../api/app"
import { useSettingStore } from "../store/setting"

const route = useRoute()
const router = useRouter()
const ui = useUIStore()
const setting = useSettingStore()

const isEdit = computed(() => !!route.params.id)
const { id } = route.params

const selectedChar = ref("")
const title = ref("")
const type = ref<"text" | "image">("text")
const content = ref("")
const images = ref<string[]>([])
const selectedCharId = ref<number | null>(null)
const includeCharSettings = ref(false)
const isLoading = ref(false)

const charSettings = useCharSettings(selectedChar)

const typeOptions = [
    { value: "text", label: "图文攻略" },
    { value: "image", label: "一图流攻略" },
]

const charOptions = computed(() => [
    { value: -1, label: "不关联角色" },
    ...charData.map((char) => ({
        value: char.id,
        label: char.名称,
    })),
])

const isDragging = ref(false)
const fileInputRef = ref<HTMLInputElement>()
const uploadingImage = ref(false)

let unlistenDragEnter = () => {}
let unlistenDragLeave = () => {}
let unlistenDragDrop = () => {}

async function uploadImageToServer(file: File): Promise<string | null> {
    const api = await setting.getDNAAPI()
    if (api) {
        try {
            const res = await api.uploadImage(file)
            if (res.is_success && res.data && res.data.length > 0) {
                return res.data[0]
            }
        } catch (error) {
            console.warn("dna-api上传失败，降级到本地服务器:", error)
        }
    }

    const formData = new FormData()
    formData.append("file", file)

    try {
        const response = await fetch(`${env.endpoint}/api/upload/image`, {
            method: "POST",
            body: formData,
        })

        if (!response.ok) {
            console.error("上传失败:", response.statusText)
            return null
        }

        const result = await response.json()
        if (result.success) {
            return result.url
        } else {
            console.error("上传失败:", result.error)
            return null
        }
    } catch (error) {
        console.error("上传图片失败:", error)
        return null
    }
}

async function handleImageUpload(event: Event) {
    const target = event.target as HTMLInputElement
    if (target.files && target.files.length > 0) {
        await processFile(target.files[0])
    }
    target.value = ""
}

async function handleWebDrop(event: DragEvent) {
    event.preventDefault()
    isDragging.value = false
    if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
        const file = event.dataTransfer.files[0]
        if (file.type.startsWith("image/")) {
            await processFile(file)
        } else {
            ui.showErrorMessage("只支持图片格式")
        }
    }
}

async function handleTauriDrop(paths: string[]) {
    isDragging.value = false
    if (paths.length > 0) {
        const path = paths[0]
        if (/\.(?:png|jpg|jpeg|gif|webp)$/i.test(path)) {
            const imageUrl = await importPic(path)
            if (imageUrl) {
                await addImageToContent(imageUrl)
            } else {
                ui.showErrorMessage("图片导入失败")
            }
        } else {
            ui.showErrorMessage("只支持图片格式")
        }
    }
}

async function processFile(file: File) {
    if (!file.type.startsWith("image/")) {
        ui.showErrorMessage("只支持图片格式")
        return
    }

    if (file.size > 3 * 1024 * 1024) {
        ui.showErrorMessage("图片大小不能超过 3MB")
        return
    }

    uploadingImage.value = true
    try {
        const imageUrl = await uploadImageToServer(file)
        if (imageUrl) {
            await addImageToContent(imageUrl)
        } else {
            ui.showErrorMessage("图片上传失败")
        }
    } finally {
        uploadingImage.value = false
    }
}

async function addImageToContent(imageUrl: string) {
    if (type.value === "image") {
        images.value.push(imageUrl)
    } else {
        const imageMarkdown = `![图片](${imageUrl})`
        const textarea = document.querySelector("textarea") as HTMLTextAreaElement
        if (textarea) {
            const start = textarea.selectionStart
            const end = textarea.selectionEnd
            const text = content.value

            const newText = text.substring(0, start) + imageMarkdown + text.substring(end)
            content.value = newText

            requestAnimationFrame(() => {
                textarea.focus()
                textarea.selectionStart = textarea.selectionEnd = start + imageMarkdown.length
            })
        } else {
            content.value += imageMarkdown
        }
    }
}

function handleWebDragOver(event: DragEvent) {
    event.preventDefault()
    isDragging.value = true
}

function handleWebDragLeave() {
    isDragging.value = false
}

function triggerFileInput() {
    fileInputRef.value?.click()
}

function removeImage(index: number) {
    images.value.splice(index, 1)
}

async function handleSubmit() {
    if (!title.value.trim()) {
        ui.showErrorMessage("请输入攻略标题")
        return
    }

    if (!content.value.trim() && images.value.length === 0) {
        ui.showErrorMessage("请输入攻略内容或上传图片")
        return
    }
    isLoading.value = true

    const loginResult = await setting.autoLoginDNA()
    if (!loginResult.success) {
        ui.showErrorMessage(loginResult.error)
        isLoading.value = false
        return
    }

    const input = {
        title: title.value,
        type: type.value,
        content: content.value,
        images: images.value,
        charId: selectedCharId.value,
        charSettings: includeCharSettings.value && selectedCharId.value ? charSettings.value : null,
    }

    if (isEdit.value) {
        try {
            const result = await gqClient
                .mutation(
                    `mutation UpdateGuide($id: String!, $input: GuideInput!) {
                        updateGuide(id: $id, input: $input) {
                            id
                            title
                            type
                        }
                    }`,
                    { id: id as string, input },
                )
                .toPromise()
            if (result.error?.graphQLErrors?.[0]) {
                ui.showErrorMessage(result.error.graphQLErrors[0].message)
                return
            }
            if (result.error) {
                ui.showErrorMessage(result.error.message)
                return
            }
            if (result.data?.updateGuide) {
                router.back()
            }
        } finally {
            isLoading.value = false
        }
    } else {
        try {
            const result = await gqClient
                .mutation(
                    `mutation CreateGuide($input: GuideInput!) {
                        createGuide(input: $input) {
                            id
                            title
                            type
                        }
                    }`,
                    { input },
                )
                .toPromise()
            if (result.error?.graphQLErrors?.[0]) {
                ui.showErrorMessage(result.error.graphQLErrors[0].message)
                return
            }
            if (result.error) {
                ui.showErrorMessage(result.error.message)
                return
            }
            if (result.data?.createGuide) {
                router.push({ name: "guide-detail", params: { id: result.data.createGuide.id } })
            }
        } finally {
            isLoading.value = false
        }
    }
}

onMounted(async () => {
    if (env.isApp) {
        const { listen, TauriEvent } = await import("@tauri-apps/api/event")

        unlistenDragEnter = await listen(TauriEvent.DRAG_ENTER, () => {
            isDragging.value = true
        })

        unlistenDragLeave = await listen(TauriEvent.DRAG_LEAVE, () => {
            isDragging.value = false
        })

        unlistenDragDrop = await listen<{ paths: string[] }>(TauriEvent.DRAG_DROP, async (event) => {
            if (!isDragging.value) return
            await handleTauriDrop(event.payload.paths)
        })
    }
    ui.title = isEdit ? "编辑攻略" : "发布攻略"
})

onUnmounted(() => {
    if (env.isApp) {
        unlistenDragEnter()
        unlistenDragDrop()
        unlistenDragLeave()
    }
    ui.title = ""
})
</script>

<template>
    <div class="h-full flex flex-col bg-base-200">
        <ScrollArea class="flex-1">
            <div class="p-6 max-w-5xl mx-auto space-y-6">
                <div class="card bg-base-100 shadow-sm">
                    <div class="card-body p-6 space-y-6">
                        <div class="space-y-2">
                            <label class="block text-sm font-medium mb-2">攻略标题</label>
                            <input
                                v-model="title"
                                type="text"
                                placeholder="请输入一个吸引人的标题..."
                                class="w-full px-3 py-2 rounded-md border border-base-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                            />
                        </div>

                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div class="space-y-2">
                                <label class="block text-sm font-medium mb-2">攻略类型</label>
                                <Select v-model="type" class="input w-full">
                                    <SelectItem v-for="option in typeOptions" :key="option.value" :value="option.value">
                                        <div class="flex items-center gap-2">
                                            <Icon :icon="option.value === 'text' ? 'ri:message-2-line' : 'ri:more-line'" class="w-4 h-4" />
                                            {{ option.label }}
                                        </div>
                                    </SelectItem>
                                </Select>
                            </div>

                            <div class="space-y-2">
                                <label class="block text-sm font-medium mb-2">关联角色</label>
                                <Select v-model="selectedCharId" class="input w-full">
                                    <SelectItem v-for="option in charOptions" :key="option.value" :value="option.value">
                                        {{ option.label }}
                                    </SelectItem>
                                </Select>
                            </div>
                        </div>

                        <div v-if="selectedCharId && selectedCharId !== -1" class="card bg-base-200 border border-base-300">
                            <div class="card-body p-4">
                                <label class="flex items-start gap-3 cursor-pointer">
                                    <input v-model="includeCharSettings" type="checkbox" class="checkbox checkbox-primary" />
                                    <div>
                                        <span class="block text-sm font-medium">包含当前配装信息</span>
                                        <span class="block text-xs text-base-content/60 mt-1">勾选后，当前的角色配装将随攻略一同发布</span>
                                    </div>
                                </label>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="card bg-base-100 shadow-sm">
                    <div class="card-body p-6 space-y-6">
                        <div class="space-y-2">
                            <label class="block text-sm font-medium mb-2">攻略内容</label>
                            <div
                                @dragover="handleWebDragOver"
                                @dragleave="handleWebDragLeave"
                                @drop="handleWebDrop"
                                :class="['relative', isDragging ? 'ring-2 ring-primary ring-offset-2' : '']"
                            >
                                <textarea
                                    v-model="content"
                                    placeholder="详细描述你的攻略内容，支持 Markdown 格式..."
                                    class="w-full px-3 py-2 rounded-md border border-base-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all h-64 leading-relaxed resize-none"
                                ></textarea>
                                <div
                                    @click="triggerFileInput"
                                    class="absolute bottom-3 right-3 btn btn-ghost btn-sm bg-base-200 hover:bg-base-300"
                                    title="插入图片"
                                >
                                    <Icon icon="ri:image-add-line" class="w-4 h-4" />
                                </div>
                            </div>
                            <input ref="fileInputRef" type="file" accept="image/*" @change="handleImageUpload" class="hidden" />
                        </div>

                        <div v-if="type === 'image'" class="space-y-6">
                            <div class="space-y-2">
                                <div class="flex items-center justify-between">
                                    <label class="block text-sm font-medium">上传图片</label>
                                    <span class="text-xs text-base-content/60">支持拖拽上传或点击选择</span>
                                </div>
                                <div
                                    @click="triggerFileInput"
                                    @dragover="handleWebDragOver"
                                    @dragleave="handleWebDragLeave"
                                    @drop="handleWebDrop"
                                    :class="[
                                        'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200',
                                        isDragging ? 'border-primary bg-primary/5' : 'border-base-content/30 hover:border-primary/50',
                                    ]"
                                >
                                    <input ref="fileInputRef" type="file" accept="image/*" @change="handleImageUpload" class="hidden" />
                                    <div class="flex flex-col items-center gap-3">
                                        <div
                                            :class="[
                                                'rounded-full p-4 transition-colors',
                                                isDragging ? 'bg-primary' : 'bg-base-content/10',
                                            ]"
                                        >
                                            <Icon
                                                icon="ri:add-line"
                                                :class="['w-8 h-8', isDragging ? 'text-primary-content' : 'text-base-content/50']"
                                            />
                                        </div>
                                        <div>
                                            <p class="font-medium">点击或拖拽上传图片</p>
                                            <p class="text-sm text-base-content/50 mt-1">支持 JPG、PNG、GIF 格式，最大 3MB</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div v-if="images.length > 0" class="space-y-4">
                                <div class="flex items-center justify-between">
                                    <span class="text-sm font-medium">已上传图片 ({{ images.length }})</span>
                                </div>
                                <div class="grid grid-cols-2 lg:grid-cols-3 gap-4">
                                    <div v-for="(image, index) in images" :key="index" class="relative group aspect-square">
                                        <img
                                            :src="image"
                                            class="w-full h-full object-cover rounded-xl shadow-sm group-hover:shadow-md transition-shadow"
                                        />
                                        <button
                                            class="absolute top-2 right-2 btn btn-sm btn-circle btn-error opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                                            @click="removeImage(index)"
                                        >
                                            <Icon icon="radix-icons:cross2" class="w-4 h-4" />
                                        </button>
                                        <div
                                            class="absolute bottom-0 left-0 right-0 bg-linear-to-t from-black/60 to-transparent rounded-b-xl p-3"
                                        >
                                            <span class="text-white text-xs">图片 {{ index + 1 }}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div v-if="isDragging" class="fixed inset-0 flex items-center justify-center bg-black/50 z-50 pointer-events-none">
                    <div class="bg-base-200 p-8 rounded-lg text-2xl font-bold text-primary shadow-xl pointer-events-auto">
                        松开鼠标以插入图片
                    </div>
                </div>

                <div class="flex items-center gap-4 justify-center">
                    <button class="btn btn-primary btn-wide" @click="handleSubmit" :disabled="isLoading">
                        <span v-if="isLoading" class="loading loading-spinner loading-sm"></span>
                        <Icon v-else icon="ri:send-plane-line" class="w-4 h-4" />
                        {{ isEdit ? "保存" : "发布" }}
                    </button>
                </div>
            </div>
        </ScrollArea>
    </div>
</template>
