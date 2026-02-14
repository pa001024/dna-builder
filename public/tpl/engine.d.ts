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
     * @returns [b, g, r] 数组或undefined
     */
    at_2d(row: number, col: number): [number, number, number] | undefined
    /**
     * 获取指定坐标的RGB颜色值
     * @param x X坐标
     * @param y Y坐标
     * @returns RGB颜色值（0xRRGGBB格式）或undefined
     */
    get_rgb(x: number, y: number): number | undefined
    /**
     * 获取指定坐标的HSL颜色值
     * @param x X坐标
     * @param y Y坐标
     * @returns [hue, saturation, luminance] 数组或undefined
     */
    get_hsl(x: number, y: number): [number, number, number] | undefined
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
 * @returns Mat对象
 * @throws 捕获窗口失败时抛出错误
 */
declare function captureWindow(hwnd: number): Mat

/**
 * 从窗口捕获图像Mat对象（WGC优化版）
 * @param hwnd 窗口句柄
 * @returns Mat对象
 * @throws 捕获窗口失败时抛出错误
 */
declare function captureWindowWGC(hwnd: number): Mat

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
 * 比较源哈希与模板哈希数组的汉明距离，返回匹配索引
 * @param sourceHash 源图像哈希（十六进制字符串）
 * @param templateHashes 模板哈希数组（十六进制字符串数组）
 * @param maxDistance 最大允许汉明距离（默认 0，表示精确匹配）
 * @returns 匹配索引；未匹配返回 -1
 */
declare function matchHammingHash(sourceHash: string, templateHashes: string[], maxDistance?: number): number

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
 * 设置程序音量
 * @param programName 程序名
 * @param volume 音量值（0.0-1.0）
 */
declare function setProgramVolume(programName: string, volume: number): void

/**
 * 智能寻路函数（基于双图深度估计）
 * @param leftImage 左图（第一次截图）
 * @param rightImage 右图（移动后的第二次截图）
 * @param startX 起点X坐标
 * @param startY 起点Y坐标
 * @param endX 终点X坐标
 * @param endY 终点Y坐标
 * @param numDisp 视差搜索范围（必须是16的倍数，如160）
 * @param blockSize 匹配块大小（3-7）
 * @param strategy 绕行策略（"left"|"right"|"auto"）
 * @returns 路径点列表 [[x, y], ...]
 */
declare function findPath(
    leftImage: Mat,
    rightImage: Mat,
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    numDisp: number,
    blockSize: number,
    strategy: "left" | "right" | "auto"
): [number, number][]
