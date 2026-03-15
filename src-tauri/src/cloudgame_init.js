;(() => {
    const CONTROL_EVENT = "__dna_cloudgame_control__"
    const BRIDGE_NAME = "__DNA_CLOUDGAME_BRIDGE__"
    const POINTER_LOCK_EVENT_NAMES = new Set(["pointerlockchange", "mozpointerlockchange", "webkitpointerlockchange"])

    /**
     * 在线上 pointer lock 切换期间，仅屏蔽回调内部延迟补发的 Esc。
     * 不阻断 pointer lock 状态流转，只给对应回调和它派生出的定时器打补丁。
     */
    ;(() => {
        const originalAddEventListener = EventTarget.prototype.addEventListener
        const originalRemoveEventListener = EventTarget.prototype.removeEventListener
        const originalSetTimeout = window.setTimeout.bind(window)
        /** @type {WeakMap<EventListenerOrEventListenerObject, EventListener>} */
        const wrappedListenerMap = new WeakMap()
        let suppressEscapeDuringPointerLockChange = false
        let insidePointerLockHandler = 0

        /**
         * 在指定回调执行期间打开 Esc 屏蔽。
         * @template {(...args: any[]) => any} T
         * @param {T} callback 原始回调
         * @param {unknown} context this 绑定
         * @param {unknown[]} args 参数列表
         * @returns {ReturnType<T>} 回调返回值
         */
        function runWithPointerLockSuppression(callback, context, args) {
            suppressEscapeDuringPointerLockChange = true
            try {
                return Reflect.apply(callback, context, args)
            } finally {
                suppressEscapeDuringPointerLockChange = false
            }
        }

        /**
         * 包装 pointer lock 回调，并标记其内部衍生的异步任务。
         * @param {EventListenerOrEventListenerObject | null | undefined} listener 原始监听器
         * @returns {EventListenerOrEventListenerObject | null | undefined} 包装后的监听器
         */
        const wrapPointerLockListener = listener => {
            if (typeof listener !== "function") {
                return listener
            }
            const existingWrapped = wrappedListenerMap.get(listener)
            if (existingWrapped) {
                return existingWrapped
            }
            const wrappedListener = function wrappedPointerLockListener(...args) {
                insidePointerLockHandler += 1
                try {
                    return runWithPointerLockSuppression(listener, this, args)
                } finally {
                    insidePointerLockHandler -= 1
                }
            }
            wrappedListenerMap.set(listener, wrappedListener)
            return wrappedListener
        }

        /**
         * 包装通过属性赋值方式注册的 pointer lock 回调。
         * 线上云游戏使用的是 `document.onpointerlockchange = ...` 这条路径。
         * @param {object} target 原型对象
         * @param {string} property 属性名
         */
        function patchPointerLockHandlerProperty(target, property) {
            const descriptor = Object.getOwnPropertyDescriptor(target, property)
            if (!descriptor || typeof descriptor.set !== "function" || typeof descriptor.get !== "function" || descriptor.configurable === false) {
                return
            }
            Object.defineProperty(target, property, {
                configurable: true,
                enumerable: descriptor.enumerable ?? true,
                get() {
                    return Reflect.apply(descriptor.get, this, [])
                },
                set(listener) {
                    return Reflect.apply(descriptor.set, this, [wrapPointerLockListener(listener)])
                },
            })
        }

        EventTarget.prototype.addEventListener = function patchedAddEventListener(type, listener, options) {
            const normalizedType = typeof type === "string" ? type.toLowerCase() : ""
            if (this === document && POINTER_LOCK_EVENT_NAMES.has(normalizedType)) {
                return Reflect.apply(originalAddEventListener, this, [type, wrapPointerLockListener(listener), options])
            }
            return Reflect.apply(originalAddEventListener, this, [type, listener, options])
        }

        EventTarget.prototype.removeEventListener = function patchedRemoveEventListener(type, listener, options) {
            const normalizedType = typeof type === "string" ? type.toLowerCase() : ""
            if (this === document && POINTER_LOCK_EVENT_NAMES.has(normalizedType) && typeof listener === "function") {
                const wrappedListener = wrappedListenerMap.get(listener) ?? listener
                return Reflect.apply(originalRemoveEventListener, this, [type, wrappedListener, options])
            }
            return Reflect.apply(originalRemoveEventListener, this, [type, listener, options])
        }

        window.setTimeout = function patchedSetTimeout(callback, delay, ...args) {
            if (insidePointerLockHandler > 0 && typeof callback === "function") {
                const wrappedCallback = function wrappedPointerLockTimeoutCallback(...timeoutArgs) {
                    return runWithPointerLockSuppression(callback, this, timeoutArgs)
                }
                return originalSetTimeout(wrappedCallback, delay, ...args)
            }
            return originalSetTimeout(callback, delay, ...args)
        }

        if (typeof Document !== "undefined") {
            for (const eventName of POINTER_LOCK_EVENT_NAMES) {
                patchPointerLockHandlerProperty(Document.prototype, `on${eventName}`)
            }
        }

        window.__DNA_SUPPRESS_ESCAPE_ON_POINTERLOCK__ = () => suppressEscapeDuringPointerLockChange
    })()

    /**
     * 安全序列化任意值，避免桥接事件因为循环引用而失败。
     * @param {unknown} value 任意待序列化值
     * @returns {unknown} 可安全跨桥传输的值
     */
    function safeClone(value) {
        if (value === undefined || value === null) {
            return null
        }
        try {
            return JSON.parse(JSON.stringify(value))
        } catch (_error) {
            if (value instanceof Error) {
                return {
                    name: value.name,
                    message: value.message,
                    stack: value.stack ?? null,
                }
            }
            if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
                return value
            }
            return String(value)
        }
    }

    /**
     * 将桥接事件发送给宿主，同时兼容早期 Tauri API 尚未就绪的情况。
     * @param {string} type 事件类型
     * @param {unknown} payload 事件负载
     */
    function emit(type, payload) {
        const detail = {
            eventType: type,
            payload: safeClone(payload),
        }
        try {
            const invoke = window.__TAURI_INTERNALS__?.invoke
            if (invoke) {
                void invoke("dispatch_cloudgame_bridge_event", {
                    payload: detail,
                })
                return
            }
        } catch (error) {
            void error
        }
    }

    /**
     * 构造桥接内部状态，统一管理运行时抓到的输入通道。
     * 这里不依赖压缩变量名，而是依赖 postMessage 协议和动作字符串。
     */
    const state = {
        hookedAt: Date.now(),
        transport: null,
        transportKind: null,
        transportAttached: false,
        transportHookEnabled: false,
        connectArg: null,
        sid: null,
        connected: false,
        inputMode: null,
        lastAction: null,
        lastPacket: null,
        seenActionNames: [],
        seenPackets: 0,
        settingsApplied: false,
        commandHookEnabled: false,
    }
    const interestingActions = new Set(["connect", "x_fn_exec", "fn_exec", "connected", "ondisconnect", "notify_close", "load_callback"])
    const tracedFullscreenApis = new WeakSet()

    /**
     * 生成当前桥接状态快照，供宿主调试和决策。
     * @returns {Record<string, unknown>} 当前状态快照
     */
    function snapshotState() {
        return {
            hookedAt: state.hookedAt,
            transportReady: Boolean(state.transport),
            transportKind: state.transportKind,
            transportAttached: state.transportAttached,
            transportHookEnabled: state.transportHookEnabled,
            sid: state.sid,
            connected: state.connected,
            inputMode: state.inputMode,
            lastAction: state.lastAction,
            lastPacket: state.lastPacket,
            connectArg: state.connectArg,
            seenActionNames: [...state.seenActionNames],
            seenPackets: state.seenPackets,
            settingsApplied: state.settingsApplied,
            commandHookEnabled: state.commandHookEnabled,
        }
    }

    /**
     * 将大型 transport 包摘要化，避免深拷贝 wasm/二进制负载影响页面行为。
     * @param {any} message SDK transport 消息
     * @returns {Record<string, unknown>} 轻量摘要
     */
    function summarizePacket(message) {
        if (!message || typeof message !== "object") {
            return {
                action: null,
            }
        }
        return {
            action: message.action ?? null,
            actionName: typeof message.actionName === "string" ? message.actionName : null,
            argKeys: message.arg && typeof message.arg === "object" ? Object.keys(message.arg).slice(0, 12) : null,
            argsLength: Array.isArray(message.args) ? message.args.length : null,
            hasBinaryArg:
                message.arg instanceof ArrayBuffer ||
                ArrayBuffer.isView(message.arg) ||
                (Array.isArray(message.args) && message.args.some(item => item instanceof ArrayBuffer || ArrayBuffer.isView(item))),
        }
    }

    /**
     * 记录经过 transport 的动作名称，便于判断当前页面使用的是哪条输入链。
     * @param {string | null | undefined} actionName SDK 动作名称
     */
    function rememberActionName(actionName) {
        if (!actionName || state.seenActionNames.includes(actionName)) {
            return
        }
        state.seenActionNames.push(actionName)
        if (state.seenActionNames.length > 20) {
            state.seenActionNames.shift()
        }
    }

    /**
     * 判断消息是否看起来像 SDK 的 worker/port 指令。
     * @param {unknown} message 待判断消息
     * @returns {message is { action?: string, actionName?: string, arg?: any, args?: any[] }} 是否为 transport 指令
     */
    function isTransportPacket(message) {
        return Boolean(message && typeof message === "object" && typeof message.action === "string")
    }

    /**
     * 从 transport 消息中提取 sid、输入模式和最近的协议动作。
     * @param {any} message SDK transport 消息
     */
    function updateStateFromPacket(message) {
        state.seenPackets += 1
        state.lastPacket = summarizePacket(message)
        state.lastAction = message.action ?? null

        if (message.action === "connect" && message.arg && typeof message.arg === "object") {
            state.connectArg = safeClone(message.arg)
            if (typeof message.arg.sid === "number") {
                state.sid = message.arg.sid
            }
            state.connected = false
            emit("transport-connect-captured", snapshotState())
        }

        if ((message.action === "x_fn_exec" || message.action === "fn_exec") && typeof message.actionName === "string") {
            rememberActionName(message.actionName)
            if (!state.inputMode) {
                state.inputMode = message.action === "x_fn_exec" ? "rtc-x-fn-exec" : "fn-exec"
            }
            const firstArg = Array.isArray(message.args) ? message.args[0] : null
            if (typeof firstArg === "number") {
                state.sid = firstArg
            }
        }
    }

    /**
     * 判断是否为云游戏业务层用于全屏的主容器。
     * 当前证据表明页面会对该容器直接调用 requestFullscreen。
     * @param {unknown} target 候选元素
     * @returns {boolean} 是否命中目标容器
     */
    function isCloudGameFullscreenContainer(target) {
        if (!target || typeof target !== "object") {
            return false
        }
        const element = /** @type {{ id?: unknown, className?: unknown }} */ (target)
        const id = typeof element.id === "string" ? element.id : ""
        const className = typeof element.className === "string" ? element.className : ""
        return id === "game-fullscreen-container" || className.includes("cloud-game-container")
    }

    /**
     * 跟踪原生全屏 API，确认是否进入浏览器级 fullscreen。
     */
    function installFullscreenApiProbes() {
        const elementPrototype = typeof Element !== "undefined" ? Element.prototype : null
        const candidates = [
            [elementPrototype, "requestFullscreen"],
            [elementPrototype, "webkitRequestFullscreen"],
            [elementPrototype, "webkitRequestFullScreen"],
            [elementPrototype, "webkitEnterFullscreen"],
            [elementPrototype, "webkitEnterFullScreen"],
            [elementPrototype, "mozRequestFullScreen"],
            [elementPrototype, "msRequestFullscreen"],
        ]

        for (const [owner, methodName] of candidates) {
            if (!owner || typeof owner[methodName] !== "function") {
                continue
            }
            const original = owner[methodName]
            if (tracedFullscreenApis.has(original) || original.__dnaCloudgameFullscreenTraced) {
                continue
            }

            const wrapped = function tracedFullscreenApi(...args) {
                if (isCloudGameFullscreenContainer(this)) {
                    return methodName.toLowerCase().includes("request") ? Promise.resolve() : undefined
                }
                return Reflect.apply(original, this, args)
            }
            wrapped.__dnaCloudgameFullscreenTraced = true
            tracedFullscreenApis.add(original)
            tracedFullscreenApis.add(wrapped)
            owner[methodName] = wrapped
        }
    }

    /**
     * 监听 transport 回包，识别连接建立/断开等状态。
     * @param {Worker | MessagePort} target transport 对象
     * @param {string} kind transport 类型
     */
    function attachTransportListener(target, kind) {
        if (!target || (state.transport === target && state.transportAttached)) {
            return
        }

        const listener = event => {
            const message = event?.data
            if (!isTransportPacket(message)) {
                return
            }
            if (message.action === "connected") {
                state.connected = true
                emit("transport-connected", snapshotState())
                return
            }
            if (message.action === "ondisconnect" || message.action === "notify_close") {
                state.connected = false
                emit("transport-disconnected", snapshotState())
                return
            }
            if (message.action === "load_callback") {
                emit("transport-load-callback", {
                    ok: Boolean(message.arg),
                    state: snapshotState(),
                })
            }
        }

        try {
            target.addEventListener("message", listener)
            if (typeof target.start === "function") {
                target.start()
            }
            state.transportAttached = true
            emit("transport-listener-attached", {
                kind,
                state: snapshotState(),
            })
        } catch (error) {
            emit("transport-listener-error", {
                kind,
                error: error instanceof Error ? error.message : String(error),
            })
        }
    }

    /**
     * 记录 transport 对象并为它挂上只读监听。
     * @param {Worker | MessagePort} target transport 对象
     * @param {string} kind transport 类型
     * @param {any} message 首次看到的消息
     */
    function rememberTransport(target, kind, message) {
        const changed = state.transport !== target || state.transportKind !== kind
        state.transport = target
        state.transportKind = kind
        updateStateFromPacket(message)
        attachTransportListener(target, kind)
        if (changed) {
            emit("transport-detected", snapshotState())
        }
    }

    /**
     * 包装 postMessage，抓取 SDK 往 worker/port 发送的真实协议包。
     * @param {typeof Worker.prototype.postMessage | typeof MessagePort.prototype.postMessage} original 原始实现
     * @param {string} kind transport 类型
     * @returns {(message: any, options?: any, transfer?: any) => any} 包装后的实现
     */
    function wrapPostMessage(original, kind) {
        return function wrappedPostMessage(...postArgs) {
            const [message] = postArgs
            if (
                window.__DNA_SUPPRESS_ESCAPE_ON_POINTERLOCK__?.() &&
                message &&
                typeof message === "object" &&
                (message.action === "x_fn_exec" || message.action === "fn_exec") &&
                message.actionName === "key_event" &&
                Array.isArray(message.args)
            ) {
                const numericArgs = message.args.map(value => Number(value))
                if (numericArgs.includes(27)) {
                    return undefined
                }
            }
            if (isTransportPacket(message)) {
                if (interestingActions.has(message.action)) {
                    rememberTransport(this, kind, message)
                } else {
                    state.seenPackets += 1
                    state.lastAction = message.action ?? null
                    state.lastPacket = summarizePacket(message)
                }
            }
            return Reflect.apply(original, this, postArgs)
        }
    }

    /**
     * 按需启用 transport hook，避免默认拦截影响云游戏入场流程。
     * @returns {Record<string, unknown>} 启用后的桥接状态
     */
    function enableTransportHook() {
        if (state.transportHookEnabled) {
            return snapshotState()
        }

        const originalWorkerPostMessage = typeof Worker !== "undefined" ? Worker.prototype.postMessage : null
        if (originalWorkerPostMessage && !originalWorkerPostMessage.__dnaCloudgameWrapped) {
            const wrapped = wrapPostMessage(originalWorkerPostMessage, "worker")
            wrapped.__dnaCloudgameWrapped = true
            Worker.prototype.postMessage = wrapped
        }

        const originalMessagePortPostMessage = typeof MessagePort !== "undefined" ? MessagePort.prototype.postMessage : null
        if (originalMessagePortPostMessage && !originalMessagePortPostMessage.__dnaCloudgameWrapped) {
            const wrapped = wrapPostMessage(originalMessagePortPostMessage, "message-port")
            wrapped.__dnaCloudgameWrapped = true
            MessagePort.prototype.postMessage = wrapped
        }

        state.transportHookEnabled = true
        emit("transport-hook-enabled", snapshotState())
        return snapshotState()
    }

    /**
     * 发送任意 transport 消息到当前已捕获的 worker/port。
     * @param {Record<string, unknown>} packet 要发送的协议包
     * @returns {Record<string, unknown>} 发送后的状态快照
     */
    function sendPacket(packet) {
        if (!state.transport) {
            throw new Error("cloudgame transport not detected")
        }
        state.transport.postMessage(packet)
        return snapshotState()
    }

    /**
     * 发送 x_fn_exec 指令，供 WL_RTC + input_ver >= 3 的新链路使用。
     * @param {string} actionName 原生动作名
     * @param {any[]} args 原始参数（不含 sid）
     * @returns {Record<string, unknown>} 发送后的状态快照
     */
    function sendXFnExec(actionName, args) {
        if (typeof state.sid !== "number") {
            throw new Error("cloudgame sid not ready")
        }
        return sendPacket({
            action: "x_fn_exec",
            actionName,
            args: [state.sid, ...(Array.isArray(args) ? args : [])],
        })
    }

    /**
     * 发送 fn_exec 指令，供旧链路或 protobuf 包装层使用。
     * @param {string} actionName 原生动作名
     * @param {any[]} args 原始参数
     * @param {boolean} prependSid 是否自动在首位补 sid
     * @returns {Record<string, unknown>} 发送后的状态快照
     */
    function sendFnExec(actionName, args, prependSid = true) {
        const inputArgs = Array.isArray(args) ? [...args] : []
        if (prependSid) {
            if (typeof state.sid !== "number") {
                throw new Error("cloudgame sid not ready")
            }
            inputArgs.unshift(state.sid)
        }
        return sendPacket({
            action: "fn_exec",
            actionName,
            args: inputArgs,
        })
    }

    /**
     * 等待输入桥拿到 sid。
     * @param {number} timeoutMs 超时时间
     * @returns {Promise<Record<string, unknown>>} 准备完成后的状态
     */
    function waitForInputReady(timeoutMs = 8000) {
        enableTransportHook()
        if (typeof state.sid === "number") {
            return Promise.resolve(snapshotState())
        }

        return new Promise((resolve, reject) => {
            const startedAt = Date.now()
            const timer = window.setInterval(() => {
                if (typeof state.sid === "number") {
                    window.clearInterval(timer)
                    resolve(snapshotState())
                    return
                }
                if (Date.now() - startedAt >= timeoutMs) {
                    window.clearInterval(timer)
                    reject(new Error("cloudgame sid not ready; reload window and restart game"))
                }
            }, 100)
        })
    }

    const INPUT_OP = {
        MOUSE_BUTTON_LEFT: 512,
        MOUSE_BUTTON_MIDDLE: 513,
        MOUSE_BUTTON_RIGHT: 514,
        MOUSE_WHEEL: 515,
        MOUSE_MOV: 516,
    }

    const INPUT_STATE = {
        DEFAULT: 1,
        DOWN: 2,
        UP: 3,
    }
    const POINTER_ACTION = {
        DOWN: 2007,
        UP: 2008,
        WHEEL_UP: 2009,
        WHEEL_DOWN: 2010,
    }
    const POINTER_KEY_CODE = {
        MOVE: 2006,
        LEFT: 0,
        MIDDLE: 1,
        RIGHT: 2,
    }
    const virtualMouseState = {
        initialized: false,
        mouseX: 0,
        mouseY: 0,
        cursorX: 0,
        cursorY: 0,
        captured: false,
    }

    /**
     * 获取视频区域的中心点，作为后台输入测试的默认坐标。
     * @returns {{ cursorX: number, cursorY: number }}
     */
    function getDefaultMousePosition() {
        const target =
            document.getElementById("gamePlayLayer") ??
            document.getElementById("WelinkGameVideo") ??
            document.getElementById("game-fullscreen-container") ??
            document.body
        const rect = target.getBoundingClientRect()
        const x = Math.max(0, Math.round(rect.width / 2))
        const y = Math.max(0, Math.round(rect.height / 2))
        return {
            cursorX: x,
            cursorY: y,
        }
    }

    /**
     * 获取当前鼠标输入作用的主表面。
     * @returns {HTMLElement | null} 目标表面
     */
    function getPointerSurface() {
        return (
            document.getElementById("gamePlayLayer") ??
            document.getElementById("WelinkGameVideo") ??
            document.getElementById("game-fullscreen-container")
        )
    }

    /**
     * 获取鼠标按钮对应的 DOM button/buttons 值。
     * @param {"left" | "middle" | "right"} button 按钮名
     * @returns {{ button: number, buttons: number }}
     */
    function getDomMouseButtonState(button) {
        if (button === "right") {
            return { button: 2, buttons: 2 }
        }
        if (button === "middle") {
            return { button: 1, buttons: 4 }
        }
        return { button: 0, buttons: 1 }
    }

    /**
     * 将数值限制在区间内。
     * @param {number} value 原值
     * @param {number} min 最小值
     * @param {number} max 最大值
     * @returns {number} 限制后的值
     */
    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value))
    }

    /**
     * 用真实鼠标事件回填当前光标位置，避免 devtools 方法基于过期落点产生突变。
     * 这里故意不消费真实事件的 movementX/movementY，避免和我们自己发给游戏的相对位移混算。
     * @param {MouseEvent} event 浏览器原始事件
     */
    function syncVirtualMouseStateFromEvent(event) {
        const surface = getPointerSurface()
        if (!surface) {
            return
        }

        const path = typeof event.composedPath === "function" ? event.composedPath() : []
        const insideSurface =
            path.includes(surface) || surface.contains(/** @type {Node | null} */ (event.target instanceof Node ? event.target : null))

        const rect = surface.getBoundingClientRect()
        if (!insideSurface && document.pointerLockElement !== surface) {
            return
        }

        ensureVirtualMouseState()
        virtualMouseState.captured = document.pointerLockElement === surface || virtualMouseState.captured

        if (document.pointerLockElement === surface || virtualMouseState.captured) {
            return
        }

        const offsetX = clamp(Math.round(event.clientX - rect.left), 0, Math.round(rect.width))
        const offsetY = clamp(Math.round(event.clientY - rect.top), 0, Math.round(rect.height))
        virtualMouseState.cursorX = offsetX
        virtualMouseState.cursorY = offsetY
    }

    /**
     * 将浏览器真实 pointer lock 状态同步到虚拟鼠标状态。
     */
    function syncPointerCaptureState() {
        const surface = getPointerSurface()
        virtualMouseState.captured = Boolean(surface && document.pointerLockElement === surface)
    }

    /**
     * 确保虚拟鼠标状态已经初始化。
     * @returns {{ mouseX: number, mouseY: number, cursorX: number, cursorY: number }}
     */
    function ensureVirtualMouseState() {
        if (!virtualMouseState.initialized) {
            const initial = getDefaultMousePosition()
            virtualMouseState.mouseX = 0
            virtualMouseState.mouseY = 0
            virtualMouseState.cursorX = initial.cursorX
            virtualMouseState.cursorY = initial.cursorY
            virtualMouseState.initialized = true
        }
        return {
            mouseX: virtualMouseState.mouseX,
            mouseY: virtualMouseState.mouseY,
            cursorX: virtualMouseState.cursorX,
            cursorY: virtualMouseState.cursorY,
        }
    }

    /**
     * 更新虚拟鼠标状态。
     * @param {{ mouseX?: number, mouseY?: number, cursorX?: number, cursorY?: number }} nextState 新状态
     * @returns {{ mouseX: number, mouseY: number, cursorX: number, cursorY: number, captured: boolean }}
     */
    function setVirtualMouseState(nextState = {}) {
        ensureVirtualMouseState()
        if (typeof nextState.mouseX === "number") {
            virtualMouseState.mouseX = Math.round(nextState.mouseX)
        }
        if (typeof nextState.mouseY === "number") {
            virtualMouseState.mouseY = Math.round(nextState.mouseY)
        }
        if (typeof nextState.cursorX === "number") {
            virtualMouseState.cursorX = Math.round(nextState.cursorX)
        }
        if (typeof nextState.cursorY === "number") {
            virtualMouseState.cursorY = Math.round(nextState.cursorY)
        }
        return {
            mouseX: virtualMouseState.mouseX,
            mouseY: virtualMouseState.mouseY,
            cursorX: virtualMouseState.cursorX,
            cursorY: virtualMouseState.cursorY,
            captured: virtualMouseState.captured,
        }
    }

    /**
     * 基于当前虚拟鼠标状态构造鼠标指令坐标。
     * 3D 鼠标捕获模式下 cursor 保持不动，仅累计 mouse 位移。
     * @param {{ dx?: number, dy?: number, x?: number, y?: number, mouseX?: number, mouseY?: number, cursorX?: number, cursorY?: number }} [options]
     * @returns {{ mouseX: number, mouseY: number, cursorX: number, cursorY: number }}
     */
    function resolveMousePosition(options = {}) {
        const current = ensureVirtualMouseState()

        if (typeof options.mouseX === "number" || typeof options.mouseY === "number") {
            return setVirtualMouseState({
                mouseX: options.mouseX ?? current.mouseX,
                mouseY: options.mouseY ?? current.mouseY,
                cursorX: options.cursorX ?? current.cursorX,
                cursorY: options.cursorY ?? current.cursorY,
            })
        }

        if (typeof options.x === "number" || typeof options.y === "number") {
            const nextCursorX = Math.round(options.x ?? current.cursorX)
            const nextCursorY = Math.round(options.y ?? current.cursorY)
            return setVirtualMouseState({
                mouseX: current.mouseX,
                mouseY: current.mouseY,
                cursorX: nextCursorX,
                cursorY: nextCursorY,
            })
        }

        const dx = Math.round(options.dx ?? 0)
        const dy = Math.round(options.dy ?? 0)
        if (dx !== 0 || dy !== 0) {
            return setVirtualMouseState({
                mouseX: current.mouseX + dx,
                mouseY: current.mouseY + dy,
                cursorX: virtualMouseState.captured ? current.cursorX : current.cursorX + dx,
                cursorY: virtualMouseState.captured ? current.cursorY : current.cursorY + dy,
            })
        }

        if (typeof options.cursorX === "number" || typeof options.cursorY === "number") {
            return setVirtualMouseState({
                mouseX: current.mouseX,
                mouseY: current.mouseY,
                cursorX: options.cursorX ?? current.cursorX,
                cursorY: options.cursorY ?? current.cursorY,
            })
        }

        return current
    }

    /**
     * 发送鼠标指令，未传坐标时默认取视频区域中心点。
     * @param {number} action 鼠标状态或类型
     * @param {number} code 鼠标操作码
     * @param {{ mouseX?: number, mouseY?: number, cursorX?: number, cursorY?: number, value?: number, extra?: number }} [position]
     * @returns {Record<string, unknown>} 发送后的状态
     */
    function sendMouseCommand(action, code, position = {}) {
        const base = resolveMousePosition(position)
        return sendXFnExec("mouse", [
            position.mouseX ?? base.mouseX,
            position.mouseY ?? base.mouseY,
            position.cursorX ?? base.cursorX,
            position.cursorY ?? base.cursorY,
            action,
            code,
            position.value ?? 0,
            position.extra ?? 0,
        ])
    }

    /**
     * 通过页面实例 onPointerEvent 发送鼠标事件，兼容 blockPointerEvent 场景。
     * @param {number} keyCode 页面鼠标键码
     * @param {number | null} action 页面动作码
     * @param {{ x?: number, y?: number }} [position]
     * @returns {boolean} 是否成功命中 onPointerEvent 通道
     */
    function sendPointerEventCommand(keyCode, action, position = {}) {
        const gameInstance = window.wgs ?? window.gameInstance ?? null
        if (!gameInstance || typeof gameInstance.onPointerEvent !== "function" || !gameInstance.configs) {
            return false
        }
        const current = resolveMousePosition(position)
        gameInstance.onPointerEvent({
            type: "mouse",
            x: current.cursorX,
            y: current.cursorY,
            width: gameInstance.configs.originVideoWidth ?? gameInstance.configs.videoWidth ?? 0,
            height: gameInstance.configs.originVideoHeight ?? gameInstance.configs.videoHeight ?? 0,
            keyCode,
            action,
        })
        return true
    }

    /**
     * 将鼠标按钮名转换为页面层 keyCode。
     * @param {"left" | "middle" | "right"} button 按钮名
     * @returns {number} 页面层 keyCode
     */
    function resolvePointerKeyCode(button) {
        return button === "right" ? POINTER_KEY_CODE.RIGHT : button === "middle" ? POINTER_KEY_CODE.MIDDLE : POINTER_KEY_CODE.LEFT
    }

    /**
     * 将鼠标按钮名转换为 raw mouse code。
     * @param {"left" | "middle" | "right"} button 按钮名
     * @returns {number} raw mouse code
     */
    function resolveMouseButtonCode(button) {
        return button === "right"
            ? INPUT_OP.MOUSE_BUTTON_RIGHT
            : button === "middle"
              ? INPUT_OP.MOUSE_BUTTON_MIDDLE
              : INPUT_OP.MOUSE_BUTTON_LEFT
    }

    /**
     * 发送键盘指令。
     * @param {number} keyCode 虚拟键值
     * @param {number} state 按键状态
     * @returns {Record<string, unknown>} 发送后的状态
     */
    function sendKeyboardCommand(keyCode, state) {
        return sendXFnExec("key_event", [state, Number(keyCode)])
    }

    /**
     * 按业务层真实链路分发鼠标事件到页面表面。
     * @param {"mousemove" | "pointerrawupdate" | "mousedown" | "mouseup"} type 事件类型
     * @param {{ dx?: number, dy?: number, x?: number, y?: number, button?: "left" | "middle" | "right" }} [options]
     * @returns {{ cursorX: number, cursorY: number, captured: boolean }} 当前状态
     */
    function dispatchBusinessMouseEvent(type, options = {}) {
        const surface = getPointerSurface()
        if (!surface) {
            throw new Error("cloudgame pointer surface not ready")
        }

        const current = ensureVirtualMouseState()
        const rect = surface.getBoundingClientRect()
        const dx = Math.round(options.dx ?? 0)
        const dy = Math.round(options.dy ?? 0)
        const nextCursorX = typeof options.x === "number" ? Math.round(options.x) : clamp(current.cursorX + dx, 0, Math.round(rect.width))
        const nextCursorY = typeof options.y === "number" ? Math.round(options.y) : clamp(current.cursorY + dy, 0, Math.round(rect.height))

        if (!virtualMouseState.captured) {
            virtualMouseState.cursorX = nextCursorX
            virtualMouseState.cursorY = nextCursorY
        }

        const domButton = getDomMouseButtonState(options.button ?? "left")
        const clientX = Math.round(rect.left + nextCursorX)
        const clientY = Math.round(rect.top + nextCursorY)
        const EventCtor = type === "pointerrawupdate" && typeof PointerEvent === "function" ? PointerEvent : MouseEvent
        const event = new EventCtor(type, {
            bubbles: true,
            cancelable: true,
            clientX,
            clientY,
            screenX: clientX,
            screenY: clientY,
            button: domButton.button,
            buttons: type === "mouseup" ? 0 : domButton.buttons,
        })

        Object.defineProperties(event, {
            movementX: { configurable: true, get: () => dx },
            movementY: { configurable: true, get: () => dy },
            offsetX: { configurable: true, get: () => nextCursorX },
            offsetY: { configurable: true, get: () => nextCursorY },
            pageX: { configurable: true, get: () => clientX + window.scrollX },
            pageY: { configurable: true, get: () => clientY + window.scrollY },
        })

        surface.dispatchEvent(event)
        return {
            cursorX: virtualMouseState.cursorX,
            cursorY: virtualMouseState.cursorY,
            captured: virtualMouseState.captured,
        }
    }

    /**
     * 按业务层真实链路分发滚轮事件。
     * @param {number} delta 滚轮增量，常用 120 / -120
     * @param {{ x?: number, y?: number }} [options]
     * @returns {{ cursorX: number, cursorY: number, captured: boolean }} 当前状态
     */
    function dispatchBusinessWheelEvent(delta, options = {}) {
        const surface = getPointerSurface()
        if (!surface) {
            throw new Error("cloudgame pointer surface not ready")
        }

        if (typeof options.x === "number" || typeof options.y === "number") {
            dispatchBusinessMouseEvent("mousemove", {
                x: typeof options.x === "number" ? options.x : virtualMouseState.cursorX,
                y: typeof options.y === "number" ? options.y : virtualMouseState.cursorY,
            })
        }

        const current = ensureVirtualMouseState()
        const rect = surface.getBoundingClientRect()
        const clientX = Math.round(rect.left + current.cursorX)
        const clientY = Math.round(rect.top + current.cursorY)
        const wheelValue = Number(delta || 0)
        const event = new WheelEvent("mousewheel", {
            bubbles: true,
            cancelable: true,
            clientX,
            clientY,
            screenX: clientX,
            screenY: clientY,
            deltaY: wheelValue > 0 ? -120 : 120,
        })
        Object.defineProperties(event, {
            wheelDelta: { configurable: true, get: () => wheelValue },
            detail: { configurable: true, get: () => (wheelValue > 0 ? -1 : 1) },
            offsetX: { configurable: true, get: () => current.cursorX },
            offsetY: { configurable: true, get: () => current.cursorY },
            pageX: { configurable: true, get: () => clientX + window.scrollX },
            pageY: { configurable: true, get: () => clientY + window.scrollY },
        })
        surface.dispatchEvent(event)
        return {
            cursorX: virtualMouseState.cursorX,
            cursorY: virtualMouseState.cursorY,
            captured: virtualMouseState.captured,
        }
    }

    /**
     * 将虚拟键值转换为业务层需要的 KeyboardEvent 字段。
     * @param {number} keyCode 虚拟键值
     * @returns {{ key: string, code: string }}
     */
    function keyboardDescriptorFromKeyCode(keyCode) {
        if (keyCode >= 65 && keyCode <= 90) {
            const letter = String.fromCharCode(keyCode)
            return { key: letter.toLowerCase(), code: `Key${letter}` }
        }
        if (keyCode >= 48 && keyCode <= 57) {
            return { key: String.fromCharCode(keyCode), code: `Digit${String.fromCharCode(keyCode)}` }
        }
        const table = {
            13: { key: "Enter", code: "Enter" },
            27: { key: "Escape", code: "Escape" },
            32: { key: " ", code: "Space" },
            37: { key: "ArrowLeft", code: "ArrowLeft" },
            38: { key: "ArrowUp", code: "ArrowUp" },
            39: { key: "ArrowRight", code: "ArrowRight" },
            40: { key: "ArrowDown", code: "ArrowDown" },
            16: { key: "Shift", code: "ShiftLeft" },
            17: { key: "Control", code: "ControlLeft" },
            18: { key: "Alt", code: "AltLeft" },
            9: { key: "Tab", code: "Tab" },
            8: { key: "Backspace", code: "Backspace" },
        }
        return table[keyCode] ?? { key: "", code: "" }
    }

    /**
     * 按业务层真实链路分发键盘事件。
     * @param {"keydown" | "keyup"} type 键盘事件类型
     * @param {number} keyCode 虚拟键值
     */
    function dispatchBusinessKeyboardEvent(type, keyCode) {
        const descriptor = keyboardDescriptorFromKeyCode(Number(keyCode))
        const event = new KeyboardEvent(type, {
            bubbles: true,
            cancelable: true,
            key: descriptor.key,
            code: descriptor.code,
        })
        Object.defineProperties(event, {
            keyCode: { configurable: true, get: () => Number(keyCode) },
            which: { configurable: true, get: () => Number(keyCode) },
        })
        document.dispatchEvent(event)
    }

    /**
     * 暴露给 devtools 的输入测试接口。
     */
    function installDevtoolsHelpers() {
        window.__DNA_CLOUDGAME_DEVTOOLS__ = {
            status() {
                return {
                    ...snapshotState(),
                    virtualMouse: {
                        ...ensureVirtualMouseState(),
                        captured: virtualMouseState.captured,
                    },
                }
            },
            ready(timeoutMs = 8000) {
                return waitForInputReady(timeoutMs)
            },
            enableTransportHook() {
                return enableTransportHook()
            },
            pointerCapture(enabled = true) {
                virtualMouseState.captured = Boolean(enabled)
                return this.status()
            },
            businessMove(dx, dy) {
                return dispatchBusinessMouseEvent(virtualMouseState.captured ? "pointerrawupdate" : "mousemove", {
                    dx: Number(dx || 0),
                    dy: Number(dy || 0),
                })
            },
            businessMoveTo(x, y, duration = 0) {
                const execute = () =>
                    dispatchBusinessMouseEvent("mousemove", {
                        x: Number(x),
                        y: Number(y),
                    })
                if (Number(duration || 0) <= 0) {
                    return execute()
                }
                return new Promise(resolve => {
                    window.setTimeout(
                        () => {
                            resolve(execute())
                        },
                        Number(duration || 0)
                    )
                })
            },
            businessClick(button = "left", x, y) {
                if (typeof x === "number" || typeof y === "number") {
                    dispatchBusinessMouseEvent("mousemove", {
                        x: typeof x === "number" ? x : virtualMouseState.cursorX,
                        y: typeof y === "number" ? y : virtualMouseState.cursorY,
                        button,
                    })
                }
                dispatchBusinessMouseEvent("mousedown", { button })
                return dispatchBusinessMouseEvent("mouseup", { button })
            },
            businessDown(button = "left", x, y) {
                if (typeof x === "number" || typeof y === "number") {
                    dispatchBusinessMouseEvent("mousemove", {
                        x: typeof x === "number" ? x : virtualMouseState.cursorX,
                        y: typeof y === "number" ? y : virtualMouseState.cursorY,
                        button,
                    })
                }
                return dispatchBusinessMouseEvent("mousedown", { button })
            },
            businessUp(button = "left", x, y) {
                if (typeof x === "number" || typeof y === "number") {
                    dispatchBusinessMouseEvent("mousemove", {
                        x: typeof x === "number" ? x : virtualMouseState.cursorX,
                        y: typeof y === "number" ? y : virtualMouseState.cursorY,
                        button,
                    })
                }
                return dispatchBusinessMouseEvent("mouseup", { button })
            },
            businessMiddleClick(x, y) {
                return this.businessClick("middle", x, y)
            },
            businessWheel(delta, x, y) {
                return dispatchBusinessWheelEvent(Number(delta || 0), {
                    x: typeof x === "number" ? x : undefined,
                    y: typeof y === "number" ? y : undefined,
                })
            },
            businessKeyDown(keyCode) {
                return dispatchBusinessKeyboardEvent("keydown", Number(keyCode))
            },
            businessKeyUp(keyCode) {
                return dispatchBusinessKeyboardEvent("keyup", Number(keyCode))
            },
            businessKeyTap(keyCode, duration = 0) {
                dispatchBusinessKeyboardEvent("keydown", Number(keyCode))
                if (Number(duration || 0) <= 0) {
                    return dispatchBusinessKeyboardEvent("keyup", Number(keyCode))
                }
                return new Promise(resolve => {
                    window.setTimeout(
                        () => {
                            dispatchBusinessKeyboardEvent("keyup", Number(keyCode))
                            resolve(undefined)
                        },
                        Number(duration || 0)
                    )
                })
            },
            async mouseMove(dx, dy, options = {}) {
                await waitForInputReady()
                return sendMouseCommand(INPUT_STATE.DEFAULT, INPUT_OP.MOUSE_MOV, {
                    ...options,
                    dx: Number(dx || 0),
                    dy: Number(dy || 0),
                })
            },
            async mouseClick(button = "left", xOrOptions, maybeY) {
                await waitForInputReady()
                const options =
                    typeof xOrOptions === "object" && xOrOptions !== null
                        ? xOrOptions
                        : {
                              x: typeof xOrOptions === "number" ? xOrOptions : undefined,
                              y: typeof maybeY === "number" ? maybeY : undefined,
                          }
                const code = resolveMouseButtonCode(button)
                const pointerKeyCode = resolvePointerKeyCode(button)
                sendPointerEventCommand(pointerKeyCode, POINTER_ACTION.DOWN, options)
                sendMouseCommand(INPUT_STATE.DOWN, code, options)
                sendPointerEventCommand(pointerKeyCode, POINTER_ACTION.UP, options)
                return sendMouseCommand(INPUT_STATE.UP, code, options)
            },
            async mouseDown(button = "left", xOrOptions, maybeY) {
                await waitForInputReady()
                const options =
                    typeof xOrOptions === "object" && xOrOptions !== null
                        ? xOrOptions
                        : {
                              x: typeof xOrOptions === "number" ? xOrOptions : undefined,
                              y: typeof maybeY === "number" ? maybeY : undefined,
                          }
                const code = resolveMouseButtonCode(button)
                const pointerKeyCode = resolvePointerKeyCode(button)
                sendPointerEventCommand(pointerKeyCode, POINTER_ACTION.DOWN, options)
                return sendMouseCommand(INPUT_STATE.DOWN, code, options)
            },
            async mouseUp(button = "left", xOrOptions, maybeY) {
                await waitForInputReady()
                const options =
                    typeof xOrOptions === "object" && xOrOptions !== null
                        ? xOrOptions
                        : {
                              x: typeof xOrOptions === "number" ? xOrOptions : undefined,
                              y: typeof maybeY === "number" ? maybeY : undefined,
                          }
                const code = resolveMouseButtonCode(button)
                const pointerKeyCode = resolvePointerKeyCode(button)
                sendPointerEventCommand(pointerKeyCode, POINTER_ACTION.UP, options)
                return sendMouseCommand(INPUT_STATE.UP, code, options)
            },
            pointerDown(button = "left", xOrOptions, maybeY) {
                const options =
                    typeof xOrOptions === "object" && xOrOptions !== null
                        ? xOrOptions
                        : {
                              x: typeof xOrOptions === "number" ? xOrOptions : undefined,
                              y: typeof maybeY === "number" ? maybeY : undefined,
                          }
                return sendPointerEventCommand(resolvePointerKeyCode(button), POINTER_ACTION.DOWN, options)
            },
            pointerUp(button = "left", xOrOptions, maybeY) {
                const options =
                    typeof xOrOptions === "object" && xOrOptions !== null
                        ? xOrOptions
                        : {
                              x: typeof xOrOptions === "number" ? xOrOptions : undefined,
                              y: typeof maybeY === "number" ? maybeY : undefined,
                          }
                return sendPointerEventCommand(resolvePointerKeyCode(button), POINTER_ACTION.UP, options)
            },
            pointerClick(button = "left", xOrOptions, maybeY) {
                const options =
                    typeof xOrOptions === "object" && xOrOptions !== null
                        ? xOrOptions
                        : {
                              x: typeof xOrOptions === "number" ? xOrOptions : undefined,
                              y: typeof maybeY === "number" ? maybeY : undefined,
                          }
                sendPointerEventCommand(resolvePointerKeyCode(button), POINTER_ACTION.DOWN, options)
                return sendPointerEventCommand(resolvePointerKeyCode(button), POINTER_ACTION.UP, options)
            },
            async keyDown(keyCode) {
                await waitForInputReady()
                return sendKeyboardCommand(keyCode, INPUT_STATE.DOWN)
            },
            async keyUp(keyCode) {
                await waitForInputReady()
                return sendKeyboardCommand(keyCode, INPUT_STATE.UP)
            },
            async keyTap(keyCode) {
                await waitForInputReady()
                sendKeyboardCommand(keyCode, INPUT_STATE.DOWN)
                return sendKeyboardCommand(keyCode, INPUT_STATE.UP)
            },
            async rawMouse(action, code, options = {}) {
                await waitForInputReady()
                return sendMouseCommand(action, code, options)
            },
            async rawKey(state, keyCode) {
                await waitForInputReady()
                return sendKeyboardCommand(keyCode, state)
            },
            constants: {
                INPUT_OP,
                INPUT_STATE,
                POINTER_ACTION,
            },
        }
    }

    /**
     * 监听真实鼠标事件，实时同步虚拟鼠标状态。
     */
    function installRealInputTracking() {
        const syncHandler = event => {
            syncVirtualMouseStateFromEvent(event)
        }
        document.addEventListener("mousemove", syncHandler, true)
        document.addEventListener("mousedown", syncHandler, true)
        document.addEventListener("mouseup", syncHandler, true)
        document.addEventListener("pointerlockchange", syncPointerCaptureState, true)
    }

    /**
     * 对外暴露桥接命令，默认直接打到 SDK/worker 输入层。
     */
    const commandHandlers = {
        status: async () => snapshotState(),
        enableTransportHook: async () => enableTransportHook(),
        sendRaw: async payload => {
            if (!payload || typeof payload !== "object") {
                throw new Error("packet payload is required")
            }
            return sendPacket(payload)
        },
        xFnExec: async payload => {
            if (!payload || typeof payload !== "object" || typeof payload.actionName !== "string") {
                throw new Error("actionName is required")
            }
            return sendXFnExec(payload.actionName, payload.args)
        },
        fnExec: async payload => {
            if (!payload || typeof payload !== "object" || typeof payload.actionName !== "string") {
                throw new Error("actionName is required")
            }
            return sendFnExec(payload.actionName, payload.args, payload.prependSid !== false)
        },
        mouse: async payload => {
            if (!payload || typeof payload !== "object") {
                throw new Error("mouse payload is required")
            }
            return sendXFnExec("mouse", [
                payload.mouseX,
                payload.mouseY,
                payload.cursorX,
                payload.cursorY,
                payload.action,
                payload.code,
                payload.value ?? 0,
                payload.extra ?? 0,
            ])
        },
        keyEvent: async payload => {
            if (!payload || typeof payload !== "object") {
                throw new Error("keyEvent payload is required")
            }
            return sendXFnExec("key_event", [payload.action, payload.state])
        },
        touch: async payload => {
            if (!payload || typeof payload !== "object") {
                throw new Error("touch payload is required")
            }
            return sendXFnExec("touch", [
                payload.action,
                payload.state,
                payload.index ?? 0,
                payload.x,
                payload.y,
                payload.extra1 ?? 0,
                payload.extra2 ?? 0,
            ])
        },
        keepAlive: async () => sendXFnExec("keep_alive", []),
    }

    /**
     * 执行桥接命令并返回统一结果。
     * @param {string} action 桥接动作名
     * @param {unknown} payload 动作负载
     * @returns {Promise<unknown>} 动作执行结果
     */
    async function handleCommand(action, payload) {
        const handler = commandHandlers[action]
        if (!handler) {
            throw new Error(`unsupported command: ${String(action)}`)
        }
        return await handler(payload)
    }

    if (window[BRIDGE_NAME]) {
        emit("bridge-reused", snapshotState())
        return
    }

    installFullscreenApiProbes()
    installRealInputTracking()
    enableTransportHook()
    installDevtoolsHelpers()

    window[BRIDGE_NAME] = {
        version: 2,
        controlEvent: CONTROL_EVENT,
        emit,
        handleCommand,
        snapshotState,
    }

    window.addEventListener(CONTROL_EVENT, event => {
        const detail = event?.detail ?? {}
        void handleCommand(detail.action, detail.payload)
            .then(result => {
                emit("command-result", {
                    action: detail.action ?? null,
                    ok: true,
                    result,
                })
            })
            .catch(error => {
                emit("command-result", {
                    action: detail.action ?? null,
                    ok: false,
                    error: error instanceof Error ? error.message : String(error),
                })
            })
    })

    window.addEventListener("hashchange", () => {
        emit("hashchange", {
            href: location.href,
            hash: location.hash,
            state: snapshotState(),
        })
    })

    document.addEventListener("visibilitychange", () => {
        emit("visibilitychange", {
            href: location.href,
            hidden: document.hidden,
            visibilityState: document.visibilityState,
            state: snapshotState(),
        })
    })

    const fullscreenEvents = [
        "fullscreenchange",
        "webkitfullscreenchange",
        "webkitbeginfullscreen",
        "webkitendfullscreen",
        "mozfullscreenchange",
        "MSFullscreenChange",
    ]
    for (const eventName of fullscreenEvents) {
        document.addEventListener(eventName, () => {
            const fullscreenElement = document.fullscreenElement ?? document.webkitFullscreenElement ?? null
            if (isCloudGameFullscreenContainer(fullscreenElement)) {
                const exitFullscreen =
                    document.exitFullscreen?.bind(document) ??
                    document.webkitExitFullscreen?.bind(document) ??
                    document.webkitCancelFullScreen?.bind(document) ??
                    document.msExitFullscreen?.bind(document) ??
                    null
                if (exitFullscreen) {
                    void Promise.resolve(exitFullscreen())
                }
            }
        })
    }

    emit("bridge-ready", {
        href: location.href,
        title: document.title,
        readyState: document.readyState,
        state: snapshotState(),
    })
})()
