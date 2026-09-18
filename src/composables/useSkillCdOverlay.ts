import { computed, onMounted, onUnmounted, ref } from "vue"
import { floatWindowDisable, floatWindowSet, floatWindowState, floatWindowTrigger } from "@/api/app"
import { env } from "@/env"
import { useSettingStore } from "@/store/setting"
import { useUIStore } from "@/store/ui"
import {
    buildFloatWindowConfig,
    createKeyBinding,
    type FloatWindowKeyBinding,
    type FloatWindowState,
    SKILL_CD_DEFAULT_VK,
    SKILL_CD_MAX_KEYS,
} from "@/utils/skill-cd-overlay"
import { vkLabel } from "@/utils/virtual-key"

/** 新增绑定时的候选键位:优先技能键(Q/R/F/V/Tab/Space/1~4),其余铺满字母与数字。 */
const NEW_KEY_CANDIDATES = [
    0x51,
    0x52,
    0x46,
    0x56,
    0x09,
    0x20,
    0x31,
    0x32,
    0x33,
    0x34,
    ...Array.from({ length: 26 }, (_, index) => 0x41 + index),
    ...Array.from({ length: 10 }, (_, index) => 0x30 + index),
]

/** 设置改动下发到后端的防抖时长(拖拽数值时避免每次指针移动都跨进程调用)。 */
const APPLY_DEBOUNCE_MS = 90
/** 状态轮询间隔:用于刷新游戏客户区尺寸、运行状态与计时器预览。 */
const STATE_POLL_MS = 700

/**
 * 用当前持久化设置组装后端浮窗配置(归一化按键绑定并写回持久化对象)。
 * @returns 后端配置载荷
 */
function buildConfigFromSetting() {
    const setting = useSettingStore()
    // 持久化对象本身就是一份设置片段,直接交给组装函数去挑字段;
    // 只有按键绑定需要额外走一次归一化(并写回),避免后端拿到脏数据。
    return buildFloatWindowConfig({
        ...setting.skillCdOverlay,
        keys: setting.ensureSkillCdOverlayKeys(),
    })
}

/**
 * 应用启动时恢复浮窗:后端浮窗不会随应用自启,若上次是开启状态就按持久化设置
 * 重新拉起,避免"必须先去设置页点一下才生效"。未开启时不产生任何调用。
 */
export async function restoreSkillCdOverlay() {
    if (!env.isApp) return
    const setting = useSettingStore()
    if (!setting.skillCdOverlay.enabled) return
    try {
        const state = await floatWindowSet(buildConfigFromSetting())
        setting.skillCdOverlayRunning = state.enabled
    } catch (cause) {
        setting.skillCdOverlayRunning = false
        console.error("恢复技能 CD 浮窗失败", cause)
    }
}

/**
 * 技能 CD 倒计时浮窗的设置侧逻辑。
 *
 * 统一负责三件事:
 * - 把持久化设置组装成后端配置,并在设置变化时**实时下发**(防抖,拖拽数值也即时生效);
 * - 轮询后端状态,拿到游戏窗口客户区尺寸、解析后的坐标与计时器快照(供页面预览);
 * - 按键绑定的增删改与"试触发"(不用开游戏也能看到浮窗倒计时)。
 * @returns 状态与操作函数
 */
export function useSkillCdOverlay() {
    const setting = useSettingStore()
    const ui = useUIStore()
    /** 后端最近一次状态快照。 */
    const state = ref<FloatWindowState | null>(null)
    /** 正在下发配置。 */
    const busy = ref(false)
    /** 最近一次错误信息。 */
    const error = ref("")
    /** 是否已定位到游戏窗口。 */
    const gameFound = computed(() => Boolean(state.value?.gameFound))
    /** 游戏窗口客户区尺寸(未检测到游戏时返回空,由调用方兜底)。 */
    const clientSize = computed(() => ({
        width: state.value?.clientWidth ?? 0,
        height: state.value?.clientHeight ?? 0,
    }))
    /** 浮窗当前像素尺寸(未渲染过为 0)。 */
    const overlaySize = computed(() => ({
        width: state.value?.windowWidth ?? 0,
        height: state.value?.windowHeight ?? 0,
    }))

    let applyTimer: number | null = null
    let pollTimer: number | null = null

    /**
     * 组装后端浮窗配置(顺带归一化按键绑定并写回本地存储)。
     * @returns 后端配置载荷
     */
    function buildConfig() {
        return buildConfigFromSetting()
    }

    /**
     * 记录错误并提示用户。
     * @param cause 抛出的异常
     */
    function handleError(cause: unknown) {
        error.value = cause instanceof Error ? cause.message : String(cause)
        ui.showErrorMessage(error.value)
    }

    /**
     * 立即把当前设置下发到后端浮窗(启用 = 启动或更新;停用 = 关闭)。
     * @param enabled 目标启停状态;缺省取 store 中的总开关
     */
    async function applyImmediate(enabled = setting.skillCdOverlay.enabled) {
        if (!env.isApp) return
        busy.value = true
        error.value = ""
        try {
            if (enabled) {
                state.value = await floatWindowSet(buildConfig())
                setting.skillCdOverlayRunning = state.value.enabled
            } else {
                await floatWindowDisable()
                setting.skillCdOverlayRunning = false
                await refreshState()
            }
        } catch (cause) {
            setting.skillCdOverlay.enabled = false
            setting.skillCdOverlayRunning = false
            handleError(cause)
        } finally {
            busy.value = false
        }
    }

    /**
     * 防抖下发:连续改动(拖拽、连点)只会在停顿后触发一次跨进程调用。
     * 浮窗已关闭时不产生任何调用。
     */
    function scheduleApply() {
        if (!env.isApp || !setting.skillCdOverlay.enabled) return
        if (applyTimer !== null) window.clearTimeout(applyTimer)
        applyTimer = window.setTimeout(() => {
            applyTimer = null
            void applyImmediate(true)
        }, APPLY_DEBOUNCE_MS)
    }

    /**
     * 切换总开关并立即生效。
     * @param enabled 新的开关值
     */
    async function setEnabled(enabled: boolean) {
        setting.skillCdOverlay.enabled = enabled
        if (applyTimer !== null) {
            window.clearTimeout(applyTimer)
            applyTimer = null
        }
        await applyImmediate(enabled)
    }

    /**
     * 拉取一次后端状态快照。
     */
    async function refreshState() {
        if (!env.isApp) return
        try {
            state.value = await floatWindowState()
            setting.skillCdOverlayRunning = state.value.enabled
        } catch (cause) {
            handleError(cause)
        }
    }

    /**
     * 供预览使用:让后端按指定绑定触发一次倒计时(等同于游戏里按下该键)。
     * @param binding 按键绑定
     */
    async function previewTrigger(binding: FloatWindowKeyBinding) {
        if (!env.isApp || !setting.skillCdOverlay.enabled) return
        try {
            state.value = await floatWindowTrigger(binding.id, binding.label || vkLabel(binding.vk), binding.cdSeconds)
        } catch (cause) {
            handleError(cause)
        }
    }

    /**
     * 新增一条按键绑定:优先挑选未被占用的字母/数字键;极少数"候选键位全部占用"的情况
     * 会补一条待绑定的禁用占位行(标签为「未设置」),由用户自行捕获键位后启用。
     * @returns 新绑定;已达上限时返回 null
     */
    function addKey(): FloatWindowKeyBinding | null {
        if (setting.skillCdOverlay.keys.length >= SKILL_CD_MAX_KEYS) return null
        const used = new Set(setting.skillCdOverlay.keys.map(key => key.vk))
        const candidate = NEW_KEY_CANDIDATES.find(vk => !used.has(vk))
        const binding =
            candidate === undefined
                ? createKeyBinding({ vk: SKILL_CD_DEFAULT_VK, label: "未设置", enabled: false })
                : createKeyBinding({ vk: candidate })
        setting.skillCdOverlay.keys = [...setting.skillCdOverlay.keys, binding]
        scheduleApply()
        return binding
    }

    /**
     * 删除一条按键绑定。
     * @param id 绑定 id
     */
    function removeKey(id: string) {
        setting.skillCdOverlay.keys = setting.skillCdOverlay.keys.filter(key => key.id !== id)
        scheduleApply()
    }

    /**
     * 局部更新一条按键绑定。
     * @param id 绑定 id
     * @param patch 要覆盖的字段
     */
    function updateKey(id: string, patch: Partial<FloatWindowKeyBinding>) {
        setting.skillCdOverlay.keys = setting.skillCdOverlay.keys.map(key => (key.id === id ? { ...key, ...patch } : key))
        scheduleApply()
    }

    /**
     * 给绑定指定新的触发键(捕获键盘后调用);自动补一个可读标签。
     * @param id 绑定 id
     * @param vk 新的虚拟键码
     * @returns 出错原因;成功返回空字符串
     */
    function assignKey(id: string, vk: number): string {
        const conflict = setting.skillCdOverlay.keys.find(key => key.id !== id && key.vk === vk && key.enabled)
        if (conflict) return `该按键已被「${conflict.label || vkLabel(vk)}」占用`
        updateKey(id, { vk, label: vkLabel(vk) })
        return ""
    }

    onMounted(() => {
        // 首次进入页面时归一化存储里的绑定(空列表会补一条默认 E 键),保证列表可编辑
        setting.ensureSkillCdOverlayKeys()
        void (async () => {
            await refreshState()
            if (setting.skillCdOverlay.enabled && !state.value?.enabled) {
                await applyImmediate(true)
            }
        })()
        if (env.isApp) {
            pollTimer = window.setInterval(() => void refreshState(), STATE_POLL_MS)
        }
    })

    onUnmounted(() => {
        if (applyTimer !== null) {
            window.clearTimeout(applyTimer)
            applyTimer = null
        }
        if (pollTimer !== null) {
            window.clearInterval(pollTimer)
            pollTimer = null
        }
    })

    return {
        state,
        busy,
        error,
        gameFound,
        clientSize,
        overlaySize,
        applyImmediate,
        scheduleApply,
        setEnabled,
        refreshState,
        previewTrigger,
        addKey,
        removeKey,
        updateKey,
        assignKey,
    }
}
