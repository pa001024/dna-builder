<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import { createRoomMutation, deleteRoomMutation, updateRoomMutation } from "@/api/mutation"
import { RoomItem, roomsQuery } from "@/api/query"
import { useUIStore } from "@/store/ui"

const ui = useUIStore()

// 编辑房间表单数据
interface EditRoomForm {
    name: string
    type: string
    maxUsers: number
}

// 房间列表数据
const rooms = ref<RoomItem[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 20
const loading = ref(false)

// 编辑房间相关状态
const editDialogOpen = ref(false)
const editingRoom = ref<RoomItem | null>(null)
const editForm = ref<EditRoomForm>({
    name: "",
    type: "",
    maxUsers: 10,
})
const createDialogOpen = ref(false)
const createForm = ref<EditRoomForm>({
    name: "",
    type: "",
    maxUsers: 10,
})
const formSubmitting = ref(false)

// 获取房间列表
const fetchRooms = async () => {
    loading.value = true
    try {
        const offset = (page.value - 1) * pageSize
        const result = await roomsQuery(
            {
                limit: pageSize,
                offset,
            },
            { requestPolicy: "network-only" }
        )

        if (result) {
            rooms.value = result.rooms || []
            total.value = result.roomsCount || 0
        }
    } catch (error) {
        console.error("获取房间列表失败:", error)
    } finally {
        loading.value = false
    }
}

// 分页变更
const handlePageChange = (newPage: number) => {
    page.value = newPage
    fetchRooms()
}

// 打开创建对话框
const openCreateDialog = () => {
    createForm.value = {
        name: "",
        type: "",
        maxUsers: 10,
    }
    createDialogOpen.value = true
}

// 关闭创建对话框
const closeCreateDialog = () => {
    createDialogOpen.value = false
    createForm.value = {
        name: "",
        type: "",
        maxUsers: 10,
    }
}

// 打开编辑对话框
const openEditDialog = (room: RoomItem) => {
    editingRoom.value = room
    editForm.value = {
        name: room.name,
        type: room.type || "",
        maxUsers: room.maxUsers || 10,
    }
    editDialogOpen.value = true
}

// 关闭编辑对话框
const closeEditDialog = () => {
    editDialogOpen.value = false
    editingRoom.value = null
    editForm.value = {
        name: "",
        type: "",
        maxUsers: 10,
    }
}

// 提交创建
const submitCreate = async () => {
    // 表单验证
    if (!createForm.value.name || createForm.value.name.trim() === "") {
        ui.showErrorMessage("请输入房间名称")
        return
    }

    formSubmitting.value = true
    try {
        const result = await createRoomMutation({
            data: {
                name: createForm.value.name,
                type: createForm.value.type || null,
                maxUsers: createForm.value.maxUsers || 0,
            },
        })

        if (result) {
            // 创建成功，刷新房间列表并关闭对话框
            await fetchRooms()
            closeCreateDialog()
        }
    } catch (error) {
        console.error("创建房间失败:", error)
        ui.showErrorMessage("创建房间失败")
    } finally {
        formSubmitting.value = false
    }
}

// 提交编辑
const submitEdit = async () => {
    if (!editingRoom.value) return

    // 表单验证
    if (!editForm.value.name || editForm.value.name.trim() === "") {
        ui.showErrorMessage("请输入房间名称")
        return
    }

    formSubmitting.value = true
    try {
        const result = await updateRoomMutation({
            id: editingRoom.value.id,
            data: {
                name: editForm.value.name,
                type: editForm.value.type,
                maxUsers: editForm.value.maxUsers,
            },
        })

        if (result) {
            // 更新成功，刷新房间列表并关闭对话框
            await fetchRooms()
            closeEditDialog()
        }
    } catch (error) {
        console.error("更新房间失败:", error)
        ui.showErrorMessage("更新房间失败")
    } finally {
        formSubmitting.value = false
    }
}

// 删除房间
const deleteRoom = async (roomId: string) => {
    if (await ui.showDialog("删除确认", "确定要删除这个房间吗？")) {
        try {
            const result = await deleteRoomMutation({ id: roomId })

            if (result) {
                // 删除成功，刷新房间列表
                await fetchRooms()
            }
        } catch (error) {
            console.error("删除房间失败:", error)
        }
    }
}
const totalPages = computed(() => Math.ceil(total.value / pageSize))

// 页面挂载时获取房间列表
onMounted(() => {
    fetchRooms()
})
</script>

<template>
    <div class="animate-fadeIn p-6 bg-base-200/50 min-h-screen">
        <!-- 页面标题 -->
        <div class="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
                <h2 class="text-2xl font-semibold text-base-content">房间管理</h2>
                <p class="text-sm text-base-content/70 mt-1">管理系统房间和权限</p>
            </div>
            <button
                class="btn btn-primary px-6 shadow-md hover:shadow-lg transform hover:-translate-y-0.5 flex items-center justify-center gap-2 font-medium"
                @click="openCreateDialog"
            >
                <Icon icon="ri:add-line"></Icon>
                <span>创建房间</span>
            </button>
        </div>

        <!-- 房间列表 -->
        <div class="card bg-base-100 shadow-sm border border-base-300 overflow-hidden hover:shadow-md transition-all duration-300">
            <ScrollArea horizontal>
                <table class="table w-full">
                    <thead class="bg-base-200">
                        <tr>
                            <th class="px-8 py-4 text-left text-xs font-semibold text-base-content/70 uppercase tracking-wider">
                                房间名称
                            </th>
                            <th class="px-8 py-4 text-left text-xs font-semibold text-base-content/70 uppercase tracking-wider">类型</th>
                            <th class="px-8 py-4 text-left text-xs font-semibold text-base-content/70 uppercase tracking-wider">
                                最大用户数
                            </th>
                            <th class="px-8 py-4 text-left text-xs font-semibold text-base-content/70 uppercase tracking-wider">房主</th>
                            <th class="px-8 py-4 text-left text-xs font-semibold text-base-content/70 uppercase tracking-wider">
                                创建时间
                            </th>
                            <th class="px-8 py-4 text-left text-xs font-semibold text-base-content/70 uppercase tracking-wider">操作</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-base-200">
                        <tr
                            v-for="(room, index) in rooms"
                            :key="room.id"
                            class="hover:bg-base-200/50 transition-colors duration-200"
                            :class="{ 'bg-base-200/30': index % 2 === 0 }"
                        >
                            <td class="px-8 py-5 text-sm text-base-content font-medium">{{ room.name }}</td>
                            <td class="px-8 py-5 whitespace-nowrap text-sm">
                                <span class="badge badge-sm badge-ghost">{{ room.type || "-" }}</span>
                            </td>
                            <td class="px-8 py-5 whitespace-nowrap text-sm text-base-content/85">{{ room.maxUsers }}</td>
                            <td class="px-8 py-5 whitespace-nowrap text-sm text-base-content/85">{{ room.owner.name }}</td>
                            <td class="px-8 py-5 whitespace-nowrap text-sm text-base-content/70">{{ room.createdAt }}</td>
                            <td class="px-8 py-5 whitespace-nowrap text-sm font-medium">
                                <div class="flex items-center gap-4">
                                    <button
                                        class="text-primary hover:text-primary/80 transition-colors duration-200 flex items-center gap-1.5 group font-medium text-sm"
                                        @click="openEditDialog(room)"
                                    >
                                        <Icon icon="ri:edit-line" class="group-hover:scale-110 transition-transform duration-200"></Icon>
                                        <span class="group-hover:underline">编辑</span>
                                    </button>
                                    <button
                                        class="text-error hover:text-error/80 transition-colors duration-200 flex items-center gap-1.5 group font-medium text-sm"
                                        @click="deleteRoom(room.id)"
                                    >
                                        <Icon
                                            icon="ri:delete-bin-line"
                                            class="group-hover:scale-110 transition-transform duration-200"
                                        ></Icon>
                                        <span class="group-hover:underline">删除</span>
                                    </button>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </ScrollArea>

            <!-- 分页 -->
            <div class="mt-0 py-6 px-8 bg-base-200/50 border-t border-base-200">
                <div class="flex flex-col md:flex-row justify-between items-center gap-4">
                    <div class="text-sm text-base-content/70">
                        <span class="font-medium text-base-content/85"
                            >显示 {{ (page - 1) * pageSize + 1 }} 到 {{ Math.min(page * pageSize, total) }} 条，共
                            <span class="font-semibold">{{ total }}</span> 条</span
                        >
                    </div>
                    <div class="flex gap-2">
                        <button class="btn btn-sm btn-outline" :disabled="page <= 1" @click="handlePageChange(page - 1)">上一页</button>
                        <input v-model="page" type="number" min="1" :max="totalPages" class="input input-bordered input-sm w-20" />
                        <button class="btn btn-sm btn-outline" :disabled="page >= totalPages" @click="handlePageChange(page + 1)">
                            下一页
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <!-- 创建房间对话框 -->
        <Dialog v-model:open="createDialogOpen" title="创建房间">
            <template #content>
                <div class="space-y-4 py-4">
                    <div class="space-y-2">
                        <label class="text-sm font-medium text-base-content">房间名称</label>
                        <input
                            v-model="createForm.name"
                            type="text"
                            placeholder="房间名称"
                            class="input input-bordered w-full"
                            :disabled="formSubmitting"
                        />
                    </div>
                    <div class="space-y-2">
                        <label class="text-sm font-medium text-base-content">类型</label>
                        <input
                            v-model="createForm.type"
                            type="text"
                            placeholder="房间类型（可选）"
                            class="input input-bordered w-full"
                            :disabled="formSubmitting"
                        />
                    </div>
                    <div class="space-y-2">
                        <label class="text-sm font-medium text-base-content">最大用户数</label>
                        <input
                            v-model.number="createForm.maxUsers"
                            type="number"
                            min="1"
                            max="100"
                            class="input input-bordered w-full"
                            :disabled="formSubmitting"
                        />
                    </div>
                </div>
            </template>
            <template #actions>
                <button class="btn" :disabled="formSubmitting" @click="closeCreateDialog">取消</button>
                <button class="btn btn-primary" :disabled="formSubmitting" @click="submitCreate">
                    <span v-if="formSubmitting" class="loading loading-spinner loading-sm mr-2"></span>
                    创建
                </button>
            </template>
        </Dialog>

        <!-- 编辑房间对话框 -->
        <Dialog
            v-model:open="editDialogOpen"
            :title="editingRoom ? '编辑房间' : ''"
            :description="editingRoom ? `编辑房间: ${editingRoom.name}` : ''"
        >
            <template #content>
                <div class="space-y-4 py-4">
                    <div class="space-y-2">
                        <label class="text-sm font-medium text-base-content">房间名称</label>
                        <input
                            v-model="editForm.name"
                            type="text"
                            placeholder="房间名称"
                            class="input input-bordered w-full"
                            :disabled="formSubmitting"
                        />
                    </div>
                    <div class="space-y-2">
                        <label class="text-sm font-medium text-base-content">类型</label>
                        <input
                            v-model="editForm.type"
                            type="text"
                            placeholder="房间类型（可选）"
                            class="input input-bordered w-full"
                            :disabled="formSubmitting"
                        />
                    </div>
                    <div class="space-y-2">
                        <label class="text-sm font-medium text-base-content">最大用户数</label>
                        <input
                            v-model.number="editForm.maxUsers"
                            type="number"
                            min="1"
                            max="100"
                            class="input input-bordered w-full"
                            :disabled="formSubmitting"
                        />
                    </div>
                </div>
            </template>
            <template #actions>
                <button class="btn" :disabled="formSubmitting" @click="closeEditDialog">取消</button>
                <button class="btn btn-primary" :disabled="formSubmitting" @click="submitEdit">
                    <span v-if="formSubmitting" class="loading loading-spinner loading-sm mr-2"></span>
                    保存
                </button>
            </template>
        </Dialog>
    </div>
</template>
