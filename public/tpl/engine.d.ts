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
    /**
     * 显式克隆当前 Mat（深拷贝）
     * @returns 克隆后的 Mat
     */
    clone(): Mat
    /**
     * 裁剪图像区域并返回新的 Mat
     * @param x 起始 X 坐标
     * @param y 起始 Y 坐标
     * @param w 裁剪宽度
     * @param h 裁剪高度
     * @returns 裁剪后的 Mat
     */
    roi(x: number, y: number, w: number, h: number): Mat
    /**
     * 缩放图像并返回新的 Mat
     * @param w 目标宽度
     * @param h 目标高度
     * @param interpolation 插值方式（"nearest"|"linear"|"cubic"|"area"|"lanczos4" 或 OpenCV 常量值）
     * @returns 缩放后的 Mat
     */
    resize(w: number, h: number, interpolation?: "nearest" | "linear" | "cubic" | "area" | "lanczos4" | number): Mat
    /**
     * 获取指定坐标的像素值（BGR格式）
     * @param row 行索引
     * @param col 列索引
     * @returns [b, g, r] 数组
     */
    at_2d(row: number, col: number): [number, number, number]
    /**
     * 获取指定坐标的RGB颜色值
     * @param x X坐标
     * @param y Y坐标
     * @returns RGB颜色值（0xRRGGBB格式）
     */
    get_rgb(x: number, y: number): number
    /**
     * 获取指定坐标的RGB颜色字符串
     * @param x X坐标
     * @param y Y坐标
     * @returns RGB颜色字符串（#RRGGBB格式）
     */
    get_rgb_str(x: number, y: number): string
    /**
     * 获取指定坐标的HSL颜色值
     * @param x X坐标
     * @param y Y坐标
     * @returns [hue, saturation, luminance] 数组
     */
    get_hsl(x: number, y: number): [number, number, number]
    /**
     * 按指定方向查找符合条件的颜色
     * @param x 起始X坐标
     * @param y 起始Y坐标
     * @param max_length 最大查找像素数
     * @param color 目标颜色（0xRRGGBB格式）
     * @param tolerance 颜色容差（0-255）
     * @param direction 查找方向（"ltr"|"rtl"|"ttb"|"btt"）
     * @returns [x, y] 坐标或undefined
     */
    find_color(
        x: number,
        y: number,
        max_length: number,
        color: number,
        tolerance: number,
        direction: "ltr" | "rtl" | "ttb" | "btt"
    ): [number, number] | undefined
    /**
     * 按指定方向查找符合条件的亮度
     * @param x 起始X坐标
     * @param y 起始Y坐标
     * @param max_length 最大查找像素数
     * @param bright 目标亮度值
     * @param tolerance 亮度容差
     * @param operator 比较操作符（">"|"<"）
     * @param direction 查找方向（"ltr"|"rtl"|"ttb"|"btt"）
     * @returns [x, y] 坐标或undefined
     */
    find_bright(
        x: number,
        y: number,
        max_length: number,
        bright: number,
        tolerance: number,
        operator: ">" | "<",
        direction: "ltr" | "rtl" | "ttb" | "btt"
    ): [number, number] | undefined
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
 * 鼠标绝对移动后点击 (带缓动)
 * @param hwnd 窗口句柄(为0表示屏幕坐标)
 * @param x 目标X坐标
 * @param y 目标Y坐标
 * @param duration 移动持续时间（毫秒），默认0
 * @returns Promise<void>
 */
declare function moveC(hwnd: number, x: number, y: number, duration?: number): Promise<void>

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
 * 鼠标滚轮
 * @param hwnd 窗口句柄 (为0表示前台)
 * @param x X坐标（可选，前台模式下 >0 时会先移动到该坐标）
 * @param y Y坐标（可选，前台模式下 >0 时会先移动到该坐标）
 * @param delta 滚轮增量（常用 120 / -120）
 */
declare function wheel(hwnd?: number, x?: number, y?: number, delta?: number): void

/**
 * 按键操作（异步）
 * @param hwnd 窗口句柄 (为0表示前台)
 * @param key 按键名称
 * @param duration 按键持续时间
 */
declare function kb(hwnd: number, key: KeyEnum, duration?: number): Promise<void>

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
 * 设置脚本运行状态并推送到前端（按标题维护，可同时存在多条状态）
 * @param title 状态标题（必填）
 * @param payload 状态内容（可选）：传 Mat 显示单图，传 Mat[] 显示多图，传其他值显示文本
 * @param payloadText 附加文本（可选）：仅当 payload 为 Mat / Mat[] 时生效
 *
 * 规则：
 * - 相同 title 会更新已有状态
 * - 当 payload 为空时，表示删除该 title 对应状态
 */
declare function setStatus(title: string, payload?: string | number | boolean | Mat | Mat[], payloadText?: string | number | boolean): void

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
 * 检查当前进程是否以管理员权限运行
 * @returns true 表示管理员权限，false 表示非管理员权限
 */
declare function isElevated(): boolean

/**
 * 从窗口捕获图像Mat对象
 *
 * 注意：
 * - `capture*` 系列默认会复用内部 Mat 缓存（固定内存区域），以降低内存占用与 GC 压力；
 * - 连续调用后，之前返回的 Mat 内容可能被后一次捕获覆盖；
 * - 若需要同时处理/保留两帧及以上，请先对旧帧执行 `clone()` 再进行下一次捕获。
 * @param hwnd 窗口句柄
 * @param x ROI 左上角 X（可选，相对客户区）
 * @param y ROI 左上角 Y（可选，相对客户区）
 * @param w ROI 宽度（可选）
 * @param h ROI 高度（可选）
 * @param useWgc 是否使用 WGC 实现（可选，默认 false）
 * @returns Mat对象
 * @throws 捕获窗口失败时抛出错误
 */
declare function captureWindow(hwnd: number, x?: number, y?: number, w?: number, h?: number, useWgc?: boolean): Mat

/**
 * 从窗口捕获图像Mat对象（WGC优化版）
 *
 * 注意：
 * - 默认会复用内部 Mat 缓存（固定内存区域）；
 * - 连续调用后，之前返回的 Mat 内容可能被覆盖；
 * - 若需要同时处理/保留两帧及以上，请先 `clone()`。
 * @param hwnd 窗口句柄
 * @param x ROI 左上角 X（可选，相对客户区）
 * @param y ROI 左上角 Y（可选，相对客户区）
 * @param w ROI 宽度（可选）
 * @param h ROI 高度（可选）
 * @returns Mat对象
 * @throws 捕获窗口失败时抛出错误
 */
declare function captureWindowWGC(hwnd: number, x?: number, y?: number, w?: number, h?: number): Mat

/**
 * 从文件加载模板Mat对象(有缓存)
 * @param path 模板路径
 * @returns Mat对象
 * @throws 加载模板失败时抛出错误
 */
declare function getTemplate(path: string): Mat

/**
 * 从 base64 字符串加载模板Mat对象
 * @param b64Str base64 编码的图片字符串
 * @returns Mat对象
 * @throws 加载模板失败时抛出错误
 */
declare function getTemplateB64(b64Str: string): Mat

/**
 * 从文件加载模板Mat对象
 * @param path 模板路径
 * @returns Mat对象
 * @throws 加载模板失败时抛出错误
 */
declare function imread(path: string): Mat

/**
 * 从文件加载模板Mat对象，并返回RGBA通道
 * @param path 模板路径
 * @returns Mat对象
 * @throws 加载模板失败时抛出错误
 */
declare function imreadRgba(path: string): Mat

/**
 * 从本地或网络加载图像Mat对象，并返回RGBA通道
 * @param localPath 本地保存路径（可选，为空时不保存）
 * @param url 网络资源URL
 * @returns Mat对象
 * @throws 加载模板失败时抛出错误
 */
declare function imreadUrlRgba(localPath: string, url: string): Mat

/**
 * 从本地或网络加载图像Mat对象
 * 如果 local_path 不为空，先尝试从本地路径加载，失败则从网络下载并保存到本地
 * 如果 local_path 为空，直接从网络加载不保存到本地
 * @param localPath 本地保存路径（可选，为空时不保存）
 * @param url 网络资源URL
 * @returns Mat对象
 * @throws 加载模板失败时抛出错误
 */
declare function imreadUrl(localPath: string, url: string): Mat

/**
 * 初始化 OCR 模块（自动下载缺失资源到本地）。
 * @param localRootDir 本地资源目录（可选，默认使用程序数据目录）
 * @param cdnBaseUrl CDN 根地址（可选，默认 https://cdn.dna-builder.cn/ocr）
 * @param numThread 识别线程数（可选，默认 2）
 * @returns 实际使用的本地资源目录
 * @throws 初始化失败时抛出错误
 */
declare function initOcr(localRootDir?: string, cdnBaseUrl?: string, numThread?: number): string

/**
 * OCR 文字识别（输入 Mat，返回文本）。
 * @param imgMat 图像 Mat（支持 1/3/4 通道）
 * @returns 识别文本（失败或无结果时可能为空字符串）
 * @throws OCR 未初始化或识别失败时抛出错误
 */
declare function ocrText(imgMat: Mat): string

/**
 * 保存Mat对象到文件
 * @param path 保存路径
 * @param imgMat 图像Mat对象
 * @returns 是否成功
 */
declare function imwrite(path: string, imgMat: Mat): boolean

/**
 * 复制Mat对象到剪贴板
 * @param imgMat 图像Mat对象
 * @returns 是否成功
 */
declare function copyImage(imgMat: Mat): boolean

/**
 * 显示图片（异步、非阻塞刷新）
 * @param title 窗口标题
 * @param imgMat 图像Mat对象
 * @param waitKeyMs 可选延迟（毫秒），仅影响 Promise resolve 时间，不阻塞其他窗口刷新
 *
 * 说明：
 * - 相同 title 重复调用会实时更新同一窗口图像
 * - 不同 title 可同时显示多张图像
 */
declare function imshow(title: string, imgMat: Mat, waitKeyMs?: number): Promise<void>

/**
 * 交互式选择图像 ROI（异步）
 * @param title 窗口标题
 * @param imgMat 图像Mat对象
 * @param showCrosshair 是否显示十字光标，默认 true
 * @param fromCenter 是否从中心开始框选，默认 false
 * @param printNotice 是否在控制台打印操作提示，默认 true
 * @returns 选区 [x, y, w, h]，取消选择返回 undefined
 */
declare function selectroi(
    title: string,
    imgMat: Mat,
    showCrosshair?: boolean,
    fromCenter?: boolean,
    printNotice?: boolean
): Promise<[number, number, number, number] | undefined>

/**
 * 颜色和模板匹配（使用两个Mat对象）
 * @param imgMat 图像Mat对象
 * @param templateMat 模板Mat对象
 * @param color 颜色值
 * @param tolerance 容差
 * @returns 匹配结果 [x, y] 或 undefined
 */
declare function findColorAndMatchTemplate(
    imgMat: Mat,
    templateMat: Mat,
    color: number,
    tolerance: number
): Promise<[number, number] | undefined>

/**
 * 模板匹配（使用两个Mat对象，自动检测是否带透明度）
 * @param imgMat 图像Mat对象（BGR格式）
 * @param templateMat 模板Mat对象（BGR或BGRA格式，BGRA格式会自动使用alpha通道作为权重）
 * @param tolerance 匹配置信度阈值
 * @returns 匹配结果 [x, y] 或 undefined
 */
declare function matchTemplate(imgMat: Mat, templateMat: Mat, tolerance: number): Promise<[number, number] | undefined>

/**
 * 色键过滤并返回灰度二值图
 * @param mat 源图像 Mat
 * @param colors 色键数组（例如 [0xffffff, 0xff0000]）
 * @param tolerance 颜色容差（0-255）
 * @returns 灰度二值图 Mat（命中为255，未命中为0）
 */
declare function colorFilter(mat: Mat, colors: number[], tolerance: number): Mat

/**
 * 使用 HSL 加权差进行色键过滤并返回灰度二值图
 * @param mat 源图像 Mat
 * @param colors 色键数组（例如 [0xffffff, 0xff0000]）
 * @param tolerance HSL 加权差容差，公式：abs(h1-h2) + abs(s1-s2)*180 + abs(l1-l2)*75
 * @returns 灰度二值图 Mat（命中为255，未命中为0）
 */
declare function colorFilterHSL(mat: Mat, colors: number[], tolerance: number): Mat

/**
 * 色键匹配，返回匹配像素 mean 最大的颜色索引
 * @param mat 源图像 Mat
 * @param colors 色键数组（例如 [0xffffff, 0xff0000]）
 * @param minMean 最小 mean 阈值（0-255），低于该值返回 -1，默认 0
 * @param tolerance 颜色容差（0-255），默认 0
 * @returns 命中的最佳索引；未命中返回 -1
 */
declare function colorKeyMatch(mat: Mat, colors: number[], minMean?: number, tolerance?: number): number

/**
 * 批量模板匹配（并行）
 * @param src 源图像 Mat
 * @param tpls 模板 Mat 数组
 * @param cap 匹配置信度阈值（0-1）
 * @returns 首个命中结果 { pos: [x, y], index } 或 undefined
 */
declare function batchMatchColor(src: Mat, tpls: Mat[], cap: number): { pos: [number, number]; index: number } | undefined

/**
 * ORB 特征比较，返回优质匹配数量
 * @param img1 参考图像 Mat
 * @param img2 待比较图像 Mat
 * @returns 优质匹配数量
 */
declare function orbMatchCount(img1: Mat, img2: Mat): number

/**
 * SIFT 匹配定位，返回 img2 在 img1 中的坐标尺寸信息
 * @param img1 大图/场景图 Mat
 * @param img2 小图/模板图 Mat
 * @returns 定位结果或 undefined
 */
declare function siftLocate(
    img1: Mat,
    img2: Mat
):
    | {
          pos: [number, number]
          size: [number, number]
          bbox: [number, number, number, number]
          goodMatches: number
          inliers: number
          corners: [number, number][]
      }
    | undefined

/**
 * 计算图像感知哈希（pHash）
 * @param imgMat 图像 Mat
 * @param color 是否启用彩色哈希（true 时按 B/G/R 三通道拼接，false 时灰度哈希），默认 false
 * @returns 十六进制哈希字符串（灰度 16 字符，彩色 48 字符）
 */
declare function perceptualHash(imgMat: Mat, color?: boolean): string

/**
 * 计算图像 ORB 特征哈希
 * @param imgMat 图像 Mat
 * @returns 十六进制哈希字符串（固定 64 字符）
 */
declare function orbFeatureHash(imgMat: Mat): string

/**
 * 预测图像旋转角度（适用于罗盘/圆盘类方向识别）
 * @param imgMat 图像 Mat（BGR 三通道）
 * @returns 角度（0-359）
 */
declare function predictRotation(imgMat: Mat): number

/**
 * 比较源哈希与模板哈希数组的汉明距离，返回匹配索引
 * @param sourceHash 源图像哈希（十六进制字符串）
 * @param templateHashes 模板哈希数组（十六进制字符串数组）
 * @param maxDistance 最大允许汉明距离（默认 0，表示精确匹配）
 * @returns 匹配索引；未匹配返回 -1
 */
declare function matchHammingHash(sourceHash: string, templateHashes: string[], maxDistance?: number): number

/**
 * 比较 ORB 哈希与模板哈希数组，返回匹配索引
 * @param sourceHash 源图像 ORB 哈希（十六进制字符串，固定 64 字符）
 * @param templateHashes 模板 ORB 哈希数组（十六进制字符串数组）
 * @param maxDistance 最大允许汉明距离（默认 0，表示精确匹配）
 * @returns 匹配索引；未匹配返回 -1
 */
declare function matchOrbHash(sourceHash: string, templateHashes: string[], maxDistance?: number): number

/**
 * 形态学图像处理
 * @param imgMat 图像 Mat
 * @param op 操作类型（"erode"|"dilate"|"open"|"close"|"gradient"|"tophat"|"blackhat"|"hitmiss" 或 OpenCV 常量值）
 * @param kernelSize 核大小（会自动修正为正奇数），默认 3
 * @param iterations 迭代次数，默认 1
 * @param shape 核形状（"rect"|"cross"|"ellipse" 或 OpenCV 常量值），默认 "rect"
 * @returns 处理后的 Mat
 */
declare function morphologyEx(
    imgMat: Mat,
    op?: "erode" | "dilate" | "open" | "close" | "gradient" | "tophat" | "blackhat" | "hitmiss" | number,
    kernelSize?: number,
    iterations?: number,
    shape?: "rect" | "cross" | "ellipse" | number
): Mat

/**
 * 轮廓提取
 * @param imgMat 图像Mat对象（建议传入二值图，如 colorFilter 返回结果）
 * @param minArea 最小面积过滤（默认0）
 * @param mode 检索模式（"external"|"list"|"ccomp"|"tree"|"floodfill" 或 OpenCV 常量值）
 * @param method 轮廓逼近（"none"|"simple"|"tc89l1"|"tc89kcos" 或 OpenCV 常量值）
 * @returns 轮廓列表
 */
declare function findContours(
    imgMat: Mat,
    minArea?: number,
    mode?: "external" | "list" | "ccomp" | "tree" | "floodfill" | number,
    method?: "none" | "simple" | "tc89l1" | "tc89kcos" | number
): {
    area: number
    bbox: [number, number, number, number]
    center: [number, number]
}[]

/**
 * 基于灰度图与横向空隙检测的单行文本字符分割
 * @param imgMat 输入图像 Mat（建议灰度图；彩色会自动转灰度）
 * @param minGapWidth 最小分割空隙宽度（像素列，默认 2）
 * @param minCharWidth 最小字符宽度（像素，默认 2）
 * @returns 字符 bbox 数组，格式为 [[x, y, w, h], ...]
 */
declare function segmentChars(imgMat: Mat, minGapWidth?: number, minCharWidth?: number): [number, number, number, number][]

/**
 * 轮廓绘制（返回绘制后的 BGR 图像）
 * @param imgMat 输入图像 Mat
 * @param bboxes 外接框数组，元素可为 [x,y,w,h] 或 { bbox: [x,y,w,h] }
 * @param color 轮廓颜色（RGB，默认 0x00FF00）
 * @param thickness 线宽（默认 1）
 * @returns 绘制后的 Mat（BGR 三通道）
 */
declare function drawContours(
    imgMat: Mat,
    bboxes: ([number, number, number, number] | { bbox: [number, number, number, number] })[],
    color?: number,
    thickness?: number
): Mat

/**
 * 轮廓绘制（内部会先做 findContours 再绘制）
 * @param imgMat 输入图像 Mat
 * @param minArea 最小面积过滤（默认0）
 * @param mode 检索模式（"external"|"list"|"ccomp"|"tree"|"floodfill" 或 OpenCV 常量值）
 * @param method 轮廓逼近（"none"|"simple"|"tc89l1"|"tc89kcos" 或 OpenCV 常量值）
 * @param color 轮廓颜色（RGB，默认 0x00FF00）
 * @param thickness 线宽（默认 1）
 * @returns 绘制后的 Mat（BGR 三通道）
 */
declare function drawContours(
    imgMat: Mat,
    minArea?: number,
    mode?: "external" | "list" | "ccomp" | "tree" | "floodfill" | number,
    method?: "none" | "simple" | "tc89l1" | "tc89kcos" | number,
    color?: number,
    thickness?: number
): Mat

/**
 * 绘制边框
 * @param hwnd 窗口句柄
 * @param x 左上角X坐标（相对窗口客户区）
 * @param y 左上角Y坐标（相对窗口客户区）
 * @param w 边框宽度
 * @param h 边框高度
 */
declare function drawBorder(hwnd: number, x: number, y: number, w: number, h: number): void

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
 * 等待窗口指定坐标颜色达到条件（异步）
 * @param hwnd 窗口句柄
 * @param x X坐标（窗口客户区）
 * @param y Y坐标（窗口客户区）
 * @param color 目标颜色（0xRRGGBB）
 * @param tolerance 容差（正数=等待符合，负数=等待不符合，按绝对值参与比较）
 * @param timeout 超时时间（毫秒），默认 20000
 * @returns 命中条件返回 true，超时返回 false
 */
declare function waitColor(hwnd: number, x: number, y: number, color: number, tolerance: number, timeout?: number): Promise<boolean>

type ScriptConfigBaseType = "number" | "string" | "boolean" | "bool" | "select" | "multi-select"
type ScriptConfigStringFormat = ScriptConfigBaseType | `select:${string}` | `multi-select:${string}`
type ScriptConfigObjectFormat =
    | {
          type: "number"
      }
    | {
          type: "string"
      }
    | {
          type: "boolean" | "bool"
      }
    | {
          type: "select"
          options?: readonly string[]
      }
    | {
          type: "multi-select"
          options?: readonly string[]
      }
type ScriptConfigFormat = ScriptConfigStringFormat | ScriptConfigObjectFormat | readonly string[]

type ScriptConfigValueByType<T extends string> = T extends "number"
    ? number
    : T extends "boolean" | "bool"
      ? boolean
      : T extends "multi-select" | `multi-select:${string}`
        ? string[]
        : T extends "select" | `select:${string}`
          ? string
          : T extends "string"
            ? string
            : string

type ScriptConfigValueByFormat<F extends ScriptConfigFormat> = F extends readonly string[]
    ? string
    : F extends {
            type: infer T extends string
        }
      ? ScriptConfigValueByType<T>
      : F extends string
        ? ScriptConfigValueByType<F>
        : string

/**
 * 读取脚本配置项（会触发前端创建/更新配置 UI）
 * @param name 配置名（唯一键）
 * @param desc 配置描述
 * @param format 配置格式（number/string/select/multi-select/boolean）
 * @param defaultValue 默认值
 * @remarks 配置项按“脚本文件”做作用域隔离，不同文件互不影响
 * @returns 当前配置值（优先返回前端持久化值，返回类型由 format 精确推断）
 */
declare function readConfig<F extends ScriptConfigFormat>(
    name: string,
    desc: string,
    format: F,
    defaultValue?: ScriptConfigValueByFormat<F>
): ScriptConfigValueByFormat<F>

/**
 * 设置程序音量
 * @param programName 程序名
 * @param volume 音量值（0.0-1.0）
 */
declare function setProgramVolume(programName: string, volume: number): void

/**
 * 双图深度预测结果
 */
interface PredictDepthResult {
    /** 深度图（8位视差图，0 表示不可计算区域） */
    depth: Mat
    /** 障碍物掩码（0 表示可通行，255 表示障碍） */
    obstacleMask: Mat
    /** 可能的路径方向候选坐标（按“更深 + 面积更大”优先） */
    directions: [number, number][]
}

/**
 * 双图深度预测（并返回路径方向候选）
 * @param leftImage 左图（第一次截图）
 * @param rightImage 右图（移动后的第二次截图）
 * @param numDisp 视差搜索范围（必须是16的倍数，如160，默认160）
 * @param blockSize 匹配块大小（3-7，默认5）
 * @param minRegionArea 有效连通区域最小面积（像素，默认800）
 * @param maxCandidates 最多返回的方向候选数量（默认3）
 * @returns 深度图、障碍掩码和方向候选点
 */
declare function predictDepth(
    leftImage: Mat,
    rightImage: Mat,
    numDisp?: number,
    blockSize?: number,
    minRegionArea?: number,
    maxCandidates?: number
): PredictDepthResult
