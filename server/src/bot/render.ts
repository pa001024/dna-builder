import fs from "node:fs"
import { Children, cloneElement, isValidElement, type JSX } from "react"
import satori, { type SatoriOptions } from "satori"
import sharp from "sharp"
import { tailwindToCSS } from "tw-to-css"
import Demo from "./components/Demo"

const { twj } = tailwindToCSS({
    config: {
        theme: {
            extend: {
                colors: {
                    primary: "#007bff",
                },
                fontFamily: {
                    sans: ["Inter", "sans-serif"],
                },
            },
        },
    },
})

function inlineTailwind(el: JSX.Element): JSX.Element {
    const { className: tw, children, style: originalStyle, ...props } = el.props
    // Generate style from the `tw` prop
    const twStyle = tw ? twj(tw.split(" ")) : {}
    // Merge original and generated styles
    const mergedStyle = { ...originalStyle, ...twStyle }
    // Recursively process children
    const processedChildren = Children.map(children, child => (isValidElement(child) ? inlineTailwind(child as JSX.Element) : child))
    // Return cloned element with updated props
    return cloneElement(el, { ...props, style: mergedStyle }, processedChildren)
}

const fontCache = new Map<string, Buffer>()
const loadFont = (path: string) => {
    if (fontCache.has(path)) {
        return fontCache.get(path)!
    }
    const font = fs.readFileSync(path)
    fontCache.set(path, font)
    return font
}

const css = `
@font-face {
    font-family: "Inter";
    src: url("./assets/HarmonyOS_Sans_SC_Regular.ttf");
}
* {
    font-family: "Inter";
}
`
export async function renderJSX(component: JSX.Element, options?: Partial<SatoriOptions>) {
    const jsx = inlineTailwind(component)
    const svg = await satori(jsx, {
        width: 580,
        height: 400,
        fonts: [
            {
                name: "Inter",
                data: loadFont("./assets/HarmonyOS_Sans_SC_Regular.ttf"),
            },
        ],
        embedFont: false,
        ...options,
    })
    return sharp(svg, {
        svg: {
            stylesheet: css,
        },
    })
        .png()
        .toBuffer()
}

if (require.main === module) {
    renderJSX(
        Demo({
            data: {
                hello: "world",
            },
        })
    ).then(buffer => {
        fs.writeFileSync("demo.png", buffer)
    })
}
