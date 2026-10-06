/**
 * SSG 预渲染用的最小 DOM 环境。
 *
 * 这个项目的组件只在 onMounted 之后才大量操作 DOM，但 setup 阶段仍会零散地读
 * localStorage、写 document.body 的属性、用 matchMedia 判断主题等。预渲染要在
 * Node 里跑通这些代码，必须先把浏览器全局补上，否则 renderToString 会直接抛错。
 *
 * 这里的实现刻意保持"哑"：只保证调用不抛错、读取不返回 null，不模拟真实布局。
 * 预渲染产物只是给爬虫与首屏看的静态标记，主应用启动时会整体替换 #container 的内容。
 */

/** 空函数 */
const noop = () => {}

/**
 * 创建带增删查方法的 classList。
 * @param element 所属元素
 * @returns classList 桩对象
 */
function createClassList(element) {
    const classes = new Set()
    return {
        add: (...names) => {
            for (const name of names) classes.add(name)
        },
        remove: (...names) => {
            for (const name of names) classes.delete(name)
        },
        toggle: (name, force) => {
            const shouldAdd = force === undefined ? !classes.has(name) : Boolean(force)
            if (shouldAdd) {
                classes.add(name)
            } else {
                classes.delete(name)
            }
            return shouldAdd
        },
        contains: name => classes.has(name),
        replace: (from, to) => {
            if (classes.delete(from)) {
                classes.add(to)
            }
        },
        get value() {
            return [...classes].join(" ")
        },
        get length() {
            return classes.size
        },
        item: index => [...classes][index] ?? null,
        toString: () => [...classes].join(" "),
        element,
    }
}

/**
 * 创建 CSSStyleDeclaration 桩对象。
 * @returns style 桩对象
 */
function createStyle() {
    const declarations = new Map()
    const style = {
        setProperty: (name, value) => declarations.set(name, String(value)),
        getPropertyValue: name => declarations.get(name) ?? "",
        removeProperty: name => declarations.delete(name),
        get cssText() {
            return [...declarations].map(([name, value]) => `${name}: ${value}`).join("; ")
        },
        set cssText(text) {
            declarations.clear()
            for (const part of String(text).split(";")) {
                const [name, value] = part.split(":")
                if (name && value) declarations.set(name.trim(), value.trim())
            }
        },
    }

    // 未知属性（backgroundColor / transform 等）按普通字符串字段处理
    return new Proxy(style, {
        get(target, key) {
            if (key in target) return Reflect.get(target, key)
            return declarations.get(String(key)) ?? ""
        },
        set(target, key, value) {
            if (key in target) return Reflect.set(target, key, value)
            declarations.set(String(key), String(value))
            return true
        },
    })
}

/**
 * 创建元素桩对象。
 * @param tagName 标签名
 * @returns 元素桩对象
 */
function createElement(tagName = "div") {
    const element = {
        tagName: String(tagName).toUpperCase(),
        nodeName: String(tagName).toUpperCase(),
        nodeType: 1,
        classList: createClassList(undefined),
        className: "",
        style: createStyle(),
        dataset: {},
        children: [],
        childNodes: [],
        parentNode: null,
        innerHTML: "",
        outerHTML: "",
        textContent: "",
        innerText: "",
        value: "",
        checked: false,
        files: [],
        scrollTop: 0,
        scrollLeft: 0,
        scrollHeight: 0,
        scrollWidth: 0,
        clientWidth: 0,
        clientHeight: 0,
        offsetWidth: 0,
        offsetHeight: 0,
        offsetLeft: 0,
        offsetTop: 0,
        hidden: false,
        disabled: false,
        appendChild: child => {
            element.children.push(child)
            return child
        },
        removeChild: child => {
            const index = element.children.indexOf(child)
            if (index >= 0) element.children.splice(index, 1)
            return child
        },
        insertBefore: child => child,
        replaceChild: child => child,
        append: noop,
        prepend: noop,
        remove: noop,
        contains: () => false,
        cloneNode: () => createElement(tagName),
        setAttribute: (name, value) => {
            element.attributes[String(name)] = String(value)
        },
        getAttribute: name => element.attributes[String(name)] ?? null,
        removeAttribute: name => {
            delete element.attributes[String(name)]
        },
        hasAttribute: name => Object.hasOwn(element.attributes, String(name)),
        attributes: {},
        addEventListener: noop,
        removeEventListener: noop,
        dispatchEvent: () => true,
        focus: noop,
        blur: noop,
        click: noop,
        setPointerCapture: noop,
        releasePointerCapture: noop,
        scrollTo: noop,
        scrollIntoView: noop,
        animate: () => ({ cancel: noop, finished: Promise.resolve(), addEventListener: noop }),
        getBoundingClientRect: () => ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }),
        getClientRects: () => [],
        querySelector: () => null,
        querySelectorAll: () => [],
        getElementsByTagName: () => [],
        closest: () => null,
        matches: () => false,
        getContext: type => (type === "2d" ? createCanvasContext() : null),
        toDataURL: () => "",
        insertAdjacentHTML: noop,
        attachShadow: () => createElement("shadow-root"),
        requestFullscreen: () => Promise.resolve(),
        play: () => Promise.resolve(),
        pause: noop,
        load: noop,
    }

    return element
}

/**
 * 创建 canvas 2d context 桩对象（离屏取色、绘制缩略图等代码会用到）。
 * @returns context 桩对象
 */
function createCanvasContext() {
    const gradient = { addColorStop: noop }
    return {
        canvas: null,
        fillStyle: "",
        strokeStyle: "",
        lineWidth: 1,
        font: "",
        globalAlpha: 1,
        globalCompositeOperation: "source-over",
        textAlign: "start",
        textBaseline: "alphabetic",
        imageSmoothingEnabled: true,
        shadowBlur: 0,
        shadowColor: "",
        save: noop,
        restore: noop,
        scale: noop,
        rotate: noop,
        translate: noop,
        transform: noop,
        setTransform: noop,
        resetTransform: noop,
        beginPath: noop,
        closePath: noop,
        moveTo: noop,
        lineTo: noop,
        arc: noop,
        arcTo: noop,
        ellipse: noop,
        rect: noop,
        roundRect: noop,
        quadraticCurveTo: noop,
        bezierCurveTo: noop,
        fill: noop,
        stroke: noop,
        clip: noop,
        fillRect: noop,
        strokeRect: noop,
        clearRect: noop,
        fillText: noop,
        strokeText: noop,
        drawImage: noop,
        setLineDash: noop,
        getLineDash: () => [],
        createLinearGradient: () => gradient,
        createRadialGradient: () => gradient,
        createPattern: () => null,
        measureText: () => ({ width: 0, actualBoundingBoxAscent: 0, actualBoundingBoxDescent: 0 }),
        getImageData: (_x, _y, width = 1, height = 1) => ({
            width,
            height,
            data: new Uint8ClampedArray(Math.max(1, width * height * 4)),
        }),
        putImageData: noop,
        createImageData: (width = 1, height = 1) => ({ width, height, data: new Uint8ClampedArray(Math.max(1, width * height * 4)) }),
        isPointInPath: () => false,
    }
}

/**
 * 创建基于 Map 的 Storage 桩对象。
 * @returns Storage 桩对象
 */
function createStorage() {
    const store = new Map()
    return {
        getItem: key => (store.has(String(key)) ? store.get(String(key)) : null),
        setItem: (key, value) => {
            store.set(String(key), String(value))
        },
        removeItem: key => {
            store.delete(String(key))
        },
        clear: () => store.clear(),
        key: index => [...store.keys()][index] ?? null,
        get length() {
            return store.size
        },
    }
}

/**
 * 创建空的媒体查询结果对象。
 * @param query 媒体查询串
 * @returns MediaQueryList 桩对象
 */
function createMediaQueryList(query) {
    return {
        matches: false,
        media: query,
        onchange: null,
        addListener: noop,
        removeListener: noop,
        addEventListener: noop,
        removeEventListener: noop,
        dispatchEvent: () => false,
    }
}

/**
 * 覆盖一个全局变量。
 * Node 18+ 把 navigator 等属性定义成只读 getter，直接赋值会抛错，这里统一走 defineProperty。
 * @param name 全局名
 * @param value 值
 */
function defineGlobal(name, value) {
    try {
        Object.defineProperty(globalThis, name, { value, writable: true, configurable: true, enumerable: true })
    } catch (error) {
        console.warn(`[ssg] 无法覆盖全局 ${name}`, error)
    }
}

/**
 * 安装预渲染所需的浏览器全局。
 * 必须在加载任何应用模块之前调用（env.ts 会在模块初始化时读取 window）。
 */
export function installDomStubs() {
    const documentElement = createElement("html")
    const body = createElement("body")
    const head = createElement("head")

    const document = {
        nodeType: 9,
        documentElement,
        body,
        head,
        title: "",
        cookie: "",
        referrer: "",
        readyState: "complete",
        visibilityState: "visible",
        hidden: false,
        currentScript: null,
        fonts: { ready: Promise.resolve(), add: noop, check: () => true },
        styleSheets: [],
        activeElement: null,
        createElement: tagName => createElement(tagName),
        createElementNS: (_namespace, tagName) => createElement(tagName),
        createTextNode: text => ({ nodeType: 3, textContent: String(text) }),
        createDocumentFragment: () => createElement("fragment"),
        createComment: text => ({ nodeType: 8, textContent: String(text) }),
        createEvent: () => ({ initEvent: noop }),
        getElementById: () => null,
        getElementsByTagName: () => [],
        getElementsByClassName: () => [],
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener: noop,
        removeEventListener: noop,
        dispatchEvent: () => true,
        append: noop,
        appendChild: node => node,
        contains: () => false,
        execCommand: () => true,
        exitFullscreen: () => Promise.resolve(),
        hasFocus: () => true,
        elementFromPoint: () => null,
        createRange: () => ({ selectNodeContents: noop, setStart: noop, setEnd: noop, cloneContents: () => createElement("fragment") }),
    }

    const navigator = {
        userAgent: "Mozilla/5.0 (SSG prerender) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
        language: "zh-CN",
        languages: ["zh-CN", "zh"],
        platform: "Win32",
        vendor: "ssg",
        maxTouchPoints: 0,
        hardwareConcurrency: 8,
        deviceMemory: 8,
        onLine: true,
        webdriver: false,
        cookieEnabled: true,
        clipboard: { writeText: () => Promise.resolve(), readText: () => Promise.resolve("") },
        // 不提供 navigator.storage：让数据包逻辑判定为"无 OPFS"，直接走空数据分支
        sendBeacon: () => false,
        vibrate: () => true,
        share: () => Promise.resolve(),
    }

    const windowStub = {
        document,
        navigator,
        location: {
            href: "https://dna-builder.cn/",
            origin: "https://dna-builder.cn",
            protocol: "https:",
            host: "dna-builder.cn",
            hostname: "dna-builder.cn",
            pathname: "/",
            search: "",
            hash: "",
            reload: noop,
            replace: noop,
            assign: noop,
            toString: () => "https://dna-builder.cn/",
        },
        history: {
            length: 1,
            state: null,
            pushState: noop,
            replaceState: noop,
            go: noop,
            back: noop,
            forward: noop,
            scrollRestoration: "auto",
        },
        localStorage: createStorage(),
        sessionStorage: createStorage(),
        innerWidth: 1440,
        innerHeight: 900,
        outerWidth: 1440,
        outerHeight: 900,
        devicePixelRatio: 1,
        screen: { width: 1440, height: 900, availWidth: 1440, availHeight: 900 },
        scrollX: 0,
        scrollY: 0,
        pageXOffset: 0,
        pageYOffset: 0,
        matchMedia: query => createMediaQueryList(query),
        getComputedStyle: () => createStyle(),
        requestAnimationFrame: callback => setTimeout(() => callback(Date.now()), 16),
        cancelAnimationFrame: handle => clearTimeout(handle),
        requestIdleCallback: callback => setTimeout(() => callback({ didTimeout: false, timeRemaining: () => 50 }), 1),
        cancelIdleCallback: handle => clearTimeout(handle),
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        queueMicrotask,
        addEventListener: noop,
        removeEventListener: noop,
        dispatchEvent: () => true,
        scrollTo: noop,
        scrollBy: noop,
        open: () => null,
        close: noop,
        focus: noop,
        blur: noop,
        alert: noop,
        confirm: () => false,
        prompt: () => null,
        fetch: () => Promise.reject(new Error("[ssg] 预渲染不发起网络请求")),
        Image: class Image {
            constructor() {
                this.src = ""
                this.width = 0
                this.height = 0
                this.onload = null
                this.onerror = null
            }
        },
        Audio: class Audio {
            constructor() {
                this.src = ""
                this.volume = 1
                this.play = () => Promise.resolve()
                this.pause = noop
            }
        },
        CSS: { supports: () => false, escape: value => String(value) },
        performance: { now: () => Date.now(), mark: noop, measure: noop, getEntries: () => [] },
        IntersectionObserver: class IntersectionObserver {
            observe() {}
            unobserve() {}
            disconnect() {}
            takeRecords() {
                return []
            }
        },
        ResizeObserver: class ResizeObserver {
            observe() {}
            unobserve() {}
            disconnect() {}
        },
        MutationObserver: class MutationObserver {
            observe() {}
            disconnect() {}
            takeRecords() {
                return []
            }
        },
        Event: class Event {
            constructor(type, init = {}) {
                this.type = type
                Object.assign(this, init)
            }
        },
        CustomEvent: class CustomEvent {
            constructor(type, init = {}) {
                this.type = type
                this.detail = init.detail
            }
        },
        AbortController,
        AbortSignal,
        Blob: class Blob {
            constructor(parts = []) {
                this.parts = parts
                this.size = 0
                this.type = ""
            }
            text() {
                return Promise.resolve("")
            }
            arrayBuffer() {
                return Promise.resolve(new ArrayBuffer(0))
            }
        },
        File: class File {},
        FileReader: class FileReader {
            readAsDataURL() {}
            readAsText() {}
            readAsArrayBuffer() {}
            abort() {}
        },
        URL,
        URLSearchParams,
        FormData: class FormData {
            append() {}
            get() {
                return null
            }
        },
        DOMParser: class DOMParser {
            parseFromString() {
                return { querySelector: () => null, querySelectorAll: () => [], body: createElement("body"), documentElement }
            }
        },
        XMLHttpRequest: class XMLHttpRequest {
            open() {}
            send() {}
            setRequestHeader() {}
            abort() {}
            addEventListener() {}
            removeEventListener() {}
        },
        HTMLElement: class HTMLElement {},
        HTMLCanvasElement: class HTMLCanvasElement {},
        HTMLVideoElement: class HTMLVideoElement {},
        HTMLImageElement: class HTMLImageElement {},
        Element: class Element {},
        Node: class Node {},
        NodeList: class NodeList {},
        Text: class Text {},
        Comment: class Comment {},
        EventTarget: class EventTarget {
            addEventListener() {}
            removeEventListener() {}
            dispatchEvent() {
                return true
            }
        },
        getSelection: () => ({ toString: () => "", rangeCount: 0, removeAllRanges: noop }),
        isSecureContext: true,
        crossOriginIsolated: false,
        // @vueuse/core 的 useStorage 会用 instanceof Storage 判断取到的是不是浏览器存储
        Storage: class Storage {},
        process,
    }

    windowStub.window = windowStub
    windowStub.self = windowStub
    windowStub.globalThis = windowStub

    // 元素桩的 classList/ownerDocument 需要双向引用，这里补齐
    for (const element of [documentElement, body, head]) {
        element.classList = createClassList(element)
    }
    documentElement.style = createStyle()
    body.style = createStyle()
    head.style = createStyle()
    body.ownerDocument = document
    head.ownerDocument = document
    documentElement.ownerDocument = document

    const globals = {
        window: windowStub,
        self: windowStub,
        document,
        navigator,
        location: windowStub.location,
        history: windowStub.history,
        localStorage: windowStub.localStorage,
        sessionStorage: windowStub.sessionStorage,
        matchMedia: windowStub.matchMedia,
        getComputedStyle: windowStub.getComputedStyle,
        requestAnimationFrame: windowStub.requestAnimationFrame,
        cancelAnimationFrame: windowStub.cancelAnimationFrame,
        requestIdleCallback: windowStub.requestIdleCallback,
        cancelIdleCallback: windowStub.cancelIdleCallback,
        IntersectionObserver: windowStub.IntersectionObserver,
        ResizeObserver: windowStub.ResizeObserver,
        MutationObserver: windowStub.MutationObserver,
        CSS: windowStub.CSS,
        HTMLElement: windowStub.HTMLElement,
        HTMLCanvasElement: windowStub.HTMLCanvasElement,
        Element: windowStub.Element,
        Node: windowStub.Node,
        Event: windowStub.Event,
        CustomEvent: windowStub.CustomEvent,
        Image: windowStub.Image,
        Audio: windowStub.Audio,
        Blob: windowStub.Blob,
        FileReader: windowStub.FileReader,
        DOMParser: windowStub.DOMParser,
        XMLHttpRequest: windowStub.XMLHttpRequest,
        FormData: windowStub.FormData,
        Storage: windowStub.Storage,
        fetch: windowStub.fetch,
    }

    for (const [name, value] of Object.entries(globals)) {
        defineGlobal(name, value)
    }

    return windowStub
}
