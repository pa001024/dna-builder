/**
 * 自动化脚本类型定义
 */

type KeyEnum =
    | "a"
    | "b"
    | "c"
    | "d"
    | "e"
    | "f"
    | "g"
    | "h"
    | "i"
    | "j"
    | "k"
    | "l"
    | "m"
    | "n"
    | "o"
    | "p"
    | "q"
    | "r"
    | "s"
    | "t"
    | "u"
    | "v"
    | "w"
    | "x"
    | "y"
    | "z"
    | "0"
    | "1"
    | "2"
    | "3"
    | "4"
    | "5"
    | "6"
    | "7"
    | "8"
    | "9"
    | "space"
    | "enter"
    | "backspace"
    | "esc"
    | "escape"
    | "left"
    | "up"
    | "right"
    | "down"
    | "shift"
    | "lshift"
    | "rshift"
    | "ctrl"
    | "lctrl"
    | "rctrl"
    | "alt"
    | "lalt"
    | "ralt"
    | "tab"
    | "capslock"
    | "numlock"
    | "scrolllock"
    | "printscreen"
    | "insert"
    | "del"
    | "delete"
    | "home"
    | "end"
    | "pageup"
    | "pagedown"
    | "f1"
    | "f2"
    | "f3"
    | "f4"
    | "f5"
    | "f6"
    | "f7"
    | "f8"
    | "f9"
    | "f10"
    | "f11"
    | "f12"
    | "lwin"
    | "rwin"
    | "apps"
    | "media_next_track"
    | "media_prev_track"
    | "media_play_pause"
    | "media_stop"
    | "volume_mute"
    | "volume_down"
    | "volume_up"
    | "media_select"
    | "browser_back"
    | "browser_forward"
    | "browser_refresh"
    | "browser_stop"
    | "browser_search"
    | "browser_favorites"
    | "browser_home"
    | "launch_mail"
    | "launch_media_select"
    | "launch_app1"
    | "launch_app2"

interface Mat {
    /** 矩阵行数 */
    rows(): number
    /** 矩阵列数 */
    cols(): number
}

/** 高精度计时器 */
declare class Timer {
    /** 重置定时器 */
    reset(): void
    /**
     * 等待指定时间（异步）
     * @param ms 延迟（毫秒）
     */
    sleep(ms: number): Promise<void>
    /**
     * 等待到指定时间（异步）
     * @param ms 相对时间（毫秒）
     */
    sleepUntil(ms: number): Promise<void>
    /**
     * 获取已过去时间（毫秒）
     */
    elapsed(): number
}

/**
 * 鼠标点击操作
 * @param hwnd 窗口句柄 (为0表示前台)
 * @param x X坐标
 * @param y Y坐标
 */
declare function mc(hwnd?: number, x?: number, y?: number): void

/**
 * 鼠标相对移动
 * @param x X坐标
 * @param y Y坐标
 */
declare function mm(x: number, y: number): void

/**
 * 鼠标绝对移动（带缓动，异步）
 * @param hwnd 窗口句柄(为0表示屏幕坐标)
 * @param x 目标X坐标
 * @param y 目标Y坐标
 * @param duration 移动持续时间（毫秒），默认0
 * @returns Promise<void>
 */
declare function moveTo(hwnd: number, x: number, y: number, duration?: number): Promise<void>

/**
 * 鼠标按下
 * @param hwnd 窗口句柄 (为0表示前台)
 * @param x X坐标
 * @param y Y坐标
 */
declare function md(hwnd?: number, x?: number, y?: number): void

/**
 * 鼠标抬起
 * @param hwnd 窗口句柄 (为0表示前台)
 * @param x X坐标
 * @param y Y坐标
 */
declare function mu(hwnd?: number, x?: number, y?: number): void

/**
 * 鼠标中键点击
 * @param hwnd 窗口句柄 (为0表示前台)
 * @param x X坐标
 * @param y Y坐标
 */
declare function mt(hwnd?: number, x?: number, y?: number): void

/**
 * 按键操作
 * @param hwnd 窗口句柄 (为0表示前台)
 * @param key 按键名称
 * @param duration 按键持续时间
 */
declare function kb(hwnd: number, key: KeyEnum, duration?: number): void

/**
 * 按键按下状态
 * @param hwnd 窗口句柄 (为0表示前台)
 * @param key 按键名称
 */
declare function kd(hwnd: number, key: KeyEnum): void

/**
 * 按键抬起状态
 * @param hwnd 窗口句柄 (为0表示前台)
 * @param key 按键名称
 */
declare function ku(hwnd: number, key: KeyEnum): void

/**
 * 延迟等待（同步）
 * @param ms 毫秒数
 */
declare function s(ms: number): void

/**
 * 延迟等待（异步）
 * @param ms 毫秒数
 */
declare function sleep(ms: number): Promise<void>

/**
 * 复制文本到剪贴板
 * @param text 要复制的文本
 */
declare function copyText(text: string): void

/**
 * 从剪贴板粘贴文本
 * @returns 剪贴板中的文本或undefined
 */
declare function pasteText(): string | undefined

/**
 * 根据窗口标题查找窗口句柄
 * @param title 窗口标题
 * @returns 窗口句柄或0
 */
declare function findWindow(title: string): number

/**
 * 根据进程名获取窗口句柄
 * @param process_name 进程名
 * @returns 窗口句柄或0
 */
declare function getWindowByProcessName(process_name: string): number

/**
 * 设置前台窗口
 * @param hwnd 窗口句柄
 */
declare function setForegroundWindow(hwnd: number): void

/**
 * 检查窗口大小 如果不为1600*900 则设置为1600*900
 * @param hwnd 窗口句柄
 * @returns 是否成功
 */
declare function checkSize(hwnd: number): boolean

/**
 * 移动窗口并设置大小
 * @param hwnd 窗口句柄
 * @param x X坐标
 * @param y Y坐标
 * @param w 窗口宽度 可选
 * @param h 窗口高度 可选
 * @returns 是否成功
 */
declare function moveWindow(hwnd: number, x: number, y: number, w?: number, h?: number): boolean

/**
 * 获取前台窗口句柄
 * @returns 窗口句柄
 */
declare function getForegroundWindow(): number

/**
 * 从窗口捕获图像Mat对象
 * @param hwnd 窗口句柄
 * @returns Mat对象或undefined
 */
declare function captureWindow(hwnd: number): Mat | undefined

/**
 * 从窗口捕获图像Mat对象（WGC优化版）
 * @param hwnd 窗口句柄
 * @returns Mat对象或undefined
 */
declare function captureWindowWGC(hwnd: number): Mat | undefined

/**
 * 从文件加载模板Mat对象(有缓存)
 * @param path 模板路径
 * @returns Mat对象或undefined
 */
declare function getTemplate(path: string): Mat | undefined

/**
 * 从 base64 字符串加载模板Mat对象(有缓存)
 * @param b64Str base64 编码的图片字符串
 * @returns Mat对象或undefined
 */
declare function getTemplateB64(b64Str: string): Mat | undefined

/**
 * 从文件加载模板Mat对象(无缓存)
 * @param path 模板路径
 * @returns Mat对象或undefined
 */
declare function imread(path: string): Mat | undefined

/**
 * 保存Mat对象到文件
 * @param imgMat 图像Mat对象
 * @param path 保存路径
 * @returns 是否成功
 */
declare function imwrite(imgMat: Mat, path: string): boolean

/**
 * 复制Mat对象到剪贴板
 * @param imgMat 图像Mat对象
 * @returns 是否成功
 */
declare function copyImage(imgMat: Mat): boolean

/**
 * 从本地或网络加载图像Mat对象
 * 如果 local_path 不为空，先尝试从本地路径加载，失败则从网络下载并保存到本地
 * 如果 local_path 为空，直接从网络加载不保存到本地
 * @param localPath 本地保存路径（可选，为空时不保存）
 * @param url 网络资源URL
 * @returns Mat对象或undefined
 */
declare function imreadUrl(localPath: string, url: string): Mat | undefined

/**
 * 显示图片 (异步)
 * @param title 窗口标题
 * @param imgMat 图像Mat对象
 * @param waitKeyMs 等待按键时间（毫秒），默认0 无限等待
 */
declare function imshow(title: string, imgMat: Mat, waitKeyMs?: number): Promise<void>

/**
 * 颜色和模板匹配（使用两个Mat对象）
 * @param imgMat 图像Mat对象
 * @param templateMat 模板Mat对象
 * @param color 颜色值
 * @param tolerance 容差
 * @returns 匹配结果 [x, y] 或 undefined
 */
declare function findColorAndMatchTemplate(imgMat: Mat, templateMat: Mat, color: number, tolerance: number): [number, number] | undefined

/**
 * 模板匹配（使用两个Mat对象，自动检测是否带透明度）
 * @param imgMat 图像Mat对象（BGR格式）
 * @param templateMat 模板Mat对象（BGR或BGRA格式，BGRA格式会自动使用alpha通道作为权重）
 * @param tolerance 匹配置信度阈值
 * @returns 匹配结果 [x, y] 或 undefined
 */
declare function matchTemplate(imgMat: Mat, templateMat: Mat, tolerance: number): [number, number] | undefined

/**
 * 绘制边框
 * @param hwnd 窗口句柄
 * @param left 左边界
 * @param top 上边界
 * @param right 右边界
 * @param bottom 下边界
 */
declare function drawBorder(hwnd: number, left: number, top: number, right: number, bottom: number): void

/**
 * 检查颜色矩阵（使用Mat对象）
 * @param imgMat 图像Mat对象
 * @param x X坐标
 * @param y Y坐标
 * @param color 颜色值
 * @param tolerance 容差
 * @returns 检查结果
 */
declare function cc(imgMat: Mat, x: number, y: number, color: number, tolerance: number): boolean

/**
 * 设置程序音量
 * @param programName 程序名
 * @param volume 音量值（0.0-1.0）
 */
declare function setProgramVolume(programName: string, volume: number): void
